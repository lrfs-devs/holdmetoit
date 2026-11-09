import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiscordAPIError, REST } from "discord.js";
import {
   DISCORD_UNKNOWN_MEMBER_CODE,
   lookupGuildMember,
   resetDiscordRest,
} from "@holdmetoit/discord";

function discordError(status: number, code: number): DiscordAPIError {
   return new DiscordAPIError(
      { code, message: "Discord error" },
      code,
      status,
      "GET",
      "/guilds/g/members/u",
      {}
   );
}

describe("lookupGuildMember (real client, stubbed transport)", () => {
   const originalToken = process.env.DISCORD_BOT_TOKEN;

   beforeEach(() => {
      process.env.DISCORD_BOT_TOKEN = "bot_secret";
      resetDiscordRest();
   });

   afterEach(() => {
      vi.restoreAllMocks();
      resetDiscordRest();
      if (originalToken === undefined) delete process.env.DISCORD_BOT_TOKEN;
      else process.env.DISCORD_BOT_TOKEN = originalToken;
   });

   const input = { guildId: "g", userId: "u" };

   it("returns found with the member on success", async () => {
      vi.spyOn(REST.prototype, "get").mockResolvedValue({ roles: ["r1"] });

      await expect(lookupGuildMember(input)).resolves.toEqual({
         status: "found",
         member: { roles: ["r1"] },
      });
   });

   it("returns not_found only for 404 Unknown Member (10007)", async () => {
      expect(DISCORD_UNKNOWN_MEMBER_CODE).toBe(10007);
      vi.spyOn(REST.prototype, "get").mockRejectedValue(
         discordError(404, 10007)
      );

      await expect(lookupGuildMember(input)).resolves.toEqual({
         status: "not_found",
      });
   });

   it("treats an unknown guild (404, 10004) as unavailable, not a missing member", async () => {
      vi.spyOn(REST.prototype, "get").mockRejectedValue(
         discordError(404, 10004)
      );

      await expect(lookupGuildMember(input)).resolves.toEqual({
         status: "unavailable",
      });
   });

   it("treats other API failures and network errors as unavailable", async () => {
      const get = vi.spyOn(REST.prototype, "get");

      get.mockRejectedValueOnce(discordError(403, 50001));
      await expect(lookupGuildMember(input)).resolves.toEqual({
         status: "unavailable",
      });

      get.mockRejectedValueOnce(discordError(500, 0));
      await expect(lookupGuildMember(input)).resolves.toEqual({
         status: "unavailable",
      });

      get.mockRejectedValueOnce(new Error("socket hang up"));
      await expect(lookupGuildMember(input)).resolves.toEqual({
         status: "unavailable",
      });
   });

   it("is unavailable without a bot token", async () => {
      delete process.env.DISCORD_BOT_TOKEN;
      await expect(lookupGuildMember(input)).resolves.toEqual({
         status: "unavailable",
      });
   });
});
