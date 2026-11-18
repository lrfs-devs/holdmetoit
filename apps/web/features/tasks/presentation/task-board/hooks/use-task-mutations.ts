"use client";

import type * as React from "react";
import { useCallback, type Dispatch, type SetStateAction } from "react";
import { validateMoveTaskChallengeDay } from "@/features/study-logs/domain/challenge-day";
import { buildTaskEditPatch } from "@/features/tasks/domain/task-edit-patch";
import { isWeeklyTaskGraceExpired } from "@/features/tasks/domain/task-lock";
import {
   applyRolloverToCategories,
   findRolloverCandidates,
} from "@/features/tasks/domain/task-rollover";
import type { TaskStatus } from "@/features/tasks/domain/task.types";
import type {
   LocalTaskRecord,
   QueuedMutation,
} from "@/features/tasks/domain/task-sync.types";
import {
   logTaskSync,
   putLocalTasks,
} from "@/features/tasks/data/local/task-idb";
import { scheduleSync } from "@/features/tasks/data/local/task-sync.service";
import { trackLogRocketEvent } from "@/core/observability/logrocket";
import { triggerTaskConfetti } from "@/lib/confetti";
import { playCompletionAudio } from "@/features/preferences/presentation/audio-service";
import type { TaskBoardPersistence } from "./use-task-board-persistence";
import type {
   BoardCategory,
   BoardTask,
   EditTaskModalState,
} from "../task-board.types";
import { buildBoardTaskRecord, getTaskStatus } from "../task-board.utils";

export interface UseTaskMutationsOptions {
   userId?: string | null;
   isLoggedIn: boolean;
   dailyCategories: BoardCategory[];
   weeklyCategories: BoardCategory[];
   setDailyCategories: Dispatch<SetStateAction<BoardCategory[]>>;
   setWeeklyCategories: Dispatch<SetStateAction<BoardCategory[]>>;
   persistTask: TaskBoardPersistence["persistTask"];
   persistTasks: TaskBoardPersistence["persistTasks"];
   deleteTaskWithMutation: TaskBoardPersistence["deleteTaskWithMutation"];
   effectiveTodayDate: string;
   selectedDateKey: string;
   hasChallengeContext: boolean;
   isPastDayLocked: boolean;
   getTaskDateKey: (task: BoardTask) => string;
   checkIsDayLocked: (dateKey: string) => boolean;
   editTaskModal: EditTaskModalState | null;
   setEditTaskModal: Dispatch<SetStateAction<EditTaskModalState | null>>;
   editTaskInputText: string;
   editTaskInputStatus: TaskStatus;
   editTaskInputDueDate: string;
   editTaskInputChallengeId: string | null;
   isEditTaskGraceLocked: boolean;
}

export interface TaskMutations {
   setTaskStatus: (
      catIndex: number,
      taskId: string,
      taskType: "daily" | "weekly",
      nextStatusOrCompleted: TaskStatus | boolean,
      clickOrigin?:
         | React.MouseEvent
         | MouseEvent
         | { clientX: number; clientY: number }
         | Element
         | null
   ) => void;
   toggleDailyTask: (
      catIndex: number,
      taskId: string,
      clickOrigin?:
         | React.MouseEvent
         | MouseEvent
         | { clientX: number; clientY: number }
         | Element
         | null
   ) => void;
   toggleWeeklyTask: (
      catIndex: number,
      taskId: string,
      clickOrigin?:
         | React.MouseEvent
         | MouseEvent
         | { clientX: number; clientY: number }
         | Element
         | null
   ) => void;
   handleDeleteTask: (
      catIndex: number,
      taskId: string,
      taskType: "daily" | "weekly"
   ) => void;
   handleSaveEditTask: (
      newText: string,
      newStatus: TaskStatus,
      newDueDate?: string | null
   ) => void;
   toggleTaskChallengeScope: (
      taskId: string,
      newChallengeId: string | null
   ) => void;
   handleRolloverIncompleteTasks: (options?: {
      sourceDateKey?: string;
      taskId?: string;
   }) => void;
}

/**
 * Owns the task-level mutations: status changes, edits, deletes, challenge
 * scope, and rollover. Every local record is built through buildBoardTaskRecord.
 */
export function useTaskMutations({
   userId,
   isLoggedIn,
   dailyCategories,
   weeklyCategories,
   setDailyCategories,
   setWeeklyCategories,
   persistTask,
   persistTasks,
   deleteTaskWithMutation,
   effectiveTodayDate,
   selectedDateKey,
   hasChallengeContext,
   isPastDayLocked,
   getTaskDateKey,
   checkIsDayLocked,
   editTaskModal,
   setEditTaskModal,
   editTaskInputText,
   editTaskInputStatus,
   editTaskInputDueDate,
   editTaskInputChallengeId,
   isEditTaskGraceLocked,
}: UseTaskMutationsOptions): TaskMutations {
   const setTaskStatus = (
      catIndex: number,
      taskId: string,
      taskType: "daily" | "weekly",
      nextStatusOrCompleted: TaskStatus | boolean,
      clickOrigin?:
         | React.MouseEvent
         | MouseEvent
         | { clientX: number; clientY: number }
         | Element
         | null
   ) => {
      const nextStatus: TaskStatus =
         typeof nextStatusOrCompleted === "boolean"
            ? nextStatusOrCompleted
               ? "COMPLETED"
               : "TODO"
            : nextStatusOrCompleted;
      const nextCompleted = nextStatus === "COMPLETED";

      if (taskType === "daily") {
         let resolvedCatIdx = catIndex;
         let targetTask = dailyCategories[catIndex]?.tasks.find(
            (t) => t.id === taskId
         );
         if (!targetTask) {
            resolvedCatIdx = dailyCategories.findIndex((c) =>
               c.tasks.some((t) => t.id === taskId)
            );
            if (resolvedCatIdx !== -1) {
               targetTask = dailyCategories[resolvedCatIdx]?.tasks.find(
                  (t) => t.id === taskId
               );
            }
         }
         if (!targetTask) return;
         const currentStatus = getTaskStatus(targetTask);
         if (currentStatus === nextStatus) return;

         if (nextStatus === "COMPLETED") {
            const targetEl =
               typeof document !== "undefined"
                  ? document.querySelector(`[data-task-id="${taskId}"]`)
                  : null;
            triggerTaskConfetti(clickOrigin ?? targetEl);
            void playCompletionAudio();
         }

         setDailyCategories((prev) =>
            prev.map((cat, i) =>
               i === resolvedCatIdx || cat.tasks.some((t) => t.id === taskId)
                  ? {
                       ...cat,
                       tasks: cat.tasks.map((t) =>
                          t.id === taskId
                             ? {
                                  ...t,
                                  completed: nextCompleted,
                                  status: nextStatus,
                               }
                             : t
                       ),
                    }
                  : cat
            )
         );

         const nowIso = new Date().toISOString();
         const cat =
            dailyCategories[resolvedCatIdx] ||
            dailyCategories.find((c) => c.tasks.some((t) => t.id === taskId));
         if (cat?.id) {
            const localTask: LocalTaskRecord = buildBoardTaskRecord({
               task: targetTask,
               userId: userId ?? null,
               categoryId: cat.id,
               taskType: "DAILY",
               sortOrder: Math.max(
                  0,
                  cat.tasks.findIndex((t) => t.id === taskId)
               ),
               isComplete: nextCompleted,
               status: nextStatus,
               challengeId: targetTask.challengeId ?? null,
               nowIso,
            });

            persistTask(localTask, {
               id: crypto.randomUUID(),
               entityType: "TASK",
               action: "TOGGLE",
               payload: {
                  taskId,
                  isComplete: nextCompleted,
                  status: nextStatus,
               },
               createdAt: Date.now(),
               retryCount: 0,
            })
               .then(() => scheduleSync(userId, 400))
               .catch(() => {});
         }

         if (isLoggedIn && userId) {
            trackLogRocketEvent("TaskStatusChanged", {
               taskId,
               taskType: "daily",
               status: nextStatus,
               isComplete: nextCompleted,
            });
         }

         logTaskSync("Task status updated", {
            taskId,
            status: nextStatus,
            isComplete: nextCompleted,
         });
      } else {
         let resolvedCatIdx = catIndex;
         let targetTask = weeklyCategories[catIndex]?.tasks.find(
            (t) => t.id === taskId
         );
         if (!targetTask) {
            resolvedCatIdx = weeklyCategories.findIndex((c) =>
               c.tasks.some((t) => t.id === taskId)
            );
            if (resolvedCatIdx !== -1) {
               targetTask = weeklyCategories[resolvedCatIdx]?.tasks.find(
                  (t) => t.id === taskId
               );
            }
         }
         if (!targetTask) return;
         const currentStatus = getTaskStatus(targetTask);
         if (currentStatus === nextStatus) return;

         if (nextStatus === "COMPLETED") {
            const targetEl =
               typeof document !== "undefined"
                  ? document.querySelector(`[data-task-id="${taskId}"]`)
                  : null;
            triggerTaskConfetti(clickOrigin ?? targetEl);
            void playCompletionAudio();
         }

         setWeeklyCategories((prev) =>
            prev.map((cat, i) =>
               i === resolvedCatIdx || cat.tasks.some((t) => t.id === taskId)
                  ? {
                       ...cat,
                       tasks: cat.tasks.map((t) =>
                          t.id === taskId
                             ? {
                                  ...t,
                                  completed: nextCompleted,
                                  status: nextStatus,
                               }
                             : t
                       ),
                    }
                  : cat
            )
         );

         const nowIso = new Date().toISOString();
         const cat =
            weeklyCategories[resolvedCatIdx] ||
            weeklyCategories.find((c) => c.tasks.some((t) => t.id === taskId));
         if (cat?.id) {
            const localTask: LocalTaskRecord = buildBoardTaskRecord({
               task: targetTask,
               userId: userId ?? null,
               categoryId: cat.id,
               taskType: "WEEKLY",
               sortOrder: Math.max(
                  0,
                  cat.tasks.findIndex((t) => t.id === taskId)
               ),
               isComplete: nextCompleted,
               status: nextStatus,
               challengeId: targetTask.challengeId ?? null,
               nowIso,
            });

            persistTask(localTask, {
               id: crypto.randomUUID(),
               entityType: "TASK",
               action: "TOGGLE",
               payload: {
                  taskId,
                  isComplete: nextCompleted,
                  status: nextStatus,
               },
               createdAt: Date.now(),
               retryCount: 0,
            })
               .then(() => scheduleSync(userId, 400))
               .catch(() => {});
         }

         if (isLoggedIn && userId) {
            trackLogRocketEvent("TaskStatusChanged", {
               taskId,
               taskType: "weekly",
               status: nextStatus,
               isComplete: nextCompleted,
            });
         }

         logTaskSync("Task status updated", {
            taskId,
            status: nextStatus,
            isComplete: nextCompleted,
         });
      }
   };

   const toggleDailyTask = (
      catIndex: number,
      taskId: string,
      clickOrigin?:
         | React.MouseEvent
         | MouseEvent
         | { clientX: number; clientY: number }
         | Element
         | null
   ) => {
      let targetTask = dailyCategories[catIndex]?.tasks.find(
         (t) => t.id === taskId
      );
      if (!targetTask) {
         targetTask = dailyCategories
            .flatMap((c) => c.tasks)
            .find((t) => t.id === taskId);
      }
      if (!targetTask) return;
      const currentStatus = getTaskStatus(targetTask);
      const nextStatus: TaskStatus =
         currentStatus === "COMPLETED" ? "TODO" : "COMPLETED";
      setTaskStatus(catIndex, taskId, "daily", nextStatus, clickOrigin);
   };

   const toggleWeeklyTask = (
      catIndex: number,
      taskId: string,
      clickOrigin?:
         | React.MouseEvent
         | MouseEvent
         | { clientX: number; clientY: number }
         | Element
         | null
   ) => {
      let targetTask = weeklyCategories[catIndex]?.tasks.find(
         (t) => t.id === taskId
      );
      if (!targetTask) {
         targetTask = weeklyCategories
            .flatMap((c) => c.tasks)
            .find((t) => t.id === taskId);
      }
      if (!targetTask) return;
      const currentStatus = getTaskStatus(targetTask);
      const nextStatus: TaskStatus =
         currentStatus === "COMPLETED" ? "TODO" : "COMPLETED";
      setTaskStatus(catIndex, taskId, "weekly", nextStatus, clickOrigin);
   };

   const handleDeleteTask = (
      catIndex: number,
      taskId: string,
      taskType: "daily" | "weekly"
   ) => {
      if (taskType === "daily") {
         const taskToDelete = dailyCategories[catIndex]?.tasks.find(
            (t) => t.id === taskId
         );
         if (taskToDelete) {
            const dateKey = getTaskDateKey(taskToDelete);
            if (checkIsDayLocked(dateKey)) {
               return;
            }
         }
         setDailyCategories((prev) =>
            prev.map((cat, i) =>
               i === catIndex
                  ? {
                       ...cat,
                       tasks: cat.tasks.filter((t) => t.id !== taskId),
                    }
                  : cat
            )
         );
      } else {
         const weeklyTaskToDelete = weeklyCategories[catIndex]?.tasks.find(
            (t) => t.id === taskId
         );
         if (
            weeklyTaskToDelete &&
            isWeeklyTaskGraceExpired({
               taskType: "WEEKLY",
               challengeId: weeklyTaskToDelete.challengeId,
               createdAt: weeklyTaskToDelete.createdAt ?? new Date(),
            })
         ) {
            return;
         }
         setWeeklyCategories((prev) =>
            prev.map((cat, i) =>
               i === catIndex
                  ? {
                       ...cat,
                       tasks: cat.tasks.filter((t) => t.id !== taskId),
                    }
                  : cat
            )
         );
      }

      deleteTaskWithMutation(taskId, {
         id: crypto.randomUUID(),
         entityType: "TASK",
         action: "DELETE",
         payload: { taskId },
         createdAt: Date.now(),
         retryCount: 0,
      })
         .then(() => scheduleSync(userId))
         .catch(() => {});

      logTaskSync("Task deleted", { taskId });
   };

   const handleSaveEditTask = (
      newText: string,
      newStatus: TaskStatus,
      newDueDate?: string | null
   ) => {
      if (!editTaskModal || !newText.trim()) return;
      const { id, taskType } = editTaskModal;
      // Resolve the category from the task at save time: a sync or hydration
      // can reorder categories while the dialog is open, which would make the
      // modal's snapshot index point at a different category.
      const catIdx =
         taskType === "daily"
            ? dailyCategories.findIndex((category) =>
                 category.tasks.some((task) => task.id === id)
              )
            : weeklyCategories.findIndex((category) =>
                 category.tasks.some((task) => task.id === id)
              );
      // The task disappeared (deleted or filtered out) while the dialog was
      // open; nothing to save.
      if (catIdx === -1) return;
      const trimmed = newText.trim();
      const nextCompleted = newStatus === "COMPLETED";
      const nowIso = new Date().toISOString();
      const resolvedDueDate =
         taskType === "daily"
            ? newDueDate !== undefined && newDueDate !== ""
               ? newDueDate
               : (editTaskModal.dueDate ?? selectedDateKey)
            : newDueDate !== undefined && newDueDate !== ""
              ? newDueDate
              : (editTaskModal.dueDate ?? null);

      if (taskType === "daily" && resolvedDueDate) {
         const originalDateKey = editTaskModal.dueDate
            ? typeof editTaskModal.dueDate === "string"
               ? editTaskModal.dueDate.slice(0, 10)
               : new Date(editTaskModal.dueDate).toISOString().slice(0, 10)
            : editTaskModal.createdAt
              ? new Date(editTaskModal.createdAt).toISOString().slice(0, 10)
              : effectiveTodayDate;

         if (checkIsDayLocked(resolvedDueDate)) {
            return;
         }

         const check = validateMoveTaskChallengeDay(
            originalDateKey,
            resolvedDueDate,
            effectiveTodayDate,
            {
               isChallengeActive: hasChallengeContext,
               isTargetDayLocked: checkIsDayLocked(resolvedDueDate),
            }
         );
         if (!check.ok) {
            return;
         }
      }

      const patch = buildTaskEditPatch(
         {
            title: editTaskModal.text,
            status: editTaskModal.status,
            isComplete: editTaskModal.completed,
            dueDate: editTaskModal.dueDate ?? null,
            challengeId: editTaskModal.challengeId ?? null,
         },
         {
            title: trimmed,
            status: newStatus,
            isComplete: nextCompleted,
            dueDate: resolvedDueDate,
            challengeId:
               taskType === "weekly" ? editTaskInputChallengeId : undefined,
         },
         taskType === "daily" ? "DAILY" : "WEEKLY"
      );

      if (
         isEditTaskGraceLocked &&
         (patch.title !== undefined || patch.challengeId !== undefined)
      ) {
         return;
      }

      if (Object.keys(patch).length === 0) {
         setEditTaskModal(null);
         return;
      }

      if (nextCompleted) {
         const prevTask =
            taskType === "daily"
               ? dailyCategories[catIdx]?.tasks.find((t) => t.id === id)
               : weeklyCategories[catIdx]?.tasks.find((t) => t.id === id);
         if (prevTask && getTaskStatus(prevTask) !== "COMPLETED") {
            const targetEl =
               typeof document !== "undefined"
                  ? document.querySelector(`[data-task-id="${id}"]`)
                  : null;
            triggerTaskConfetti(targetEl);
            void playCompletionAudio();
         }
      }

      if (taskType === "daily") {
         setDailyCategories((prev) =>
            prev.map((cat, i) =>
               i === catIdx
                  ? {
                       ...cat,
                       tasks: cat.tasks.map((t) =>
                          t.id === id
                             ? {
                                  ...t,
                                  text: trimmed,
                                  completed: nextCompleted,
                                  status: newStatus,
                                  dueDate: resolvedDueDate,
                               }
                             : t
                       ),
                    }
                  : cat
            )
         );
      } else {
         setWeeklyCategories((prev) =>
            prev.map((cat, i) =>
               i === catIdx
                  ? {
                       ...cat,
                       tasks: cat.tasks.map((t) =>
                          t.id === id
                             ? {
                                  ...t,
                                  text: trimmed,
                                  completed: nextCompleted,
                                  status: newStatus,
                                  dueDate: resolvedDueDate,
                                  challengeId: editTaskInputChallengeId,
                               }
                             : t
                       ),
                    }
                  : cat
            )
         );
      }

      const cat =
         taskType === "daily"
            ? dailyCategories[catIdx]
            : weeklyCategories[catIdx];
      if (cat?.id) {
         const localTask: LocalTaskRecord = buildBoardTaskRecord({
            task: {
               id,
               text: trimmed,
               completed: nextCompleted,
               status: newStatus,
               dueDate: resolvedDueDate,
               createdAt: editTaskModal.createdAt,
               challengeId:
                  taskType === "weekly"
                     ? editTaskInputChallengeId
                     : (editTaskModal.challengeId ?? null),
            },
            userId: userId ?? null,
            categoryId: cat.id,
            taskType: taskType === "daily" ? "DAILY" : "WEEKLY",
            sortOrder: Math.max(
               0,
               cat.tasks.findIndex((t) => t.id === id)
            ),
            isComplete: nextCompleted,
            status: newStatus,
            dueDate: resolvedDueDate,
            challengeId:
               taskType === "weekly"
                  ? editTaskInputChallengeId
                  : (editTaskModal.challengeId ?? null),
            nowIso,
         });

         persistTask(localTask, {
            id: crypto.randomUUID(),
            entityType: "TASK",
            action: "UPDATE",
            payload: { taskId: id, ...patch },
            createdAt: Date.now(),
            retryCount: 0,
         })
            .then(() => scheduleSync(userId, 400))
            .catch(() => {});
      }

      logTaskSync("Task updated", {
         taskId: id,
         title: trimmed,
         status: newStatus,
         isComplete: nextCompleted,
         dueDate: resolvedDueDate,
      });
      setEditTaskModal(null);
   };

   const toggleTaskChallengeScope = useCallback(
      (taskId: string, newChallengeId: string | null) => {
         let foundCat: BoardCategory | undefined;
         let foundTask: BoardTask | undefined;

         for (const cat of weeklyCategories) {
            const t = cat.tasks.find((item) => item.id === taskId);
            if (t) {
               foundCat = cat;
               foundTask = t;
               break;
            }
         }
         if (!foundTask || !foundCat) return;

         if (
            isWeeklyTaskGraceExpired({
               taskType: "WEEKLY",
               challengeId: foundTask.challengeId,
               createdAt: foundTask.createdAt ?? new Date(),
            })
         ) {
            return;
         }

         setWeeklyCategories((prev) =>
            prev.map((cat) => ({
               ...cat,
               tasks: cat.tasks.map((t) =>
                  t.id === taskId ? { ...t, challengeId: newChallengeId } : t
               ),
            }))
         );

         const nowIso = new Date().toISOString();
         if (foundCat.id) {
            const localTask: LocalTaskRecord = buildBoardTaskRecord({
               task: foundTask,
               userId: userId ?? null,
               categoryId: foundCat.id,
               taskType: "WEEKLY",
               sortOrder: Math.max(
                  0,
                  foundCat.tasks.findIndex((t) => t.id === taskId)
               ),
               isComplete: Boolean(foundTask.completed),
               status: getTaskStatus(foundTask),
               challengeId: newChallengeId,
               nowIso,
            });

            persistTask(localTask, {
               id: crypto.randomUUID(),
               entityType: "TASK",
               action: "UPDATE",
               payload: {
                  taskId,
                  challengeId: newChallengeId,
               },
               createdAt: Date.now(),
               retryCount: 0,
            })
               .then(() => scheduleSync(userId, 400))
               .catch(() => {});
         }
      },
      [weeklyCategories, userId, persistTask]
   );

   const handleRolloverIncompleteTasks = useCallback(
      (options?: { sourceDateKey?: string; taskId?: string }) => {
         const candidates = findRolloverCandidates(
            dailyCategories,
            effectiveTodayDate,
            options
         );
         if (candidates.length === 0) return;

         const candidateIds = candidates.map((c) => c.taskId);
         const { updatedCategories, rolledOverCount } =
            applyRolloverToCategories(
               dailyCategories,
               candidateIds,
               effectiveTodayDate
            );

         setDailyCategories(updatedCategories);

         const nowIso = new Date().toISOString();
         const localTasks: LocalTaskRecord[] = [];
         candidates.forEach((candidate) => {
            if (candidate.categoryId) {
               const sourceCat = dailyCategories.find((c) =>
                  c.tasks.some((t) => t.id === candidate.taskId)
               );
               localTasks.push(
                  buildBoardTaskRecord({
                     task: candidate.task,
                     userId: userId ?? null,
                     categoryId: candidate.categoryId,
                     taskType: "DAILY",
                     sortOrder: sourceCat
                        ? Math.max(
                             0,
                             sourceCat.tasks.findIndex(
                                (t) => t.id === candidate.taskId
                             )
                          )
                        : 0,
                     isComplete: false,
                     status: (candidate.task.status as TaskStatus) || "TODO",
                     dueDate: effectiveTodayDate,
                     title: candidate.title,
                     challengeId: candidate.task.challengeId ?? null,
                     nowIso,
                  })
               );
            }
         });

         if (isLoggedIn && userId && candidateIds.length > 0) {
            persistTasks(localTasks, {
               id: crypto.randomUUID(),
               entityType: "TASK",
               action: "ROLLOVER",
               payload: {
                  taskIds: candidateIds,
                  targetDateKey: effectiveTodayDate,
               },
               createdAt: Date.now(),
               retryCount: 0,
            })
               .then(() => scheduleSync(userId, 400))
               .catch(() => {});
         } else if (localTasks.length > 0) {
            putLocalTasks(localTasks).catch(() => {});
         }

         logTaskSync("Incomplete tasks rolled over to Today", {
            count: rolledOverCount,
            targetDateKey: effectiveTodayDate,
         });
      },
      [dailyCategories, effectiveTodayDate, userId, isLoggedIn, persistTasks]
   );

   return {
      setTaskStatus,
      toggleDailyTask,
      toggleWeeklyTask,
      handleDeleteTask,
      handleSaveEditTask,
      toggleTaskChallengeScope,
      handleRolloverIncompleteTasks,
   };
}
