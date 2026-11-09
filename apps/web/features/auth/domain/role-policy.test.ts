import { describe, expect, it } from "vitest";
import {
   ROLE_REVALIDATION_RETRY_MS,
   ROLE_REVALIDATION_TTL_MS,
   SESSION_MAX_AGE_SECONDS,
   SESSION_UPDATE_AGE_SECONDS,
   canRevokeStoredRole,
   evaluateRoleChange,
   resolveDiscordRole,
   resolveRevalidatedRole,
} from "./role-policy";

describe("role-policy", () => {
   describe("session and revalidation windows", () => {
      it("keeps sessions well below the 30-day Auth.js default", () => {
         expect(SESSION_MAX_AGE_SECONDS).toBe(7 * 24 * 60 * 60);
         expect(SESSION_UPDATE_AGE_SECONDS).toBeLessThan(
            SESSION_MAX_AGE_SECONDS
         );
      });

      it("revalidates within minutes and retries outages sooner than the TTL", () => {
         expect(ROLE_REVALIDATION_TTL_MS).toBeLessThanOrEqual(10 * 60 * 1000);
         expect(ROLE_REVALIDATION_RETRY_MS).toBeLessThan(
            ROLE_REVALIDATION_TTL_MS
         );
      });
   });

   describe("resolveDiscordRole", () => {
      it("prefers DEV over ADMIN", () => {
         expect(resolveDiscordRole({ isDevId: true, hasAdminRole: true })).toBe(
            "DEV"
         );
      });

      it("returns ADMIN for the Discord admin role and PARTICIPANT otherwise", () => {
         expect(
            resolveDiscordRole({ isDevId: false, hasAdminRole: true })
         ).toBe("ADMIN");
         expect(
            resolveDiscordRole({ isDevId: false, hasAdminRole: false })
         ).toBe("PARTICIPANT");
      });
   });

   describe("resolveRevalidatedRole", () => {
      it("demotes ADMIN to PARTICIPANT when Discord no longer grants admin", () => {
         expect(resolveRevalidatedRole("ADMIN", "PARTICIPANT")).toBe(
            "PARTICIPANT"
         );
      });

      it("demotes a DEV removed from DEV_DISCORD_IDS to what Discord says", () => {
         expect(resolveRevalidatedRole("DEV", "ADMIN")).toBe("ADMIN");
         expect(resolveRevalidatedRole("DEV", "PARTICIPANT")).toBe(
            "PARTICIPANT"
         );
      });

      it("never promotes to ADMIN mid-session", () => {
         expect(resolveRevalidatedRole("PARTICIPANT", "ADMIN")).toBe(
            "PARTICIPANT"
         );
      });

      it("applies a DEV id configured in the environment", () => {
         expect(resolveRevalidatedRole("ADMIN", "DEV")).toBe("DEV");
      });

      it("keeps the current role when nothing changed", () => {
         expect(resolveRevalidatedRole("ADMIN", "ADMIN")).toBe("ADMIN");
         expect(resolveRevalidatedRole("DEV", "DEV")).toBe("DEV");
      });
   });

   describe("evaluateRoleChange", () => {
      it("blocks any change to a DEV user", () => {
         for (const requestedRole of ["PARTICIPANT", "ADMIN"] as const) {
            const decision = evaluateRoleChange({
               targetRole: "DEV",
               requestedRole,
            });
            expect(decision.allowed).toBe(false);
            if (!decision.allowed) {
               expect(decision.code).toBe("DEV_ROLE_PROTECTED");
            }
         }
      });

      it("blocks granting ADMIN (Discord is the source of truth)", () => {
         const decision = evaluateRoleChange({
            targetRole: "PARTICIPANT",
            requestedRole: "ADMIN",
         });
         expect(decision.allowed).toBe(false);
         if (!decision.allowed) {
            expect(decision.code).toBe("ROLE_GRANT_FORBIDDEN");
            expect(decision.message).toContain("Discord");
         }
      });

      it("allows revoking an ADMIN down to PARTICIPANT", () => {
         expect(
            evaluateRoleChange({
               targetRole: "ADMIN",
               requestedRole: "PARTICIPANT",
            })
         ).toEqual({ allowed: true, code: "ROLE_CHANGE_ALLOWED" });
      });
   });

   describe("canRevokeStoredRole", () => {
      it("offers revoke only for a stored ADMIN", () => {
         expect(canRevokeStoredRole("ADMIN")).toBe(true);
      });

      it("hides revoke for DEV (protected) and PARTICIPANT (nothing to revoke)", () => {
         expect(canRevokeStoredRole("DEV")).toBe(false);
         expect(canRevokeStoredRole("PARTICIPANT")).toBe(false);
         expect(canRevokeStoredRole(undefined)).toBe(false);
         expect(canRevokeStoredRole(null)).toBe(false);
      });
   });
});
