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

export interface DailyTaskBoardProps {
   model: TaskBoardModel;
}

/** Daily board column. */
function DailyTaskBoardComponent({ model }: DailyTaskBoardProps) {
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

   const showRollover = rolloverSummary.isViewingPastDay;

   return (
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
                        No todos scheduled for {activeDayOption.shortLabel} (
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
                           <span>Adding tasks to past days is locked</span>
                        </div>
                     ) : (
                        <div className="pt-2">
                           <Button
                              type="button"
                              onClick={() => openAddDailyModal(selectedDateKey)}
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
                                    onClick={() => handleAddSampleTask(sample)}
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
                           (task) => getTaskDateKey(task) === selectedDateKey
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
                                 handleCategoryDragStart(e, catIdx, "daily")
                              }
                              onDragOver={(e) =>
                                 handleCategoryDragOver(e, catIdx, "daily")
                              }
                              onDrop={(e) =>
                                 handleCategoryDrop(e, catIdx, "daily")
                              }
                              onDragEnd={handleDragEnd}
                              menuContent={
                                 <CategoryMenuItems
                                    isChallengeActive={hasChallengeContext}
                                    cat={cat}
                                    catType="daily"
                                    dailyCategories={dailyCategories}
                                    weeklyCategories={weeklyCategories}
                                    selectedDateKey={selectedDateKey}
                                    effectiveTodayDate={effectiveTodayDate}
                                    dayOptions={dayOptions}
                                    onMoveCategoryToDay={(targetDateKey) =>
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
                                    isChallengeActive={hasChallengeContext}
                                    cat={cat}
                                    catType="daily"
                                    dailyCategories={dailyCategories}
                                    weeklyCategories={weeklyCategories}
                                    selectedDateKey={selectedDateKey}
                                    effectiveTodayDate={effectiveTodayDate}
                                    dayOptions={dayOptions}
                                    onMoveCategoryToDay={(targetDateKey) =>
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
                                          catIdx={catIdx}
                                          variant="daily"
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
   );
}

export const DailyTaskBoard = memo(DailyTaskBoardComponent);
