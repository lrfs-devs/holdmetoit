import { prisma } from "@/core/db";
import { createLogger, logEvents } from "@/core/observability/logger";
import type { UserRoleType } from "@/features/auth/domain/auth-roles";
import {
   ROLE_REVALIDATION_RETRY_MS,
   ROLE_REVALIDATION_TTL_MS,
   resolveDiscordRole,
   resolveRevalidatedRole,
} from "@/features/auth/domain/role-policy";
import {
   checkDiscordAdminRole,
   isDiscordDev,
} from "@/features/auth/data/discord-guild.service";

const logger = createLogger("auth.role-revalidation");

/** userId -> epoch ms before which Discord is not asked again. Per-process. */
const nextCheckAt = new Map<string, number>();
const MAX_TRACKED_USERS = 5000;

/** Test helper: forgets every cached check. */
export function resetRoleRevalidationCache(): void {
   nextCheckAt.clear();
}

export interface RevalidatePrivilegedRoleInput {
   userId: string;
   discordId: string | null | undefined;
   currentRole: UserRoleType;
   now?: number;
}

/**
 * Re-checks a privileged (ADMIN/DEV) user's role against Discord, at most once
 * per {@link ROLE_REVALIDATION_TTL_MS} per process, and persists a demotion.
 *
 * - PARTICIPANT sessions are never checked: gaining a role happens at sign-in.
 * - Users without a Discord id cannot be verified and keep their stored role.
 * - If Discord is unreachable the stored role is kept and the check is retried
 *   after {@link ROLE_REVALIDATION_RETRY_MS}; the outage is logged as a warning.
 * - If the demotion cannot be persisted, the demoted role is still returned so
 *   the current request runs with reduced privileges, and the check is retried.
 */
export async function revalidatePrivilegedRole(
   input: RevalidatePrivilegedRoleInput
): Promise<UserRoleType> {
   const { userId, discordId, currentRole } = input;
   const now = input.now ?? Date.now();

   if (currentRole === "PARTICIPANT" || !discordId) {
      return currentRole;
   }

   const due = nextCheckAt.get(userId);
   if (due !== undefined && now < due) {
      return currentRole;
   }

   let authoritative: UserRoleType;
   if (isDiscordDev(discordId)) {
      authoritative = "DEV";
   } else {
      const check = await checkDiscordAdminRole(discordId);
      if (check === "unavailable") {
         remember(userId, now + ROLE_REVALIDATION_RETRY_MS);
         logger.warn(logEvents.authRoleRevalidationUnavailable, {
            context: { userId, discordId, currentRole },
         });
         return currentRole;
      }
      authoritative = resolveDiscordRole({
         isDevId: false,
         hasAdminRole: check === "admin",
      });
   }

   const nextRole = resolveRevalidatedRole(currentRole, authoritative);

   if (nextRole === currentRole) {
      remember(userId, now + ROLE_REVALIDATION_TTL_MS);
      return currentRole;
   }

   try {
      await prisma.user.update({
         where: { id: userId },
         data: { role: nextRole },
      });
      remember(userId, now + ROLE_REVALIDATION_TTL_MS);
      logger.info(logEvents.authRoleRevalidated, {
         context: { userId, discordId, from: currentRole, to: nextRole },
      });
   } catch (error) {
      logger.error(logEvents.authRoleSyncFailed, {
         context: { userId, discordId, from: currentRole, to: nextRole },
         error,
      });
   }

   return nextRole;
}

function remember(userId: string, until: number): void {
   if (nextCheckAt.size >= MAX_TRACKED_USERS) {
      nextCheckAt.clear();
   }
   nextCheckAt.set(userId, until);
}
