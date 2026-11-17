"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
   ChevronDown,
   ChevronUp,
   Check,
   X,
   Trash2,
   MoreVertical,
   Pencil,
   GripVertical,
   RotateCcw,
   Calendar,
   Lock,
   ArrowRight,
   Trophy,
   User,
   Plus,
} from "lucide-react";
import {
   formatDayDate,
   validateMoveTaskChallengeDay,
   type ChallengeDayOption,
} from "@/features/study-logs/domain/challenge-day";
import {
   calculateReorderIndex,
   moveCategoryBetweenColumns,
   moveTaskBetweenCategories,
} from "@/features/tasks/domain/task-reorder";
import {
   isCategoryCollapsed,
   writeCollapsedCategoryIds,
   ROLLOVER_SNOOZE_COOKIE,
   ROLLOVER_SNOOZE_STORAGE_PREFIX,
} from "@/features/study-logs/presentation/cockpit/cockpit-tasks-storage";
import { TaskExportButton } from "@/features/tasks/presentation/task-export-button";
import {
   formatDailyTasksExport,
   formatWeeklyTasksExport,
   formatFullDayDate,
   type TaskExportStyle,
} from "@/features/tasks/domain/task-export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
   Select,
   SelectContent,
   SelectGroup,
   SelectItem,
   SelectLabel,
   SelectTrigger,
   SelectValue,
} from "@/components/ui/select";
import {
   DropdownMenu,
   DropdownMenuTrigger,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
   ContextMenu,
   ContextMenuTrigger,
   ContextMenuContent,
   ContextMenuItem,
   ContextMenuSeparator,
   ContextMenuLabel,
} from "@/components/ui/context-menu";
import {
   TaskMenuItems,
   CategoryMenuItems,
} from "@/features/study-logs/presentation/cockpit/cockpit-task-menu";
import { CockpitWeekNavigator } from "@/features/study-logs/presentation/cockpit/cockpit-date-picker-popover";
import { cn } from "@/lib/utils";
import { triggerTaskConfetti } from "@/lib/confetti";
import { playCompletionAudio } from "@/features/preferences/presentation/audio-service";
import { trackLogRocketEvent } from "@/core/observability/logrocket";
import {
   applyRolloverToCategories,
   findRolloverCandidates,
   getRolloverSummary,
} from "@/features/tasks/domain/task-rollover";
import {
   canScopeTaskToChallenge,
   countScopedTasks,
   getTaskScope,
   type TaskScope,
} from "@/features/tasks/domain/task-scope";
import { buildTaskEditPatch } from "@/features/tasks/domain/task-edit-patch";
import { isWeeklyTaskGraceExpired } from "@/features/tasks/domain/task-lock";
import type { TaskStatus } from "@/features/tasks/domain/task.types";
import {
   commitLocalBatch,
   logTaskSync,
   putLocalCategory,
   putLocalTask,
   putLocalTasks,
} from "@/features/tasks/data/local/task-idb";
import { scheduleSync } from "@/features/tasks/data/local/task-sync.service";
import { useCategoryMutations } from "./hooks/use-category-mutations";
import { useTaskBoardHydration } from "./hooks/use-task-board-hydration";
import { useTaskDragAndDrop } from "./hooks/use-task-drag-and-drop";
import { useTaskModals } from "./hooks/use-task-modals";
import { useTaskBoardState } from "./hooks/use-task-board-state";
import { useTaskMoves } from "./hooks/use-task-moves";
import { useTaskMutations } from "./hooks/use-task-mutations";
import { useWeekNavigation } from "./hooks/use-week-navigation";
import { RenameCategoryDialog } from "./dialogs/rename-category-dialog";
import { DeleteCategoryDialog } from "./dialogs/delete-category-dialog";
import { EditTaskDialog } from "./dialogs/edit-task-dialog";
import { AddTaskDialog } from "./dialogs/add-task-dialog";
import { MobileBoardSwitcher } from "./components/mobile-board-switcher";
import { TaskRow } from "./components/task-row";
import { TaskCategoryCard } from "./components/task-category-card";
import { RolloverBanner } from "./components/rollover-banner";
import { BoardHeader } from "./components/board-header";
import { DayPillSwitcher } from "./components/day-pill-switcher";
import { TaskSyncIssueBanner } from "@/features/tasks/presentation/task-sync-issue-banner";
import type {
   LocalCategoryRecord,
   LocalTaskRecord,
   QueuedMutation,
} from "@/features/tasks/domain/task-sync.types";
import type {
   BoardCategory,
   BoardTask,
   CockpitTasksSectionProps,
   DeleteCategoryModalState,
   DragOverInfo,
   DraggedItem,
   EditCategoryModalState,
   EditTaskModalState,
} from "./task-board.types";
import {
   buildBoardTaskRecord,
   getTaskStatus,
   LOAD_SAMPLE_TASK_EVENT,
   SAMPLE_STUDY_TASKS,
} from "./task-board.utils";
import { useTaskBoardPersistence } from "./hooks/use-task-board-persistence";
import {
   selectActiveDayOption,
   selectActiveWeekDateKeys,
   selectActiveWeeklyWeekDateKeys,
   selectCategoryTotals,
   selectCompletedChallengeIdSet,
   selectDailyCategoryNameToId,
   selectDailyCategoryOptions,
   selectDayOptions,
   selectDayTaskCounts,
   selectEffectiveTodayDate,
   selectIndependentDailyCategoryOptions,
   selectInitialDayOption,
   selectIsTaskInWeeklyWeek,
   selectIsViewingCurrentWeeklyWeek,
   selectTaskDateKey,
   selectTasksForDateKey,
   selectTodayDayOption,
   selectVisibleWeeklyCategories,
   selectWeekRangeLabel,
   selectWeekScopedTotals,
   selectWeeklyCategoryNameToId,
   selectWeeklyCategoryOptions,
   selectWeeklyRangeLabel,
} from "./task-board.selectors";

export type {
   BoardCategory,
   BoardTask,
   CockpitTasksSectionProps,
   DeleteCategoryModalState,
   DragOverInfo,
   DraggedItem,
   EditCategoryModalState,
   EditTaskModalState,
} from "./task-board.types";
export {
   getTaskStatus,
   isWeeklyTaskVisible,
   LOAD_SAMPLE_TASK_EVENT,
   SAMPLE_STUDY_TASKS,
} from "./task-board.utils";

/** Renders the participant's categorized task board and task actions. */
export function CockpitTasksSection({
   isLoggedIn,
   userId,
   userTasks,
   completedChallengeIds,
   challengeStartDate,
   challengeId,
   challengeStatus,
   todayDate,
   todayDayNumber,
   totalChallengeDays = 7,
   initialSelectedDateKey,
   onOpenHoursModal,
   isAdmin = false,
   initialCollapsedCategoryIds,
   initialIsRolloverSnoozed,
}: CockpitTasksSectionProps) {
   const {
      persistTask,
      persistTasks,
      persistCategory,
      deleteTaskWithMutation,
      deleteCategoryWithMutation,
   } = useTaskBoardPersistence({ isLoggedIn, userId });

   const linkableChallengeId =
      challengeId && challengeStatus !== "COMPLETED" ? challengeId : null;
   const isChallengeActive = challengeStatus
      ? challengeStatus === "ACTIVE"
      : Boolean(challengeStartDate);
   const hasChallengeContext = Boolean(
      (challengeStartDate || (challengeStatus === "ACTIVE" && todayDate)) &&
      isChallengeActive
   );
   const effectiveStartDate =
      challengeStartDate || (hasChallengeContext ? todayDate : undefined);

   const effectiveTodayDate = useMemo(
      () =>
         selectEffectiveTodayDate({
            hasChallengeContext,
            challengeStatus,
            todayDate,
         }),
      [hasChallengeContext, challengeStatus, todayDate]
   );

   const {
      dailyCategories,
      setDailyCategories,
      weeklyCategories,
      setWeeklyCategories,
      expandedTaskIds,
      toggleTaskExpand,
      mobileActiveTab,
      setMobileActiveTab,
      collapsedCategoryIds,
      setCollapsedCategoryIds,
      collapsedCategoryIdsRef,
      toggleDailyCollapse,
      toggleWeeklyCollapse,
      isRolloverSnoozed,
      isRolloverDismissed,
      handleSnoozeRolloverToday,
   } = useTaskBoardState({
      userId,
      userTasks,
      initialCollapsedCategoryIds,
      initialIsRolloverSnoozed,
      effectiveTodayDate,
   });

   // Edit Category Modal State
   const [editCategoryModal, setEditCategoryModal] =
      useState<EditCategoryModalState | null>(null);
   const [editCategoryInputName, setEditCategoryInputName] = useState("");

   // Delete Category Confirmation Modal State
   const [deleteCategoryModal, setDeleteCategoryModal] =
      useState<DeleteCategoryModalState | null>(null);

   const weeklyCategoryOptions = selectWeeklyCategoryOptions(
      userTasks?.categories,
      weeklyCategories
   );

   const independentDailyCategoryOptions =
      selectIndependentDailyCategoryOptions(
         userTasks?.categories,
         dailyCategories,
         weeklyCategoryOptions
      );

   const dailyCategoryOptions = selectDailyCategoryOptions(
      weeklyCategoryOptions,
      independentDailyCategoryOptions
   );

   const completedChallengeIdSet = useMemo(
      () =>
         selectCompletedChallengeIdSet(
            completedChallengeIds,
            challengeStatus,
            challengeId
         ),
      [completedChallengeIds, challengeStatus, challengeId]
   );

   const visibleWeeklyCategories = useMemo(
      () =>
         selectVisibleWeeklyCategories(
            weeklyCategories,
            completedChallengeIdSet
         ),
      [weeklyCategories, completedChallengeIdSet]
   );

   const {
      activeWeekAnchorDateKey,
      dayOptions,
      todayDayOption,
      selectedDateKey,
      selectedDayNumber,
      activeDayOption,
      isActiveDayToday,
      isActiveDayPast,
      checkIsDayLocked,
      isPastDayLocked,
      activeWeekDateKeys,
      weekRangeLabel,
      handleSelectDay,
      handleJumpToToday,
      handlePreviousWeek,
      handleNextWeek,
      handleSelectDateFromPicker,
      activeWeeklyAnchorDateKey,
      activeWeeklyWeekDateKeys,
      weeklyRangeLabel,
      isViewingCurrentWeeklyWeek,
      handleWeeklyPreviousWeek,
      handleWeeklyNextWeek,
      handleWeeklyJumpToCurrentWeek,
      handleSelectWeeklyDateFromPicker,
      isTaskInWeeklyWeek,
      getTaskDateKey,
   } = useWeekNavigation({
      initialSelectedDateKey,
      hasChallengeContext,
      effectiveStartDate,
      effectiveTodayDate,
      totalChallengeDays,
      todayDayNumber,
      challengeStartDate,
      challengeStatus,
      linkableChallengeId,
   });

   const taskModals = useTaskModals({
      selectedDateKey,
      effectiveTodayDate,
      todayDayOption,
      dayOptions,
      checkIsDayLocked,
      dailyCategoryOptions,
      weeklyCategoryOptions,
      linkableChallengeId,
   });

   const {
      add: {
         type: addModalType,
         text: newTodoText,
         selectedCategory,
         customCategory,
         isCreatingCategory,
         status: newTodoStatus,
         dateKey: addTodoDateKey,
         challengeScope: addTodoChallengeScope,
         categoryInputRef,
         categorySelectRef,
         setText: setNewTodoText,
         setSelectedCategory,
         setCustomCategory,
         setIsCreatingCategory,
         setStatus: setNewTodoStatus,
         setDateKey: setAddTodoDateKey,
         setChallengeScope: setAddTodoChallengeScope,
         openDaily: openAddDailyModal,
         openWeekly: openAddWeeklyModal,
         close: closeAddModal,
      },
      editTask: {
         modal: editTaskModal,
         text: editTaskInputText,
         status: editTaskInputStatus,
         dueDate: editTaskInputDueDate,
         challengeId: editTaskInputChallengeId,
         isGraceLocked: isEditTaskGraceLocked,
         setModal: setEditTaskModal,
         setText: setEditTaskInputText,
         setStatus: setEditTaskInputStatus,
         setDueDate: setEditTaskInputDueDate,
         setChallengeId: setEditTaskInputChallengeId,
         close: closeEditTaskModal,
      },
   } = taskModals;

   const { moveTaskToDay, moveCategoryToDayAction, commitTaskMove } =
      useTaskMoves({
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
         persistCategory,
         checkIsDayLocked,
         getTaskDateKey,
      });

   const {
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
   } = useTaskDragAndDrop({
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
   });
   const weeklyCategoryNameToId = selectWeeklyCategoryNameToId(
      userTasks?.categories
   );

   const dailyCategoryNameToId = selectDailyCategoryNameToId(
      userTasks?.categories,
      weeklyCategories,
      dailyCategories
   );

   useTaskBoardHydration({
      userId,
      userTasks,
      collapsedCategoryIdsRef,
      setDailyCategories,
      setWeeklyCategories,
   });

   const {
      setTaskStatus,
      toggleDailyTask,
      toggleWeeklyTask,
      handleDeleteTask,
      handleSaveEditTask,
      toggleTaskChallengeScope,
      handleRolloverIncompleteTasks,
   } = useTaskMutations({
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
   });

   const rolloverSummary = useMemo(
      () =>
         getRolloverSummary(
            dailyCategories,
            effectiveTodayDate,
            selectedDateKey
         ),
      [dailyCategories, effectiveTodayDate, selectedDateKey]
   );

   const weeklyScopedCounts = useMemo(() => {
      if (!linkableChallengeId) {
         return {
            totalChallengeGoals: 0,
            completedChallengeGoals: 0,
            totalPersonalGoals: 0,
            completedPersonalGoals: 0,
            totalTasks: 0,
            completedTasks: 0,
         };
      }
      const allWeeklyTasks = weeklyCategories.flatMap((c) => c.tasks);
      const scopedTasks = allWeeklyTasks.map((t) => ({
         ...t,
         challengeId:
            t.challengeId === linkableChallengeId ? linkableChallengeId : null,
      }));
      return countScopedTasks(scopedTasks);
   }, [weeklyCategories, linkableChallengeId]);

   const { handleSaveEditCategory, handleConfirmDeleteCategory } =
      useCategoryMutations({
         userId,
         dailyCategories,
         weeklyCategories,
         setDailyCategories,
         setWeeklyCategories,
         dailyCategoryNameToId,
         weeklyCategoryNameToId,
         persistCategory,
         deleteCategoryWithMutation,
         editCategoryModal,
         setEditCategoryModal,
         deleteCategoryModal,
         setDeleteCategoryModal,
         setCollapsedCategoryIds,
         collapsedCategoryIdsRef,
         getTaskDateKey,
         checkIsDayLocked,
      });

   const { total: totalDailyTasks, completed: completedDailyTasks } =
      selectCategoryTotals(dailyCategories);

   const dailyTasksForSelectedDay = useMemo(
      () =>
         selectTasksForDateKey(
            dailyCategories,
            selectedDateKey,
            getTaskDateKey
         ),
      [dailyCategories, selectedDateKey, getTaskDateKey]
   );

   const completedDailyTasksForDay = dailyTasksForSelectedDay.filter(
      (t) => t.completed
   ).length;
   const totalDailyTasksForDay = dailyTasksForSelectedDay.length;

   const dayTaskCounts = useMemo(
      () => selectDayTaskCounts(dayOptions, dailyCategories, getTaskDateKey),
      [dayOptions, dailyCategories, getTaskDateKey]
   );

   const { total: totalWeeklyTasks, completed: completedWeeklyTasks } =
      selectCategoryTotals(weeklyCategories);

   const weekScopedTotals = useMemo(
      () => selectWeekScopedTotals(weeklyCategories, isTaskInWeeklyWeek),
      [weeklyCategories, isTaskInWeeklyWeek]
   );
   const totalWeeklyTasksForWeek = weekScopedTotals.total;
   const completedWeeklyTasksForWeek = weekScopedTotals.completed;

   const visibleWeeklyTasksCount = useMemo(
      () =>
         selectWeekScopedTotals(visibleWeeklyCategories, isTaskInWeeklyWeek)
            .total,
      [visibleWeeklyCategories, isTaskInWeeklyWeek]
   );

   const handleExportDaily = useCallback(
      (style: TaskExportStyle) => {
         const exportCategories = dailyCategories.map((cat) => ({
            id: cat.id,
            name: cat.name,
            tasks: cat.tasks
               .filter((t) => getTaskDateKey(t) === selectedDateKey)
               .map((t) => ({
                  id: t.id,
                  text: t.text,
                  completed: t.completed,
                  status: getTaskStatus(t),
                  challengeId: t.challengeId,
                  isChallengeGoal: Boolean(
                     linkableChallengeId &&
                     t.challengeId === linkableChallengeId
                  ),
               })),
         }));

         return formatDailyTasksExport({
            dateKey: selectedDateKey,
            dateLabel: formatFullDayDate(selectedDateKey),
            dayNumber: hasChallengeContext
               ? activeDayOption?.dayNumber
               : undefined,
            categories: exportCategories,
            style,
         });
      },
      [
         dailyCategories,
         selectedDateKey,
         getTaskDateKey,
         hasChallengeContext,
         activeDayOption,
         linkableChallengeId,
      ]
   );

   const handleExportWeekly = useCallback(
      (style: TaskExportStyle) => {
         const exportCategories = visibleWeeklyCategories.map((cat) => ({
            id: cat.id,
            name: cat.name,
            tasks: cat.tasks.filter(isTaskInWeeklyWeek).map((t) => ({
               id: t.id,
               text: t.text,
               completed: t.completed,
               status: getTaskStatus(t),
               challengeId: t.challengeId,
               isChallengeGoal: Boolean(
                  linkableChallengeId && t.challengeId === linkableChallengeId
               ),
            })),
         }));

         return formatWeeklyTasksExport({
            weekRangeLabel: weeklyRangeLabel || "Active Week",
            categories: exportCategories,
            style,
         });
      },
      [
         visibleWeeklyCategories,
         isTaskInWeeklyWeek,
         weeklyRangeLabel,
         linkableChallengeId,
      ]
   );
   const handleAddTodoSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTodoText.trim()) return;

      const trimmedCustom = customCategory.trim();
      // If user typed a custom name that matches an existing weekly category, link to that parent category
      const matchingWeekly = trimmedCustom
         ? weeklyCategories.find(
              (c) => c.name.toLowerCase() === trimmedCustom.toLowerCase()
           ) ||
           userTasks?.categories?.find(
              (c) =>
                 c.taskType === "WEEKLY" &&
                 c.name.toLowerCase() === trimmedCustom.toLowerCase()
           )
         : undefined;

      const isNew = Boolean(
         isCreatingCategory && trimmedCustom && !matchingWeekly
      );
      const targetCategoryName =
         (isCreatingCategory && trimmedCustom
            ? matchingWeekly?.name || trimmedCustom
            : selectedCategory) || "General";
      const taskType = addModalType === "daily" ? "DAILY" : "WEEKLY";
      const resolvedDueDate =
         addModalType === "daily"
            ? addTodoDateKey || selectedDateKey
            : isViewingCurrentWeeklyWeek
              ? null
              : activeWeeklyAnchorDateKey;

      if (addModalType === "daily" && resolvedDueDate) {
         if (checkIsDayLocked(resolvedDueDate)) {
            return;
         }
      }

      const targetChallengeId =
         addModalType === "weekly"
            ? addTodoChallengeScope === "CHALLENGE"
               ? linkableChallengeId
               : null
            : null;

      const nowIso = new Date().toISOString();
      const newTaskId = crypto.randomUUID();
      const nextCompleted = newTodoStatus === "COMPLETED";
      const newTask: BoardTask = {
         id: newTaskId,
         text: newTodoText.trim(),
         completed: nextCompleted,
         status: newTodoStatus,
         dueDate: resolvedDueDate,
         createdAt: nowIso,
         challengeId: targetChallengeId,
      };

      let targetCatId: string | undefined = undefined;

      if (addModalType === "daily") {
         const existingInDaily = dailyCategories.find(
            (c) => c.name === targetCategoryName
         );
         const existingInWeekly = weeklyCategories.find(
            (c) => c.name === targetCategoryName
         );
         const existingInServer = userTasks?.categories?.find(
            (c) => c.name === targetCategoryName
         );

         targetCatId =
            existingInDaily?.id ||
            existingInWeekly?.id ||
            existingInServer?.id ||
            (isNew
               ? crypto.randomUUID()
               : dailyCategoryNameToId.get(targetCategoryName) ||
                 weeklyCategoryNameToId.get(targetCategoryName) ||
                 crypto.randomUUID());

         setDailyCategories((prev) => {
            const existingIndex = prev.findIndex(
               (c) => c.name === targetCategoryName
            );
            if (existingIndex >= 0) {
               return prev.map((cat, i) =>
                  i === existingIndex
                     ? {
                          ...cat,
                          id: cat.id || targetCatId,
                          isCollapsed: cat.isCollapsed,
                          tasks: [...cat.tasks, newTask],
                       }
                     : cat
               );
            } else {
               return [
                  ...prev,
                  {
                     id: targetCatId,
                     name: targetCategoryName,
                     isCollapsed: false,
                     tasks: [newTask],
                  },
               ];
            }
         });
      } else {
         const existingInWeekly = weeklyCategories.find(
            (c) => c.name === targetCategoryName
         );
         const existingInServer = userTasks?.categories?.find(
            (c) => c.name === targetCategoryName
         );

         targetCatId =
            existingInWeekly?.id ||
            existingInServer?.id ||
            (isNew
               ? crypto.randomUUID()
               : weeklyCategoryNameToId.get(targetCategoryName) ||
                 crypto.randomUUID());

         setWeeklyCategories((prev) => {
            const existingIndex = prev.findIndex(
               (c) => c.name === targetCategoryName
            );
            if (existingIndex >= 0) {
               return prev.map((cat, i) =>
                  i === existingIndex
                     ? {
                          ...cat,
                          id: cat.id || targetCatId,
                          isCollapsed: cat.isCollapsed,
                          tasks: [...cat.tasks, newTask],
                       }
                     : cat
               );
            } else {
               return [
                  ...prev,
                  {
                     id: targetCatId,
                     name: targetCategoryName,
                     isCollapsed: false,
                     tasks: [newTask],
                  },
               ];
            }
         });
      }

      let initialSortOrder = 0;
      if (isNew && targetCatId) {
         const boardCategories =
            addModalType === "daily" ? dailyCategories : weeklyCategories;
         const highestOrder = boardCategories.reduce(
            (max, c) => Math.max(max, c.sortOrder ?? 0),
            -1
         );
         initialSortOrder = highestOrder + 1;
      }

      const localCategories: LocalCategoryRecord[] =
         isNew && targetCatId
            ? [
                 {
                    id: targetCatId,
                    userId: userId ?? null,
                    name: targetCategoryName,
                    taskType: addModalType === "daily" ? "DAILY" : "WEEKLY",
                    sortOrder: initialSortOrder,
                    createdAt: nowIso,
                    updatedAt: nowIso,
                    syncState: "pending",
                 },
              ]
            : [];

      const targetBoardCategories =
         addModalType === "daily" ? dailyCategories : weeklyCategories;
      const targetCategoryForOrder = targetBoardCategories.find(
         (c) => c.id === targetCatId || c.name === targetCategoryName
      );
      const newTaskSortOrder = targetCategoryForOrder?.tasks.length ?? 0;

      const localTasks: LocalTaskRecord[] = targetCatId
         ? [
              buildBoardTaskRecord({
                 task: newTask,
                 userId: userId ?? null,
                 categoryId: targetCatId,
                 taskType,
                 sortOrder: newTaskSortOrder,
                 isComplete: nextCompleted,
                 status: newTodoStatus,
                 dueDate: resolvedDueDate,
                 title: newTodoText.trim(),
                 challengeId: targetChallengeId,
                 nowIso,
              }),
           ]
         : [];

      const mutations: Array<Omit<QueuedMutation, "userId">> = [];
      if (isNew && targetCatId) {
         mutations.push({
            id: crypto.randomUUID(),
            entityType: "CATEGORY",
            action: "CREATE",
            payload: {
               id: targetCatId,
               name: targetCategoryName,
               taskType: addModalType === "daily" ? "DAILY" : "WEEKLY",
               sortOrder: initialSortOrder,
            },
            createdAt: Date.now(),
            retryCount: 0,
         });
      }

      mutations.push({
         id: crypto.randomUUID(),
         entityType: "TASK",
         action: "CREATE",
         payload: {
            id: newTaskId,
            categoryId: targetCatId,
            challengeId: targetChallengeId,
            title: newTodoText.trim(),
            taskType,
            sortOrder: newTaskSortOrder,
            isComplete: nextCompleted,
            status: newTodoStatus,
            dueDate: resolvedDueDate,
         },
         createdAt: Date.now() + 1,
         retryCount: 0,
      });

      commitLocalBatch({
         categories: localCategories,
         tasks: localTasks,
         mutations:
            isLoggedIn && userId
               ? mutations.map((mutation) => ({ ...mutation, userId }))
               : [],
      })
         .then(() => scheduleSync(userId))
         .catch(() => {});

      if (isLoggedIn && userId) {
         trackLogRocketEvent("TaskCreated", {
            taskType,
            isNewCategory: isNew,
         });
      }

      logTaskSync("Task created", {
         id: newTaskId,
         title: newTodoText.trim(),
         dueDate: resolvedDueDate,
      });

      setNewTodoText("");
      setNewTodoStatus("TODO");
      setCustomCategory("");
      setIsCreatingCategory(false);
      closeAddModal();
   };

   const handleAddSampleTask = useCallback(
      (taskText: string) => {
         const trimmed = taskText.trim();
         if (!trimmed) return;
         const targetCategoryName = "Study Commitments";
         const targetDateKey = selectedDateKey || effectiveTodayDate;
         const newTaskId = crypto.randomUUID();
         const newTask: BoardTask = {
            id: newTaskId,
            text: trimmed,
            completed: false,
            status: "TODO",
            dueDate: targetDateKey,
            challengeId: null,
         };

         const existingCat = dailyCategories.find(
            (c) => c.name === targetCategoryName
         );
         const targetCatId = existingCat?.id || crypto.randomUUID();

         setDailyCategories((prev) => {
            const existingIdx = prev.findIndex(
               (c) => c.name === targetCategoryName
            );
            if (existingIdx >= 0) {
               return prev.map((cat, i) =>
                  i === existingIdx
                     ? {
                          ...cat,
                          id: cat.id || targetCatId,
                          tasks: [...cat.tasks, newTask],
                       }
                     : cat
               );
            }
            return [
               ...prev,
               {
                  id: targetCatId,
                  name: targetCategoryName,
                  isCollapsed: false,
                  sortOrder: 0,
                  tasks: [newTask],
               },
            ];
         });

         const nowIso = new Date().toISOString();
         if (!existingCat) {
            putLocalCategory({
               id: targetCatId,
               userId: userId ?? null,
               name: targetCategoryName,
               taskType: "DAILY",
               sortOrder: 0,
               createdAt: nowIso,
               updatedAt: nowIso,
               syncState: "pending",
            }).catch(() => {});
         }

         putLocalTask(
            buildBoardTaskRecord({
               task: newTask,
               userId: userId ?? null,
               categoryId: targetCatId,
               taskType: "DAILY",
               sortOrder: existingCat?.tasks.length ?? 0,
               dueDate: targetDateKey,
               title: trimmed,
               challengeId: null,
               nowIso,
            })
         ).catch(() => {});
      },
      [selectedDateKey, effectiveTodayDate, dailyCategories, userId]
   );

   useEffect(() => {
      if (typeof window === "undefined") return;
      const handleSampleTaskEvent = (e: Event) => {
         const customEvent = e as CustomEvent<{ title?: string }>;
         if (customEvent.detail?.title) {
            handleAddSampleTask(customEvent.detail.title);
         }
      };
      window.addEventListener(LOAD_SAMPLE_TASK_EVENT, handleSampleTaskEvent);
      return () => {
         window.removeEventListener(
            LOAD_SAMPLE_TASK_EVENT,
            handleSampleTaskEvent
         );
      };
   }, [handleAddSampleTask]);

   // ---------------------------------------------------------------------------
   // Drag and Drop Event Handlers
   // ---------------------------------------------------------------------------

   return (
      <>
         <TaskSyncIssueBanner userId={userId} />
         <MobileBoardSwitcher
            activeTab={mobileActiveTab}
            onTabChange={setMobileActiveTab}
            dailyCompleted={completedDailyTasksForDay}
            dailyTotal={totalDailyTasksForDay}
            weeklyCompleted={completedWeeklyTasks}
            weeklyTotal={totalWeeklyTasks}
         />

         <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Daily Todos */}
            <div
               data-testid="daily-tasks-board"
               onDragOver={(e) => handleColumnDragOver(e, "daily")}
               onDrop={(e) => handleColumnDrop(e, "daily")}
               className={`rounded-2xl border bg-surface-primary p-5 sm:p-6 shadow-md flex-col justify-between space-y-5 transition-all ${
                  mobileActiveTab === "daily" ? "flex" : "hidden sm:flex"
               } ${
                  dragOverInfo?.type === "column" &&
                  dragOverInfo.targetColumn === "daily"
                     ? "border-brand-2 ring-1 ring-brand-2/50 bg-surface-secondary"
                     : "border-border-default"
               }`}
            >
               <div className="space-y-3">
                  <BoardHeader
                     title="Daily Todos"
                     badgeLabel={activeDayOption.shortLabel}
                     showTodayDot={isActiveDayToday}
                     isLocked={isPastDayLocked}
                     completed={completedDailyTasksForDay}
                     total={totalDailyTasksForDay}
                  />

                  {/* Row 2: Calendar Week Navigator & Export */}
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                     <CockpitWeekNavigator
                        selectedDateKey={selectedDateKey}
                        todayDateKey={effectiveTodayDate}
                        weekRangeLabel={weekRangeLabel}
                        onPreviousWeek={handlePreviousWeek}
                        onNextWeek={handleNextWeek}
                        onSelectDate={handleSelectDateFromPicker}
                        activeWeekDateKeys={activeWeekDateKeys}
                        showToday={!isActiveDayToday}
                        onJumpToToday={handleJumpToToday}
                     />
                     <TaskExportButton
                        onExport={handleExportDaily}
                        scopeLabel="Daily"
                        dataTestId="daily-tasks-export-button"
                     />
                  </div>

                  <DayPillSwitcher
                     dayOptions={dayOptions}
                     selectedDateKey={selectedDateKey}
                     dayTaskCounts={dayTaskCounts}
                     draggedItem={draggedItem}
                     dragOverInfo={dragOverInfo}
                     hasChallengeContext={hasChallengeContext}
                     effectiveTodayDate={effectiveTodayDate}
                     checkIsDayLocked={checkIsDayLocked}
                     onSelectDay={handleSelectDay}
                     onDayPillDragOver={handleDayPillDragOver}
                     onDayPillDrop={handleDayPillDrop}
                     onDragLeave={(opt) => {
                        if (
                           dragOverInfo?.type === "day" &&
                           dragOverInfo.targetDateKey === opt.dateKey
                        ) {
                           setDragOverInfo(null);
                        }
                     }}
                  />

                  <div className="space-y-3">
                     {/* Rollover Helper Banners */}
                     <RolloverBanner
                        summary={rolloverSummary}
                        isActiveDayToday={isActiveDayToday}
                        isDismissed={isRolloverDismissed}
                        isSnoozed={isRolloverSnoozed}
                        userId={userId}
                        effectiveTodayDate={effectiveTodayDate}
                        onRolloverAll={() => handleRolloverIncompleteTasks()}
                        onRolloverDay={() =>
                           handleRolloverIncompleteTasks({
                              sourceDateKey: selectedDateKey,
                           })
                        }
                        onSnooze={handleSnoozeRolloverToday}
                     />

                     {totalDailyTasksForDay === 0 ? (
                        <div className="rounded-xl border border-dashed border-border-strong bg-surface-tertiary/50 p-6 text-center space-y-2">
                           <Calendar className="h-6 w-6 text-text-tertiary mx-auto mb-1" />
                           <p className="text-sm font-medium text-text-secondary">
                              No todos scheduled for{" "}
                              {activeDayOption.shortLabel} (
                              {formatDayDate(activeDayOption.dateKey)})
                           </p>
                           <p className="text-xs text-text-tertiary">
                              {isPastDayLocked
                                 ? "This challenge day has passed. New tasks cannot be added to past days."
                                 : isActiveDayToday
                                   ? "Organize your daily study commitments by adding your first task."
                                   : hasChallengeContext
                                     ? `Plan ahead for ${activeDayOption.shortLabel} of the challenge.`
                                     : `Plan or log your tasks for ${activeDayOption.shortLabel}.`}
                           </p>
                           {isPastDayLocked ? (
                              <div className="pt-2 flex items-center justify-center gap-1.5 text-xs text-text-tertiary">
                                 <Lock className="h-3.5 w-3.5 text-text-tertiary" />
                                 <span>
                                    Adding tasks to past days is locked
                                 </span>
                              </div>
                           ) : (
                              <div className="pt-2">
                                 <Button
                                    type="button"
                                    onClick={() =>
                                       openAddDailyModal(selectedDateKey)
                                    }
                                    className="h-8 px-4 rounded-full bg-surface-nested hover:bg-surface-nested text-white text-xs font-semibold border border-border-strong"
                                 >
                                    + Add todo for {activeDayOption.shortLabel}
                                 </Button>
                              </div>
                           )}

                           {!isLoggedIn && (
                              <div className="pt-3 border-t border-border-strong/50 mt-3 space-y-2">
                                 <p className="text-xs font-medium text-text-secondary">
                                    💡 Or load sample study commitments:
                                 </p>
                                 <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
                                    {SAMPLE_STUDY_TASKS.map((sample) => (
                                       <button
                                          key={sample}
                                          type="button"
                                          onClick={() =>
                                             handleAddSampleTask(sample)
                                          }
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-nested hover:bg-surface-elevated text-text-primary text-xs font-medium border border-border-default hover:border-brand-1/40 transition-colors"
                                       >
                                          <span className="text-brand-1-light font-bold">
                                             +
                                          </span>
                                          <span>{sample}</span>
                                       </button>
                                    ))}
                                 </div>
                              </div>
                           )}
                        </div>
                     ) : (
                        <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1 scrollbar-obsidian">
                           {dailyCategories.map((cat, catIdx) => {
                              const dayTasks = cat.tasks.filter(
                                 (task) =>
                                    getTaskDateKey(task) === selectedDateKey
                              );
                              if (dayTasks.length === 0 && cat.tasks.length > 0)
                                 return null;

                              const isCollapsed = isCategoryCollapsed(
                                 "daily",
                                 cat,
                                 collapsedCategoryIds
                              );

                              const isCatDragging =
                                 draggedItem?.type === "category" &&
                                 draggedItem.sourceColumn === "daily" &&
                                 draggedItem.sourceCatIdx === catIdx;
                              const isCatOver =
                                 dragOverInfo?.type === "category" &&
                                 dragOverInfo.targetColumn === "daily" &&
                                 dragOverInfo.targetCatIdx === catIdx;

                              return (
                                 <TaskCategoryCard
                                    key={cat.id || cat.name}
                                    category={cat}
                                    variant="daily"
                                    isCollapsed={isCollapsed}
                                    isDragging={isCatDragging}
                                    isOver={isCatOver}
                                    dropPosition={dragOverInfo?.position}
                                    onToggleCollapse={() =>
                                       toggleDailyCollapse(catIdx)
                                    }
                                    onDragStart={(e) =>
                                       handleCategoryDragStart(
                                          e,
                                          catIdx,
                                          "daily"
                                       )
                                    }
                                    onDragOver={(e) =>
                                       handleCategoryDragOver(
                                          e,
                                          catIdx,
                                          "daily"
                                       )
                                    }
                                    onDrop={(e) =>
                                       handleCategoryDrop(e, catIdx, "daily")
                                    }
                                    onDragEnd={handleDragEnd}
                                    menuContent={
                                       <CategoryMenuItems
                                          isChallengeActive={
                                             hasChallengeContext
                                          }
                                          cat={cat}
                                          catType="daily"
                                          dailyCategories={dailyCategories}
                                          weeklyCategories={weeklyCategories}
                                          selectedDateKey={selectedDateKey}
                                          effectiveTodayDate={
                                             effectiveTodayDate
                                          }
                                          dayOptions={dayOptions}
                                          onMoveCategoryToDay={(
                                             targetDateKey
                                          ) =>
                                             moveCategoryToDayAction(
                                                catIdx,
                                                targetDateKey,
                                                "daily"
                                             )
                                          }
                                          onRenameCategory={() => {
                                             setEditCategoryModal({
                                                id: cat.id,
                                                name: cat.name,
                                                taskType: "daily",
                                             });
                                             setEditCategoryInputName(cat.name);
                                          }}
                                          onDeleteCategory={() => {
                                             setDeleteCategoryModal({
                                                id: cat.id,
                                                name: cat.name,
                                                taskType: "daily",
                                             });
                                          }}
                                          Item={DropdownMenuItem}
                                          Separator={DropdownMenuSeparator}
                                          Label={DropdownMenuLabel}
                                       />
                                    }
                                    contextMenuContent={
                                       <CategoryMenuItems
                                          isChallengeActive={
                                             hasChallengeContext
                                          }
                                          cat={cat}
                                          catType="daily"
                                          dailyCategories={dailyCategories}
                                          weeklyCategories={weeklyCategories}
                                          selectedDateKey={selectedDateKey}
                                          effectiveTodayDate={
                                             effectiveTodayDate
                                          }
                                          dayOptions={dayOptions}
                                          onMoveCategoryToDay={(
                                             targetDateKey
                                          ) =>
                                             moveCategoryToDayAction(
                                                catIdx,
                                                targetDateKey,
                                                "daily"
                                             )
                                          }
                                          onRenameCategory={() => {
                                             setEditCategoryModal({
                                                id: cat.id,
                                                name: cat.name,
                                                taskType: "daily",
                                             });
                                             setEditCategoryInputName(cat.name);
                                          }}
                                          onDeleteCategory={() => {
                                             setDeleteCategoryModal({
                                                id: cat.id,
                                                name: cat.name,
                                                taskType: "daily",
                                             });
                                          }}
                                          Item={ContextMenuItem}
                                          Separator={ContextMenuSeparator}
                                          Label={ContextMenuLabel}
                                       />
                                    }
                                 >
                                    {dayTasks.length === 0 ? (
                                       <p className="text-xs text-text-tertiary py-1">
                                          No daily tasks in this category for{" "}
                                          {activeDayOption.shortLabel}.
                                       </p>
                                    ) : (
                                       dayTasks.map((task) => {
                                          const isTaskDragging =
                                             draggedItem?.type === "task" &&
                                             draggedItem.id === task.id;
                                          const isTaskOver =
                                             dragOverInfo?.type === "task" &&
                                             dragOverInfo.targetId === task.id;

                                          return (
                                             <TaskRow
                                                key={task.id}
                                                task={task}
                                                variant="daily"
                                                expanded={expandedTaskIds.has(
                                                   task.id
                                                )}
                                                isDragging={isTaskDragging}
                                                isOver={isTaskOver}
                                                dropPosition={
                                                   dragOverInfo?.position
                                                }
                                                onToggleExpand={(e) =>
                                                   toggleTaskExpand(task.id, e)
                                                }
                                                onToggleStatus={(e) =>
                                                   toggleDailyTask(
                                                      catIdx,
                                                      task.id,
                                                      e
                                                   )
                                                }
                                                onStatusAction={(status, e) =>
                                                   setTaskStatus(
                                                      catIdx,
                                                      task.id,
                                                      "daily",
                                                      status,
                                                      e
                                                   )
                                                }
                                                onDragStart={(e) =>
                                                   handleTaskDragStart(
                                                      e,
                                                      task.id,
                                                      catIdx,
                                                      "daily"
                                                   )
                                                }
                                                onDragOver={(e) =>
                                                   handleTaskDragOver(
                                                      e,
                                                      task.id,
                                                      catIdx,
                                                      "daily"
                                                   )
                                                }
                                                onDrop={(e) =>
                                                   handleTaskDrop(
                                                      e,
                                                      task.id,
                                                      catIdx,
                                                      "daily"
                                                   )
                                                }
                                                onDragEnd={handleDragEnd}
                                                onDelete={(e) => {
                                                   e.preventDefault();
                                                   e.stopPropagation();
                                                   handleDeleteTask(
                                                      catIdx,
                                                      task.id,
                                                      "daily"
                                                   );
                                                }}
                                                trailingAction={
                                                   rolloverSummary.isViewingPastDay &&
                                                   !task.completed &&
                                                   getTaskStatus(task) !==
                                                      "COMPLETED" &&
                                                   getTaskStatus(task) !==
                                                      "CROSSED_OUT" && (
                                                      <button
                                                         type="button"
                                                         onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleRolloverIncompleteTasks(
                                                               {
                                                                  sourceDateKey:
                                                                     selectedDateKey,
                                                                  taskId:
                                                                     task.id,
                                                               }
                                                            );
                                                         }}
                                                         className="opacity-0 group-hover:opacity-100 sm:opacity-0 max-sm:opacity-100 p-1 text-text-tertiary hover:text-emerald-400 rounded hover:bg-surface-elevated transition-all shrink-0 mt-0.5"
                                                         title="Roll over to Today"
                                                         aria-label={`Roll over ${task.text} to Today`}
                                                      >
                                                         <RotateCcw className="h-3.5 w-3.5" />
                                                      </button>
                                                   )
                                                }
                                                menuContent={
                                                   <TaskMenuItems
                                                      isChallengeActive={
                                                         hasChallengeContext
                                                      }
                                                      task={task}
                                                      catIdx={catIdx}
                                                      taskType="daily"
                                                      effectiveTodayDate={
                                                         effectiveTodayDate
                                                      }
                                                      dayOptions={dayOptions}
                                                      selectedDateKey={
                                                         selectedDateKey
                                                      }
                                                      linkableChallengeId={
                                                         linkableChallengeId
                                                      }
                                                      onToggleChallengeScope={(
                                                         newScope
                                                      ) =>
                                                         toggleTaskChallengeScope(
                                                            task.id,
                                                            newScope
                                                         )
                                                      }
                                                      onSetStatus={(status) =>
                                                         setTaskStatus(
                                                            catIdx,
                                                            task.id,
                                                            "daily",
                                                            status
                                                         )
                                                      }
                                                      onMoveToDay={(
                                                         targetDateKey
                                                      ) =>
                                                         moveTaskToDay(
                                                            task.id,
                                                            targetDateKey,
                                                            catIdx,
                                                            "daily"
                                                         )
                                                      }
                                                      onEditTask={() => {
                                                         setEditTaskModal({
                                                            id: task.id,
                                                            text: task.text,
                                                            completed:
                                                               task.completed,
                                                            status:
                                                               getTaskStatus(
                                                                  task
                                                               ),
                                                            dueDate:
                                                               task.dueDate ??
                                                               null,
                                                            createdAt:
                                                               task.createdAt,
                                                            challengeId:
                                                               task.challengeId ??
                                                               null,
                                                            catIdx,
                                                            taskType: "daily",
                                                         });
                                                         setEditTaskInputChallengeId(
                                                            task.challengeId ??
                                                               null
                                                         );
                                                         setEditTaskInputText(
                                                            task.text
                                                         );
                                                         setEditTaskInputStatus(
                                                            getTaskStatus(task)
                                                         );
                                                         setEditTaskInputDueDate(
                                                            task.dueDate ||
                                                               selectedDateKey
                                                         );
                                                      }}
                                                      onDeleteTask={() =>
                                                         handleDeleteTask(
                                                            catIdx,
                                                            task.id,
                                                            "daily"
                                                         )
                                                      }
                                                      Item={DropdownMenuItem}
                                                      Separator={
                                                         DropdownMenuSeparator
                                                      }
                                                      Label={DropdownMenuLabel}
                                                   />
                                                }
                                                contextMenuContent={
                                                   <TaskMenuItems
                                                      isChallengeActive={
                                                         hasChallengeContext
                                                      }
                                                      task={task}
                                                      catIdx={catIdx}
                                                      taskType="daily"
                                                      effectiveTodayDate={
                                                         effectiveTodayDate
                                                      }
                                                      dayOptions={dayOptions}
                                                      selectedDateKey={
                                                         selectedDateKey
                                                      }
                                                      linkableChallengeId={
                                                         linkableChallengeId
                                                      }
                                                      onToggleChallengeScope={(
                                                         newScope
                                                      ) =>
                                                         toggleTaskChallengeScope(
                                                            task.id,
                                                            newScope
                                                         )
                                                      }
                                                      onSetStatus={(status) =>
                                                         setTaskStatus(
                                                            catIdx,
                                                            task.id,
                                                            "daily",
                                                            status
                                                         )
                                                      }
                                                      onMoveToDay={(
                                                         targetDateKey
                                                      ) =>
                                                         moveTaskToDay(
                                                            task.id,
                                                            targetDateKey,
                                                            catIdx,
                                                            "daily"
                                                         )
                                                      }
                                                      onEditTask={() => {
                                                         setEditTaskModal({
                                                            id: task.id,
                                                            text: task.text,
                                                            completed:
                                                               task.completed,
                                                            status:
                                                               getTaskStatus(
                                                                  task
                                                               ),
                                                            dueDate:
                                                               task.dueDate ??
                                                               null,
                                                            createdAt:
                                                               task.createdAt,
                                                            challengeId:
                                                               task.challengeId ??
                                                               null,
                                                            catIdx,
                                                            taskType: "daily",
                                                         });
                                                         setEditTaskInputChallengeId(
                                                            task.challengeId ??
                                                               null
                                                         );
                                                         setEditTaskInputText(
                                                            task.text
                                                         );
                                                         setEditTaskInputStatus(
                                                            getTaskStatus(task)
                                                         );
                                                         setEditTaskInputDueDate(
                                                            task.dueDate ||
                                                               selectedDateKey
                                                         );
                                                      }}
                                                      onDeleteTask={() =>
                                                         handleDeleteTask(
                                                            catIdx,
                                                            task.id,
                                                            "daily"
                                                         )
                                                      }
                                                      Item={ContextMenuItem}
                                                      Separator={
                                                         ContextMenuSeparator
                                                      }
                                                      Label={ContextMenuLabel}
                                                   />
                                                }
                                             />
                                          );
                                       })
                                    )}
                                 </TaskCategoryCard>
                              );
                           })}
                        </div>
                     )}
                  </div>
               </div>

               <div className="pt-2 text-center">
                  {isPastDayLocked ? (
                     <Button
                        type="button"
                        disabled
                        className="h-10 px-6 rounded-full bg-surface-elevated text-text-tertiary text-xs font-semibold border border-border-default cursor-not-allowed inline-flex items-center gap-1.5 shadow-none"
                        title="Adding tasks to past challenge days is locked"
                     >
                        <Lock className="h-3.5 w-3.5 text-text-tertiary" />
                        <span>Past day locked (new tasks blocked)</span>
                     </Button>
                  ) : (
                     <Button
                        type="button"
                        onClick={() => openAddDailyModal(selectedDateKey)}
                        className="h-10 px-6 rounded-full bg-white text-black text-xs font-bold hover:bg-white/90 shadow-sm inline-flex items-center gap-1.5"
                     >
                        {totalDailyTasksForDay === 0
                           ? `+ Add first todo for ${activeDayOption.shortLabel}`
                           : `+ Add more todos for ${activeDayOption.shortLabel}`}
                     </Button>
                  )}
               </div>
            </div>

            {/* Weekly Todos */}
            <div
               data-testid="weekly-tasks-board"
               onDragOver={(e) => handleColumnDragOver(e, "weekly")}
               onDrop={(e) => handleColumnDrop(e, "weekly")}
               className={`rounded-2xl border bg-surface-primary p-5 sm:p-6 shadow-md flex-col justify-between space-y-5 transition-all ${mobileActiveTab === "weekly" ? "flex" : "hidden sm:flex"} ${
                  dragOverInfo?.type === "column" &&
                  dragOverInfo.targetColumn === "weekly"
                     ? "border-brand-2 ring-1 ring-brand-2/50 bg-surface-secondary"
                     : "border-border-default"
               }`}
            >
               <div className="space-y-3">
                  <BoardHeader
                     title="Weekly Todos"
                     completed={completedWeeklyTasksForWeek}
                     total={totalWeeklyTasksForWeek}
                     extraBadge={
                        Boolean(
                           linkableChallengeId &&
                           weeklyScopedCounts.totalChallengeGoals > 0
                        ) && (
                           <span
                              data-testid="weekly-challenge-goals-badge"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-meta font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0"
                              title="Challenge-scoped goals evaluated for Law L6 lock"
                           >
                              <Trophy className="h-3 w-3" />
                              <span>
                                 {weeklyScopedCounts.completedChallengeGoals}/
                                 {weeklyScopedCounts.totalChallengeGoals} Goals
                              </span>
                           </span>
                        )
                     }
                  />

                  {/* Row 2: Calendar Week Navigator & Export for Weekly Todos */}
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                     <CockpitWeekNavigator
                        selectedDateKey={activeWeeklyAnchorDateKey}
                        todayDateKey={effectiveTodayDate}
                        weekRangeLabel={weeklyRangeLabel}
                        onPreviousWeek={handleWeeklyPreviousWeek}
                        onNextWeek={handleWeeklyNextWeek}
                        onSelectDate={handleSelectWeeklyDateFromPicker}
                        activeWeekDateKeys={activeWeeklyWeekDateKeys}
                        mode="weekly"
                        showToday={!isViewingCurrentWeeklyWeek}
                        onJumpToToday={handleWeeklyJumpToCurrentWeek}
                     />
                     <TaskExportButton
                        onExport={handleExportWeekly}
                        scopeLabel="Weekly"
                        dataTestId="weekly-tasks-export-button"
                     />
                  </div>

                  <div className="space-y-3">
                     {visibleWeeklyTasksCount === 0 &&
                     weeklyCategories.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border-strong bg-surface-tertiary/50 p-6 text-center">
                           <p className="text-sm font-medium text-text-secondary">
                              No weekly todos yet
                           </p>
                           <p className="text-xs text-text-tertiary mt-1">
                              Set your weekly milestones and track them across
                              the challenge.
                           </p>
                        </div>
                     ) : visibleWeeklyTasksCount === 0 ? (
                        <div className="rounded-xl border border-dashed border-border-strong bg-surface-tertiary/50 p-6 text-center">
                           <p className="text-sm font-medium text-text-secondary">
                              No weekly todos for this week
                           </p>
                           <p className="text-xs text-text-tertiary mt-1">
                              Set your weekly milestones and track them across
                              the challenge.
                           </p>
                        </div>
                     ) : (
                        <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1 scrollbar-obsidian">
                           {visibleWeeklyCategories.map((cat, catIdx) => {
                              const weekTasks =
                                 cat.tasks.filter(isTaskInWeeklyWeek);
                              if (weekTasks.length === 0) {
                                 return null;
                              }
                              const isCollapsed = isCategoryCollapsed(
                                 "weekly",
                                 cat,
                                 collapsedCategoryIds
                              );
                              const isCatDragging =
                                 draggedItem?.type === "category" &&
                                 draggedItem.sourceColumn === "weekly" &&
                                 draggedItem.sourceCatIdx === catIdx;
                              const isCatOver =
                                 dragOverInfo?.type === "category" &&
                                 dragOverInfo.targetColumn === "weekly" &&
                                 dragOverInfo.targetCatIdx === catIdx;

                              return (
                                 <TaskCategoryCard
                                    key={cat.id || cat.name}
                                    category={cat}
                                    variant="weekly"
                                    isCollapsed={isCollapsed}
                                    isDragging={isCatDragging}
                                    isOver={isCatOver}
                                    dropPosition={dragOverInfo?.position}
                                    onToggleCollapse={() =>
                                       toggleWeeklyCollapse(catIdx)
                                    }
                                    onDragStart={(e) =>
                                       handleCategoryDragStart(
                                          e,
                                          catIdx,
                                          "weekly"
                                       )
                                    }
                                    onDragOver={(e) =>
                                       handleCategoryDragOver(
                                          e,
                                          catIdx,
                                          "weekly"
                                       )
                                    }
                                    onDrop={(e) =>
                                       handleCategoryDrop(e, catIdx, "weekly")
                                    }
                                    onDragEnd={handleDragEnd}
                                    menuContent={
                                       <CategoryMenuItems
                                          isChallengeActive={
                                             hasChallengeContext
                                          }
                                          cat={cat}
                                          catType="weekly"
                                          dailyCategories={dailyCategories}
                                          weeklyCategories={weeklyCategories}
                                          selectedDateKey={selectedDateKey}
                                          effectiveTodayDate={
                                             effectiveTodayDate
                                          }
                                          dayOptions={dayOptions}
                                          onMoveCategoryToDay={(
                                             targetDateKey
                                          ) =>
                                             moveCategoryToDayAction(
                                                catIdx,
                                                targetDateKey,
                                                "weekly"
                                             )
                                          }
                                          onRenameCategory={() => {
                                             setEditCategoryModal({
                                                id: cat.id,
                                                name: cat.name,
                                                taskType: "weekly",
                                             });
                                             setEditCategoryInputName(cat.name);
                                          }}
                                          onDeleteCategory={() => {
                                             setDeleteCategoryModal({
                                                id: cat.id,
                                                name: cat.name,
                                                taskType: "weekly",
                                             });
                                          }}
                                          Item={DropdownMenuItem}
                                          Separator={DropdownMenuSeparator}
                                          Label={DropdownMenuLabel}
                                       />
                                    }
                                    contextMenuContent={
                                       <CategoryMenuItems
                                          isChallengeActive={
                                             hasChallengeContext
                                          }
                                          cat={cat}
                                          catType="weekly"
                                          dailyCategories={dailyCategories}
                                          weeklyCategories={weeklyCategories}
                                          selectedDateKey={selectedDateKey}
                                          effectiveTodayDate={
                                             effectiveTodayDate
                                          }
                                          dayOptions={dayOptions}
                                          onMoveCategoryToDay={(
                                             targetDateKey
                                          ) =>
                                             moveCategoryToDayAction(
                                                catIdx,
                                                targetDateKey,
                                                "weekly"
                                             )
                                          }
                                          onRenameCategory={() => {
                                             setEditCategoryModal({
                                                id: cat.id,
                                                name: cat.name,
                                                taskType: "weekly",
                                             });
                                             setEditCategoryInputName(cat.name);
                                          }}
                                          onDeleteCategory={() => {
                                             setDeleteCategoryModal({
                                                id: cat.id,
                                                name: cat.name,
                                                taskType: "weekly",
                                             });
                                          }}
                                          Item={ContextMenuItem}
                                          Separator={ContextMenuSeparator}
                                          Label={ContextMenuLabel}
                                       />
                                    }
                                 >
                                    {weekTasks.length === 0 ? (
                                       <p className="text-xs text-text-tertiary py-1">
                                          No weekly tasks in this category.
                                       </p>
                                    ) : (
                                       weekTasks.map((task) => {
                                          const isTaskDragging =
                                             draggedItem?.type === "task" &&
                                             draggedItem.id === task.id;
                                          const isTaskOver =
                                             dragOverInfo?.type === "task" &&
                                             dragOverInfo.targetId === task.id;

                                          return (
                                             <TaskRow
                                                key={task.id}
                                                task={task}
                                                variant="weekly"
                                                expanded={expandedTaskIds.has(
                                                   task.id
                                                )}
                                                isDragging={isTaskDragging}
                                                isOver={isTaskOver}
                                                dropPosition={
                                                   dragOverInfo?.position
                                                }
                                                onToggleExpand={(e) =>
                                                   toggleTaskExpand(task.id, e)
                                                }
                                                onToggleStatus={(e) =>
                                                   toggleWeeklyTask(
                                                      catIdx,
                                                      task.id,
                                                      e
                                                   )
                                                }
                                                onStatusAction={(status, e) =>
                                                   setTaskStatus(
                                                      catIdx,
                                                      task.id,
                                                      "weekly",
                                                      status,
                                                      e
                                                   )
                                                }
                                                onDragStart={(e) =>
                                                   handleTaskDragStart(
                                                      e,
                                                      task.id,
                                                      catIdx,
                                                      "weekly"
                                                   )
                                                }
                                                onDragOver={(e) =>
                                                   handleTaskDragOver(
                                                      e,
                                                      task.id,
                                                      catIdx,
                                                      "weekly"
                                                   )
                                                }
                                                onDrop={(e) =>
                                                   handleTaskDrop(
                                                      e,
                                                      task.id,
                                                      catIdx,
                                                      "weekly"
                                                   )
                                                }
                                                onDragEnd={handleDragEnd}
                                                onDelete={(e) => {
                                                   e.preventDefault();
                                                   e.stopPropagation();
                                                   handleDeleteTask(
                                                      catIdx,
                                                      task.id,
                                                      "weekly"
                                                   );
                                                }}
                                                trailingAction={
                                                   Boolean(
                                                      linkableChallengeId
                                                   ) &&
                                                   (task.challengeId ===
                                                   linkableChallengeId ? (
                                                      <span
                                                         data-testid="task-scope-challenge-badge"
                                                         className="shrink-0 inline-flex items-center justify-center p-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mt-0.5"
                                                         title="Challenge Goal (evaluated at challenge lock)"
                                                         aria-label="Challenge Goal"
                                                      >
                                                         <Trophy className="h-3 w-3" />
                                                      </span>
                                                   ) : !task.challengeId ? (
                                                      <span
                                                         data-testid="task-scope-personal-badge"
                                                         className="shrink-0 inline-flex items-center justify-center p-1 rounded bg-surface-nested text-text-tertiary border border-border-subtle mt-0.5"
                                                         title="Personal Task (excluded from challenge lock)"
                                                         aria-label="Personal Task"
                                                      >
                                                         <User className="h-3 w-3" />
                                                      </span>
                                                   ) : null)
                                                }
                                                menuContent={
                                                   <TaskMenuItems
                                                      isChallengeActive={
                                                         hasChallengeContext
                                                      }
                                                      task={task}
                                                      catIdx={catIdx}
                                                      taskType="weekly"
                                                      effectiveTodayDate={
                                                         effectiveTodayDate
                                                      }
                                                      dayOptions={dayOptions}
                                                      selectedDateKey={
                                                         selectedDateKey
                                                      }
                                                      linkableChallengeId={
                                                         linkableChallengeId
                                                      }
                                                      onToggleChallengeScope={(
                                                         newScope
                                                      ) =>
                                                         toggleTaskChallengeScope(
                                                            task.id,
                                                            newScope
                                                         )
                                                      }
                                                      onSetStatus={(status) =>
                                                         setTaskStatus(
                                                            catIdx,
                                                            task.id,
                                                            "weekly",
                                                            status
                                                         )
                                                      }
                                                      onMoveToDay={(
                                                         targetDateKey
                                                      ) =>
                                                         moveTaskToDay(
                                                            task.id,
                                                            targetDateKey,
                                                            catIdx,
                                                            "weekly"
                                                         )
                                                      }
                                                      onEditTask={() => {
                                                         setEditTaskModal({
                                                            id: task.id,
                                                            text: task.text,
                                                            completed:
                                                               task.completed,
                                                            status:
                                                               getTaskStatus(
                                                                  task
                                                               ),
                                                            dueDate:
                                                               task.dueDate ??
                                                               null,
                                                            createdAt:
                                                               task.createdAt,
                                                            challengeId:
                                                               task.challengeId ??
                                                               null,
                                                            catIdx,
                                                            taskType: "weekly",
                                                         });
                                                         setEditTaskInputChallengeId(
                                                            task.challengeId ??
                                                               null
                                                         );
                                                         setEditTaskInputText(
                                                            task.text
                                                         );
                                                         setEditTaskInputStatus(
                                                            getTaskStatus(task)
                                                         );
                                                         setEditTaskInputDueDate(
                                                            task.dueDate ?? ""
                                                         );
                                                      }}
                                                      onDeleteTask={() =>
                                                         handleDeleteTask(
                                                            catIdx,
                                                            task.id,
                                                            "weekly"
                                                         )
                                                      }
                                                      Item={DropdownMenuItem}
                                                      Separator={
                                                         DropdownMenuSeparator
                                                      }
                                                      Label={DropdownMenuLabel}
                                                   />
                                                }
                                                contextMenuContent={
                                                   <TaskMenuItems
                                                      isChallengeActive={
                                                         hasChallengeContext
                                                      }
                                                      task={task}
                                                      catIdx={catIdx}
                                                      taskType="weekly"
                                                      effectiveTodayDate={
                                                         effectiveTodayDate
                                                      }
                                                      dayOptions={dayOptions}
                                                      selectedDateKey={
                                                         selectedDateKey
                                                      }
                                                      linkableChallengeId={
                                                         linkableChallengeId
                                                      }
                                                      onToggleChallengeScope={(
                                                         newScope
                                                      ) =>
                                                         toggleTaskChallengeScope(
                                                            task.id,
                                                            newScope
                                                         )
                                                      }
                                                      onSetStatus={(status) =>
                                                         setTaskStatus(
                                                            catIdx,
                                                            task.id,
                                                            "weekly",
                                                            status
                                                         )
                                                      }
                                                      onMoveToDay={(
                                                         targetDateKey
                                                      ) =>
                                                         moveTaskToDay(
                                                            task.id,
                                                            targetDateKey,
                                                            catIdx,
                                                            "weekly"
                                                         )
                                                      }
                                                      onEditTask={() => {
                                                         setEditTaskModal({
                                                            id: task.id,
                                                            text: task.text,
                                                            completed:
                                                               task.completed,
                                                            status:
                                                               getTaskStatus(
                                                                  task
                                                               ),
                                                            dueDate:
                                                               task.dueDate ??
                                                               null,
                                                            createdAt:
                                                               task.createdAt,
                                                            challengeId:
                                                               task.challengeId ??
                                                               null,
                                                            catIdx,
                                                            taskType: "weekly",
                                                         });
                                                         setEditTaskInputChallengeId(
                                                            task.challengeId ??
                                                               null
                                                         );
                                                         setEditTaskInputText(
                                                            task.text
                                                         );
                                                         setEditTaskInputStatus(
                                                            getTaskStatus(task)
                                                         );
                                                         setEditTaskInputDueDate(
                                                            task.dueDate ?? ""
                                                         );
                                                      }}
                                                      onDeleteTask={() =>
                                                         handleDeleteTask(
                                                            catIdx,
                                                            task.id,
                                                            "weekly"
                                                         )
                                                      }
                                                      Item={ContextMenuItem}
                                                      Separator={
                                                         ContextMenuSeparator
                                                      }
                                                      Label={ContextMenuLabel}
                                                   />
                                                }
                                             />
                                          );
                                       })
                                    )}
                                 </TaskCategoryCard>
                              );
                           })}
                        </div>
                     )}
                  </div>
               </div>

               <div className="pt-2 text-center">
                  <Button
                     type="button"
                     onClick={openAddWeeklyModal}
                     className="h-10 px-6 rounded-full bg-white text-black text-xs font-bold hover:bg-white/90 shadow-sm inline-flex items-center gap-1.5"
                  >
                     {weeklyCategories.length === 0
                        ? "+ Add first todo"
                        : "+ Add more todos"}
                  </Button>
               </div>
            </div>
         </div>

         <AddTaskDialog
            open={Boolean(addModalType)}
            modalType={addModalType}
            text={newTodoText}
            selectedCategory={selectedCategory}
            customCategory={customCategory}
            isCreatingCategory={isCreatingCategory}
            status={newTodoStatus}
            dateKey={addTodoDateKey}
            challengeScope={addTodoChallengeScope}
            weeklyCategoryOptions={weeklyCategoryOptions}
            independentDailyCategoryOptions={independentDailyCategoryOptions}
            dailyCategoryOptions={dailyCategoryOptions}
            dayOptions={dayOptions}
            selectedDateKey={selectedDateKey}
            effectiveTodayDate={effectiveTodayDate}
            linkableChallengeId={linkableChallengeId}
            hasChallengeContext={hasChallengeContext}
            categoryInputRef={categoryInputRef}
            categorySelectRef={categorySelectRef}
            onTextChange={setNewTodoText}
            onSelectedCategoryChange={setSelectedCategory}
            onCustomCategoryChange={setCustomCategory}
            onCreatingCategoryChange={setIsCreatingCategory}
            onStatusChange={setNewTodoStatus}
            onDateKeyChange={setAddTodoDateKey}
            onChallengeScopeChange={setAddTodoChallengeScope}
            onSubmit={handleAddTodoSubmit}
            onClose={() => closeAddModal()}
         />

         <EditTaskDialog
            open={Boolean(editTaskModal)}
            task={editTaskModal}
            text={editTaskInputText}
            status={editTaskInputStatus}
            dueDate={editTaskInputDueDate}
            challengeId={editTaskInputChallengeId}
            isGraceLocked={isEditTaskGraceLocked}
            hasChallengeContext={hasChallengeContext}
            effectiveTodayDate={effectiveTodayDate}
            linkableChallengeId={linkableChallengeId}
            dayOptions={dayOptions}
            onTextChange={setEditTaskInputText}
            onStatusChange={setEditTaskInputStatus}
            onDueDateChange={setEditTaskInputDueDate}
            onChallengeIdChange={setEditTaskInputChallengeId}
            onSave={() =>
               handleSaveEditTask(
                  editTaskInputText,
                  editTaskInputStatus,
                  editTaskInputDueDate
               )
            }
            onClose={() => closeEditTaskModal()}
         />

         <RenameCategoryDialog
            open={Boolean(editCategoryModal)}
            name={editCategoryInputName}
            onNameChange={setEditCategoryInputName}
            onSave={() => handleSaveEditCategory(editCategoryInputName)}
            onClose={() => setEditCategoryModal(null)}
         />

         <DeleteCategoryDialog
            open={Boolean(deleteCategoryModal)}
            categoryName={deleteCategoryModal?.name}
            onConfirm={handleConfirmDeleteCategory}
            onClose={() => setDeleteCategoryModal(null)}
         />
      </>
   );
}
