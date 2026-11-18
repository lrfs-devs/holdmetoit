"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
   validateMoveTaskChallengeDay,
   type ChallengeDayOption,
} from "@/features/study-logs/domain/challenge-day";
import {
   moveCategoryToDay,
   moveTaskBetweenCategories,
} from "@/features/tasks/domain/task-reorder";
import { isWeeklyTaskGraceExpired } from "@/features/tasks/domain/task-lock";
import type { TaskStatus, TaskType } from "@/features/tasks/domain/task.types";
import type {
   LocalCategoryRecord,
   LocalTaskRecord,
   QueuedMutation,
} from "@/features/tasks/domain/task-sync.types";
import {
   commitLocalBatch,
   logTaskSync,
} from "@/features/tasks/data/local/task-idb";
import { scheduleSync } from "@/features/tasks/data/local/task-sync.service";
import { trackLogRocketEvent } from "@/core/observability/logrocket";
import type { TaskBoardPersistence } from "./use-task-board-persistence";
import type { BoardCategory, BoardTask } from "../task-board.types";
import {
   buildBoardTaskRecord,
   getTaskStatus,
   revertTaskMove,
   toBoardTask,
} from "../task-board.utils";

export interface UseTaskMovesOptions {
   userId?: string | null;
   isLoggedIn: boolean;
   selectedDateKey: string;
   effectiveTodayDate: string;
   hasChallengeContext: boolean;
   dayOptions: ChallengeDayOption[];
   dailyCategories: BoardCategory[];
   weeklyCategories: BoardCategory[];
   setDailyCategories: Dispatch<SetStateAction<BoardCategory[]>>;
   setWeeklyCategories: Dispatch<SetStateAction<BoardCategory[]>>;
   persistTask: TaskBoardPersistence["persistTask"];
   checkIsDayLocked: (dateKey: string) => boolean;
   getTaskDateKey: (task: BoardTask) => string;
}

export interface MoveTaskLike {
   id: string;
   text?: string;
   title?: string;
   completed?: boolean;
   isComplete?: boolean;
   status?: string;
   dueDate?: string | null;
   createdAt?: string | Date;
   challengeId?: string | null;
}

export interface CommitTaskMoveParams {
   task: MoveTaskLike;
   targetCategoryId: string;
   targetTaskType: TaskType;
   targetDueDate: string | null;
   sortOrder: number;
   action: "MOVE" | "UPDATE";
   payload: Record<string, unknown>;
   title?: string;
   isComplete?: boolean;
   status?: TaskStatus;
   challengeId?: string | null;
   delayMs?: number;
   nowIso?: string;
}

export interface TaskMoves {
   moveTaskToDay: (
      taskId: string,
      targetDateKey: string,
      sourceCatIdx?: number,
      sourceColumn?: "daily" | "weekly"
   ) => void;
   moveCategoryToDayAction: (
      catIdx: number,
      targetDateKey: string,
      sourceColumn?: "daily" | "weekly"
   ) => void;
   commitTaskMove: (params: CommitTaskMoveParams) => void;
}

/**
 * Owns every move gesture: menu/day-pill moves, category-to-day moves, and the
 * shared task-record commit used by drag-and-drop.
 */
export function useTaskMoves({
   userId,
   isLoggedIn,
   selectedDateKey,
   effectiveTodayDate,
   hasChallengeContext,
   dayOptions,
   dailyCategories,
   weeklyCategories,
   setDailyCategories,
   setWeeklyCategories,
   persistTask,
   checkIsDayLocked,
   getTaskDateKey,
}: UseTaskMovesOptions): TaskMoves {
   const commitTaskMove = useCallback(
      ({
         task,
         targetCategoryId,
         targetTaskType,
         targetDueDate,
         sortOrder,
         action,
         payload,
         title,
         isComplete,
         status,
         challengeId,
         delayMs,
         nowIso,
      }: CommitTaskMoveParams) => {
         const normalizedTask: BoardTask = {
            id: task.id,
            text: task.text ?? task.title ?? "",
            completed: Boolean(task.completed ?? task.isComplete),
            status: task.status as TaskStatus | undefined,
            dueDate: task.dueDate ?? null,
            createdAt: task.createdAt
               ? typeof task.createdAt === "string"
                  ? task.createdAt
                  : task.createdAt.toISOString()
               : undefined,
            challengeId: task.challengeId ?? null,
         };

         const record = buildBoardTaskRecord({
            task: normalizedTask,
            userId: userId ?? null,
            categoryId: targetCategoryId,
            taskType: targetTaskType,
            sortOrder,
            dueDate: targetDueDate,
            title,
            isComplete,
            status,
            challengeId,
            nowIso,
         });

         persistTask(record, {
            id: crypto.randomUUID(),
            entityType: "TASK",
            action,
            payload,
            createdAt: Date.now(),
            retryCount: 0,
         })
            .then(() => scheduleSync(userId, delayMs))
            .catch(() => {});
      },
      [persistTask, userId]
   );

   const moveTaskToDay = useCallback(
      (
         taskId: string,
         targetDateKey: string,
         sourceCatIdx?: number,
         sourceColumn: "daily" | "weekly" = "daily"
      ) => {
         // If source is weekly
         if (sourceColumn === "weekly") {
            if (checkIsDayLocked(targetDateKey)) return;
            const foundWeeklyCatIdx =
               sourceCatIdx !== undefined
                  ? sourceCatIdx
                  : weeklyCategories.findIndex((c) =>
                       c.tasks.some((t) => t.id === taskId)
                    );
            if (foundWeeklyCatIdx === -1) return;
            const sourceCat = weeklyCategories[foundWeeklyCatIdx];
            let targetDailyIdx = dailyCategories.findIndex(
               (c) =>
                  (sourceCat.id && c.id === sourceCat.id) ||
                  c.name === sourceCat.name
            );
            let currentDailyCats = dailyCategories;
            let createdCategoryId: string | undefined;
            if (targetDailyIdx === -1) {
               createdCategoryId = crypto.randomUUID();
               const newDailyCat: BoardCategory = {
                  id: createdCategoryId,
                  name: sourceCat.name,
                  isCollapsed: false,
                  tasks: [],
               };
               currentDailyCats = [...dailyCategories, newDailyCat];
               targetDailyIdx = currentDailyCats.length - 1;
            }

            // Pre-move record, used to reverse just this move if the write
            // rejects while other edits are landing.
            const foundWeeklyPlacement = sourceCat.tasks.find(
               (task) => task.id === taskId
            );

            const res = moveTaskBetweenCategories({
               taskId,
               sourceCategoryIndex: foundWeeklyCatIdx,
               sourceColumn: "weekly",
               targetCategoryIndex: targetDailyIdx,
               targetColumn: "daily",
               targetTaskIndex: currentDailyCats[targetDailyIdx].tasks.length,
               targetDueDate: targetDateKey,
               dailyCategories: currentDailyCats,
               weeklyCategories,
            });

            setDailyCategories(res.dailyCategories);
            setWeeklyCategories(res.weeklyCategories);

            if (res.movedTask && res.targetCategoryId) {
               const isMovedComplete = Boolean(
                  res.movedTask.completed ?? res.movedTask.isComplete
               );
               const movedStatus =
                  (res.movedTask.status as TaskStatus) ||
                  (isMovedComplete ? "COMPLETED" : "TODO");
               const sortOrder = currentDailyCats[targetDailyIdx].tasks.length;
               const nowIso = new Date().toISOString();

               // The destination category and the moved task are written in one
               // batch: a task pointing at an unpersisted category is unloadable
               // after reload.
               const localCategory: LocalCategoryRecord | null =
                  createdCategoryId
                     ? {
                          id: createdCategoryId,
                          userId: userId ?? null,
                          name: sourceCat.name,
                          taskType: "DAILY",
                          sortOrder: targetDailyIdx,
                          createdAt: nowIso,
                          updatedAt: nowIso,
                          syncState: "pending",
                       }
                     : null;

               const localTask = buildBoardTaskRecord({
                  task: toBoardTask(res.movedTask),
                  userId: userId ?? null,
                  categoryId: res.targetCategoryId,
                  taskType: "DAILY",
                  sortOrder,
                  dueDate: targetDateKey,
                  challengeId: null,
                  nowIso,
               });

               const mutations: Array<Omit<QueuedMutation, "userId">> = [];
               if (createdCategoryId) {
                  mutations.push({
                     id: crypto.randomUUID(),
                     entityType: "CATEGORY",
                     action: "CREATE",
                     payload: {
                        id: createdCategoryId,
                        name: sourceCat.name,
                        taskType: "DAILY",
                        sortOrder: targetDailyIdx,
                     },
                     createdAt: Date.now(),
                     retryCount: 0,
                  });
               }
               mutations.push({
                  id: crypto.randomUUID(),
                  entityType: "TASK",
                  action: "MOVE",
                  payload: {
                     taskId: res.movedTask.id,
                     categoryId: res.targetCategoryId,
                     taskType: "DAILY",
                     sortOrder,
                     dueDate: targetDateKey,
                  },
                  createdAt: Date.now() + 1,
                  retryCount: 0,
               });

               commitLocalBatch({
                  categories: localCategory ? [localCategory] : [],
                  tasks: [localTask],
                  mutations:
                     isLoggedIn && userId
                        ? mutations.map((mutation) => ({
                             ...mutation,
                             userId,
                          }))
                        : [],
               })
                  .then(() => scheduleSync(userId))
                  .catch(() => {
                     if (!foundWeeklyPlacement) return;
                     const rollbackParams = {
                        taskId: foundWeeklyPlacement.id,
                        task: toBoardTask(foundWeeklyPlacement),
                        sourceColumn: "weekly" as const,
                        sourceCategoryId: sourceCat.id,
                        sourceCategoryName: sourceCat.name,
                     };
                     setDailyCategories(
                        (prevDaily) =>
                           revertTaskMove(
                              {
                                 dailyCategories: prevDaily,
                                 weeklyCategories: [],
                              },
                              {
                                 ...rollbackParams,
                                 createdCategoryId,
                              }
                           ).dailyCategories
                     );
                     setWeeklyCategories(
                        (prevWeekly) =>
                           revertTaskMove(
                              {
                                 dailyCategories: [],
                                 weeklyCategories: prevWeekly,
                              },
                              rollbackParams
                           ).weeklyCategories
                     );
                  });
            }
            return;
         }

         // Source is daily
         let foundCatIdx = sourceCatIdx;
         let foundTask: BoardTask | undefined;
         if (foundCatIdx !== undefined && dailyCategories[foundCatIdx]) {
            foundTask = dailyCategories[foundCatIdx].tasks.find(
               (t) => t.id === taskId
            );
         }
         if (!foundTask) {
            for (let ci = 0; ci < dailyCategories.length; ci++) {
               const t = dailyCategories[ci].tasks.find(
                  (item) => item.id === taskId
               );
               if (t) {
                  foundCatIdx = ci;
                  foundTask = t;
                  break;
               }
            }
         }
         if (!foundTask || foundCatIdx === undefined) return;

         const sourceDateKey = getTaskDateKey(foundTask);
         if (checkIsDayLocked(sourceDateKey)) return;
         const validation = validateMoveTaskChallengeDay(
            sourceDateKey,
            targetDateKey,
            effectiveTodayDate,
            {
               isChallengeActive: hasChallengeContext,
               isTargetDayLocked: checkIsDayLocked(targetDateKey),
            }
         );
         if (!validation.ok) return;

         const targetCat = dailyCategories[foundCatIdx];

         setDailyCategories((prev) =>
            prev.map((cat, ci) =>
               ci === foundCatIdx
                  ? {
                       ...cat,
                       tasks: cat.tasks.map((t) =>
                          t.id === taskId ? { ...t, dueDate: targetDateKey } : t
                       ),
                    }
                  : cat
            )
         );

         if (targetCat?.id) {
            const isComplete = Boolean(foundTask.completed);
            const sortOrder = Math.max(
               0,
               targetCat.tasks.findIndex((t) => t.id === taskId)
            );

            commitTaskMove({
               task: foundTask,
               targetCategoryId: targetCat.id,
               targetTaskType: "DAILY",
               targetDueDate: targetDateKey,
               sortOrder,
               action: "UPDATE",
               payload: {
                  taskId: foundTask.id,
                  dueDate: targetDateKey,
               },
               isComplete,
               status: getTaskStatus(foundTask),
               challengeId: null,
               delayMs: 400,
            });
         }

         logTaskSync("Task moved to day", {
            taskId,
            sourceDateKey,
            targetDateKey,
         });
      },
      [
         checkIsDayLocked,
         commitTaskMove,
         dailyCategories,
         effectiveTodayDate,
         getTaskDateKey,
         hasChallengeContext,
         isLoggedIn,
         setDailyCategories,
         setWeeklyCategories,
         userId,
         weeklyCategories,
      ]
   );

   const moveCategoryToDayAction = useCallback(
      (
         catIdx: number,
         targetDateKey: string,
         sourceColumn: "daily" | "weekly" = "daily"
      ) => {
         if (sourceColumn === "weekly") {
            if (checkIsDayLocked(targetDateKey)) return;
            if (catIdx < 0 || catIdx >= weeklyCategories.length) return;
            const sourceCat = weeklyCategories[catIdx];
            if (!sourceCat) return;

            if (
               sourceCat.tasks.some((t) =>
                  isWeeklyTaskGraceExpired({
                     taskType: "WEEKLY",
                     challengeId: t.challengeId,
                     createdAt: t.createdAt ?? new Date(),
                  })
               )
            ) {
               return;
            }

            const res = moveCategoryToDay<BoardTask, BoardCategory>({
               categoryIndex: catIdx,
               sourceColumn: "weekly",
               targetDateKey,
               dailyCategories,
               weeklyCategories,
            });

            setDailyCategories(res.dailyCategories);
            setWeeklyCategories(res.weeklyCategories);

            if (res.movedCategory?.id) {
               const nowIso = new Date().toISOString();
               const catId = res.movedCategory.id;

               const localCategory: LocalCategoryRecord = {
                  id: catId,
                  userId: userId ?? null,
                  name: res.movedCategory.name,
                  taskType: "DAILY",
                  sortOrder: dailyCategories.length,
                  createdAt: nowIso,
                  updatedAt: nowIso,
                  syncState: "pending",
               };

               const tasksToUpdate: LocalTaskRecord[] = res.movedTasks.map(
                  (t, idx) =>
                     buildBoardTaskRecord({
                        task: t,
                        userId: userId ?? null,
                        categoryId: catId,
                        taskType: "DAILY",
                        sortOrder: idx,
                        dueDate: targetDateKey,
                        title: t.text || "",
                        challengeId: null,
                        nowIso,
                     })
               );

               const allCatsToUpdate: LocalCategoryRecord[] = [
                  ...res.dailyCategories
                     .filter((c): c is typeof c & { id: string } =>
                        Boolean(c.id)
                     )
                     .map((c, idx) => ({
                        id: c.id,
                        userId: userId ?? null,
                        name: c.name,
                        taskType: "DAILY" as const,
                        sortOrder: idx,
                        createdAt: nowIso,
                        updatedAt: nowIso,
                        syncState: "pending" as const,
                     })),
                  ...res.weeklyCategories
                     .filter((c): c is typeof c & { id: string } =>
                        Boolean(c.id)
                     )
                     .map((c, idx) => ({
                        id: c.id,
                        userId: userId ?? null,
                        name: c.name,
                        taskType: "WEEKLY" as const,
                        sortOrder: idx,
                        createdAt: nowIso,
                        updatedAt: nowIso,
                        syncState: "pending" as const,
                     })),
               ];

               const mutations: Array<Omit<QueuedMutation, "userId">> = [
                  {
                     id: crypto.randomUUID(),
                     entityType: "CATEGORY",
                     action: "MOVE",
                     payload: {
                        categoryId: res.movedCategory.id,
                        taskType: "DAILY",
                        sortOrder: dailyCategories.length,
                     },
                     createdAt: Date.now(),
                     retryCount: 0,
                  },
                  ...res.movedTasks.map((t) => ({
                     id: crypto.randomUUID(),
                     entityType: "TASK" as const,
                     action: "MOVE" as const,
                     payload: {
                        taskId: t.id,
                        categoryId: catId,
                        taskType: "DAILY",
                        dueDate: targetDateKey,
                     },
                     createdAt: Date.now(),
                     retryCount: 0,
                  })),
               ];

               commitLocalBatch({
                  categories: [localCategory, ...allCatsToUpdate],
                  tasks: tasksToUpdate,
                  mutations:
                     isLoggedIn && userId
                        ? mutations.map((mutation) => ({
                             ...mutation,
                             userId,
                          }))
                        : [],
               })
                  .then(() => scheduleSync(userId))
                  .catch(() => {});

               if (isLoggedIn && userId) {
                  trackLogRocketEvent("WeeklyCategoryMovedToDay", {
                     categoryId: res.movedCategory.id,
                     targetDateKey,
                  });
               }

               logTaskSync("Weekly category moved to day via drag and drop", {
                  categoryId: res.movedCategory.id,
                  targetDateKey,
               });
            }
            return;
         }

         // sourceColumn === "daily"
         if (catIdx < 0 || catIdx >= dailyCategories.length) return;
         const sourceCat = dailyCategories[catIdx];
         if (!sourceCat) return;

         const sourceDateKey = selectedDateKey;
         if (checkIsDayLocked(sourceDateKey)) return;
         const validation = validateMoveTaskChallengeDay(
            sourceDateKey,
            targetDateKey,
            effectiveTodayDate,
            {
               isChallengeActive: hasChallengeContext,
               isTargetDayLocked: checkIsDayLocked(targetDateKey),
            }
         );
         if (!validation.ok) return;

         if (sourceDateKey === targetDateKey) return;

         const res = moveCategoryToDay<BoardTask, BoardCategory>({
            categoryIndex: catIdx,
            sourceColumn: "daily",
            sourceDateKey,
            targetDateKey,
            dailyCategories,
            weeklyCategories,
         });

         setDailyCategories(res.dailyCategories);

         if (res.movedTasks.length > 0 && sourceCat.id) {
            const nowIso = new Date().toISOString();
            const catId = sourceCat.id;

            const tasksToUpdate: LocalTaskRecord[] = res.movedTasks.map(
               (t, idx) =>
                  buildBoardTaskRecord({
                     task: t,
                     userId: userId ?? null,
                     categoryId: catId,
                     taskType: "DAILY",
                     sortOrder: idx,
                     dueDate: targetDateKey,
                     title: t.text || "",
                     challengeId: null,
                     nowIso,
                  })
            );

            const mutations: Array<Omit<QueuedMutation, "userId">> =
               res.movedTasks.map((t) => ({
                  id: crypto.randomUUID(),
                  entityType: "TASK" as const,
                  action: "MOVE" as const,
                  payload: {
                     taskId: t.id,
                     categoryId: catId,
                     taskType: "DAILY",
                     dueDate: targetDateKey,
                  },
                  createdAt: Date.now(),
                  retryCount: 0,
               }));

            commitLocalBatch({
               tasks: tasksToUpdate,
               mutations:
                  isLoggedIn && userId
                     ? mutations.map((mutation) => ({ ...mutation, userId }))
                     : [],
            })
               .then(() => scheduleSync(userId))
               .catch(() => {});

            if (isLoggedIn && userId) {
               trackLogRocketEvent("DailyCategoryMovedToDay", {
                  categoryId: catId,
                  targetDateKey,
                  tasksCount: res.movedTasks.length,
               });
            }

            logTaskSync("Daily category moved to day via drag and drop", {
               categoryId: catId,
               tasksCount: res.movedTasks.length,
               targetDateKey,
            });
         }
      },
      [
         checkIsDayLocked,
         dailyCategories,
         effectiveTodayDate,
         hasChallengeContext,
         isLoggedIn,
         selectedDateKey,
         setDailyCategories,
         setWeeklyCategories,
         userId,
         weeklyCategories,
      ]
   );

   return { moveTaskToDay, moveCategoryToDayAction, commitTaskMove };
}
