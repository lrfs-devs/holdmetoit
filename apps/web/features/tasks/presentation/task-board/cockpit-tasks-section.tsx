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
import { useTaskBoardState } from "./hooks/use-task-board-state";
import { useTaskMoves } from "./hooks/use-task-moves";
import { useTaskMutations } from "./hooks/use-task-mutations";
import { useWeekNavigation } from "./hooks/use-week-navigation";
import { RenameCategoryDialog } from "./dialogs/rename-category-dialog";
import { DeleteCategoryDialog } from "./dialogs/delete-category-dialog";
import { EditTaskDialog } from "./dialogs/edit-task-dialog";
import { AddTaskDialog } from "./dialogs/add-task-dialog";
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
   const [addModalType, setAddModalType] = useState<"daily" | "weekly" | null>(
      null
   );
   const [newTodoText, setNewTodoText] = useState("");
   const [selectedCategory, setSelectedCategory] = useState("");
   const [customCategory, setCustomCategory] = useState("");
   const [isCreatingCategory, setIsCreatingCategory] = useState(false);
   const [newTodoStatus, setNewTodoStatus] = useState<TaskStatus>("TODO");
   const [addTodoDateKey, setAddTodoDateKey] = useState<string>("");
   const categoryInputRef = useRef<HTMLInputElement>(null);
   const categorySelectRef = useRef<HTMLButtonElement>(null);

   useEffect(() => {
      if (isCreatingCategory && addModalType) {
         const timer = setTimeout(() => {
            categoryInputRef.current?.focus();
            categoryInputRef.current?.select();
         }, 50);
         return () => clearTimeout(timer);
      }
   }, [isCreatingCategory, addModalType]);

   // Edit Task Modal State
   const [editTaskModal, setEditTaskModal] =
      useState<EditTaskModalState | null>(null);
   const [editTaskInputText, setEditTaskInputText] = useState("");
   const [editTaskInputStatus, setEditTaskInputStatus] =
      useState<TaskStatus>("TODO");
   const [editTaskInputDueDate, setEditTaskInputDueDate] = useState<string>("");
   const [editTaskInputChallengeId, setEditTaskInputChallengeId] = useState<
      string | null
   >(null);
   const isEditTaskGraceLocked = Boolean(
      editTaskModal &&
      isWeeklyTaskGraceExpired({
         taskType: editTaskModal.taskType === "weekly" ? "WEEKLY" : "DAILY",
         challengeId: editTaskModal.challengeId,
         createdAt: editTaskModal.createdAt ?? new Date(),
      })
   );
   const [addTodoChallengeScope, setAddTodoChallengeScope] =
      useState<TaskScope>("CHALLENGE");

   // Edit Category Modal State
   const [editCategoryModal, setEditCategoryModal] =
      useState<EditCategoryModalState | null>(null);
   const [editCategoryInputName, setEditCategoryInputName] = useState("");

   // Delete Category Confirmation Modal State
   const [deleteCategoryModal, setDeleteCategoryModal] =
      useState<DeleteCategoryModalState | null>(null);

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
   const openAddDailyModal = (targetDateKey?: string) => {
      const rawDateKey = targetDateKey || selectedDateKey;
      const isTargetLocked = checkIsDayLocked(rawDateKey);

      // If target day is in a locked past challenge day, clamp to today or the first available non-past day
      const initialDateKey = isTargetLocked
         ? todayDayOption?.dateKey ||
           dayOptions.find((d) => !checkIsDayLocked(d.dateKey))?.dateKey ||
           effectiveTodayDate
         : rawDateKey;

      setAddTodoDateKey(initialDateKey);
      setNewTodoText("");
      if (dailyCategoryOptions.length > 0) {
         setSelectedCategory(dailyCategoryOptions[0]);
         setIsCreatingCategory(false);
      } else {
         setSelectedCategory("");
         setIsCreatingCategory(true);
      }
      setCustomCategory("");
      setNewTodoStatus("TODO");
      setAddModalType("daily");
   };

   const weeklyCategoryOptions = selectWeeklyCategoryOptions(
      userTasks?.categories,
      weeklyCategories
   );

   const openAddWeeklyModal = () => {
      setAddTodoChallengeScope(linkableChallengeId ? "CHALLENGE" : "PERSONAL");
      setNewTodoText("");
      setNewTodoStatus("TODO");
      setCustomCategory("");
      if (weeklyCategoryOptions.length > 0) {
         setSelectedCategory(weeklyCategoryOptions[0]);
         setIsCreatingCategory(false);
      } else {
         setSelectedCategory("");
         setIsCreatingCategory(true);
      }
      setAddModalType("weekly");
   };

   // Independent categories created specifically for daily tasks (unplanned/independent)
   const independentDailyCategoryOptions =
      selectIndependentDailyCategoryOptions(
         userTasks?.categories,
         dailyCategories,
         weeklyCategoryOptions
      );

   // Daily inherits all weekly categories (parent categories) + independent daily categories
   const dailyCategoryOptions = selectDailyCategoryOptions(
      weeklyCategoryOptions,
      independentDailyCategoryOptions
   );

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
      setAddModalType(null);
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
         {/* Mobile Segmented Switcher (< sm: 360px–639px) */}
         <div
            role="tablist"
            aria-label="Tasks board view switcher"
            className="flex sm:hidden items-center justify-between p-1 rounded-2xl bg-surface-primary border border-border-default mb-4"
         >
            <button
               type="button"
               role="tab"
               aria-selected={mobileActiveTab === "daily"}
               onClick={() => setMobileActiveTab("daily")}
               className={`flex-1 min-h-control-sm py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  mobileActiveTab === "daily"
                     ? "bg-white text-black shadow-sm"
                     : "text-text-tertiary hover:text-white"
               }`}
            >
               <span>Daily</span>
               <span
                  className={`px-1.5 py-0.5 rounded-full text-micro font-semibold tabular-nums ${
                     mobileActiveTab === "daily"
                        ? "bg-black/10 text-black"
                        : "bg-surface-nested text-text-tertiary"
                  }`}
               >
                  {completedDailyTasksForDay}/{totalDailyTasksForDay}
               </span>
            </button>
            <button
               type="button"
               role="tab"
               aria-selected={mobileActiveTab === "weekly"}
               onClick={() => setMobileActiveTab("weekly")}
               className={`flex-1 min-h-control-sm py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  mobileActiveTab === "weekly"
                     ? "bg-white text-black shadow-sm"
                     : "text-text-tertiary hover:text-white"
               }`}
            >
               <span>Weekly</span>
               <span
                  className={`px-1.5 py-0.5 rounded-full text-micro font-semibold tabular-nums ${
                     mobileActiveTab === "weekly"
                        ? "bg-black/10 text-black"
                        : "bg-surface-nested text-text-tertiary"
                  }`}
               >
                  {completedWeeklyTasks}/{totalWeeklyTasks}
               </span>
            </button>
         </div>

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
                  {/* Row 1: Section Title, Day Badge, and Completed Counter (Mirrors Weekly Todos card) */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                     <div className="flex items-center gap-2 shrink-0">
                        <h3 className="text-lg font-bold text-white shrink-0">
                           Daily Todos
                        </h3>
                        <span className="px-2 py-0.5 rounded-full text-meta font-semibold bg-surface-nested text-text-secondary border border-border-strong inline-flex items-center gap-1.5 shrink-0">
                           {activeDayOption.shortLabel}
                           {isActiveDayToday && (
                              <span
                                 className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                                 title="Today"
                              />
                           )}
                           {isPastDayLocked && (
                              <span className="text-label text-text-tertiary flex items-center gap-1 font-normal">
                                 <Lock className="h-3 w-3 text-text-tertiary" />
                                 Locked
                              </span>
                           )}
                        </span>
                     </div>
                     <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-semibold text-text-secondary whitespace-nowrap">
                           {completedDailyTasksForDay}/{totalDailyTasksForDay}{" "}
                           Completed
                        </span>
                     </div>
                  </div>

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

                  {/* 7-Day Pill Switcher (Fits all 7 days without horizontal scrolling) */}
                  <div
                     role="tablist"
                     aria-label={
                        hasChallengeContext
                           ? "Challenge Day Tabs"
                           : "Calendar Week Day Tabs"
                     }
                     className="grid grid-cols-7 gap-1 sm:gap-1.5 w-full pt-0.5 pb-1"
                  >
                     {dayOptions.map((opt) => {
                        const isSelected = opt.dateKey === selectedDateKey;
                        const stats = dayTaskCounts.get(opt.dateKey) || {
                           total: 0,
                           completed: 0,
                        };
                        const allDone =
                           stats.total > 0 && stats.completed === stats.total;

                        const isDayDropTarget =
                           dragOverInfo?.type === "day" &&
                           dragOverInfo.targetDateKey === opt.dateKey;
                        let isDropAllowedOnOpt = true;
                        if (
                           draggedItem?.type === "task" ||
                           draggedItem?.type === "category"
                        ) {
                           if (draggedItem.sourceColumn === "daily") {
                              const sourceKey =
                                 draggedItem.sourceDateKey || selectedDateKey;
                              isDropAllowedOnOpt =
                                 !checkIsDayLocked(sourceKey) &&
                                 validateMoveTaskChallengeDay(
                                    sourceKey,
                                    opt.dateKey,
                                    effectiveTodayDate,
                                    {
                                       isChallengeActive: hasChallengeContext,
                                       isTargetDayLocked: checkIsDayLocked(
                                          opt.dateKey
                                       ),
                                    }
                                 ).ok;
                           } else if (draggedItem.sourceColumn === "weekly") {
                              isDropAllowedOnOpt =
                                 !checkIsDayLocked(opt.dateKey) &&
                                 (hasChallengeContext ? !opt.isPast : true);
                           }
                        }

                        return (
                           <button
                              key={opt.dateKey}
                              type="button"
                              role="tab"
                              aria-selected={isSelected}
                              onClick={() => handleSelectDay(opt)}
                              onDragOver={(e) => handleDayPillDragOver(e, opt)}
                              onDragLeave={(e) => {
                                 e.preventDefault();
                                 if (
                                    dragOverInfo?.type === "day" &&
                                    dragOverInfo.targetDateKey === opt.dateKey
                                 ) {
                                    setDragOverInfo(null);
                                 }
                              }}
                              onDrop={(e) => handleDayPillDrop(e, opt)}
                              title={
                                 draggedItem?.type === "task"
                                    ? !isDropAllowedOnOpt
                                       ? `${opt.label} (Cannot move to past day)`
                                       : `Move task to ${opt.label}`
                                    : draggedItem?.type === "category"
                                      ? !isDropAllowedOnOpt
                                         ? `${opt.label} (Cannot move to past day)`
                                         : `Move category to ${opt.label}`
                                      : opt.isToday
                                        ? "Today"
                                        : opt.isYesterday
                                          ? `Yesterday (${opt.label})`
                                          : opt.label
                              }
                              className={`w-full min-w-0 py-1.5 px-0.5 sm:px-1 rounded-xl text-center border transition-all flex flex-col items-center justify-between min-h-[54px] sm:min-h-[58px] overflow-hidden ${
                                 (draggedItem?.type === "task" ||
                                    draggedItem?.type === "category") &&
                                 isDayDropTarget
                                    ? isDropAllowedOnOpt
                                       ? "bg-emerald-950/40 border-emerald-500 text-white shadow-md ring-2 ring-emerald-500 scale-[1.02]"
                                       : "bg-red-950/30 border-red-500/50 text-red-300 ring-2 ring-red-500/60 cursor-not-allowed opacity-60"
                                    : (draggedItem?.type === "task" ||
                                           draggedItem?.type === "category") &&
                                        !isDropAllowedOnOpt
                                      ? "bg-surface-primary border-border-default text-text-tertiary opacity-40 cursor-not-allowed border-dashed"
                                      : isSelected
                                        ? "bg-brand-1/15 border-brand-2 text-white shadow-sm ring-1 ring-brand-2/60"
                                        : "bg-surface-elevated border-border-strong text-text-tertiary hover:bg-surface-nested hover:text-white"
                              }`}
                           >
                              <span className="text-label sm:text-meta font-bold uppercase tracking-tight leading-none truncate max-w-full">
                                 {opt.isToday
                                    ? "Today"
                                    : opt.shortLabel.startsWith("Day ")
                                      ? `D${opt.dayNumber}`
                                      : opt.shortLabel.slice(0, 3)}
                              </span>
                              <span className="text-micro sm:text-caption opacity-75 mt-0.5 leading-none truncate max-w-full">
                                 {formatDayDate(opt.dateKey)}
                              </span>
                              <div className="mt-1 flex items-center justify-center gap-0.5 sm:gap-1 min-h-[14px] w-full">
                                 {draggedItem?.type === "task" &&
                                 !isDropAllowedOnOpt ? (
                                    <Lock className="h-2.5 w-2.5 text-red-400/70" />
                                 ) : (
                                    <>
                                       {opt.isToday && (
                                          <span
                                             className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                                isSelected
                                                   ? "bg-brand-2"
                                                   : "bg-emerald-400"
                                             }`}
                                             title="Today"
                                          />
                                       )}
                                       {stats.total > 0 && (
                                          <span
                                             className={`text-micro sm:text-caption font-semibold px-0.5 sm:px-1 rounded leading-tight truncate ${
                                                allDone
                                                   ? "bg-emerald-500/20 text-emerald-400"
                                                   : isSelected
                                                     ? "bg-brand-2/20 text-brand-2"
                                                     : "bg-surface-nested text-text-tertiary"
                                             }`}
                                          >
                                             {stats.completed}/{stats.total}
                                          </span>
                                       )}
                                    </>
                                 )}
                              </div>
                           </button>
                        );
                     })}
                  </div>

                  <div className="space-y-3">
                     {/* Rollover Helper Banners */}
                     {isActiveDayToday &&
                        rolloverSummary.totalPastIncompleteCount > 0 &&
                        !isRolloverDismissed &&
                        !isRolloverSnoozed && (
                           <div
                              id="rollover-today-banner"
                              data-testid="rollover-today-banner"
                              suppressHydrationWarning
                              className="p-3.5 rounded-2xl bg-surface-nested border border-amber-500/30 flex flex-col gap-2.5 shadow-sm animate-in fade-in duration-200"
                           >
                              <script
                                 dangerouslySetInnerHTML={{
                                    __html: `(function(){try{var k=${JSON.stringify(
                                       ROLLOVER_SNOOZE_STORAGE_PREFIX
                                    ).replace(
                                       /</g,
                                       "\\u003c"
                                    )};var u=${JSON.stringify(
                                       userId && userId.trim().length > 0
                                          ? userId.trim()
                                          : "guest"
                                    ).replace(
                                       /</g,
                                       "\\u003c"
                                    )};var d=${JSON.stringify(
                                       effectiveTodayDate
                                    ).replace(
                                       /</g,
                                       "\\u003c"
                                    )};var c=${JSON.stringify(
                                       ROLLOVER_SNOOZE_COOKIE
                                    ).replace(
                                       /</g,
                                       "\\u003c"
                                    )};var s=false;if(typeof localStorage!=='undefined'&&localStorage.getItem(k+u+'_'+d)==='true'){s=true;}if(!s&&typeof document!=='undefined'&&document.cookie){var m=document.cookie.match(new RegExp('(?:^|;\\\\s*)'+c+'=([^;]*)'));if(m&&m[1]){var p=JSON.parse(decodeURIComponent(m[1]));if(p&&typeof p==='object'&&p[u]===d){s=true;}}}if(s){var el=document.getElementById('rollover-today-banner');if(el)el.style.setProperty('display','none','important');}}catch(e){}})();`,
                                 }}
                              />
                              <div className="flex items-start justify-between gap-2.5">
                                 <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                    <div className="h-8 w-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                                       <RotateCcw className="h-4 w-4 text-amber-400" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                       <p className="text-xs font-semibold text-text-primary">
                                          {rolloverSummary.yesterdayIncompleteCount >
                                             0 &&
                                          rolloverSummary.totalPastIncompleteCount ===
                                             rolloverSummary.yesterdayIncompleteCount
                                             ? `${rolloverSummary.yesterdayIncompleteCount} incomplete task${
                                                  rolloverSummary.yesterdayIncompleteCount >
                                                  1
                                                     ? "s"
                                                     : ""
                                               } from yesterday`
                                             : `${rolloverSummary.totalPastIncompleteCount} incomplete task${
                                                  rolloverSummary.totalPastIncompleteCount >
                                                  1
                                                     ? "s"
                                                     : ""
                                               } from earlier days`}
                                       </p>
                                       <p className="text-meta text-text-tertiary mt-0.5">
                                          Carry over unfinished tasks to today
                                          with one click.
                                       </p>
                                    </div>
                                 </div>
                                 <button
                                    type="button"
                                    onClick={handleSnoozeRolloverToday}
                                    aria-label="Dismiss rollover helper"
                                    className="p-1 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-elevated transition-colors shrink-0 -mr-1 -mt-1"
                                 >
                                    <X className="h-4 w-4" />
                                 </button>
                              </div>
                              <div className="flex items-center flex-wrap gap-2 pt-0.5">
                                 <button
                                    type="button"
                                    onClick={() =>
                                       handleRolloverIncompleteTasks()
                                    }
                                    data-testid="rollover-all-button"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition-colors shadow-sm"
                                 >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    <span>Roll over to Today</span>
                                 </button>
                                 <button
                                    type="button"
                                    onClick={handleSnoozeRolloverToday}
                                    title="Don't remind today"
                                    data-testid="rollover-snooze-today-button"
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-xl text-text-tertiary hover:text-text-primary hover:bg-surface-elevated transition-colors border border-border-subtle/60 hover:border-border-subtle"
                                 >
                                    <span>Don&apos;t remind today</span>
                                 </button>
                              </div>
                           </div>
                        )}

                     {rolloverSummary.isViewingPastDay &&
                        rolloverSummary.selectedDayIncompleteCount > 0 && (
                           <div
                              data-testid="rollover-past-day-banner"
                              className="p-2.5 rounded-xl bg-surface-nested border border-amber-500/20 flex items-center justify-between gap-2 animate-in fade-in duration-200"
                           >
                              <div className="flex items-center gap-2 text-xs text-text-secondary min-w-0">
                                 <RotateCcw className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                                 <span className="truncate">
                                    {rolloverSummary.selectedDayIncompleteCount}{" "}
                                    incomplete task
                                    {rolloverSummary.selectedDayIncompleteCount >
                                    1
                                       ? "s"
                                       : ""}{" "}
                                    on this day
                                 </span>
                              </div>
                              <button
                                 type="button"
                                 onClick={() =>
                                    handleRolloverIncompleteTasks({
                                       sourceDateKey: selectedDateKey,
                                    })
                                 }
                                 data-testid="rollover-day-button"
                                 className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-colors shrink-0"
                              >
                                 <RotateCcw className="h-3 w-3" />
                                 <span>Roll over to Today</span>
                              </button>
                           </div>
                        )}

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
                                 <div
                                    key={cat.id || cat.name}
                                    data-drag-card="category"
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
                                    className={`rounded-xl bg-surface-nested overflow-hidden border transition-all ${
                                       isCatDragging
                                          ? "opacity-30 border-dashed border-brand-2 bg-surface-elevated scale-[0.99]"
                                          : ""
                                    } ${
                                       isCatOver &&
                                       dragOverInfo?.position === "above"
                                          ? "border-t-2 border-t-[#e08a32] border-border-strong"
                                          : isCatOver &&
                                              dragOverInfo?.position === "below"
                                            ? "border-b-2 border-b-[#e08a32] border-border-strong"
                                            : isCatOver
                                              ? "border-brand-2"
                                              : "border-border-strong"
                                    }`}
                                 >
                                    <ContextMenu modal={false}>
                                       <ContextMenuTrigger asChild>
                                          <div
                                             draggable
                                             onDragStart={(e) =>
                                                handleCategoryDragStart(
                                                   e,
                                                   catIdx,
                                                   "daily"
                                                )
                                             }
                                             onDragEnd={handleDragEnd}
                                             onClick={() =>
                                                toggleDailyCollapse(catIdx)
                                             }
                                             className="w-full flex items-center justify-between px-3 py-3 text-left font-medium text-sm text-white hover:bg-surface-nested transition-colors cursor-grab active:cursor-grabbing select-none"
                                          >
                                             <div
                                                className="p-1 -ml-1 mr-1 text-text-tertiary hover:text-brand-2 rounded transition-colors shrink-0"
                                                title="Drag category to reorder, move to day or across boards"
                                                aria-label={`Drag category ${cat.name}`}
                                             >
                                                <GripVertical className="h-4 w-4" />
                                             </div>
                                             <span className="truncate flex-1 pr-2">
                                                {cat.name}
                                             </span>
                                             <div
                                                className="flex items-center gap-1.5 shrink-0"
                                                onDragStart={(e) =>
                                                   e.stopPropagation()
                                                }
                                                onClick={(e) =>
                                                   e.stopPropagation()
                                                }
                                             >
                                                <DropdownMenu modal={false}>
                                                   <DropdownMenuTrigger asChild>
                                                      <button
                                                         type="button"
                                                         className="p-1 rounded-md text-text-tertiary hover:text-white hover:bg-input-bg data-[state=open]:text-white data-[state=open]:bg-input-bg transition-colors"
                                                         title="Category options"
                                                         aria-label={`Options for category ${cat.name}`}
                                                      >
                                                         <MoreVertical className="h-4 w-4" />
                                                      </button>
                                                   </DropdownMenuTrigger>
                                                   <DropdownMenuContent
                                                      align="end"
                                                      className="min-w-dropdown-min"
                                                   >
                                                      <CategoryMenuItems
                                                         isChallengeActive={
                                                            hasChallengeContext
                                                         }
                                                         cat={cat}
                                                         catType="daily"
                                                         dailyCategories={
                                                            dailyCategories
                                                         }
                                                         weeklyCategories={
                                                            weeklyCategories
                                                         }
                                                         selectedDateKey={
                                                            selectedDateKey
                                                         }
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
                                                            setEditCategoryModal(
                                                               {
                                                                  id: cat.id,
                                                                  name: cat.name,
                                                                  taskType:
                                                                     "daily",
                                                               }
                                                            );
                                                            setEditCategoryInputName(
                                                               cat.name
                                                            );
                                                         }}
                                                         onDeleteCategory={() => {
                                                            setDeleteCategoryModal(
                                                               {
                                                                  id: cat.id,
                                                                  name: cat.name,
                                                                  taskType:
                                                                     "daily",
                                                               }
                                                            );
                                                         }}
                                                         Item={DropdownMenuItem}
                                                         Separator={
                                                            DropdownMenuSeparator
                                                         }
                                                         Label={
                                                            DropdownMenuLabel
                                                         }
                                                      />
                                                   </DropdownMenuContent>
                                                </DropdownMenu>
                                                {isCollapsed ? (
                                                   <ChevronDown className="h-4 w-4 text-text-tertiary" />
                                                ) : (
                                                   <ChevronUp className="h-4 w-4 text-text-tertiary" />
                                                )}
                                             </div>
                                          </div>
                                       </ContextMenuTrigger>
                                       <ContextMenuContent className="min-w-dropdown-min">
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
                                                setEditCategoryInputName(
                                                   cat.name
                                                );
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
                                       </ContextMenuContent>
                                    </ContextMenu>

                                    {!isCollapsed && (
                                       <div className="px-4 pb-3 pt-1 space-y-2.5 border-t border-border-strong">
                                          {dayTasks.length === 0 ? (
                                             <p className="text-xs text-text-tertiary py-1">
                                                No daily tasks in this category
                                                for {activeDayOption.shortLabel}
                                                .
                                             </p>
                                          ) : (
                                             dayTasks.map((task) => {
                                                const isTaskDragging =
                                                   draggedItem?.type ===
                                                      "task" &&
                                                   draggedItem.id === task.id;
                                                const isTaskOver =
                                                   dragOverInfo?.type ===
                                                      "task" &&
                                                   dragOverInfo.targetId ===
                                                      task.id;

                                                return (
                                                   <ContextMenu
                                                      key={task.id}
                                                      modal={false}
                                                   >
                                                      <ContextMenuTrigger
                                                         asChild
                                                      >
                                                         <div
                                                            data-drag-card="task"
                                                            data-task-id={
                                                               task.id
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
                                                            className={`flex items-start justify-between gap-2 p-1.5 rounded-lg hover:bg-surface-nested transition-all group ${
                                                               isTaskDragging
                                                                  ? "opacity-30 border border-dashed border-brand-2 bg-surface-elevated"
                                                                  : ""
                                                            } ${
                                                               isTaskOver &&
                                                               dragOverInfo?.position ===
                                                                  "above"
                                                                  ? "border-t-2 border-t-[#e08a32]"
                                                                  : isTaskOver &&
                                                                      dragOverInfo?.position ===
                                                                         "below"
                                                                    ? "border-b-2 border-b-[#e08a32]"
                                                                    : ""
                                                            }`}
                                                         >
                                                            <div
                                                               draggable
                                                               onDragStart={(
                                                                  e
                                                               ) =>
                                                                  handleTaskDragStart(
                                                                     e,
                                                                     task.id,
                                                                     catIdx,
                                                                     "daily"
                                                                  )
                                                               }
                                                               onDragEnd={
                                                                  handleDragEnd
                                                               }
                                                               onClick={(e) =>
                                                                  e.stopPropagation()
                                                               }
                                                               className="p-1 -ml-1 text-text-tertiary hover:text-brand-2 cursor-grab active:cursor-grabbing rounded transition-colors shrink-0 mt-0.5"
                                                               title="Drag task to reorder or move across categories"
                                                               aria-label={`Drag task ${task.text}`}
                                                            >
                                                               <GripVertical className="h-3.5 w-3.5" />
                                                            </div>
                                                            {(() => {
                                                               const status =
                                                                  getTaskStatus(
                                                                     task
                                                                  );
                                                               return (
                                                                  <>
                                                                     <div
                                                                        role="checkbox"
                                                                        aria-checked={
                                                                           status ===
                                                                           "COMPLETED"
                                                                        }
                                                                        onClick={(
                                                                           e
                                                                        ) => {
                                                                           toggleDailyTask(
                                                                              catIdx,
                                                                              task.id,
                                                                              e
                                                                           );
                                                                        }}
                                                                        className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer"
                                                                        title={
                                                                           status ===
                                                                           "COMPLETED"
                                                                              ? "Status: Completed. Click to reset to To-Do"
                                                                              : status ===
                                                                                  "IN_PROGRESS"
                                                                                ? "Status: In Progress. Click to mark Completed"
                                                                                : status ===
                                                                                    "CROSSED_OUT"
                                                                                  ? "Status: Crossed Out. Click to mark Completed"
                                                                                  : "Status: To-Do. Click to mark Completed"
                                                                        }
                                                                     >
                                                                        <div
                                                                           className={`h-5 w-5 rounded flex items-center justify-center border transition-all shrink-0 mt-0.5 ${
                                                                              status ===
                                                                              "COMPLETED"
                                                                                 ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
                                                                                 : status ===
                                                                                     "IN_PROGRESS"
                                                                                   ? "border-amber-400/80 bg-amber-500/15 text-amber-400"
                                                                                   : status ===
                                                                                       "CROSSED_OUT"
                                                                                     ? "border-rose-500/80 bg-rose-500/15 text-rose-400"
                                                                                     : "border-white bg-transparent group-hover:border-gray-300"
                                                                           }`}
                                                                        >
                                                                           {status ===
                                                                              "COMPLETED" && (
                                                                              <Check className="h-3.5 w-3.5 stroke-[3]" />
                                                                           )}
                                                                           {status ===
                                                                              "IN_PROGRESS" && (
                                                                              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                                                                           )}
                                                                           {status ===
                                                                              "CROSSED_OUT" && (
                                                                              <X className="h-3.5 w-3.5 stroke-[2.5]" />
                                                                           )}
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                           <span
                                                                              title={
                                                                                 task.text
                                                                              }
                                                                              className={`text-sm break-words leading-snug ${
                                                                                 expandedTaskIds.has(
                                                                                    task.id
                                                                                 )
                                                                                    ? "line-clamp-none"
                                                                                    : "line-clamp-2"
                                                                              } ${
                                                                                 status ===
                                                                                 "COMPLETED"
                                                                                    ? "text-text-tertiary line-through"
                                                                                    : status ===
                                                                                        "CROSSED_OUT"
                                                                                      ? "text-text-tertiary line-through decoration-rose-500/60"
                                                                                      : status ===
                                                                                          "IN_PROGRESS"
                                                                                        ? "text-white font-medium"
                                                                                        : "text-white"
                                                                              }`}
                                                                           >
                                                                              {
                                                                                 task.text
                                                                              }
                                                                           </span>
                                                                           {(task
                                                                              .text
                                                                              .length >
                                                                              45 ||
                                                                              task.text.includes(
                                                                                 "\n"
                                                                              )) && (
                                                                              <button
                                                                                 type="button"
                                                                                 onClick={(
                                                                                    e
                                                                                 ) => {
                                                                                    e.preventDefault();
                                                                                    e.stopPropagation();
                                                                                    toggleTaskExpand(
                                                                                       task.id,
                                                                                       e
                                                                                    );
                                                                                 }}
                                                                                 title={
                                                                                    expandedTaskIds.has(
                                                                                       task.id
                                                                                    )
                                                                                       ? "Show less"
                                                                                       : "Show full task description"
                                                                                 }
                                                                                 className="text-text-tertiary hover:text-white text-xs font-medium mt-0.5 inline-flex items-center gap-1 transition-colors select-none group/expand cursor-pointer"
                                                                              >
                                                                                 <span>
                                                                                    {expandedTaskIds.has(
                                                                                       task.id
                                                                                    )
                                                                                       ? "Show less"
                                                                                       : "Show more"}
                                                                                 </span>
                                                                                 <ChevronDown
                                                                                    className={`h-3 w-3 transition-transform duration-200 ${
                                                                                       expandedTaskIds.has(
                                                                                          task.id
                                                                                       )
                                                                                          ? "rotate-180"
                                                                                          : ""
                                                                                    }`}
                                                                                 />
                                                                              </button>
                                                                           )}
                                                                        </div>
                                                                     </div>

                                                                     {status ===
                                                                        "COMPLETED" && (
                                                                        <button
                                                                           type="button"
                                                                           onClick={(
                                                                              e
                                                                           ) => {
                                                                              e.stopPropagation();
                                                                              setTaskStatus(
                                                                                 catIdx,
                                                                                 task.id,
                                                                                 "daily",
                                                                                 "TODO"
                                                                              );
                                                                           }}
                                                                           title="Status: Completed. Click to reset to To-Do"
                                                                           className="shrink-0 px-2 py-0.5 rounded-md text-label font-semibold tracking-wide uppercase transition-colors border mt-0.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                                                                        >
                                                                           Completed
                                                                        </button>
                                                                     )}
                                                                     {status ===
                                                                        "IN_PROGRESS" && (
                                                                        <button
                                                                           type="button"
                                                                           onClick={(
                                                                              e
                                                                           ) => {
                                                                              e.stopPropagation();
                                                                              setTaskStatus(
                                                                                 catIdx,
                                                                                 task.id,
                                                                                 "daily",
                                                                                 "COMPLETED",
                                                                                 e
                                                                              );
                                                                           }}
                                                                           title="Status: In Progress. Click to mark Completed"
                                                                           className="shrink-0 px-2 py-0.5 rounded-md text-label font-semibold tracking-wide uppercase transition-colors border mt-0.5 bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
                                                                        >
                                                                           In
                                                                           Progress
                                                                        </button>
                                                                     )}
                                                                     {status ===
                                                                        "CROSSED_OUT" && (
                                                                        <button
                                                                           type="button"
                                                                           onClick={(
                                                                              e
                                                                           ) => {
                                                                              e.stopPropagation();
                                                                              setTaskStatus(
                                                                                 catIdx,
                                                                                 task.id,
                                                                                 "daily",
                                                                                 "TODO"
                                                                              );
                                                                           }}
                                                                           title="Status: Crossed Out. Click to reset to To-Do"
                                                                           className="shrink-0 px-2 py-0.5 rounded-md text-label font-semibold tracking-wide uppercase transition-colors border mt-0.5 bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20"
                                                                        >
                                                                           Crossed
                                                                           Out
                                                                        </button>
                                                                     )}
                                                                     {status ===
                                                                        "TODO" && (
                                                                        <button
                                                                           type="button"
                                                                           onClick={(
                                                                              e
                                                                           ) => {
                                                                              e.stopPropagation();
                                                                              setTaskStatus(
                                                                                 catIdx,
                                                                                 task.id,
                                                                                 "daily",
                                                                                 "IN_PROGRESS"
                                                                              );
                                                                           }}
                                                                           title="Status: To-Do. Click to set In Progress"
                                                                           className="opacity-0 group-hover:opacity-100 sm:opacity-0 max-sm:opacity-100 shrink-0 px-2 py-0.5 rounded-md text-label font-semibold tracking-wide uppercase transition-all border mt-0.5 bg-surface-nested text-text-tertiary hover:text-amber-400 border-border-subtle hover:border-amber-500/30 hover:bg-amber-500/10"
                                                                        >
                                                                           To-Do
                                                                        </button>
                                                                     )}
                                                                  </>
                                                               );
                                                            })()}
                                                            {rolloverSummary.isViewingPastDay &&
                                                               !task.completed &&
                                                               getTaskStatus(
                                                                  task
                                                               ) !==
                                                                  "COMPLETED" &&
                                                               getTaskStatus(
                                                                  task
                                                               ) !==
                                                                  "CROSSED_OUT" && (
                                                                  <button
                                                                     type="button"
                                                                     onClick={(
                                                                        e
                                                                     ) => {
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
                                                               )}
                                                            <button
                                                               type="button"
                                                               onClick={(e) => {
                                                                  e.preventDefault();
                                                                  e.stopPropagation();
                                                                  handleDeleteTask(
                                                                     catIdx,
                                                                     task.id,
                                                                     "daily"
                                                                  );
                                                               }}
                                                               className="opacity-0 group-hover:opacity-100 sm:opacity-0 max-sm:opacity-100 p-1 text-text-tertiary hover:text-feedback-error rounded hover:bg-input-bg transition-opacity shrink-0 mt-0.5"
                                                               title="Delete task"
                                                               aria-label={`Delete task ${task.text}`}
                                                            >
                                                               <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                            <DropdownMenu
                                                               modal={false}
                                                            >
                                                               <DropdownMenuTrigger
                                                                  asChild
                                                               >
                                                                  <button
                                                                     type="button"
                                                                     className="opacity-0 group-hover:opacity-100 sm:opacity-0 max-sm:opacity-100 data-[state=open]:opacity-100 p-1 text-text-tertiary hover:text-white rounded hover:bg-input-bg transition-opacity shrink-0 mt-0.5"
                                                                     title="Task options"
                                                                     aria-label={`Options for task ${task.text}`}
                                                                  >
                                                                     <MoreVertical className="h-3.5 w-3.5" />
                                                                  </button>
                                                               </DropdownMenuTrigger>
                                                               <DropdownMenuContent
                                                                  align="end"
                                                                  className="min-w-dropdown-min"
                                                               >
                                                                  <TaskMenuItems
                                                                     isChallengeActive={
                                                                        hasChallengeContext
                                                                     }
                                                                     task={task}
                                                                     catIdx={
                                                                        catIdx
                                                                     }
                                                                     taskType="daily"
                                                                     effectiveTodayDate={
                                                                        effectiveTodayDate
                                                                     }
                                                                     dayOptions={
                                                                        dayOptions
                                                                     }
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
                                                                     onSetStatus={(
                                                                        status
                                                                     ) =>
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
                                                                        setEditTaskModal(
                                                                           {
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
                                                                              taskType:
                                                                                 "daily",
                                                                           }
                                                                        );
                                                                        setEditTaskInputChallengeId(
                                                                           task.challengeId ??
                                                                              null
                                                                        );
                                                                        setEditTaskInputText(
                                                                           task.text
                                                                        );
                                                                        setEditTaskInputStatus(
                                                                           getTaskStatus(
                                                                              task
                                                                           )
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
                                                                     Item={
                                                                        DropdownMenuItem
                                                                     }
                                                                     Separator={
                                                                        DropdownMenuSeparator
                                                                     }
                                                                     Label={
                                                                        DropdownMenuLabel
                                                                     }
                                                                  />
                                                               </DropdownMenuContent>
                                                            </DropdownMenu>
                                                         </div>
                                                      </ContextMenuTrigger>
                                                      <ContextMenuContent className="min-w-dropdown-min">
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
                                                            dayOptions={
                                                               dayOptions
                                                            }
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
                                                            onSetStatus={(
                                                               status
                                                            ) =>
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
                                                               setEditTaskModal(
                                                                  {
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
                                                                     taskType:
                                                                        "daily",
                                                                  }
                                                               );
                                                               setEditTaskInputChallengeId(
                                                                  task.challengeId ??
                                                                     null
                                                               );
                                                               setEditTaskInputText(
                                                                  task.text
                                                               );
                                                               setEditTaskInputStatus(
                                                                  getTaskStatus(
                                                                     task
                                                                  )
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
                                                            Item={
                                                               ContextMenuItem
                                                            }
                                                            Separator={
                                                               ContextMenuSeparator
                                                            }
                                                            Label={
                                                               ContextMenuLabel
                                                            }
                                                         />
                                                      </ContextMenuContent>
                                                   </ContextMenu>
                                                );
                                             })
                                          )}
                                       </div>
                                    )}
                                 </div>
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                     <div className="flex items-center gap-2 shrink-0">
                        <h3 className="text-lg font-bold text-white shrink-0">
                           Weekly Todos
                        </h3>
                        {Boolean(
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
                        )}
                     </div>
                     <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-semibold text-text-secondary whitespace-nowrap">
                           {completedWeeklyTasksForWeek}/
                           {totalWeeklyTasksForWeek} Completed
                        </span>
                     </div>
                  </div>

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
                                 <div
                                    key={cat.id || cat.name}
                                    data-drag-card="category"
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
                                    className={`rounded-xl bg-surface-nested overflow-hidden border transition-all ${
                                       isCatDragging
                                          ? "opacity-30 border-dashed border-brand-2 bg-surface-elevated scale-[0.99]"
                                          : ""
                                    } ${
                                       isCatOver &&
                                       dragOverInfo?.position === "above"
                                          ? "border-t-2 border-t-[#e08a32] border-border-strong"
                                          : isCatOver &&
                                              dragOverInfo?.position === "below"
                                            ? "border-b-2 border-b-[#e08a32] border-border-strong"
                                            : isCatOver
                                              ? "border-brand-2"
                                              : "border-border-strong"
                                    }`}
                                 >
                                    <ContextMenu modal={false}>
                                       <ContextMenuTrigger asChild>
                                          <div
                                             draggable
                                             onDragStart={(e) =>
                                                handleCategoryDragStart(
                                                   e,
                                                   catIdx,
                                                   "weekly"
                                                )
                                             }
                                             onDragEnd={handleDragEnd}
                                             onClick={() =>
                                                toggleWeeklyCollapse(catIdx)
                                             }
                                             className="w-full flex items-center justify-between px-3 py-3 text-left font-medium text-sm text-white hover:bg-surface-nested transition-colors cursor-grab active:cursor-grabbing select-none"
                                          >
                                             <div
                                                className="p-1 -ml-1 mr-1 text-text-tertiary hover:text-brand-2 rounded transition-colors shrink-0"
                                                title="Drag category to reorder, move to day or across boards"
                                                aria-label={`Drag category ${cat.name}`}
                                             >
                                                <GripVertical className="h-4 w-4" />
                                             </div>
                                             <span className="truncate flex-1 pr-2">
                                                {cat.name}
                                             </span>
                                             <div
                                                className="flex items-center gap-1.5 shrink-0"
                                                onDragStart={(e) =>
                                                   e.stopPropagation()
                                                }
                                                onClick={(e) =>
                                                   e.stopPropagation()
                                                }
                                             >
                                                <DropdownMenu modal={false}>
                                                   <DropdownMenuTrigger asChild>
                                                      <button
                                                         type="button"
                                                         className="p-1 rounded-md text-text-tertiary hover:text-white hover:bg-input-bg data-[state=open]:text-white data-[state=open]:bg-input-bg transition-colors"
                                                         title="Category options"
                                                         aria-label={`Options for category ${cat.name}`}
                                                      >
                                                         <MoreVertical className="h-4 w-4" />
                                                      </button>
                                                   </DropdownMenuTrigger>
                                                   <DropdownMenuContent
                                                      align="end"
                                                      className="min-w-dropdown-min"
                                                   >
                                                      <CategoryMenuItems
                                                         isChallengeActive={
                                                            hasChallengeContext
                                                         }
                                                         cat={cat}
                                                         catType="weekly"
                                                         dailyCategories={
                                                            dailyCategories
                                                         }
                                                         weeklyCategories={
                                                            weeklyCategories
                                                         }
                                                         selectedDateKey={
                                                            selectedDateKey
                                                         }
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
                                                            setEditCategoryModal(
                                                               {
                                                                  id: cat.id,
                                                                  name: cat.name,
                                                                  taskType:
                                                                     "weekly",
                                                               }
                                                            );
                                                            setEditCategoryInputName(
                                                               cat.name
                                                            );
                                                         }}
                                                         onDeleteCategory={() => {
                                                            setDeleteCategoryModal(
                                                               {
                                                                  id: cat.id,
                                                                  name: cat.name,
                                                                  taskType:
                                                                     "weekly",
                                                               }
                                                            );
                                                         }}
                                                         Item={DropdownMenuItem}
                                                         Separator={
                                                            DropdownMenuSeparator
                                                         }
                                                         Label={
                                                            DropdownMenuLabel
                                                         }
                                                      />
                                                   </DropdownMenuContent>
                                                </DropdownMenu>
                                                {isCollapsed ? (
                                                   <ChevronDown className="h-4 w-4 text-text-tertiary" />
                                                ) : (
                                                   <ChevronUp className="h-4 w-4 text-text-tertiary" />
                                                )}
                                             </div>
                                          </div>
                                       </ContextMenuTrigger>
                                       <ContextMenuContent className="min-w-dropdown-min">
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
                                                setEditCategoryInputName(
                                                   cat.name
                                                );
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
                                       </ContextMenuContent>
                                    </ContextMenu>

                                    {!isCollapsed && (
                                       <div className="px-4 pb-3 pt-1 space-y-2.5 border-t border-border-strong">
                                          {weekTasks.length === 0 ? (
                                             <p className="text-xs text-text-tertiary py-1">
                                                No weekly tasks in this
                                                category.
                                             </p>
                                          ) : (
                                             weekTasks.map((task) => {
                                                const isTaskDragging =
                                                   draggedItem?.type ===
                                                      "task" &&
                                                   draggedItem.id === task.id;
                                                const isTaskOver =
                                                   dragOverInfo?.type ===
                                                      "task" &&
                                                   dragOverInfo.targetId ===
                                                      task.id;

                                                return (
                                                   <ContextMenu
                                                      key={task.id}
                                                      modal={false}
                                                   >
                                                      <ContextMenuTrigger
                                                         asChild
                                                      >
                                                         <div
                                                            data-drag-card="task"
                                                            data-task-id={
                                                               task.id
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
                                                            className={`flex items-start justify-between gap-2 p-1.5 rounded-lg hover:bg-surface-nested transition-all group ${
                                                               isTaskDragging
                                                                  ? "opacity-30 border border-dashed border-brand-2 bg-surface-elevated"
                                                                  : ""
                                                            } ${
                                                               isTaskOver &&
                                                               dragOverInfo?.position ===
                                                                  "above"
                                                                  ? "border-t-2 border-t-[#e08a32]"
                                                                  : isTaskOver &&
                                                                      dragOverInfo?.position ===
                                                                         "below"
                                                                    ? "border-b-2 border-b-[#e08a32]"
                                                                    : ""
                                                            }`}
                                                         >
                                                            <div
                                                               draggable
                                                               onDragStart={(
                                                                  e
                                                               ) =>
                                                                  handleTaskDragStart(
                                                                     e,
                                                                     task.id,
                                                                     catIdx,
                                                                     "weekly"
                                                                  )
                                                               }
                                                               onDragEnd={
                                                                  handleDragEnd
                                                               }
                                                               onClick={(e) =>
                                                                  e.stopPropagation()
                                                               }
                                                               className="p-1 -ml-1 text-text-tertiary hover:text-brand-2 cursor-grab active:cursor-grabbing rounded transition-colors shrink-0 mt-0.5"
                                                               title="Drag task to reorder or move across categories"
                                                               aria-label={`Drag task ${task.text}`}
                                                            >
                                                               <GripVertical className="h-3.5 w-3.5" />
                                                            </div>
                                                            {(() => {
                                                               const status =
                                                                  getTaskStatus(
                                                                     task
                                                                  );
                                                               return (
                                                                  <>
                                                                     <div
                                                                        role="checkbox"
                                                                        aria-checked={
                                                                           status ===
                                                                           "COMPLETED"
                                                                        }
                                                                        onClick={(
                                                                           e
                                                                        ) =>
                                                                           toggleWeeklyTask(
                                                                              catIdx,
                                                                              task.id,
                                                                              e
                                                                           )
                                                                        }
                                                                        className="flex items-start gap-3 cursor-pointer flex-1 min-w-0"
                                                                        title={
                                                                           status ===
                                                                           "COMPLETED"
                                                                              ? "Status: Completed. Click to reset to To-Do"
                                                                              : status ===
                                                                                  "IN_PROGRESS"
                                                                                ? "Status: In Progress. Click to mark Completed"
                                                                                : status ===
                                                                                    "CROSSED_OUT"
                                                                                  ? "Status: Crossed Out. Click to mark Completed"
                                                                                  : "Status: To-Do. Click to mark Completed"
                                                                        }
                                                                     >
                                                                        <div
                                                                           className={`h-5 w-5 rounded flex items-center justify-center border transition-all shrink-0 mt-0.5 ${
                                                                              status ===
                                                                              "COMPLETED"
                                                                                 ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
                                                                                 : status ===
                                                                                     "IN_PROGRESS"
                                                                                   ? "border-amber-400/80 bg-amber-500/15 text-amber-400"
                                                                                   : status ===
                                                                                       "CROSSED_OUT"
                                                                                     ? "border-rose-500/80 bg-rose-500/15 text-rose-400"
                                                                                     : "border-white bg-transparent group-hover:border-gray-300"
                                                                           }`}
                                                                        >
                                                                           {status ===
                                                                              "COMPLETED" && (
                                                                              <Check className="h-3.5 w-3.5 stroke-[3]" />
                                                                           )}
                                                                           {status ===
                                                                              "IN_PROGRESS" && (
                                                                              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                                                                           )}
                                                                           {status ===
                                                                              "CROSSED_OUT" && (
                                                                              <X className="h-3.5 w-3.5 stroke-[2.5]" />
                                                                           )}
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                           <span
                                                                              title={
                                                                                 task.text
                                                                              }
                                                                              className={`text-sm break-words leading-snug ${
                                                                                 expandedTaskIds.has(
                                                                                    task.id
                                                                                 )
                                                                                    ? "line-clamp-none"
                                                                                    : "line-clamp-2"
                                                                              } ${
                                                                                 status ===
                                                                                 "COMPLETED"
                                                                                    ? "text-text-tertiary line-through"
                                                                                    : status ===
                                                                                        "CROSSED_OUT"
                                                                                      ? "text-text-tertiary line-through decoration-rose-500/60"
                                                                                      : status ===
                                                                                          "IN_PROGRESS"
                                                                                        ? "text-white font-medium"
                                                                                        : "text-white"
                                                                              }`}
                                                                           >
                                                                              {
                                                                                 task.text
                                                                              }
                                                                           </span>
                                                                           {(task
                                                                              .text
                                                                              .length >
                                                                              45 ||
                                                                              task.text.includes(
                                                                                 "\n"
                                                                              )) && (
                                                                              <button
                                                                                 type="button"
                                                                                 onClick={(
                                                                                    e
                                                                                 ) => {
                                                                                    e.preventDefault();
                                                                                    e.stopPropagation();
                                                                                    toggleTaskExpand(
                                                                                       task.id,
                                                                                       e
                                                                                    );
                                                                                 }}
                                                                                 title={
                                                                                    expandedTaskIds.has(
                                                                                       task.id
                                                                                    )
                                                                                       ? "Show less"
                                                                                       : "Show full task description"
                                                                                 }
                                                                                 className="text-text-tertiary hover:text-white text-xs font-medium mt-0.5 inline-flex items-center gap-1 transition-colors select-none group/expand cursor-pointer"
                                                                              >
                                                                                 <span>
                                                                                    {expandedTaskIds.has(
                                                                                       task.id
                                                                                    )
                                                                                       ? "Show less"
                                                                                       : "Show more"}
                                                                                 </span>
                                                                                 <ChevronDown
                                                                                    className={`h-3 w-3 transition-transform duration-200 ${
                                                                                       expandedTaskIds.has(
                                                                                          task.id
                                                                                       )
                                                                                          ? "rotate-180"
                                                                                          : ""
                                                                                    }`}
                                                                                 />
                                                                              </button>
                                                                           )}
                                                                        </div>
                                                                     </div>

                                                                     {status ===
                                                                        "IN_PROGRESS" && (
                                                                        <button
                                                                           type="button"
                                                                           onClick={(
                                                                              e
                                                                           ) => {
                                                                              e.stopPropagation();
                                                                              setTaskStatus(
                                                                                 catIdx,
                                                                                 task.id,
                                                                                 "weekly",
                                                                                 "COMPLETED",
                                                                                 e
                                                                              );
                                                                           }}
                                                                           title="Status: In Progress. Click to mark Completed"
                                                                           className="shrink-0 px-2 py-0.5 rounded-md text-label font-semibold tracking-wide uppercase transition-colors border mt-0.5 bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
                                                                        >
                                                                           In
                                                                           Progress
                                                                        </button>
                                                                     )}
                                                                     {status ===
                                                                        "CROSSED_OUT" && (
                                                                        <button
                                                                           type="button"
                                                                           onClick={(
                                                                              e
                                                                           ) => {
                                                                              e.stopPropagation();
                                                                              setTaskStatus(
                                                                                 catIdx,
                                                                                 task.id,
                                                                                 "weekly",
                                                                                 "TODO"
                                                                              );
                                                                           }}
                                                                           title="Status: Crossed Out. Click to reset to To-Do"
                                                                           className="shrink-0 px-2 py-0.5 rounded-md text-label font-semibold tracking-wide uppercase transition-colors border mt-0.5 bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20"
                                                                        >
                                                                           Crossed
                                                                           Out
                                                                        </button>
                                                                     )}
                                                                     {status ===
                                                                        "TODO" && (
                                                                        <button
                                                                           type="button"
                                                                           onClick={(
                                                                              e
                                                                           ) => {
                                                                              e.stopPropagation();
                                                                              setTaskStatus(
                                                                                 catIdx,
                                                                                 task.id,
                                                                                 "weekly",
                                                                                 "IN_PROGRESS"
                                                                              );
                                                                           }}
                                                                           title="Status: To-Do. Click to set In Progress"
                                                                           className="opacity-0 group-hover:opacity-100 sm:opacity-0 max-sm:opacity-100 shrink-0 px-2 py-0.5 rounded-md text-label font-semibold tracking-wide uppercase transition-all border mt-0.5 bg-surface-nested text-text-tertiary hover:text-amber-400 border-border-subtle hover:border-amber-500/30 hover:bg-amber-500/10"
                                                                        >
                                                                           To-Do
                                                                        </button>
                                                                     )}
                                                                  </>
                                                               );
                                                            })()}
                                                            {Boolean(
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
                                                               ) : null)}
                                                            <button
                                                               type="button"
                                                               onClick={(e) => {
                                                                  e.preventDefault();
                                                                  e.stopPropagation();
                                                                  handleDeleteTask(
                                                                     catIdx,
                                                                     task.id,
                                                                     "weekly"
                                                                  );
                                                               }}
                                                               className="opacity-0 group-hover:opacity-100 sm:opacity-0 max-sm:opacity-100 p-1 text-text-tertiary hover:text-feedback-error rounded hover:bg-input-bg transition-opacity shrink-0 mt-0.5"
                                                               title="Delete task"
                                                               aria-label={`Delete task ${task.text}`}
                                                            >
                                                               <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                            <DropdownMenu
                                                               modal={false}
                                                            >
                                                               <DropdownMenuTrigger
                                                                  asChild
                                                               >
                                                                  <button
                                                                     type="button"
                                                                     className="opacity-0 group-hover:opacity-100 sm:opacity-0 max-sm:opacity-100 data-[state=open]:opacity-100 p-1 text-text-tertiary hover:text-white rounded hover:bg-input-bg transition-opacity shrink-0 mt-0.5"
                                                                     title="Task options"
                                                                     aria-label={`Options for task ${task.text}`}
                                                                  >
                                                                     <MoreVertical className="h-3.5 w-3.5" />
                                                                  </button>
                                                               </DropdownMenuTrigger>
                                                               <DropdownMenuContent
                                                                  align="end"
                                                                  className="min-w-dropdown-min"
                                                               >
                                                                  <TaskMenuItems
                                                                     isChallengeActive={
                                                                        hasChallengeContext
                                                                     }
                                                                     task={task}
                                                                     catIdx={
                                                                        catIdx
                                                                     }
                                                                     taskType="weekly"
                                                                     effectiveTodayDate={
                                                                        effectiveTodayDate
                                                                     }
                                                                     dayOptions={
                                                                        dayOptions
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
                                                                     selectedDateKey={
                                                                        selectedDateKey
                                                                     }
                                                                     onSetStatus={(
                                                                        status
                                                                     ) =>
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
                                                                        setEditTaskModal(
                                                                           {
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
                                                                              taskType:
                                                                                 "weekly",
                                                                           }
                                                                        );
                                                                        setEditTaskInputChallengeId(
                                                                           task.challengeId ??
                                                                              null
                                                                        );
                                                                        setEditTaskInputText(
                                                                           task.text
                                                                        );
                                                                        setEditTaskInputStatus(
                                                                           getTaskStatus(
                                                                              task
                                                                           )
                                                                        );
                                                                        setEditTaskInputDueDate(
                                                                           task.dueDate ??
                                                                              ""
                                                                        );
                                                                     }}
                                                                     onDeleteTask={() =>
                                                                        handleDeleteTask(
                                                                           catIdx,
                                                                           task.id,
                                                                           "weekly"
                                                                        )
                                                                     }
                                                                     Item={
                                                                        DropdownMenuItem
                                                                     }
                                                                     Separator={
                                                                        DropdownMenuSeparator
                                                                     }
                                                                     Label={
                                                                        DropdownMenuLabel
                                                                     }
                                                                  />
                                                               </DropdownMenuContent>
                                                            </DropdownMenu>
                                                         </div>
                                                      </ContextMenuTrigger>
                                                      <ContextMenuContent className="min-w-dropdown-min">
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
                                                            dayOptions={
                                                               dayOptions
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
                                                            selectedDateKey={
                                                               selectedDateKey
                                                            }
                                                            onSetStatus={(
                                                               status
                                                            ) =>
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
                                                               setEditTaskModal(
                                                                  {
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
                                                                     taskType:
                                                                        "weekly",
                                                                  }
                                                               );
                                                               setEditTaskInputChallengeId(
                                                                  task.challengeId ??
                                                                     null
                                                               );
                                                               setEditTaskInputText(
                                                                  task.text
                                                               );
                                                               setEditTaskInputStatus(
                                                                  getTaskStatus(
                                                                     task
                                                                  )
                                                               );
                                                               setEditTaskInputDueDate(
                                                                  task.dueDate ??
                                                                     ""
                                                               );
                                                            }}
                                                            onDeleteTask={() =>
                                                               handleDeleteTask(
                                                                  catIdx,
                                                                  task.id,
                                                                  "weekly"
                                                               )
                                                            }
                                                            Item={
                                                               ContextMenuItem
                                                            }
                                                            Separator={
                                                               ContextMenuSeparator
                                                            }
                                                            Label={
                                                               ContextMenuLabel
                                                            }
                                                         />
                                                      </ContextMenuContent>
                                                   </ContextMenu>
                                                );
                                             })
                                          )}
                                       </div>
                                    )}
                                 </div>
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
            onClose={() => setAddModalType(null)}
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
            onClose={() => setEditTaskModal(null)}
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
