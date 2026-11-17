"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import {
   validateMoveTaskChallengeDay,
   type ChallengeDayOption,
} from "@/features/study-logs/domain/challenge-day";
import {
   calculateReorderIndex,
   moveCategoryBetweenColumns,
   moveTaskBetweenCategories,
} from "@/features/tasks/domain/task-reorder";
import { isWeeklyTaskGraceExpired } from "@/features/tasks/domain/task-lock";
import type { TaskStatus } from "@/features/tasks/domain/task.types";
import type {
   LocalCategoryRecord,
   LocalTaskRecord,
   QueuedMutation,
} from "@/features/tasks/domain/task-sync.types";
import {
   commitLocalBatch,
   logTaskSync,
   putLocalTask,
   putLocalTasks,
} from "@/features/tasks/data/local/task-idb";
import { scheduleSync } from "@/features/tasks/data/local/task-sync.service";
import { trackLogRocketEvent } from "@/core/observability/logrocket";
import type { TaskBoardPersistence } from "./use-task-board-persistence";
import type { TaskMoves } from "./use-task-moves";
import type {
   BoardCategory,
   BoardTask,
   DragOverInfo,
   DraggedItem,
} from "../task-board.types";
import { buildBoardTaskRecord, getTaskStatus } from "../task-board.utils";

export interface UseTaskDragAndDropOptions {
   userId?: string | null;
   isLoggedIn: boolean;
   dailyCategories: BoardCategory[];
   weeklyCategories: BoardCategory[];
   setDailyCategories: Dispatch<SetStateAction<BoardCategory[]>>;
   setWeeklyCategories: Dispatch<SetStateAction<BoardCategory[]>>;
   selectedDateKey: string;
   effectiveTodayDate: string;
   hasChallengeContext: boolean;
   isPastDayLocked: boolean;
   dayOptions: ChallengeDayOption[];
   checkIsDayLocked: (dateKey: string) => boolean;
   getTaskDateKey: (task: BoardTask) => string;
   moveTaskToDay: TaskMoves["moveTaskToDay"];
   moveCategoryToDayAction: TaskMoves["moveCategoryToDayAction"];
   commitTaskMove: TaskMoves["commitTaskMove"];
   persistTask: TaskBoardPersistence["persistTask"];
   persistTasks: TaskBoardPersistence["persistTasks"];
   persistCategory: TaskBoardPersistence["persistCategory"];
}

export interface TaskDragAndDrop {
   draggedItem: DraggedItem | null;
   dragOverInfo: DragOverInfo | null;
   setDragOverInfo: Dispatch<SetStateAction<DragOverInfo | null>>;
   handleTaskDragStart: (
      e: React.DragEvent,
      taskId: string,
      catIdx: number,
      column: "daily" | "weekly"
   ) => void;
   handleCategoryDragStart: (
      e: React.DragEvent,
      catIdx: number,
      column: "daily" | "weekly"
   ) => void;
   handleDragEnd: () => void;
   handleTaskDragOver: (
      e: React.DragEvent,
      targetTaskId: string,
      targetCatIdx: number,
      targetColumn: "daily" | "weekly"
   ) => void;
   handleCategoryDragOver: (
      e: React.DragEvent,
      targetCatIdx: number,
      targetColumn: "daily" | "weekly"
   ) => void;
   handleColumnDragOver: (
      e: React.DragEvent,
      targetColumn: "daily" | "weekly"
   ) => void;
   handleDayPillDragOver: (e: React.DragEvent, opt: ChallengeDayOption) => void;
   handleDayPillDrop: (e: React.DragEvent, opt: ChallengeDayOption) => void;
   handleTaskDrop: (
      e: React.DragEvent,
      targetTaskId: string,
      targetCatIdx: number,
      targetColumn: "daily" | "weekly"
   ) => void;
   handleCategoryDrop: (
      e: React.DragEvent,
      targetCatIdx: number,
      targetColumn: "daily" | "weekly"
   ) => void;
   handleColumnDrop: (
      e: React.DragEvent,
      targetColumn: "daily" | "weekly"
   ) => void;
}

/** Owns all drag state and drop routing for the task board. */
export function useTaskDragAndDrop({
   userId,
   isLoggedIn,
   dailyCategories,
   weeklyCategories,
   setDailyCategories,
   setWeeklyCategories,
   selectedDateKey,
   effectiveTodayDate,
   hasChallengeContext,
   isPastDayLocked,
   dayOptions,
   checkIsDayLocked,
   getTaskDateKey,
   moveTaskToDay,
   moveCategoryToDayAction,
   commitTaskMove,
   persistTask,
   persistTasks,
   persistCategory,
}: UseTaskDragAndDropOptions): TaskDragAndDrop {
   const [draggedItem, setDraggedItem] = useState<DraggedItem | null>(null);
   const [dragOverInfo, setDragOverInfo] = useState<DragOverInfo | null>(null);

   const handleTaskDragStart = (
      e: React.DragEvent,
      taskId: string,
      catIdx: number,
      column: "daily" | "weekly"
   ) => {
      e.stopPropagation();
      const pool = column === "daily" ? dailyCategories : weeklyCategories;
      const sourceTask = pool[catIdx]?.tasks.find((t) => t.id === taskId);
      const sourceDateKey = sourceTask
         ? getTaskDateKey(sourceTask)
         : column === "daily"
           ? selectedDateKey
           : undefined;

      setDraggedItem({
         type: "task",
         id: taskId,
         sourceCatIdx: catIdx,
         sourceColumn: column,
         sourceDateKey,
      });
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(
         "application/json",
         JSON.stringify({ type: "task", taskId, catIdx, column, sourceDateKey })
      );

      const targetEl = e.currentTarget as HTMLElement;
      const cardEl = targetEl.closest<HTMLElement>('[data-drag-card="task"]');
      if (cardEl && e.dataTransfer && e.dataTransfer.setDragImage) {
         const rect = cardEl.getBoundingClientRect();
         const offsetX = Math.max(
            16,
            Math.min(e.clientX - rect.left, rect.width - 16)
         );
         const offsetY = Math.max(
            12,
            Math.min(e.clientY - rect.top, rect.height - 12)
         );
         e.dataTransfer.setDragImage(cardEl, offsetX, offsetY);
      }
   };

   const handleCategoryDragStart = (
      e: React.DragEvent,
      catIdx: number,
      column: "daily" | "weekly"
   ) => {
      e.stopPropagation();
      const sourceDateKey = column === "daily" ? selectedDateKey : undefined;
      setDraggedItem({
         type: "category",
         sourceCatIdx: catIdx,
         sourceColumn: column,
         sourceDateKey,
      });
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(
         "application/json",
         JSON.stringify({ type: "category", catIdx, column, sourceDateKey })
      );

      const targetEl = e.currentTarget as HTMLElement;
      const cardEl = targetEl.closest<HTMLElement>(
         '[data-drag-card="category"]'
      );
      if (cardEl && e.dataTransfer && e.dataTransfer.setDragImage) {
         const rect = cardEl.getBoundingClientRect();
         const offsetX = Math.max(
            20,
            Math.min(e.clientX - rect.left, rect.width - 20)
         );
         const offsetY = 20;
         e.dataTransfer.setDragImage(cardEl, offsetX, offsetY);
      }
   };

   const handleDragEnd = () => {
      setDraggedItem(null);
      setDragOverInfo(null);
   };

   const handleTaskDragOver = (
      e: React.DragEvent,
      targetTaskId: string,
      targetCatIdx: number,
      targetColumn: "daily" | "weekly"
   ) => {
      if (!draggedItem) return;
      if (draggedItem.type === "category") {
         handleCategoryDragOver(e, targetCatIdx, targetColumn);
         return;
      }
      if (draggedItem.type !== "task") return;
      e.preventDefault();
      e.stopPropagation();

      if (
         targetColumn === "daily" &&
         draggedItem.sourceColumn === "weekly" &&
         isPastDayLocked
      ) {
         e.dataTransfer.dropEffect = "none";
         return;
      }

      e.dataTransfer.dropEffect = "move";
      const rect = e.currentTarget.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const position = e.clientY < midY ? "above" : "below";

      setDragOverInfo({
         type: "task",
         targetId: targetTaskId,
         targetCatIdx,
         targetColumn,
         position,
      });
   };

   const handleCategoryDragOver = (
      e: React.DragEvent,
      targetCatIdx: number,
      targetColumn: "daily" | "weekly"
   ) => {
      if (!draggedItem) return;
      e.preventDefault();
      e.stopPropagation();

      if (
         targetColumn === "daily" &&
         draggedItem.sourceColumn === "weekly" &&
         isPastDayLocked
      ) {
         e.dataTransfer.dropEffect = "none";
         return;
      }

      e.dataTransfer.dropEffect = "move";
      if (draggedItem.type === "category") {
         const rect = e.currentTarget.getBoundingClientRect();
         const midY = rect.top + rect.height / 2;
         const position = e.clientY < midY ? "above" : "below";
         setDragOverInfo({
            type: "category",
            targetCatIdx,
            targetColumn,
            position,
         });
      } else if (draggedItem.type === "task") {
         setDragOverInfo({
            type: "category",
            targetCatIdx,
            targetColumn,
         });
      }
   };

   const handleColumnDragOver = (
      e: React.DragEvent,
      targetColumn: "daily" | "weekly"
   ) => {
      if (!draggedItem) return;
      if (
         targetColumn === "daily" &&
         draggedItem.sourceColumn === "weekly" &&
         isPastDayLocked
      ) {
         e.dataTransfer.dropEffect = "none";
         return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (!dragOverInfo || dragOverInfo.targetColumn !== targetColumn) {
         setDragOverInfo({
            type: "column",
            targetColumn,
         });
      }
   };

   const handleDayPillDragOver = (
      e: React.DragEvent,
      opt: ChallengeDayOption
   ) => {
      if (!draggedItem) return;
      e.preventDefault();
      e.stopPropagation();

      if (draggedItem.sourceColumn === "daily") {
         const sourceDateKey = draggedItem.sourceDateKey || selectedDateKey;
         if (checkIsDayLocked(sourceDateKey)) {
            e.dataTransfer.dropEffect = "none";
            return;
         }
         const validation = validateMoveTaskChallengeDay(
            sourceDateKey,
            opt.dateKey,
            effectiveTodayDate,
            {
               isChallengeActive: hasChallengeContext,
               isTargetDayLocked: checkIsDayLocked(opt.dateKey),
            }
         );
         if (!validation.ok) {
            e.dataTransfer.dropEffect = "none";
            if (!dragOverInfo || dragOverInfo.targetDateKey !== opt.dateKey) {
               setDragOverInfo({
                  type: "day",
                  targetDateKey: opt.dateKey,
               });
            }
            return;
         }
      } else if (draggedItem.sourceColumn === "weekly") {
         if (
            checkIsDayLocked(opt.dateKey) ||
            (hasChallengeContext && opt.isPast)
         ) {
            e.dataTransfer.dropEffect = "none";
            if (!dragOverInfo || dragOverInfo.targetDateKey !== opt.dateKey) {
               setDragOverInfo({
                  type: "day",
                  targetDateKey: opt.dateKey,
               });
            }
            return;
         }
      }

      e.dataTransfer.dropEffect = "move";
      if (!dragOverInfo || dragOverInfo.targetDateKey !== opt.dateKey) {
         setDragOverInfo({
            type: "day",
            targetDateKey: opt.dateKey,
         });
      }
   };

   const handleDayPillDrop = (e: React.DragEvent, opt: ChallengeDayOption) => {
      e.preventDefault();
      e.stopPropagation();

      if (!draggedItem) {
         handleDragEnd();
         return;
      }

      if (draggedItem.type === "category") {
         if (draggedItem.sourceColumn === "daily") {
            const sourceDateKey = draggedItem.sourceDateKey || selectedDateKey;
            if (checkIsDayLocked(sourceDateKey)) {
               handleDragEnd();
               return;
            }
            const validation = validateMoveTaskChallengeDay(
               sourceDateKey,
               opt.dateKey,
               effectiveTodayDate,
               {
                  isChallengeActive: hasChallengeContext,
                  isTargetDayLocked: checkIsDayLocked(opt.dateKey),
               }
            );
            if (!validation.ok) {
               handleDragEnd();
               return;
            }
            moveCategoryToDayAction(
               draggedItem.sourceCatIdx,
               opt.dateKey,
               "daily"
            );
         } else if (draggedItem.sourceColumn === "weekly") {
            if (
               checkIsDayLocked(opt.dateKey) ||
               (hasChallengeContext && opt.isPast)
            ) {
               handleDragEnd();
               return;
            }
            moveCategoryToDayAction(
               draggedItem.sourceCatIdx,
               opt.dateKey,
               "weekly"
            );
         }
         handleDragEnd();
         return;
      }

      if (draggedItem.type === "task" && draggedItem.id) {
         if (draggedItem.sourceColumn === "daily") {
            const sourceDateKey = draggedItem.sourceDateKey || selectedDateKey;
            if (checkIsDayLocked(sourceDateKey)) {
               handleDragEnd();
               return;
            }
            const validation = validateMoveTaskChallengeDay(
               sourceDateKey,
               opt.dateKey,
               effectiveTodayDate,
               {
                  isChallengeActive: hasChallengeContext,
                  isTargetDayLocked: checkIsDayLocked(opt.dateKey),
               }
            );
            if (!validation.ok) {
               handleDragEnd();
               return;
            }
            moveTaskToDay(
               draggedItem.id,
               opt.dateKey,
               draggedItem.sourceCatIdx,
               "daily"
            );
         } else if (draggedItem.sourceColumn === "weekly") {
            if (
               checkIsDayLocked(opt.dateKey) ||
               (hasChallengeContext && opt.isPast)
            ) {
               handleDragEnd();
               return;
            }
            moveTaskToDay(
               draggedItem.id,
               opt.dateKey,
               draggedItem.sourceCatIdx,
               "weekly"
            );
         }
      }

      handleDragEnd();
   };

   const handleTaskDrop = (
      e: React.DragEvent,
      targetTaskId: string,
      targetCatIdx: number,
      targetColumn: "daily" | "weekly"
   ) => {
      e.preventDefault();
      e.stopPropagation();

      if (!draggedItem) {
         handleDragEnd();
         return;
      }

      if (draggedItem.type === "category") {
         handleCategoryDrop(e, targetCatIdx, targetColumn);
         return;
      }

      if (draggedItem.type !== "task" || !draggedItem.id) {
         handleDragEnd();
         return;
      }

      if (
         (targetColumn === "daily" || draggedItem.sourceColumn === "daily") &&
         isPastDayLocked
      ) {
         handleDragEnd();
         return;
      }

      const targetCategories =
         targetColumn === "daily" ? dailyCategories : weeklyCategories;
      const targetCat = targetCategories[targetCatIdx];
      if (!targetCat) {
         handleDragEnd();
         return;
      }

      const targetIndexInCat = targetCat.tasks.findIndex(
         (t) => t.id === targetTaskId
      );
      const destIdx =
         dragOverInfo?.position === "below"
            ? targetIndexInCat + 1
            : targetIndexInCat;

      const isMovingWeeklyToDaily =
         draggedItem.sourceColumn === "weekly" && targetColumn === "daily";
      const isMovingDailyToWeekly =
         draggedItem.sourceColumn === "daily" && targetColumn === "weekly";
      const targetDueDate = isMovingWeeklyToDaily
         ? selectedDateKey
         : isMovingDailyToWeekly
           ? null
           : undefined;

      const res = moveTaskBetweenCategories({
         taskId: draggedItem.id,
         sourceCategoryIndex: draggedItem.sourceCatIdx,
         sourceColumn: draggedItem.sourceColumn,
         targetCategoryIndex: targetCatIdx,
         targetColumn,
         targetTaskIndex: Math.max(0, destIdx),
         targetDueDate,
         dailyCategories,
         weeklyCategories,
      });

      setDailyCategories(res.dailyCategories);
      setWeeklyCategories(res.weeklyCategories);

      if (res.movedTask && res.targetCategoryId) {
         const nowIso = new Date().toISOString();
         const targetCats =
            res.targetTaskType === "DAILY"
               ? res.dailyCategories
               : res.weeklyCategories;
         const targetCatGroup = targetCats[targetCatIdx];

         const categoryChanged =
            draggedItem.sourceCatIdx !== targetCatIdx ||
            draggedItem.sourceColumn !== targetColumn;

         // The moved task's index in the destination list *after* the splice.
         const insertedIndex = Math.max(
            0,
            targetCatGroup?.tasks.findIndex(
               (t) => t.id === res.movedTask!.id
            ) ?? 0
         );

         if (categoryChanged) {
            const isMovedComplete = Boolean(
               res.movedTask.completed ?? res.movedTask.isComplete
            );
            const movedTask = res.movedTask as BoardTask;
            const movedLocalTask = buildBoardTaskRecord({
               task: {
                  ...movedTask,
                  text: movedTask.text ?? movedTask.id,
               },
               userId: userId ?? null,
               categoryId: res.targetCategoryId,
               taskType: res.targetTaskType,
               sortOrder: insertedIndex,
               dueDate: movedTask.dueDate ?? null,
               isComplete: isMovedComplete,
               status:
                  (movedTask.status as TaskStatus) ||
                  (isMovedComplete ? "COMPLETED" : "TODO"),
               challengeId:
                  res.targetTaskType === "WEEKLY"
                     ? (movedTask.challengeId ?? null)
                     : null,
               nowIso,
            });

            if (isLoggedIn && userId) {
               // Identity first: categoryId + taskType + dueDate must persist
               // even when the destination already had tasks.
               persistTask(movedLocalTask, {
                  id: crypto.randomUUID(),
                  entityType: "TASK",
                  action: "MOVE",
                  payload: {
                     taskId: res.movedTask.id,
                     categoryId: res.targetCategoryId,
                     taskType: res.targetTaskType,
                     sortOrder: insertedIndex,
                     dueDate: res.movedTask.dueDate ?? null,
                  },
                  createdAt: Date.now(),
                  retryCount: 0,
               }).catch(() => {});
            } else {
               putLocalTask(movedLocalTask).catch(() => {});
            }
         }

         // Ordering for the destination category is always rewritten.
         if (targetCatGroup && targetCatGroup.tasks.length > 0) {
            const tasksToUpdate: LocalTaskRecord[] = targetCatGroup.tasks.map(
               (t, idx) =>
                  buildBoardTaskRecord({
                     task: t,
                     userId: userId ?? null,
                     categoryId: res.targetCategoryId!,
                     taskType: res.targetTaskType,
                     sortOrder: idx,
                     challengeId:
                        res.targetTaskType === "WEEKLY"
                           ? (t.challengeId ?? null)
                           : null,
                     nowIso,
                  })
            );

            const taskIds = targetCatGroup.tasks
               .map((t) => t.id)
               .filter((id) => Boolean(id));

            if (isLoggedIn && userId && taskIds.length > 0) {
               persistTasks(tasksToUpdate, {
                  id: crypto.randomUUID(),
                  entityType: "TASK",
                  action: "REORDER",
                  payload: { taskIds },
                  createdAt: Date.now() + 1,
                  retryCount: 0,
               })
                  .then(() => scheduleSync(userId))
                  .catch(() => {});
            } else {
               putLocalTasks(tasksToUpdate).catch(() => {});
            }
         }

         if (isLoggedIn && userId) {
            trackLogRocketEvent("TaskMoved", {
               taskId: res.movedTask.id,
               targetTaskType: res.targetTaskType,
            });
         }

         logTaskSync("Task moved via drag and drop", {
            taskId: res.movedTask.id,
            targetCatIdx,
            targetColumn,
         });
      }

      handleDragEnd();
   };

   const handleCategoryDrop = (
      e: React.DragEvent,
      targetCatIdx: number,
      targetColumn: "daily" | "weekly"
   ) => {
      e.preventDefault();
      e.stopPropagation();

      if (!draggedItem) {
         handleDragEnd();
         return;
      }

      if (
         (targetColumn === "daily" || draggedItem.sourceColumn === "daily") &&
         isPastDayLocked
      ) {
         handleDragEnd();
         return;
      }

      if (draggedItem.type === "category") {
         let destIndex: number;
         if (draggedItem.sourceColumn === targetColumn) {
            if (draggedItem.sourceCatIdx === targetCatIdx) {
               handleDragEnd();
               return;
            }
            destIndex = calculateReorderIndex(
               draggedItem.sourceCatIdx,
               targetCatIdx,
               dragOverInfo?.position || "above"
            );
         } else {
            destIndex =
               dragOverInfo?.position === "below"
                  ? targetCatIdx + 1
                  : targetCatIdx;
         }

         const isMovingWeeklyToDaily =
            draggedItem.sourceColumn === "weekly" && targetColumn === "daily";
         const isMovingDailyToWeekly =
            draggedItem.sourceColumn === "daily" && targetColumn === "weekly";
         const targetDueDate = isMovingWeeklyToDaily
            ? selectedDateKey
            : isMovingDailyToWeekly
              ? null
              : undefined;

         const res = moveCategoryBetweenColumns({
            categoryIndex: draggedItem.sourceCatIdx,
            sourceColumn: draggedItem.sourceColumn,
            targetColumn,
            targetIndex: destIndex,
            targetDueDate,
            dailyCategories,
            weeklyCategories,
         });

         setDailyCategories(res.dailyCategories);
         setWeeklyCategories(res.weeklyCategories);

         if (res.movedCategory?.id) {
            const nowIso = new Date().toISOString();
            const catId = res.movedCategory.id;
            const targetType = res.targetTaskType;

            const localCategory: LocalCategoryRecord = {
               id: catId,
               userId: userId ?? null,
               name: res.movedCategory.name,
               taskType: targetType,
               sortOrder: destIndex,
               createdAt: nowIso,
               updatedAt: nowIso,
               syncState: "pending",
            };

            // Cascade taskType and dueDate to all tasks inside this category.
            const tasksToUpdate: LocalTaskRecord[] = (
               res.movedCategory.tasks ?? []
            ).map((t, idx) =>
               buildBoardTaskRecord({
                  task: t,
                  userId: userId ?? null,
                  categoryId: catId,
                  taskType: targetType,
                  sortOrder: idx,
                  challengeId:
                     targetType === "WEEKLY" ? (t.challengeId ?? null) : null,
                  nowIso,
               })
            );

            // Persist updated sortOrder for all categories in both columns.
            const allCatsToUpdate: LocalCategoryRecord[] = [
               ...res.dailyCategories
                  .filter((c): c is typeof c & { id: string } => Boolean(c.id))
                  .map((c, idx) => ({
                     id: c.id,
                     userId: userId ?? null,
                     name: c.name,
                     taskType: "DAILY" as const,
                     sortOrder: idx,
                     createdAt: c.createdAt
                        ? typeof c.createdAt === "string"
                           ? c.createdAt
                           : c.createdAt.toISOString()
                        : nowIso,
                     updatedAt: nowIso,
                     syncState: "pending" as const,
                  })),
               ...res.weeklyCategories
                  .filter((c): c is typeof c & { id: string } => Boolean(c.id))
                  .map((c, idx) => ({
                     id: c.id,
                     userId: userId ?? null,
                     name: c.name,
                     taskType: "WEEKLY" as const,
                     sortOrder: idx,
                     createdAt: c.createdAt
                        ? typeof c.createdAt === "string"
                           ? c.createdAt
                           : c.createdAt.toISOString()
                        : nowIso,
                     updatedAt: nowIso,
                     syncState: "pending" as const,
                  })),
            ];

            const mutations: Array<Omit<QueuedMutation, "userId">> = [];

            const dailyCatIds = res.dailyCategories
               .map((c) => c.id)
               .filter((id): id is string => Boolean(id));
            if (dailyCatIds.length > 0) {
               mutations.push({
                  id: crypto.randomUUID(),
                  entityType: "CATEGORY",
                  action: "REORDER",
                  payload: { categoryIds: dailyCatIds },
                  createdAt: Date.now(),
                  retryCount: 0,
               });
            }

            const weeklyCatIds = res.weeklyCategories
               .map((c) => c.id)
               .filter((id): id is string => Boolean(id));
            if (weeklyCatIds.length > 0) {
               mutations.push({
                  id: crypto.randomUUID(),
                  entityType: "CATEGORY",
                  action: "REORDER",
                  payload: { categoryIds: weeklyCatIds },
                  createdAt: Date.now() + 1,
                  retryCount: 0,
               });
            }

            if (draggedItem.sourceColumn !== targetColumn) {
               mutations.push({
                  id: crypto.randomUUID(),
                  entityType: "CATEGORY",
                  action: "MOVE",
                  payload: {
                     categoryId: res.movedCategory.id,
                     taskType: res.targetTaskType,
                     sortOrder: destIndex,
                  },
                  createdAt: Date.now() + 2,
                  retryCount: 0,
               });
            }

            // Every member task follows its category's column, in both
            // directions, so the server never keeps a task in the old column.
            if (draggedItem.sourceColumn !== targetColumn) {
               for (const t of res.movedCategory.tasks ?? []) {
                  mutations.push({
                     id: crypto.randomUUID(),
                     entityType: "TASK",
                     action: "MOVE",
                     payload: {
                        taskId: t.id,
                        categoryId: catId,
                        taskType: targetType,
                        dueDate:
                           targetType === "DAILY" ? selectedDateKey : null,
                     },
                     createdAt: Date.now(),
                     retryCount: 0,
                  });
               }
            }

            commitLocalBatch({
               categories: [localCategory, ...allCatsToUpdate],
               tasks: tasksToUpdate,
               mutations:
                  isLoggedIn && userId
                     ? mutations.map((mutation) => ({ ...mutation, userId }))
                     : [],
            })
               .then(() => scheduleSync(userId))
               .catch(() => {});

            if (isLoggedIn && userId) {
               trackLogRocketEvent("CategoryMoved", {
                  categoryId: res.movedCategory.id,
                  targetTaskType: res.targetTaskType,
               });
            }

            logTaskSync("Category moved via drag and drop", {
               categoryId: res.movedCategory.id,
               targetColumn,
            });
         }
      } else if (draggedItem.type === "task" && draggedItem.id) {
         // Dropping a task into a category header
         const isMovingWeeklyToDaily =
            draggedItem.sourceColumn === "weekly" && targetColumn === "daily";
         const isMovingDailyToWeekly =
            draggedItem.sourceColumn === "daily" && targetColumn === "weekly";
         const targetDueDate = isMovingWeeklyToDaily
            ? selectedDateKey
            : isMovingDailyToWeekly
              ? null
              : undefined;

         const res = moveTaskBetweenCategories({
            taskId: draggedItem.id,
            sourceCategoryIndex: draggedItem.sourceCatIdx,
            sourceColumn: draggedItem.sourceColumn,
            targetCategoryIndex: targetCatIdx,
            targetColumn,
            targetTaskIndex: 0,
            targetDueDate,
            dailyCategories,
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

            commitTaskMove({
               task: res.movedTask,
               targetCategoryId: res.targetCategoryId,
               targetTaskType: res.targetTaskType,
               targetDueDate: res.movedTask.dueDate ?? null,
               sortOrder: 0,
               action: "MOVE",
               payload: {
                  taskId: res.movedTask.id,
                  categoryId: res.targetCategoryId,
                  taskType: res.targetTaskType,
                  sortOrder: 0,
                  dueDate: res.movedTask.dueDate ?? null,
               },
               isComplete: isMovedComplete,
               status: movedStatus,
            });
         }
      }

      handleDragEnd();
   };

   const handleColumnDrop = (
      e: React.DragEvent,
      targetColumn: "daily" | "weekly"
   ) => {
      e.preventDefault();
      e.stopPropagation();

      if (!draggedItem) {
         handleDragEnd();
         return;
      }

      if (
         (targetColumn === "daily" || draggedItem.sourceColumn === "daily") &&
         isPastDayLocked
      ) {
         handleDragEnd();
         return;
      }

      const targetCategories =
         targetColumn === "daily" ? dailyCategories : weeklyCategories;

      if (draggedItem.type === "category") {
         const destIndex = targetCategories.length;
         const isMovingWeeklyToDaily =
            draggedItem.sourceColumn === "weekly" && targetColumn === "daily";
         const isMovingDailyToWeekly =
            draggedItem.sourceColumn === "daily" && targetColumn === "weekly";
         const targetDueDate = isMovingWeeklyToDaily
            ? selectedDateKey
            : isMovingDailyToWeekly
              ? null
              : undefined;

         const res = moveCategoryBetweenColumns({
            categoryIndex: draggedItem.sourceCatIdx,
            sourceColumn: draggedItem.sourceColumn,
            targetColumn,
            targetIndex: destIndex,
            targetDueDate,
            dailyCategories,
            weeklyCategories,
         });

         setDailyCategories(res.dailyCategories);
         setWeeklyCategories(res.weeklyCategories);

         if (res.movedCategory?.id) {
            const nowIso = new Date().toISOString();
            const catId = res.movedCategory.id;
            const targetType = res.targetTaskType;

            const localCategory: LocalCategoryRecord = {
               id: catId,
               userId: userId ?? null,
               name: res.movedCategory.name,
               taskType: targetType,
               sortOrder: destIndex,
               createdAt: nowIso,
               updatedAt: nowIso,
               syncState: "pending",
            };

            const tasksToUpdate: LocalTaskRecord[] = (
               res.movedCategory.tasks ?? []
            ).map((t, idx) =>
               buildBoardTaskRecord({
                  task: t,
                  userId: userId ?? null,
                  categoryId: catId,
                  taskType: targetType,
                  sortOrder: idx,
                  challengeId:
                     targetType === "WEEKLY" ? (t.challengeId ?? null) : null,
                  nowIso,
               })
            );

            const allCatsToUpdate: LocalCategoryRecord[] = [
               ...res.dailyCategories
                  .filter((c): c is typeof c & { id: string } => Boolean(c.id))
                  .map((c, idx) => ({
                     id: c.id,
                     userId: userId ?? null,
                     name: c.name,
                     taskType: "DAILY" as const,
                     sortOrder: idx,
                     createdAt: c.createdAt
                        ? typeof c.createdAt === "string"
                           ? c.createdAt
                           : c.createdAt.toISOString()
                        : nowIso,
                     updatedAt: nowIso,
                     syncState: "pending" as const,
                  })),
               ...res.weeklyCategories
                  .filter((c): c is typeof c & { id: string } => Boolean(c.id))
                  .map((c, idx) => ({
                     id: c.id,
                     userId: userId ?? null,
                     name: c.name,
                     taskType: "WEEKLY" as const,
                     sortOrder: idx,
                     createdAt: c.createdAt
                        ? typeof c.createdAt === "string"
                           ? c.createdAt
                           : c.createdAt.toISOString()
                        : nowIso,
                     updatedAt: nowIso,
                     syncState: "pending" as const,
                  })),
            ];

            const mutations: Array<Omit<QueuedMutation, "userId">> = [];

            const dailyCatIds = res.dailyCategories
               .map((c) => c.id)
               .filter((id): id is string => Boolean(id));
            if (dailyCatIds.length > 0) {
               mutations.push({
                  id: crypto.randomUUID(),
                  entityType: "CATEGORY",
                  action: "REORDER",
                  payload: { categoryIds: dailyCatIds },
                  createdAt: Date.now(),
                  retryCount: 0,
               });
            }

            const weeklyCatIds = res.weeklyCategories
               .map((c) => c.id)
               .filter((id): id is string => Boolean(id));
            if (weeklyCatIds.length > 0) {
               mutations.push({
                  id: crypto.randomUUID(),
                  entityType: "CATEGORY",
                  action: "REORDER",
                  payload: { categoryIds: weeklyCatIds },
                  createdAt: Date.now() + 1,
                  retryCount: 0,
               });
            }

            if (draggedItem.sourceColumn !== targetColumn) {
               mutations.push({
                  id: crypto.randomUUID(),
                  entityType: "CATEGORY",
                  action: "MOVE",
                  payload: {
                     categoryId: res.movedCategory.id,
                     taskType: res.targetTaskType,
                     sortOrder: destIndex,
                  },
                  createdAt: Date.now() + 2,
                  retryCount: 0,
               });
            }

            commitLocalBatch({
               categories: [localCategory, ...allCatsToUpdate],
               tasks: tasksToUpdate,
               mutations:
                  isLoggedIn && userId
                     ? mutations.map((mutation) => ({ ...mutation, userId }))
                     : [],
            })
               .then(() => scheduleSync(userId))
               .catch(() => {});
         }
      } else if (draggedItem.type === "task" && draggedItem.id) {
         if (
            targetColumn === "daily" &&
            draggedItem.sourceColumn === "weekly"
         ) {
            const sourceCat = weeklyCategories[draggedItem.sourceCatIdx];
            if (sourceCat) {
               let targetDailyIdx = dailyCategories.findIndex(
                  (c) =>
                     (sourceCat.id && c.id === sourceCat.id) ||
                     c.name === sourceCat.name
               );
               let currentDailyCats = dailyCategories;
               if (targetDailyIdx === -1) {
                  const newCatId = crypto.randomUUID();
                  const newDailyCat: BoardCategory = {
                     id: newCatId,
                     name: sourceCat.name,
                     isCollapsed: false,
                     tasks: [],
                  };
                  currentDailyCats = [...dailyCategories, newDailyCat];
                  targetDailyIdx = currentDailyCats.length - 1;

                  persistCategory(
                     {
                        id: newCatId,
                        userId: userId ?? null,
                        name: sourceCat.name,
                        taskType: "DAILY",
                        sortOrder: targetDailyIdx,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        syncState: "pending",
                     },
                     {
                        id: crypto.randomUUID(),
                        entityType: "CATEGORY",
                        action: "CREATE",
                        payload: {
                           id: newCatId,
                           name: sourceCat.name,
                           taskType: "DAILY",
                           sortOrder: targetDailyIdx,
                        },
                        createdAt: Date.now(),
                        retryCount: 0,
                     }
                  ).catch(() => {});
               }

               const res = moveTaskBetweenCategories({
                  taskId: draggedItem.id,
                  sourceCategoryIndex: draggedItem.sourceCatIdx,
                  sourceColumn: "weekly",
                  targetCategoryIndex: targetDailyIdx,
                  targetColumn: "daily",
                  targetTaskIndex:
                     currentDailyCats[targetDailyIdx].tasks.length,
                  targetDueDate: selectedDateKey,
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
                  const sortOrder =
                     currentDailyCats[targetDailyIdx].tasks.length;

                  commitTaskMove({
                     task: res.movedTask,
                     targetCategoryId: res.targetCategoryId,
                     targetTaskType: res.targetTaskType,
                     targetDueDate: selectedDateKey,
                     sortOrder,
                     action: "MOVE",
                     payload: {
                        taskId: res.movedTask.id,
                        categoryId: res.targetCategoryId,
                        taskType: res.targetTaskType,
                        sortOrder,
                        dueDate: selectedDateKey,
                     },
                     isComplete: isMovedComplete,
                     status: movedStatus,
                     challengeId: null,
                  });
               }
            }
         } else if (targetCategories.length > 0) {
            const lastCatIdx = targetCategories.length - 1;
            const isMovingWeeklyToDaily =
               draggedItem.sourceColumn === "weekly" &&
               targetColumn === "daily";
            const isMovingDailyToWeekly =
               draggedItem.sourceColumn === "daily" &&
               targetColumn === "weekly";
            const targetDueDate = isMovingWeeklyToDaily
               ? selectedDateKey
               : isMovingDailyToWeekly
                 ? null
                 : undefined;

            const res = moveTaskBetweenCategories({
               taskId: draggedItem.id,
               sourceCategoryIndex: draggedItem.sourceCatIdx,
               sourceColumn: draggedItem.sourceColumn,
               targetCategoryIndex: lastCatIdx,
               targetColumn,
               targetTaskIndex: targetCategories[lastCatIdx].tasks.length,
               targetDueDate,
               dailyCategories,
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
               const sortOrder = targetCategories[lastCatIdx].tasks.length;

               commitTaskMove({
                  task: res.movedTask,
                  targetCategoryId: res.targetCategoryId,
                  targetTaskType: res.targetTaskType,
                  targetDueDate: res.movedTask.dueDate ?? null,
                  sortOrder,
                  action: "MOVE",
                  payload: {
                     taskId: res.movedTask.id,
                     categoryId: res.targetCategoryId,
                     taskType: res.targetTaskType,
                     sortOrder,
                     dueDate: res.movedTask.dueDate ?? null,
                  },
                  isComplete: isMovedComplete,
                  status: movedStatus,
               });
            }
         }
      }

      handleDragEnd();
   };

   return {
      draggedItem,
      dragOverInfo,
      setDragOverInfo,
      handleTaskDragStart,
      handleCategoryDragStart,
      handleDragEnd,
      handleTaskDragOver,
      handleCategoryDragOver,
      handleColumnDragOver,
      handleDayPillDragOver,
      handleDayPillDrop,
      handleTaskDrop,
      handleCategoryDrop,
      handleColumnDrop,
   };
}
