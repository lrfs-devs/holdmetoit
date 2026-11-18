"use client";

import { memo, type Dispatch, type SetStateAction } from "react";
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
import type { TaskBoardModel } from "./task-board";
import { useTaskRowActions } from "../hooks/use-task-row-actions";

type Column = "daily" | "weekly";
type ClickOrigin =
   | React.MouseEvent
   | MouseEvent
   | { clientX: number; clientY: number }
   | Element
   | null;

export interface WeeklyTaskBoardProps {
   model: TaskBoardModel;
}

/** Weekly board column. */
function WeeklyTaskBoardComponent({ model }: WeeklyTaskBoardProps) {
   const {
      isLoggedIn,
      userId,
      hasChallengeContext,
      linkableChallengeId,
      completedChallengeIdSet,
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

   const rowActions = useTaskRowActions({
      toggleTaskExpand,
      toggleDailyTask,
      toggleWeeklyTask,
      setTaskStatus,
      handleTaskDragStart,
      handleTaskDragOver,
      handleTaskDrop,
      handleDragEnd,
      handleDeleteTask,
      handleRolloverIncompleteTasks,
      moveTaskToDay,
      toggleTaskChallengeScope,
      openEditTask: model.openEditTask,
   });

   const showRollover = false;

   return (
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
                        Set your weekly milestones and track them across the
                        challenge.
                     </p>
                  </div>
               ) : visibleWeeklyTasksCount === 0 ? (
                  <div className="rounded-xl border border-dashed border-border-strong bg-surface-tertiary/50 p-6 text-center">
                     <p className="text-sm font-medium text-text-secondary">
                        No weekly todos for this week
                     </p>
                     <p className="text-xs text-text-tertiary mt-1">
                        Set your weekly milestones and track them across the
                        challenge.
                     </p>
                  </div>
               ) : (
                  <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1 scrollbar-obsidian">
                     {visibleWeeklyCategories.map((cat, catIdx) => {
                        const weekTasks = cat.tasks.filter(isTaskInWeeklyWeek);
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
                                 handleCategoryDragStart(e, catIdx, "weekly")
                              }
                              onDragOver={(e) =>
                                 handleCategoryDragOver(e, catIdx, "weekly")
                              }
                              onDrop={(e) =>
                                 handleCategoryDrop(e, catIdx, "weekly")
                              }
                              onDragEnd={handleDragEnd}
                              menuContent={
                                 <CategoryMenuItems
                                    isChallengeActive={hasChallengeContext}
                                    cat={cat}
                                    catType="weekly"
                                    dailyCategories={dailyCategories}
                                    weeklyCategories={weeklyCategories}
                                    selectedDateKey={selectedDateKey}
                                    effectiveTodayDate={effectiveTodayDate}
                                    dayOptions={dayOptions}
                                    onMoveCategoryToDay={(targetDateKey) =>
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
                                    isChallengeActive={hasChallengeContext}
                                    cat={cat}
                                    catType="weekly"
                                    dailyCategories={dailyCategories}
                                    weeklyCategories={weeklyCategories}
                                    selectedDateKey={selectedDateKey}
                                    effectiveTodayDate={effectiveTodayDate}
                                    dayOptions={dayOptions}
                                    onMoveCategoryToDay={(targetDateKey) =>
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
                                          catIdx={catIdx}
                                          variant="weekly"
                                          expanded={expandedTaskIds.has(
                                             task.id
                                          )}
                                          isDragging={isTaskDragging}
                                          isOver={isTaskOver}
                                          dropPosition={dragOverInfo?.position}
                                          actions={rowActions}
                                          hasChallengeContext={
                                             hasChallengeContext
                                          }
                                          linkableChallengeId={
                                             linkableChallengeId
                                          }
                                          effectiveTodayDate={
                                             effectiveTodayDate
                                          }
                                          selectedDateKey={selectedDateKey}
                                          dayOptions={dayOptions}
                                          showRollover={showRollover}
                                          isResultsLocked={Boolean(
                                             task.challengeId &&
                                             completedChallengeIdSet.has(
                                                task.challengeId
                                             )
                                          )}
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
   );
}

export const WeeklyTaskBoard = memo(WeeklyTaskBoardComponent);
