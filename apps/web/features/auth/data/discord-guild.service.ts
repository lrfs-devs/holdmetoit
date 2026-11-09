/**
 * Service to verify Discord server roles and permissions for RBAC.
 * Uses the shared discord.js REST client to inspect guild member roles.
 */

import { fetchGuildMember, lookupGuildMember } from "@holdmetoit/discord";
import { getServerEnv } from "@/core/env/server";
import { parseDiscordSnowflakeList } from "@/features/auth/domain/auth-roles";

export interface DiscordGuildMemberResponse {
   roles?: string[];
   user?: {
      id: string;
      username: string;
   };
}

export function getConfiguredAdminRoleIds(): string[] {
   const raw = getServerEnv().DISCORD_ADMIN_ROLE_IDS ?? "";
   return parseDiscordSnowflakeList(raw);
}

export function getConfiguredDevDiscordIds(): string[] {
   const env = getServerEnv();
   const raw = env.DEV_DISCORD_IDS ?? env.DISCORD_DEV_IDS ?? "";
   return parseDiscordSnowflakeList(raw);
}

/**
 * Evaluates whether a Discord user qualifies for the DEV role.
 * Criteria: User's Discord snowflake is in DEV_DISCORD_IDS.
 */
export function isDiscordDev(discordUserId: string): boolean {
   if (!discordUserId) {
      return false;
   }
   const devIds = getConfiguredDevDiscordIds();
   return devIds.includes(discordUserId);
}

/**
 * Fetches the role IDs assigned to a member in the configured Discord server.
 */
export async function fetchMemberRoles(
   discordUserId: string
): Promise<string[]> {
   const guildId = getServerEnv().DISCORD_GUILD_ID;

   if (!guildId || !discordUserId) {
      return [];
   }

   const member = await fetchGuildMember({
      guildId,
      userId: discordUserId,
   });

   return Array.isArray(member?.roles) ? member.roles : [];
}

/**
 * Evaluates whether a Discord user qualifies for the ADMIN (Host) role.
 * Criteria: User possesses one or more roles listed in DISCORD_ADMIN_ROLE_IDS in the server.
 */
export async function isDiscordAdmin(discordUserId: string): Promise<boolean> {
   if (!discordUserId) {
      return false;
   }

   const adminRoleIds = getConfiguredAdminRoleIds();
   if (adminRoleIds.length === 0) {
      return false;
   }

   const memberRoles = await fetchMemberRoles(discordUserId);
   return memberRoles.some((roleId) => adminRoleIds.includes(roleId));
}

export type AdminRoleCheck = "admin" | "not_admin" | "unavailable";

/**
 * Revalidation-grade variant of {@link isDiscordAdmin}.
 *
 * Unlike `isDiscordAdmin`, it never mistakes an outage for a missing role:
 * - "unavailable": guild/bot not configured, or Discord could not be reached
 * - "not_admin":   Discord answered and the user lacks an admin role (including
 *                  users who left the server, HTTP 404)
 * - "admin":       Discord answered and the user holds a configured admin role
 */
export async function checkDiscordAdminRole(
   discordUserId: string
): Promise<AdminRoleCheck> {
   const guildId = getServerEnv().DISCORD_GUILD_ID;
   if (!guildId || !discordUserId) {
      return "unavailable";
   }

   const adminRoleIds = getConfiguredAdminRoleIds();
   if (adminRoleIds.length === 0) {
      return "not_admin";
   }

   const lookup = await lookupGuildMember({ guildId, userId: discordUserId });
   if (lookup.status === "unavailable") {
      return "unavailable";
   }
   if (lookup.status === "not_found") {
      return "not_admin";
   }

   const roles = Array.isArray(lookup.member.roles) ? lookup.member.roles : [];
   return roles.some((roleId) => adminRoleIds.includes(roleId))
      ? "admin"
      : "not_admin";
}
