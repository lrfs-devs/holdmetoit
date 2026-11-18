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
import { useCategoryMutations } from "./use-category-mutations";
import { useTaskBoardHydration } from "./use-task-board-hydration";
import { useTaskDragAndDrop } from "./use-task-drag-and-drop";
import { useTaskModals } from "./use-task-modals";
import { useTaskBoardState } from "./use-task-board-state";
import { useTaskMoves } from "./use-task-moves";
import { useTaskMutations } from "./use-task-mutations";
import { useWeekNavigation } from "./use-week-navigation";
import { RenameCategoryDialog } from "../dialogs/rename-category-dialog";
import { DeleteCategoryDialog } from "../dialogs/delete-category-dialog";
import { EditTaskDialog } from "../dialogs/edit-task-dialog";
import { AddTaskDialog } from "../dialogs/add-task-dialog";
import { MobileBoardSwitcher } from "../components/mobile-board-switcher";
import { TaskRow } from "../components/task-row";
import { TaskCategoryCard } from "../components/task-category-card";
import { RolloverBanner } from "../components/rollover-banner";
import { BoardHeader } from "../components/board-header";
import { DayPillSwitcher } from "../components/day-pill-switcher";
import { TaskBoard, type TaskBoardModel } from "../components/task-board";
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
} from "../task-board.types";
import {
   buildBoardTaskRecord,
   getTaskStatus,
   LOAD_SAMPLE_TASK_EVENT,
   SAMPLE_STUDY_TASKS,
} from "../task-board.utils";
import { useTaskBoardPersistence } from "./use-task-board-persistence";
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
} from "../task-board.selectors";

export interface UseTaskBoardModelResult {
   board: TaskBoardModel;
   modals: ReturnType<typeof useTaskModals>;
   handleAddTodoSubmit: (e: React.FormEvent) => void;
   handleAddSampleTask: (title: string) => void;
   handleSaveEditTask: (
      newText: string,
      newStatus: TaskStatus,
      newDueDate?: string | null
   ) => void;
   handleSaveEditCategory: (newName: string) => void;
   handleConfirmDeleteCategory: () => void;
   editCategoryModal: EditCategoryModalState | null;
   setEditCategoryModal: (modal: EditCategoryModalState | null) => void;
   editCategoryInputName: string;
   setEditCategoryInputName: (name: string) => void;
   deleteCategoryModal: DeleteCategoryModalState | null;
   setDeleteCategoryModal: (modal: DeleteCategoryModalState | null) => void;
   weeklyCategoryOptions: string[];
   independentDailyCategoryOptions: string[];
   dailyCategoryOptions: string[];
   dayOptions: ChallengeDayOption[];
   selectedDateKey: string;
   effectiveTodayDate: string;
   linkableChallengeId: string | null;
   hasChallengeContext: boolean;
}

/** Builds the full task-board view model: hooks, derived values and handlers. */
export function useTaskBoardModel({
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
}: CockpitTasksSectionProps): UseTaskBoardModelResult {
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
      dailyCategoriesRef,
      weeklyCategoriesRef,
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
      activeWeeklyAnchorDateKey,
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
      dailyCategoriesRef,
      weeklyCategoriesRef,
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
      // A weekly task may reuse an existing weekly category by name. A daily
      // task never does: categories are single-column, so the same name must
      // resolve to a DAILY category (created when absent).
      const matchingWeekly =
         addModalType === "weekly" && trimmedCustom
            ? weeklyCategories.find(
                 (c) => c.name.toLowerCase() === trimmedCustom.toLowerCase()
              ) ||
              userTasks?.categories?.find(
                 (c) =>
                    c.taskType === "WEEKLY" &&
                    c.name.toLowerCase() === trimmedCustom.toLowerCase()
              )
            : undefined;

      const matchingDaily =
         addModalType === "daily" && trimmedCustom
            ? dailyCategories.find(
                 (c) => c.name.toLowerCase() === trimmedCustom.toLowerCase()
              ) ||
              userTasks?.categories?.find(
                 (c) =>
                    c.taskType === "DAILY" &&
                    c.name.toLowerCase() === trimmedCustom.toLowerCase()
              )
            : undefined;

      const isNew = Boolean(
         isCreatingCategory &&
         trimmedCustom &&
         !matchingWeekly &&
         !matchingDaily
      );
      const targetCategoryName =
         (isCreatingCategory && trimmedCustom
            ? matchingWeekly?.name || matchingDaily?.name || trimmedCustom
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
         const existingInServer = userTasks?.categories?.find(
            (c) => c.taskType === "DAILY" && c.name === targetCategoryName
         );

         targetCatId =
            existingInDaily?.id ||
            existingInServer?.id ||
            (isNew
               ? crypto.randomUUID()
               : dailyCategoryNameToId.get(targetCategoryName) ||
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
         const sortOrder = existingCat?.tasks.length ?? 0;

         const localCategories: LocalCategoryRecord[] = existingCat
            ? []
            : [
                 {
                    id: targetCatId,
                    userId: userId ?? null,
                    name: targetCategoryName,
                    taskType: "DAILY",
                    sortOrder: 0,
                    createdAt: nowIso,
                    updatedAt: nowIso,
                    syncState: "pending",
                 },
              ];

         const localTasks: LocalTaskRecord[] = [
            buildBoardTaskRecord({
               task: newTask,
               userId: userId ?? null,
               categoryId: targetCatId,
               taskType: "DAILY",
               sortOrder,
               dueDate: targetDateKey,
               title: trimmed,
               challengeId: null,
               nowIso,
            }),
         ];

         const mutations: Array<Omit<QueuedMutation, "userId">> = [];
         if (!existingCat) {
            mutations.push({
               id: crypto.randomUUID(),
               entityType: "CATEGORY",
               action: "CREATE",
               payload: {
                  id: targetCatId,
                  name: targetCategoryName,
                  taskType: "DAILY",
                  sortOrder: 0,
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
               title: trimmed,
               taskType: "DAILY",
               sortOrder,
               isComplete: false,
               status: "TODO",
               dueDate: targetDateKey,
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
      },
      [selectedDateKey, effectiveTodayDate, dailyCategories, userId, isLoggedIn]
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

   const openEditTask = useCallback(
      (task: BoardTask, catIdx: number, variant: "daily" | "weekly") => {
         setEditTaskModal({
            id: task.id,
            text: task.text,
            completed: task.completed,
            status: getTaskStatus(task),
            dueDate: task.dueDate ?? null,
            createdAt: task.createdAt,
            challengeId: task.challengeId ?? null,
            catIdx,
            taskType: variant,
         });
         setEditTaskInputChallengeId(task.challengeId ?? null);
         setEditTaskInputText(task.text);
         setEditTaskInputStatus(getTaskStatus(task));
         setEditTaskInputDueDate(
            variant === "daily"
               ? task.dueDate || selectedDateKey
               : (task.dueDate ?? "")
         );
      },
      [
         selectedDateKey,
         setEditTaskInputChallengeId,
         setEditTaskInputDueDate,
         setEditTaskInputStatus,
         setEditTaskInputText,
         setEditTaskModal,
      ]
   );

   const board: TaskBoardModel = {
      isLoggedIn,
      userId,
      hasChallengeContext,
      linkableChallengeId,
      mobileActiveTab,
      setMobileActiveTab,
      dailyCategories,
      weeklyCategories,
      visibleWeeklyCategories,
      visibleWeeklyTasksCount,
      dayOptions,
      activeDayOption,
      selectedDateKey,
      effectiveTodayDate,
      isActiveDayToday,
      isPastDayLocked,
      checkIsDayLocked,
      dayTaskCounts,
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
      isTaskInWeeklyWeek,
      handleWeeklyPreviousWeek,
      handleWeeklyNextWeek,
      handleWeeklyJumpToCurrentWeek,
      handleSelectWeeklyDateFromPicker,
      completedDailyTasksForDay,
      totalDailyTasksForDay,
      completedWeeklyTasks,
      totalWeeklyTasks,
      completedWeeklyTasksForWeek,
      totalWeeklyTasksForWeek,
      rolloverSummary,
      isRolloverDismissed,
      isRolloverSnoozed,
      handleRolloverIncompleteTasks,
      handleSnoozeRolloverToday,
      expandedTaskIds,
      collapsedCategoryIds,
      draggedItem,
      dragOverInfo,
      setDragOverInfo,
      getTaskDateKey,
      toggleTaskExpand,
      toggleDailyCollapse,
      toggleWeeklyCollapse,
      toggleDailyTask,
      toggleWeeklyTask,
      setTaskStatus,
      handleDeleteTask,
      toggleTaskChallengeScope,
      moveTaskToDay,
      moveCategoryToDayAction,
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
      handleExportDaily,
      handleExportWeekly,
      handleAddSampleTask,
      openAddDailyModal,
      openAddWeeklyModal,
      setEditTaskModal,
      setEditTaskInputText,
      setEditTaskInputStatus,
      setEditTaskInputDueDate,
      setEditTaskInputChallengeId,
      setEditCategoryModal,
      setEditCategoryInputName,
      setDeleteCategoryModal,
      weeklyScopedCounts,
      openEditTask,
   };

   return {
      board,
      modals: taskModals,
      handleAddTodoSubmit,
      handleAddSampleTask,
      handleSaveEditTask,
      handleSaveEditCategory,
      handleConfirmDeleteCategory,
      editCategoryModal,
      setEditCategoryModal,
      editCategoryInputName,
      setEditCategoryInputName,
      deleteCategoryModal,
      setDeleteCategoryModal,
      weeklyCategoryOptions,
      independentDailyCategoryOptions,
      dailyCategoryOptions,
      dayOptions,
      selectedDateKey,
      effectiveTodayDate,
      linkableChallengeId,
      hasChallengeContext,
   };
}
