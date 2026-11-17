"use client";

import type { Dispatch, SetStateAction } from "react";
import { Calendar, Lock, RotateCcw, Trophy, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
   ContextMenuItem,
   ContextMenuLabel,
   ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
   formatDayDate,
   type ChallengeDayOption,
} from "@/features/study-logs/domain/challenge-day";
import { isCategoryCollapsed } from "@/features/study-logs/presentation/cockpit/cockpit-tasks-storage";
import {
   TaskMenuItems,
   CategoryMenuItems,
} from "@/features/study-logs/presentation/cockpit/cockpit-task-menu";
import { CockpitWeekNavigator } from "@/features/study-logs/presentation/cockpit/cockpit-date-picker-popover";
import { TaskExportButton } from "@/features/tasks/presentation/task-export-button";
import type { TaskExportStyle } from "@/features/tasks/domain/task-export";
import type { TaskStatus } from "@/features/tasks/domain/task.types";
import { TaskSyncIssueBanner } from "@/features/tasks/presentation/task-sync-issue-banner";
import type {
   BoardCategory,
   BoardTask,
   DragOverInfo,
   DraggedItem,
   DeleteCategoryModalState,
   EditCategoryModalState,
   EditTaskModalState,
} from "../task-board.types";
import { SAMPLE_STUDY_TASKS, getTaskStatus } from "../task-board.utils";
import { BoardHeader } from "./board-header";
import { DayPillSwitcher } from "./day-pill-switcher";
import { MobileBoardSwitcher } from "./mobile-board-switcher";
import { RolloverBanner } from "./rollover-banner";
import { TaskCategoryCard } from "./task-category-card";
import { TaskRow } from "./task-row";
import { DailyTaskBoard } from "./daily-task-board";
import { WeeklyTaskBoard } from "./weekly-task-board";

type Column = "daily" | "weekly";
type ClickOrigin =
   | React.MouseEvent
   | MouseEvent
   | { clientX: number; clientY: number }
   | Element
   | null;

export interface RolloverSummaryView {
   yesterdayIncompleteCount: number;
   totalPastIncompleteCount: number;
   selectedDayIncompleteCount: number;
   isViewingPastDay: boolean;
}

export interface WeeklyScopedCountsView {
   totalChallengeGoals: number;
   completedChallengeGoals: number;
   totalPersonalGoals: number;
   completedPersonalGoals: number;
   totalTasks: number;
   completedTasks: number;
}

export interface TaskBoardModel {
   isLoggedIn: boolean;
   userId?: string | null;
   hasChallengeContext: boolean;
   linkableChallengeId: string | null;

   mobileActiveTab: Column;
   setMobileActiveTab: Dispatch<SetStateAction<Column>>;

   dailyCategories: BoardCategory[];
   weeklyCategories: BoardCategory[];
   visibleWeeklyCategories: BoardCategory[];
   visibleWeeklyTasksCount: number;

   dayOptions: ChallengeDayOption[];
   activeDayOption: ChallengeDayOption;
   selectedDateKey: string;
   effectiveTodayDate: string;
   isActiveDayToday: boolean;
   isPastDayLocked: boolean;
   checkIsDayLocked: (dateKey: string) => boolean;
   dayTaskCounts: Map<string, { total: number; completed: number }>;

   activeWeekDateKeys: string[];
   weekRangeLabel: string;
   handleSelectDay: (opt: ChallengeDayOption) => void;
   handleJumpToToday: () => void;
   handlePreviousWeek: () => void;
   handleNextWeek: () => void;
   handleSelectDateFromPicker: (dateKey: string) => void;

   activeWeeklyAnchorDateKey: string;
   activeWeeklyWeekDateKeys: string[];
   weeklyRangeLabel: string;
   isViewingCurrentWeeklyWeek: boolean;
   isTaskInWeeklyWeek: (task: BoardTask) => boolean;
   handleWeeklyPreviousWeek: () => void;
   handleWeeklyNextWeek: () => void;
   handleWeeklyJumpToCurrentWeek: () => void;
   handleSelectWeeklyDateFromPicker: (dateKey: string) => void;

   completedDailyTasksForDay: number;
   totalDailyTasksForDay: number;
   completedWeeklyTasks: number;
   totalWeeklyTasks: number;
   completedWeeklyTasksForWeek: number;
   totalWeeklyTasksForWeek: number;

   rolloverSummary: RolloverSummaryView;
   isRolloverDismissed: boolean;
   isRolloverSnoozed: boolean;
   handleRolloverIncompleteTasks: (options?: {
      sourceDateKey?: string;
      taskId?: string;
   }) => void;
   handleSnoozeRolloverToday: () => void;

   expandedTaskIds: Set<string>;
   collapsedCategoryIds: Set<string>;
   draggedItem: DraggedItem | null;
   dragOverInfo: DragOverInfo | null;
   setDragOverInfo: Dispatch<SetStateAction<DragOverInfo | null>>;

   getTaskDateKey: (task: BoardTask) => string;
   toggleTaskExpand: (taskId: string, e?: React.MouseEvent) => void;
   toggleDailyCollapse: (index: number) => void;
   toggleWeeklyCollapse: (index: number) => void;
   toggleDailyTask: (
      catIndex: number,
      taskId: string,
      origin?: ClickOrigin
   ) => void;
   toggleWeeklyTask: (
      catIndex: number,
      taskId: string,
      origin?: ClickOrigin
   ) => void;
   setTaskStatus: (
      catIndex: number,
      taskId: string,
      taskType: Column,
      next: TaskStatus | boolean,
      origin?: ClickOrigin
   ) => void;
   handleDeleteTask: (
      catIndex: number,
      taskId: string,
      taskType: Column
   ) => void;
   toggleTaskChallengeScope: (
      taskId: string,
      challengeId: string | null
   ) => void;

   moveTaskToDay: (
      taskId: string,
      dateKey: string,
      sourceCatIdx?: number,
      sourceColumn?: Column
   ) => void;
   moveCategoryToDayAction: (
      catIdx: number,
      dateKey: string,
      sourceColumn?: Column
   ) => void;

   handleTaskDragStart: (
      e: React.DragEvent,
      taskId: string,
      catIdx: number,
      column: Column
   ) => void;
   handleCategoryDragStart: (
      e: React.DragEvent,
      catIdx: number,
      column: Column
   ) => void;
   handleDragEnd: () => void;
   handleTaskDragOver: (
      e: React.DragEvent,
      taskId: string,
      catIdx: number,
      column: Column
   ) => void;
   handleCategoryDragOver: (
      e: React.DragEvent,
      catIdx: number,
      column: Column
   ) => void;
   handleColumnDragOver: (e: React.DragEvent, column: Column) => void;
   handleDayPillDragOver: (e: React.DragEvent, opt: ChallengeDayOption) => void;
   handleDayPillDrop: (e: React.DragEvent, opt: ChallengeDayOption) => void;
   handleTaskDrop: (
      e: React.DragEvent,
      taskId: string,
      catIdx: number,
      column: Column
   ) => void;
   handleCategoryDrop: (
      e: React.DragEvent,
      catIdx: number,
      column: Column
   ) => void;
   handleColumnDrop: (e: React.DragEvent, column: Column) => void;

   handleExportDaily: (style: TaskExportStyle) => string;
   handleExportWeekly: (style: TaskExportStyle) => string;
   handleAddSampleTask: (title: string) => void;
   openAddDailyModal: (targetDateKey?: string) => void;
   openAddWeeklyModal: () => void;

   setEditTaskModal: Dispatch<SetStateAction<EditTaskModalState | null>>;
   setEditTaskInputText: (value: string) => void;
   setEditTaskInputStatus: (status: TaskStatus) => void;
   setEditTaskInputDueDate: (dateKey: string) => void;
   setEditTaskInputChallengeId: (challengeId: string | null) => void;
   setEditCategoryModal: Dispatch<
      SetStateAction<EditCategoryModalState | null>
   >;
   setEditCategoryInputName: (name: string) => void;
   setDeleteCategoryModal: Dispatch<
      SetStateAction<DeleteCategoryModalState | null>
   >;

   weeklyScopedCounts: WeeklyScopedCountsView;
}

export interface TaskBoardProps {
   model: TaskBoardModel;
}

/** Renders the responsive two-column task board. */
export function TaskBoard({ model }: TaskBoardProps) {
   const {
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
   } = model;

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
            <DailyTaskBoard model={model} />

            {/* Weekly Todos */}
            <WeeklyTaskBoard model={model} />
         </div>
      </>
   );
}
