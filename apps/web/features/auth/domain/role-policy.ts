import type { UserRoleType } from "@/features/auth/domain/auth-roles";

/**
 * Role policy (SEC-05 / SEC-20, issue #227).
 *
 * Discord is the single source of truth for privileged roles:
 *   - DEV    -> Discord snowflake listed in DEV_DISCORD_IDS
 *   - ADMIN  -> holds a role from DISCORD_ADMIN_ROLE_IDS in DISCORD_GUILD_ID
 *   - PARTICIPANT -> everyone else
 *
 * Everything here is pure (Law L7): no Next.js, Prisma or network imports.
 */

/** How long a privileged user's Discord membership is trusted before re-checking. */
export const ROLE_REVALIDATION_TTL_MS = 5 * 60 * 1000;

/** Retry delay after Discord was unreachable, so an outage is not hammered. */
export const ROLE_REVALIDATION_RETRY_MS = 30 * 1000;

/** Database session lifetime (previously the Auth.js default of 30 days). */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** How often an active session's expiry is extended. */
export const SESSION_UPDATE_AGE_SECONDS = 24 * 60 * 60;

const ROLE_RANK: Record<UserRoleType, number> = {
   PARTICIPANT: 0,
   ADMIN: 1,
   DEV: 2,
};

function rankOf(role: UserRoleType | string): number {
   return ROLE_RANK[role as UserRoleType] ?? 0;
}

/** Derives the role Discord says a user should hold. */
export function resolveDiscordRole(input: {
   isDevId: boolean;
   hasAdminRole: boolean;
}): UserRoleType {
   if (input.isDevId) return "DEV";
   return input.hasAdminRole ? "ADMIN" : "PARTICIPANT";
}

/**
 * Decides the role to store after a mid-session revalidation.
 *
 * Revalidation may only *remove* privileges (or apply a DEV id that operators
 * explicitly configured in the environment). Gaining ADMIN from Discord
 * happens at sign-in, so a manual revoke by an admin is not silently undone
 * a few minutes later.
 */
export function resolveRevalidatedRole(
   current: UserRoleType,
   authoritative: UserRoleType
): UserRoleType {
   if (authoritative === "DEV") return "DEV";
   if (rankOf(authoritative) < rankOf(current)) return authoritative;
   return current;
}

export type RoleChangeCode =
   "DEV_ROLE_PROTECTED" | "ROLE_GRANT_FORBIDDEN" | "ROLE_CHANGE_ALLOWED";

export type RoleChangeDecision =
   | { allowed: true; code: "ROLE_CHANGE_ALLOWED" }
   | {
        allowed: false;
        code: Exclude<RoleChangeCode, "ROLE_CHANGE_ALLOWED">;
        message: string;
     };

/**
 * Rules for the manual role editor.
 *
 * - DEV is controlled by DEV_DISCORD_IDS and re-derived from it, so no actor
 *   (admin or dev) may change a DEV user's role through the editor.
 * - ADMIN is controlled by Discord, so the editor is revoke-only: it may
 *   demote to PARTICIPANT but never grant ADMIN.
 */
export function evaluateRoleChange(input: {
   targetRole: UserRoleType | string;
   requestedRole: UserRoleType;
}): RoleChangeDecision {
   if (input.targetRole === "DEV") {
      return {
         allowed: false,
         code: "DEV_ROLE_PROTECTED",
         message:
            "Developer roles are controlled by DEV_DISCORD_IDS and cannot be changed here.",
      };
   }

   if (input.requestedRole !== "PARTICIPANT") {
      return {
         allowed: false,
         code: "ROLE_GRANT_FORBIDDEN",
         message:
            "Admin access is granted through the Discord admin role. Assign it in Discord; the user receives it on their next sign-in. This editor can only revoke.",
      };
   }

   return { allowed: true, code: "ROLE_CHANGE_ALLOWED" };
}
