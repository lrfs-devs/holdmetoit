import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
   userUpdate: vi.fn(),
   checkDiscordAdminRole: vi.fn(),
   isDiscordDev: vi.fn(),
}));

vi.mock("@/core/db", () => ({
   prisma: { user: { update: mocks.userUpdate } },
}));

vi.mock("./discord-guild.service", () => ({
   checkDiscordAdminRole: mocks.checkDiscordAdminRole,
   isDiscordDev: mocks.isDiscordDev,
}));

import {
   resetRoleRevalidationCache,
   revalidatePrivilegedRole,
} from "./role-revalidation.service";
import {
   ROLE_REVALIDATION_RETRY_MS,
   ROLE_REVALIDATION_TTL_MS,
} from "@/features/auth/domain/role-policy";

const T0 = 1_000_000;

describe("revalidatePrivilegedRole", () => {
   beforeEach(() => {
      vi.clearAllMocks();
      resetRoleRevalidationCache();
      mocks.isDiscordDev.mockReturnValue(false);
      mocks.userUpdate.mockResolvedValue({});
   });

   it("demotes and persists when the user lost the Discord admin role", async () => {
      mocks.checkDiscordAdminRole.mockResolvedValue("not_admin");

      const role = await revalidatePrivilegedRole({
         userId: "u1",
         discordId: "d1",
         currentRole: "ADMIN",
         now: T0,
      });

      expect(role).toBe("PARTICIPANT");
      expect(mocks.userUpdate).toHaveBeenCalledWith({
         where: { id: "u1" },
         data: { role: "PARTICIPANT" },
      });
   });

   it("keeps ADMIN without writing when Discord still grants admin", async () => {
      mocks.checkDiscordAdminRole.mockResolvedValue("admin");

      const role = await revalidatePrivilegedRole({
         userId: "u1",
         discordId: "d1",
         currentRole: "ADMIN",
         now: T0,
      });

      expect(role).toBe("ADMIN");
      expect(mocks.userUpdate).not.toHaveBeenCalled();
   });

   it("does not call Discord again inside the TTL window", async () => {
      mocks.checkDiscordAdminRole.mockResolvedValue("admin");
      const input = {
         userId: "u1",
         discordId: "d1",
         currentRole: "ADMIN" as const,
      };

      await revalidatePrivilegedRole({ ...input, now: T0 });
      await revalidatePrivilegedRole({ ...input, now: T0 + 1000 });
      expect(mocks.checkDiscordAdminRole).toHaveBeenCalledTimes(1);

      await revalidatePrivilegedRole({
         ...input,
         now: T0 + ROLE_REVALIDATION_TTL_MS,
      });
      expect(mocks.checkDiscordAdminRole).toHaveBeenCalledTimes(2);
   });

   it("revokes access once the window elapses after a Discord role removal", async () => {
      const input = {
         userId: "u1",
         discordId: "d1",
         currentRole: "ADMIN" as const,
      };
      mocks.checkDiscordAdminRole.mockResolvedValueOnce("admin");
      expect(await revalidatePrivilegedRole({ ...input, now: T0 })).toBe(
         "ADMIN"
      );

      mocks.checkDiscordAdminRole.mockResolvedValueOnce("not_admin");
      expect(
         await revalidatePrivilegedRole({
            ...input,
            now: T0 + ROLE_REVALIDATION_TTL_MS,
         })
      ).toBe("PARTICIPANT");
   });

   it("keeps the stored role and retries soon when Discord is unavailable", async () => {
      mocks.checkDiscordAdminRole.mockResolvedValue("unavailable");
      const input = {
         userId: "u1",
         discordId: "d1",
         currentRole: "ADMIN" as const,
      };

      expect(await revalidatePrivilegedRole({ ...input, now: T0 })).toBe(
         "ADMIN"
      );
      expect(mocks.userUpdate).not.toHaveBeenCalled();

      await revalidatePrivilegedRole({ ...input, now: T0 + 1000 });
      expect(mocks.checkDiscordAdminRole).toHaveBeenCalledTimes(1);

      await revalidatePrivilegedRole({
         ...input,
         now: T0 + ROLE_REVALIDATION_RETRY_MS,
      });
      expect(mocks.checkDiscordAdminRole).toHaveBeenCalledTimes(2);
   });

   it("demotes a DEV removed from DEV_DISCORD_IDS to the Discord-derived role", async () => {
      mocks.isDiscordDev.mockReturnValue(false);
      mocks.checkDiscordAdminRole.mockResolvedValue("admin");

      const role = await revalidatePrivilegedRole({
         userId: "u1",
         discordId: "d1",
         currentRole: "DEV",
         now: T0,
      });

      expect(role).toBe("ADMIN");
      expect(mocks.userUpdate).toHaveBeenCalledWith({
         where: { id: "u1" },
         data: { role: "ADMIN" },
      });
   });

   it("keeps DEV for env-listed ids without any Discord call", async () => {
      mocks.isDiscordDev.mockReturnValue(true);

      const role = await revalidatePrivilegedRole({
         userId: "u1",
         discordId: "d1",
         currentRole: "DEV",
         now: T0,
      });

      expect(role).toBe("DEV");
      expect(mocks.checkDiscordAdminRole).not.toHaveBeenCalled();
      expect(mocks.userUpdate).not.toHaveBeenCalled();
   });

   it("persists DEV when an ADMIN is added to DEV_DISCORD_IDS", async () => {
      mocks.isDiscordDev.mockReturnValue(true);

      const role = await revalidatePrivilegedRole({
         userId: "u1",
         discordId: "d1",
         currentRole: "ADMIN",
         now: T0,
      });

      expect(role).toBe("DEV");
      expect(mocks.userUpdate).toHaveBeenCalledWith({
         where: { id: "u1" },
         data: { role: "DEV" },
      });
   });

   it("never checks or promotes PARTICIPANT sessions", async () => {
      const role = await revalidatePrivilegedRole({
         userId: "u1",
         discordId: "d1",
         currentRole: "PARTICIPANT",
         now: T0,
      });

      expect(role).toBe("PARTICIPANT");
      expect(mocks.checkDiscordAdminRole).not.toHaveBeenCalled();
      expect(mocks.userUpdate).not.toHaveBeenCalled();
   });

   it("leaves users without a Discord id untouched (cannot be verified)", async () => {
      const role = await revalidatePrivilegedRole({
         userId: "u1",
         discordId: null,
         currentRole: "ADMIN",
         now: T0,
      });

      expect(role).toBe("ADMIN");
      expect(mocks.checkDiscordAdminRole).not.toHaveBeenCalled();
   });

   it("still returns the demoted role if persisting fails, and retries next time", async () => {
      mocks.checkDiscordAdminRole.mockResolvedValue("not_admin");
      mocks.userUpdate.mockRejectedValueOnce(new Error("db down"));
      const input = {
         userId: "u1",
         discordId: "d1",
         currentRole: "ADMIN" as const,
      };

      expect(await revalidatePrivilegedRole({ ...input, now: T0 })).toBe(
         "PARTICIPANT"
      );

      await revalidatePrivilegedRole({ ...input, now: T0 + 1000 });
      expect(mocks.userUpdate).toHaveBeenCalledTimes(2);
   });
});
