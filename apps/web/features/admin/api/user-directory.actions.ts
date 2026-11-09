"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/core/db";
import {
   requireAdminUser,
   AdminAccessError,
} from "@/features/auth/api/require-admin";
import {
   recordAuditEvent,
   getUserAuditTrail,
} from "@/features/audit/data/audit-log.repository";
import type { AuditEvent } from "@/features/audit/domain/audit-log";
import { evaluateRoleChange } from "@/features/auth/domain/role-policy";
import { getAdminUserRoster } from "../data/user-directory.repository";
import type {
   AdminRosterRole,
   AdminUserRosterResult,
   UserDirectoryQuery,
} from "../domain/user-directory.types";
import type { UserRole } from "@prisma/client";
import { toClientError } from "@/core/errors";

const updateUserRoleSchema = z.object({
   targetUserId: z.string().min(1, "Target user ID required"),
   newRole: z.enum(["USER", "HOST", "ADMIN"], {
      message: "Invalid role specified",
   }),
   reason: z
      .string()
      .min(3, "Audit reason must be at least 3 characters")
      .max(500, "Audit reason too long"),
});

export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;

export type ServerActionResult<T> =
   | { ok: true; data: T }
   | { ok: false; code: string; message: string; data?: T };

/**
 * Fetches the paginated admin user roster with query filters.
 * Protected by requireAdminUser.
 */
export async function fetchAdminUserRosterAction(
   query: UserDirectoryQuery = {}
): Promise<ServerActionResult<AdminUserRosterResult>> {
   try {
      await requireAdminUser();
      const result = await getAdminUserRoster(query);
      return { ok: true, data: result };
   } catch (error) {
      if (error instanceof AdminAccessError) {
         return {
            ok: false,
            code: "FORBIDDEN",
            message: error.message,
         };
      }
      const clientError = toClientError(error, {
         scope: "admin.user_directory.fetch_roster",
         defaultCode: "FETCH_ROSTER_FAILED",
         defaultMessage: "Failed to fetch user directory roster.",
      });
      return {
         ok: false,
         code: clientError.code,
         message: clientError.message,
      };
   }
}

/**
 * Revokes a user's platform admin role, with an immutable audit trail.
 * Protected by requireAdminUser.
 *
 * Discord is the source of truth for privileged roles (issue #227), so this
 * editor is revoke-only: it can demote ADMIN to PARTICIPANT, can never grant
 * ADMIN, and can never touch DEV users (controlled by DEV_DISCORD_IDS).
 * Self-demotion remains blocked.
 */
export async function updateUserRoleAction(input: UpdateUserRoleInput): Promise<
   ServerActionResult<{
      userId: string;
      newRole: AdminRosterRole;
      dbRole: UserRole;
   }>
> {
   try {
      const actor = await requireAdminUser();

      const parsed = updateUserRoleSchema.safeParse(input);
      if (!parsed.success) {
         const firstMessage =
            parsed.error.issues?.[0]?.message || "Invalid input parameters.";
         return {
            ok: false,
            code: "VALIDATION_ERROR",
            message: firstMessage,
         };
      }

      const { targetUserId, newRole, reason } = parsed.data;

      // Guard against self-demotion (actor cannot demote themselves from ADMIN)
      if (actor.id === targetUserId && newRole !== "ADMIN") {
         return {
            ok: false,
            code: "SELF_DEMOTION_FORBIDDEN",
            message:
               "Administrators cannot demote their own administrative role.",
         };
      }

      const targetUser = await prisma.user.findUnique({
         where: { id: targetUserId },
         select: {
            id: true,
            role: true,
            displayName: true,
            name: true,
            username: true,
         },
      });

      if (!targetUser) {
         return {
            ok: false,
            code: "USER_NOT_FOUND",
            message: "Target user not found.",
         };
      }

      // Map domain roster role to DB UserRole enum
      const dbRole: UserRole = newRole === "USER" ? "PARTICIPANT" : "ADMIN";
      const prevDbRole = targetUser.role;

      const decision = evaluateRoleChange({
         targetRole: prevDbRole,
         requestedRole: dbRole,
      });
      if (!decision.allowed) {
         return {
            ok: false,
            code: decision.code,
            message: decision.message,
         };
      }

      // Update role in DB
      const updatedUser = await prisma.user.update({
         where: { id: targetUserId },
         data: { role: dbRole },
      });

      // Record immutable audit event
      await recordAuditEvent({
         actorId: actor.id,
         actorUsername: actor.username,
         actorDisplayName: actor.displayName,
         actionType: "USER_ROLE_UPDATED",
         targetEntityId: targetUserId,
         targetEntityType: "USER",
         targetEntityName:
            targetUser.displayName ||
            targetUser.name ||
            targetUser.username ||
            targetUserId,
         previousValue: { role: prevDbRole },
         newValue: { role: updatedUser.role, rosterRole: newRole },
         auditReason: reason,
      });

      revalidatePath("/admin/users");
      revalidatePath("/admin");
      revalidatePath(`/profile/${targetUserId}`);
      revalidatePath("/[userHandle]", "page");
      if (targetUser.username) {
         revalidatePath(`/@${targetUser.username}`);
      }

      return {
         ok: true,
         data: {
            userId: targetUserId,
            newRole,
            dbRole: updatedUser.role,
         },
      };
   } catch (error) {
      if (error instanceof AdminAccessError) {
         return {
            ok: false,
            code: "FORBIDDEN",
            message: error.message,
         };
      }
      const clientError = toClientError(error, {
         scope: "admin.user_directory.update_role",
         defaultCode: "UPDATE_ROLE_FAILED",
         defaultMessage: "Failed to update user role.",
         context: { targetUserId: input?.targetUserId },
      });
      return {
         ok: false,
         code: clientError.code,
         message: clientError.message,
      };
   }
}

/**
 * Retrieves recent audit logs for a target user (either as actor or as target entity).
 * Protected by requireAdminUser.
 */
export async function getUserAuditLogsAction(params: {
   targetUserId: string;
   limit?: number;
}): Promise<ServerActionResult<AuditEvent[]>> {
   try {
      await requireAdminUser();

      if (!params.targetUserId || !params.targetUserId.trim()) {
         return {
            ok: false,
            code: "VALIDATION_ERROR",
            message: "Target user ID is required.",
            data: [],
         };
      }

      const limit = Math.min(100, Math.max(1, params.limit || 20));
      const logs = await getUserAuditTrail(params.targetUserId, limit);

      return {
         ok: true,
         data: logs,
      };
   } catch (error) {
      if (error instanceof AdminAccessError) {
         return {
            ok: false,
            code: "FORBIDDEN",
            message: error.message,
            data: [],
         };
      }
      const clientError = toClientError(error, {
         scope: "admin.user_directory.fetch_audit_logs",
         defaultCode: "FETCH_AUDIT_LOGS_FAILED",
         defaultMessage: "Failed to fetch user audit logs.",
         context: { targetUserId: params?.targetUserId },
      });
      return {
         ok: false,
         code: clientError.code,
         message: clientError.message,
         data: [],
      };
   }
}
