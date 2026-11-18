import { prisma } from "@/core/db";

import {
   categoryCreatePayloadSchema,
   categoryDeletePayloadSchema,
   categoryReorderPayloadSchema,
   categoryUpdatePayloadSchema,
   compactMutationQueue,
   taskCreatePayloadSchema,
   taskDeletePayloadSchema,
   taskReorderPayloadSchema,
   taskRolloverPayloadSchema,
   taskTogglePayloadSchema,
   taskUpdatePayloadSchema,
} from "@/features/tasks/domain/task-sync.schema";
import type {
   BatchSyncResponse,
   MutationResult,
   QueuedMutation,
} from "@/features/tasks/domain/task-sync.types";
import { buildCategoryTombstoneName } from "@/features/tasks/domain/task-deletion";
import { isWeeklyTaskGraceExpired } from "@/features/tasks/domain/task-lock";
import {
   DEFAULT_CATEGORY_NAME,
   assertChallengeWritable,
   getUserCategorizedTasks,
   getUserCategorizedTasksFromDatabase,
   resolveTaskChallengeId,
   rolloverIncompleteTasks,
   toCategoryItem,
   toTaskItem,
   validateTaskChallengeId,
} from "@/features/tasks/data/task.repository";
import { ChallengeStateError } from "@/features/challenges/domain/challenge-lifecycle";
import { Prisma, type TaskStatus, type TaskType } from "@prisma/client";
import { createLogger, logEvents } from "@/core/observability/logger";

const logger = createLogger("tasks.sync");

type Outcome = Omit<MutationResult, "id">;

const APPLIED: Outcome = { status: "applied" };
const INVALID: Outcome = { status: "conflict", reason: "invalid_payload" };

function isValidCategoryMutation(m: QueuedMutation): boolean {
   switch (m.action) {
      case "CREATE":
         return categoryCreatePayloadSchema.safeParse(m.payload).success;
      case "UPDATE":
      case "MOVE":
         return categoryUpdatePayloadSchema.safeParse(m.payload).success;
      case "DELETE":
         return categoryDeletePayloadSchema.safeParse(m.payload).success;
      case "REORDER":
         return categoryReorderPayloadSchema.safeParse(m.payload).success;
      default:
         return false;
   }
}

function isValidTaskMutation(m: QueuedMutation): boolean {
   switch (m.action) {
      case "CREATE":
         return taskCreatePayloadSchema.safeParse(m.payload).success;
      case "UPDATE":
      case "MOVE":
         return taskUpdatePayloadSchema.safeParse(m.payload).success;
      case "TOGGLE":
         return taskTogglePayloadSchema.safeParse(m.payload).success;
      case "DELETE":
         return taskDeletePayloadSchema.safeParse(m.payload).success;
      case "REORDER":
         return taskReorderPayloadSchema.safeParse(m.payload).success;
      case "ROLLOVER":
         return taskRolloverPayloadSchema.safeParse(m.payload).success;
      default:
         return false;
   }
}

function isP2002(error: unknown): boolean {
   return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
   );
}

async function resolveWritableChallengeLink(
   tx: Prisma.TransactionClient,
   userId: string,
   requestedChallengeId: string | null | undefined,
   options: { resolveCurrent?: boolean; onRejected?: "unlink" | "omit" } = {}
): Promise<string | null | undefined> {
   const onRejected = options.onRejected ?? "omit";
   const reject = () => (onRejected === "unlink" ? null : undefined);

   try {
      if (requestedChallengeId === undefined) {
         if (!options.resolveCurrent) return undefined;
         const resolved = await resolveTaskChallengeId(userId, tx);
         if (!resolved) return null;
         await assertChallengeWritable(tx, resolved);
         return resolved;
      }

      if (requestedChallengeId === null) return null;

      const validated = await validateTaskChallengeId(
         userId,
         requestedChallengeId,
         tx
      );
      if (!validated || validated !== requestedChallengeId) return reject();

      await assertChallengeWritable(tx, validated);
      return validated;
   } catch (error) {
      if (error instanceof ChallengeStateError) {
         logger.warn(logEvents.tasksSyncFailed, {
            context: {
               userId,
               challengeId: requestedChallengeId ?? "auto",
               reason: "challenge_locked",
            },
         });
         return reject();
      }
      throw error;
   }
}

/**
 * Whether a category still holds a weekly goal past its 24-hour grace period.
 */
async function categoryHasLockedGoals(
   tx: Prisma.TransactionClient,
   categoryId: string,
   userId: string
): Promise<boolean> {
   const tasks = await tx.task.findMany({
      where: { categoryId, userId, isDeleted: false },
      select: {
         taskType: true,
         challengeId: true,
         createdAt: true,
         challenge: { select: { resultsLockedAt: true } },
      },
   });
   return tasks.some(
      (task) =>
         isWeeklyTaskGraceExpired(task) ||
         task.challenge?.resultsLockedAt != null
   );
}

async function applyCategoryMutation(
   tx: Prisma.TransactionClient,
   userId: string,
   m: QueuedMutation
): Promise<Outcome> {
   if (!isValidCategoryMutation(m)) {
      logger.warn(logEvents.tasksSyncFailed, {
         context: {
            userId,
            mutationId: m.id,
            action: m.action,
            reason: "invalid_payload",
         },
      });
      return INVALID;
   }

   const payload = m.payload as Record<string, unknown>;
   const catId = String(payload.id || payload.categoryId || "");
   const explicitName =
      typeof payload.name === "string" && payload.name.trim() !== ""
         ? payload.name.trim()
         : undefined;
   const taskType: TaskType =
      payload.taskType === "WEEKLY" ? "WEEKLY" : "DAILY";
   const baseRevision =
      typeof m.baseRevision === "number" ? m.baseRevision : undefined;

   if (m.action === "CREATE") {
      if (!catId || !explicitName) return APPLIED;

      const byId = await tx.category.findUnique({ where: { id: catId } });
      if (byId) {
         if (byId.userId !== userId) {
            return {
               status: "conflict",
               reason: "foreign_row",
               currentCategory: null,
            };
         }

         if (!byId.isDeleted) {
            // A delayed CREATE retry must not overwrite a newer rename; the
            // snapshot reconciles the client.
            return APPLIED;
         }
      }

      const liveByName = await tx.category.findFirst({
         where: {
            userId,
            taskType,
            isDeleted: false,
            name: { equals: explicitName, mode: "insensitive" },
         },
      });

      if (liveByName) {
         if (liveByName.id !== catId) {
            return {
               status: "conflict",
               reason: "category_name_taken",
               currentCategory: toCategoryItem(liveByName),
            };
         }
         return APPLIED;
      }

      const tombstoned = await tx.category.findFirst({
         where: {
            userId,
            taskType,
            isDeleted: true,
            name: { equals: explicitName, mode: "insensitive" },
         },
         orderBy: { updatedAt: "desc" },
      });

      if (tombstoned) {
         const revived = await tx.category.update({
            where: { id: tombstoned.id },
            data: {
               name: explicitName,
               isDeleted: false,
               deletionTime: null,
               revision: { increment: 1 },
            },
         });

         if (revived.id !== catId) {
            return {
               status: "conflict",
               reason: "category_name_taken",
               currentCategory: toCategoryItem(revived),
            };
         }
         return APPLIED;
      }

      const initialSortOrder =
         typeof payload.sortOrder === "number" ? payload.sortOrder : 0;

      await tx.category.create({
         data: {
            id: catId,
            userId,
            name: explicitName,
            taskType,
            sortOrder: initialSortOrder,
         },
      });
      return APPLIED;
   }

   if (m.action === "UPDATE" || m.action === "MOVE") {
      const dataToUpdate: Record<string, unknown> = {};
      if (explicitName) {
         dataToUpdate.name = explicitName;
      }
      if (typeof payload.sortOrder === "number") {
         dataToUpdate.sortOrder = payload.sortOrder;
      }

      if (catId) {
         const currentCategory = await tx.category.findUnique({
            where: { id: catId },
         });

         if (payload.taskType) {
            if (currentCategory && currentCategory.userId === userId) {
               const targetName = explicitName || currentCategory.name;
               if (currentCategory.taskType !== taskType) {
                  const nameCollision = await tx.category.findFirst({
                     where: {
                        userId,
                        taskType,
                        name: { equals: targetName, mode: "insensitive" },
                        id: { not: catId },
                        isDeleted: false,
                     },
                  });

                  if (nameCollision) {
                     dataToUpdate.name = `${targetName} (Moved)`;
                  } else if (explicitName) {
                     dataToUpdate.name = explicitName;
                  }
                  dataToUpdate.taskType = taskType;

                  if (await categoryHasLockedGoals(tx, catId, userId)) {
                     return {
                        status: "conflict",
                        reason: "task_locked",
                        currentCategory: toCategoryItem(currentCategory),
                     };
                  }
               }
            }
         }

         if (typeof dataToUpdate.name === "string") {
            const collisionTaskType =
               (dataToUpdate.taskType as TaskType | undefined) ??
               currentCategory?.taskType ??
               taskType;
            const collision = await tx.category.findFirst({
               where: {
                  userId,
                  taskType: collisionTaskType,
                  isDeleted: false,
                  name: {
                     equals: dataToUpdate.name,
                     mode: "insensitive",
                  },
                  id: { not: catId },
               },
            });

            if (collision) {
               return {
                  status: "conflict",
                  reason: "category_name_taken",
                  currentCategory: toCategoryItem(collision),
               };
            }
         }

         if (Object.keys(dataToUpdate).length > 0) {
            const { count } = await tx.category.updateMany({
               where: {
                  id: catId,
                  userId,
                  isDeleted: false,
                  ...(baseRevision !== undefined
                     ? { revision: baseRevision }
                     : {}),
               },
               data: { ...dataToUpdate, revision: { increment: 1 } },
            });

            if (count === 0) {
               const current = await tx.category.findFirst({
                  where: { id: catId, userId, isDeleted: false },
               });
               return {
                  status: "conflict",
                  reason: "zero_rows",
                  currentCategory: current ? toCategoryItem(current) : null,
               };
            }

            // A category's column change cascades to its member tasks so the
            // board never shows a task in the opposite column to its category.
            if (dataToUpdate.taskType) {
               const nextType = dataToUpdate.taskType as TaskType;
               await tx.task.updateMany({
                  where: { categoryId: catId, userId, isDeleted: false },
                  data: {
                     taskType: nextType,
                     // Challenge links are only valid on weekly tasks.
                     ...(nextType === "DAILY" ? { challengeId: null } : {}),
                     revision: { increment: 1 },
                  },
               });
            }
         }
      }

      return APPLIED;
   }

   if (m.action === "REORDER") {
      const parsed = categoryReorderPayloadSchema.safeParse(payload);
      if (!parsed.success) return INVALID;
      const { categoryIds, baseRevisions } = parsed.data;

      // Optimistic concurrency: a stale batch must not clobber a newer order.
      if (baseRevisions) {
         const current = await tx.category.findMany({
            where: { id: { in: categoryIds }, userId },
            select: { id: true, revision: true },
         });
         const drifted = current.find(
            (category) =>
               baseRevisions[category.id] !== undefined &&
               category.revision !== baseRevisions[category.id]
         );
         if (drifted) {
            const row = await tx.category.findFirst({
               where: { id: drifted.id, userId, isDeleted: false },
            });
            return {
               status: "conflict",
               reason: "zero_rows",
               currentCategory: row ? toCategoryItem(row) : null,
            };
         }
      }

      for (let i = 0; i < categoryIds.length; i++) {
         await tx.category.updateMany({
            where: { id: categoryIds[i], userId },
            data: { sortOrder: i, revision: { increment: 1 } },
         });
      }
      return APPLIED;
   }

   if (m.action === "DELETE") {
      if (!catId) return APPLIED;

      const currentCategory = await tx.category.findFirst({
         where: { id: catId, userId },
      });

      if (!currentCategory || currentCategory.isDeleted) return APPLIED;

      if (await categoryHasLockedGoals(tx, catId, userId)) {
         return {
            status: "conflict",
            reason: "task_locked",
            currentCategory: toCategoryItem(currentCategory),
         };
      }

      const now = new Date();

      await tx.task.updateMany({
         where: { categoryId: catId, userId, isDeleted: false },
         data: {
            isDeleted: true,
            deletionTime: now,
            revision: { increment: 1 },
         },
      });

      await tx.category.updateMany({
         where: { id: catId, userId },
         data: {
            isDeleted: true,
            deletionTime: now,
            name: buildCategoryTombstoneName(
               currentCategory.name,
               currentCategory.id
            ),
            revision: { increment: 1 },
         },
      });

      return APPLIED;
   }

   return { status: "error", reason: "invalid_payload" };
}

async function applyTaskMutation(
   tx: Prisma.TransactionClient,
   userId: string,
   m: QueuedMutation
): Promise<Outcome> {
   if (!isValidTaskMutation(m)) {
      logger.warn(logEvents.tasksSyncFailed, {
         context: {
            userId,
            mutationId: m.id,
            action: m.action,
            reason: "invalid_payload",
         },
      });
      return INVALID;
   }

   const payload = m.payload as Record<string, unknown>;
   const taskId = String(payload.id || payload.taskId || "");
   let categoryId = String(payload.categoryId || "");
   const title = String(payload.title || "").trim();
   const taskType: TaskType =
      payload.taskType === "WEEKLY" ? "WEEKLY" : "DAILY";
   const isComplete = Boolean(payload.isComplete);
   const sortOrder =
      typeof payload.sortOrder === "number" ? payload.sortOrder : 0;
   const baseRevision =
      typeof m.baseRevision === "number" ? m.baseRevision : undefined;

   if (m.action === "CREATE") {
      if (!taskId || !title) return APPLIED;

      let categoryMissing = false;
      let cat = null;

      if (categoryId) {
         cat = await tx.category.findFirst({
            where: { id: categoryId, userId, isDeleted: false },
         });
      }

      if (!cat) {
         categoryMissing = Boolean(payload.categoryId);
         cat = await tx.category.findFirst({
            where: { userId, taskType, isDeleted: false },
         });
         if (!cat) {
            cat = await tx.category.create({
               data: {
                  userId,
                  name: DEFAULT_CATEGORY_NAME,
                  taskType,
                  sortOrder: 0,
               },
            });
         }
         categoryId = cat.id;
      }

      const status: TaskStatus =
         (payload.status as TaskStatus) || (isComplete ? "COMPLETED" : "TODO");
      const finalIsComplete = status === "COMPLETED";
      const dueDate = payload.dueDate
         ? new Date(String(payload.dueDate))
         : null;

      const effectiveTaskType = taskType;
      const rawChallengeId = payload.challengeId;
      const challengeLinkRequested =
         typeof rawChallengeId === "string" || rawChallengeId === null;
      const linkedChallengeId =
         effectiveTaskType === "WEEKLY"
            ? await resolveWritableChallengeLink(
                 tx,
                 userId,
                 challengeLinkRequested ? rawChallengeId : undefined,
                 { resolveCurrent: true, onRejected: "unlink" }
              )
            : null;

      if (
         effectiveTaskType !== "WEEKLY" &&
         typeof rawChallengeId === "string"
      ) {
         logger.warn(logEvents.tasksSyncFailed, {
            context: {
               userId,
               mutationId: m.id,
               action: m.action,
               reason: "challenge_link_ignored_daily",
            },
         });
      }

      const challengeId = linkedChallengeId ?? null;

      const existing = await tx.task.findUnique({
         where: { id: taskId },
         select: { userId: true },
      });

      if (existing && existing.userId !== userId) {
         return {
            status: "conflict",
            reason: "foreign_row",
            currentTask: null,
         };
      }

      if (existing) {
         // A delayed CREATE retry must not overwrite a newer edit; the
         // snapshot reconciles the client.
         return categoryMissing
            ? { status: "applied", reason: "category_missing" }
            : APPLIED;
      }

      await tx.task.create({
         data: {
            id: taskId,
            userId,
            categoryId,
            challengeId,
            title,
            taskType: effectiveTaskType,
            sortOrder,
            isComplete: finalIsComplete,
            status,
            dueDate,
            completedAt: finalIsComplete ? new Date() : null,
         },
      });
      return categoryMissing
         ? { status: "applied", reason: "category_missing" }
         : APPLIED;
   }

   let currentTaskGuard: {
      challengeId: string | null;
      taskType: TaskType;
      createdAt: Date;
   } | null = null;
   // Resolved once and reused by the write block: the post-move column comes
   // from the destination category.
   let resolvedTargetCategory: { id: string; taskType: TaskType } | null = null;

   if (
      m.action === "UPDATE" ||
      m.action === "MOVE" ||
      m.action === "TOGGLE" ||
      m.action === "DELETE"
   ) {
      if (!taskId) return APPLIED;

      currentTaskGuard = await tx.task.findFirst({
         where: { id: taskId, userId, isDeleted: false },
         select: { challengeId: true, taskType: true, createdAt: true },
      });

      if (
         currentTaskGuard?.challengeId &&
         currentTaskGuard.taskType === "WEEKLY"
      ) {
         try {
            await assertChallengeWritable(tx, currentTaskGuard.challengeId);
         } catch (error) {
            if (error instanceof ChallengeStateError) {
               const current = await tx.task.findFirst({
                  where: { id: taskId, userId, isDeleted: false },
               });
               return {
                  status: "conflict",
                  reason: "challenge_locked",
                  currentTask: current
                     ? toTaskItem(current, current.taskType)
                     : null,
               };
            }
            throw error;
         }
      }

      // Resolve the destination category before the lock checks. The task's
      // post-move column is derived from it, so a category-only MOVE must face
      // the same grace-lock rules as an explicit taskType change.
      resolvedTargetCategory = categoryId
         ? await tx.category.findFirst({
              where: { id: categoryId, userId, isDeleted: false },
              select: { id: true, taskType: true },
           })
         : null;
      const nextTaskType: TaskType =
         resolvedTargetCategory?.taskType ??
         (payload.taskType
            ? taskType
            : (currentTaskGuard?.taskType ?? taskType));

      const changesLockedFields =
         m.action === "DELETE" ||
         ((m.action === "UPDATE" || m.action === "MOVE") &&
            (Boolean(title) ||
               payload.challengeId !== undefined ||
               (currentTaskGuard != null &&
                  nextTaskType !== currentTaskGuard.taskType)));

      if (
         currentTaskGuard &&
         changesLockedFields &&
         isWeeklyTaskGraceExpired(currentTaskGuard)
      ) {
         const current = await tx.task.findFirst({
            where: { id: taskId, userId, isDeleted: false },
         });
         return {
            status: "conflict",
            reason: "task_locked",
            currentTask: current ? toTaskItem(current, current.taskType) : null,
         };
      }
   }

   if (m.action === "UPDATE" || m.action === "MOVE") {
      if (!taskId) return APPLIED;

      const dataToUpdate: Record<string, unknown> = {};
      let categoryMissing = false;
      // The type the task will have after this mutation. Falls back to the
      // stored type when no category is supplied.
      let effectiveTaskType = currentTaskGuard?.taskType ?? taskType;

      if (title) dataToUpdate.title = title;
      if (categoryId) {
         const targetCat = resolvedTargetCategory;
         if (targetCat) {
            dataToUpdate.categoryId = categoryId;
            // A task's board column follows the category it belongs to.
            effectiveTaskType = targetCat.taskType;
            dataToUpdate.taskType = targetCat.taskType;
         } else {
            categoryMissing = true;
         }
      } else if (payload.taskType) {
         effectiveTaskType = taskType;
         dataToUpdate.taskType = taskType;
      }

      // Dropping a weekly task to the daily board must clear its challenge
      // link; daily tasks cannot be challenge-scoped.
      if (
         effectiveTaskType !== "WEEKLY" &&
         currentTaskGuard?.taskType === "WEEKLY"
      ) {
         dataToUpdate.challengeId = null;
      }
      if (typeof payload.sortOrder === "number")
         dataToUpdate.sortOrder = payload.sortOrder;
      if (payload.dueDate !== undefined) {
         dataToUpdate.dueDate = payload.dueDate
            ? new Date(String(payload.dueDate))
            : null;
      }
      if (payload.challengeId !== undefined) {
         if (effectiveTaskType === "WEEKLY") {
            const rawChalId = payload.challengeId;
            const linked = await resolveWritableChallengeLink(
               tx,
               userId,
               typeof rawChalId === "string" ? rawChalId.trim() || null : null,
               { onRejected: "omit" }
            );
            if (linked !== undefined) {
               dataToUpdate.challengeId = linked;
            }
         } else if (payload.challengeId === null) {
            // Allow cleanup of a legacy daily challenge link.
            dataToUpdate.challengeId = null;
         } else {
            logger.warn(logEvents.tasksSyncFailed, {
               context: {
                  userId,
                  mutationId: m.id,
                  action: m.action,
                  reason: "challenge_link_ignored_daily",
               },
            });
         }
      }
      if (payload.status) {
         const status = payload.status as TaskStatus;
         dataToUpdate.status = status;
         dataToUpdate.isComplete = status === "COMPLETED";
         dataToUpdate.completedAt = status === "COMPLETED" ? new Date() : null;
      } else if (typeof payload.isComplete === "boolean") {
         dataToUpdate.isComplete = payload.isComplete;
         dataToUpdate.status = payload.isComplete ? "COMPLETED" : "TODO";
         dataToUpdate.completedAt = payload.isComplete ? new Date() : null;
      }

      const { count } = await tx.task.updateMany({
         where: {
            id: taskId,
            userId,
            isDeleted: false,
            ...(baseRevision !== undefined ? { revision: baseRevision } : {}),
         },
         data: { ...dataToUpdate, revision: { increment: 1 } },
      });

      if (count === 0) {
         const current = await tx.task.findFirst({
            where: { id: taskId, userId, isDeleted: false },
         });
         return {
            status: "conflict",
            reason: "zero_rows",
            currentTask: current ? toTaskItem(current, current.taskType) : null,
         };
      }

      return categoryMissing
         ? { status: "applied", reason: "category_missing" }
         : APPLIED;
   }

   if (m.action === "REORDER") {
      const parsed = taskReorderPayloadSchema.safeParse(payload);
      if (!parsed.success) return INVALID;
      const { taskIds, baseRevisions } = parsed.data;

      // Optimistic concurrency: a stale batch must not clobber a newer order.
      if (baseRevisions) {
         const current = await tx.task.findMany({
            where: { id: { in: taskIds }, userId, isDeleted: false },
            select: { id: true, revision: true, categoryId: true },
         });
         const drifted = current.find(
            (task) =>
               baseRevisions[task.id] !== undefined &&
               task.revision !== baseRevisions[task.id]
         );
         if (drifted) {
            const row = await tx.task.findFirst({
               where: { id: drifted.id, userId, isDeleted: false },
            });
            return {
               status: "conflict",
               reason: "zero_rows",
               currentTask: row ? toTaskItem(row, row.taskType) : null,
            };
         }
      }

      for (let i = 0; i < taskIds.length; i++) {
         await tx.task.updateMany({
            where: { id: taskIds[i], userId, isDeleted: false },
            data: { sortOrder: i, revision: { increment: 1 } },
         });
      }
      return APPLIED;
   }

   if (m.action === "TOGGLE") {
      if (!taskId) return APPLIED;

      const status: TaskStatus =
         (payload.status as TaskStatus) || (isComplete ? "COMPLETED" : "TODO");
      const finalIsComplete = status === "COMPLETED";

      const { count } = await tx.task.updateMany({
         where: {
            id: taskId,
            userId,
            isDeleted: false,
            ...(baseRevision !== undefined ? { revision: baseRevision } : {}),
         },
         data: {
            isComplete: finalIsComplete,
            status,
            completedAt: finalIsComplete ? new Date() : null,
            revision: { increment: 1 },
         },
      });

      if (count === 0) {
         const current = await tx.task.findFirst({
            where: { id: taskId, userId, isDeleted: false },
         });
         return {
            status: "conflict",
            reason: "zero_rows",
            currentTask: current ? toTaskItem(current, current.taskType) : null,
         };
      }

      return APPLIED;
   }

   if (m.action === "DELETE") {
      if (!taskId) return APPLIED;

      await tx.task.updateMany({
         where: { id: taskId, userId, isDeleted: false },
         data: {
            isDeleted: true,
            deletionTime: new Date(),
            revision: { increment: 1 },
         },
      });

      return APPLIED;
   }

   if (m.action === "ROLLOVER") {
      const parsed = taskRolloverPayloadSchema.safeParse(payload);
      if (!parsed.success) return INVALID;

      await rolloverIncompleteTasks(
         {
            userId,
            taskIds: parsed.data.taskIds,
            targetDateKey: parsed.data.targetDateKey,
         },
         tx
      );

      return APPLIED;
   }

   return { status: "error", reason: "invalid_payload" };
}

/**
 * Processes a queued batch of offline task and category mutations for a user.
 * Each mutation is isolated in its own transaction so individual failures do not
 * prevent remaining valid mutations from committing.
 *
 * @param userId - ID of the authenticated user performing the sync.
 * @param rawMutations - Array of pending offline mutations to apply.
 * @returns BatchSyncResponse with per-mutation results, the authenticated user ID, and latest server changes.
 */
async function recoverP2002(
   userId: string,
   mutation: QueuedMutation
): Promise<Outcome | null> {
   const payload = mutation.payload as Record<string, unknown>;

   if (mutation.entityType === "CATEGORY") {
      const categoryId = String(payload.categoryId || payload.id || "");
      const current = categoryId
         ? await prisma.category.findUnique({
              where: { id: categoryId },
              select: { taskType: true },
           })
         : null;
      const taskType: TaskType =
         payload.taskType === "WEEKLY"
            ? "WEEKLY"
            : payload.taskType === "DAILY"
              ? "DAILY"
              : (current?.taskType ?? "DAILY");
      const name = typeof payload.name === "string" ? payload.name.trim() : "";
      if (!name) return null;

      const winner = await prisma.category.findFirst({
         where: {
            userId,
            taskType,
            isDeleted: false,
            name: { equals: name, mode: "insensitive" },
         },
      });

      return {
         status: "conflict",
         reason: "category_name_taken",
         currentCategory: winner ? toCategoryItem(winner) : undefined,
      };
   }

   if (mutation.entityType === "TASK") {
      const taskId = String(payload.id || payload.taskId || "");
      if (!taskId) return null;

      const winner = await prisma.task.findUnique({
         where: { id: taskId },
         select: { userId: true },
      });
      if (winner?.userId === userId) return APPLIED;
      return {
         status: "conflict",
         reason: "foreign_row",
         currentTask: null,
      };
   }

   return null;
}

export async function processBatchSync(
   userId: string,
   rawMutations: QueuedMutation[]
): Promise<BatchSyncResponse> {
   const mutations = compactMutationQueue(rawMutations);
   const mutationResults: MutationResult[] = [];

   for (const m of mutations) {
      try {
         const outcome = await prisma.$transaction((tx) =>
            m.entityType === "CATEGORY"
               ? applyCategoryMutation(tx, userId, m)
               : applyTaskMutation(tx, userId, m)
         );

         mutationResults.push({ id: m.id, ...outcome });
      } catch (err) {
         if (isP2002(err)) {
            try {
               const recovery = await recoverP2002(userId, m);
               if (recovery) {
                  mutationResults.push({ id: m.id, ...recovery });
                  continue;
               }
            } catch (recoveryError) {
               logger.error(logEvents.tasksSyncFailed, {
                  context: {
                     userId,
                     mutationId: m.id,
                     action: m.action,
                     reason: "p2002_recovery_failed",
                  },
                  error: recoveryError,
               });
            }
         }

         logger.error(logEvents.tasksSyncFailed, {
            context: { userId, mutationId: m.id, action: m.action },
            error: err,
         });
         mutationResults.push({
            id: m.id,
            status: "error",
            reason: "invalid_payload",
         });
      }
   }

   // Acknowledge mutations that compaction pruned from the batch.
   const seenMutationIds = new Set(mutationResults.map((r) => r.id));
   for (const raw of rawMutations) {
      if (!seenMutationIds.has(raw.id)) {
         mutationResults.push({ id: raw.id, status: "applied" });
      }
   }

   const processedMutationIds = mutationResults
      .filter((r) => r.status !== "error")
      .map((r) => r.id);

   const latest =
      typeof getUserCategorizedTasksFromDatabase === "function"
         ? await getUserCategorizedTasksFromDatabase(userId)
         : await getUserCategorizedTasks(userId);

   const flatTasks = [
      ...latest.dailyCategories.flatMap((c) => c.tasks),
      ...latest.weeklyCategories.flatMap((c) => c.tasks),
   ];

   return {
      success: true,
      processedMutationIds,
      mutationResults,
      authenticatedUserId: userId,
      serverChanges: {
         categories: latest.categories,
         tasks: flatTasks,
      },
   };
}
