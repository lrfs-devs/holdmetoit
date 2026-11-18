"use client";

import { memo, type ReactNode } from "react";
import {
   Check,
   ChevronDown,
   GripVertical,
   Lock,
   MoreVertical,
   RotateCcw,
   Trash2,
   Trophy,
   User,
   X,
} from "lucide-react";
import {
   ContextMenu,
   ContextMenuContent,
   ContextMenuItem,
   ContextMenuLabel,
   ContextMenuSeparator,
   ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChallengeDayOption } from "@/features/study-logs/domain/challenge-day";
import { TaskMenuItems } from "@/features/study-logs/presentation/cockpit/cockpit-task-menu";
import type { TaskStatus } from "@/features/tasks/domain/task.types";
import type { BoardTask } from "../task-board.types";
import { getTaskStatus } from "../task-board.utils";
import type { TaskRowActions } from "../hooks/use-task-row-actions";

export interface TaskRowProps {
   task: BoardTask;
   catIdx: number;
   variant: "daily" | "weekly";
   expanded: boolean;
   isDragging: boolean;
   isOver: boolean;
   dropPosition?: "above" | "below";
   actions: TaskRowActions;
   hasChallengeContext: boolean;
   linkableChallengeId: string | null;
   effectiveTodayDate: string;
   selectedDateKey: string;
   dayOptions: ChallengeDayOption[];
   /** Daily-only: show the one-click rollover affordance. */
   showRollover: boolean;
   /** The linked challenge's results are locked, so the goal is read-only. */
   isResultsLocked?: boolean;
}

const STATUS_LABEL: Record<TaskStatus, string> = {
   TODO: "To-Do",
   IN_PROGRESS: "In Progress",
   COMPLETED: "Completed",
   CROSSED_OUT: "Crossed Out",
};

const STATUS_HINT: Record<TaskStatus, string> = {
   TODO: "Status: To-Do. Click to mark Completed",
   IN_PROGRESS: "Status: In Progress. Click to mark Completed",
   COMPLETED: "Status: Completed. Click to reset to To-Do",
   CROSSED_OUT: "Status: Crossed Out. Click to mark Completed",
};

const BADGE_CLASS: Record<TaskStatus, string> = {
   TODO: "opacity-0 group-hover:opacity-100 sm:opacity-0 max-sm:opacity-100 shrink-0 px-2 py-0.5 rounded-md text-label font-semibold tracking-wide uppercase transition-all border mt-0.5 bg-surface-nested text-text-tertiary hover:text-amber-400 border-border-subtle hover:border-amber-500/30 hover:bg-amber-500/10",
   IN_PROGRESS:
      "shrink-0 px-2 py-0.5 rounded-md text-label font-semibold tracking-wide uppercase transition-colors border mt-0.5 bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20",
   COMPLETED:
      "shrink-0 px-2 py-0.5 rounded-md text-label font-semibold tracking-wide uppercase transition-colors border mt-0.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20",
   CROSSED_OUT:
      "shrink-0 px-2 py-0.5 rounded-md text-label font-semibold tracking-wide uppercase transition-colors border mt-0.5 bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20",
};

interface MenuItemsProps {
   task: BoardTask;
   catIdx: number;
   variant: "daily" | "weekly";
   actions: TaskRowActions;
   hasChallengeContext: boolean;
   linkableChallengeId: string | null;
   isResultsLocked?: boolean;
   effectiveTodayDate: string;
   selectedDateKey: string;
   dayOptions: ChallengeDayOption[];
   Item: React.ElementType;
   Separator: React.ElementType;
   Label: React.ElementType;
}

function MenuItems({
   task,
   catIdx,
   variant,
   actions,
   hasChallengeContext,
   linkableChallengeId,
   isResultsLocked,
   effectiveTodayDate,
   selectedDateKey,
   dayOptions,
   Item,
   Separator,
   Label,
}: MenuItemsProps) {
   return (
      <TaskMenuItems
         isChallengeActive={hasChallengeContext}
         task={task}
         catIdx={catIdx}
         taskType={variant}
         effectiveTodayDate={effectiveTodayDate}
         dayOptions={dayOptions}
         selectedDateKey={selectedDateKey}
         linkableChallengeId={linkableChallengeId}
         isResultsLocked={isResultsLocked}
         onToggleChallengeScope={(newScope) =>
            actions.onToggleChallengeScope(task.id, newScope)
         }
         onSetStatus={(status) =>
            actions.onSetStatus(catIdx, task.id, variant, status)
         }
         onMoveToDay={(targetDateKey) =>
            actions.onMoveToDay(task.id, targetDateKey, catIdx, variant)
         }
         onEditTask={() => actions.onEditTask(task, catIdx, variant)}
         onDeleteTask={() => actions.onDelete(catIdx, task.id, variant)}
         Item={Item}
         Separator={Separator}
         Label={Label}
      />
   );
}

function ScopeBadge({
   task,
   linkableChallengeId,
}: {
   task: BoardTask;
   linkableChallengeId: string | null;
}) {
   if (!linkableChallengeId) return null;
   if (task.challengeId === linkableChallengeId) {
      return (
         <span
            data-testid="task-scope-challenge-badge"
            className="shrink-0 inline-flex items-center justify-center p-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mt-0.5"
            title="Challenge Goal (evaluated at challenge lock)"
            aria-label="Challenge Goal"
         >
            <Trophy className="h-3 w-3" />
         </span>
      );
   }
   if (!task.challengeId) {
      return (
         <span
            data-testid="task-scope-personal-badge"
            className="shrink-0 inline-flex items-center justify-center p-1 rounded bg-surface-nested text-text-tertiary border border-border-subtle mt-0.5"
            title="Personal Task (excluded from challenge lock)"
            aria-label="Personal Task"
         >
            <User className="h-3 w-3" />
         </span>
      );
   }
   return null;
}

/** Presentational task card shared by the daily and weekly boards. */
function TaskRowComponent({
   task,
   catIdx,
   variant,
   expanded,
   isDragging,
   isOver,
   dropPosition,
   actions,
   hasChallengeContext,
   linkableChallengeId,
   effectiveTodayDate,
   selectedDateKey,
   dayOptions,
   showRollover,
   isResultsLocked = false,
}: TaskRowProps) {
   const status = getTaskStatus(task);
   const isLongText = task.text.length > 45 || task.text.includes("\n");
   const lockedTooltip =
      "Challenge results are locked — this goal is read-only";

   const nextBadgeStatus: TaskStatus =
      variant === "daily" && status === "TODO"
         ? "IN_PROGRESS"
         : status === "COMPLETED" || status === "CROSSED_OUT"
           ? "TODO"
           : "COMPLETED";

   const canRollover =
      showRollover &&
      !task.completed &&
      status !== "COMPLETED" &&
      status !== "CROSSED_OUT";

   const trailingAction: ReactNode =
      variant === "weekly" ? (
         <>
            <ScopeBadge task={task} linkableChallengeId={linkableChallengeId} />
            {isResultsLocked && (
               <span
                  data-testid="task-results-locked"
                  className="shrink-0 inline-flex items-center justify-center p-1 rounded bg-surface-nested text-text-tertiary border border-border-subtle mt-0.5"
                  title={lockedTooltip}
                  aria-label="Results locked"
               >
                  <Lock className="h-3 w-3" />
               </span>
            )}
         </>
      ) : canRollover ? (
         <button
            type="button"
            onClick={(e) => {
               e.stopPropagation();
               actions.onRollover(task.id, selectedDateKey);
            }}
            className="opacity-0 group-hover:opacity-100 sm:opacity-0 max-sm:opacity-100 p-1 text-text-tertiary hover:text-emerald-400 rounded hover:bg-surface-elevated transition-all shrink-0 mt-0.5"
            title="Roll over to Today"
            aria-label={`Roll over ${task.text} to Today`}
         >
            <RotateCcw className="h-3.5 w-3.5" />
         </button>
      ) : null;

   return (
      <ContextMenu modal={false}>
         <ContextMenuTrigger asChild>
            <div
               data-drag-card="task"
               data-task-id={task.id}
               onDragOver={(e) =>
                  actions.onDragOver(e, task.id, catIdx, variant)
               }
               onDrop={(e) => actions.onDrop(e, task.id, catIdx, variant)}
               className={`flex items-start justify-between gap-2 p-1.5 rounded-lg hover:bg-surface-nested transition-all group ${
                  isDragging
                     ? "opacity-30 border border-dashed border-brand-2 bg-surface-elevated"
                     : ""
               } ${
                  isOver && dropPosition === "above"
                     ? "border-t-2 border-t-[#e08a32]"
                     : isOver && dropPosition === "below"
                       ? "border-b-2 border-b-[#e08a32]"
                       : ""
               }`}
            >
               <div
                  draggable={!isResultsLocked}
                  onDragStart={
                     isResultsLocked
                        ? undefined
                        : (e) =>
                             actions.onDragStart(e, task.id, catIdx, variant)
                  }
                  onDragEnd={isResultsLocked ? undefined : actions.onDragEnd}
                  onClick={(e) => e.stopPropagation()}
                  aria-disabled={isResultsLocked || undefined}
                  className={`p-1 -ml-1 rounded transition-colors shrink-0 mt-0.5 ${
                     isResultsLocked
                        ? "text-text-tertiary cursor-not-allowed opacity-50"
                        : "text-text-tertiary hover:text-brand-2 cursor-grab active:cursor-grabbing"
                  }`}
                  title={
                     isResultsLocked
                        ? lockedTooltip
                        : "Drag task to reorder or move across categories"
                  }
                  aria-label={`Drag task ${task.text}`}
               >
                  <GripVertical className="h-3.5 w-3.5" />
               </div>

               <div
                  role="checkbox"
                  aria-checked={status === "COMPLETED"}
                  aria-disabled={isResultsLocked || undefined}
                  tabIndex={isResultsLocked ? -1 : 0}
                  onKeyDown={
                     isResultsLocked
                        ? undefined
                        : (e) => {
                             if (e.key !== " " && e.key !== "Enter") return;
                             e.preventDefault();
                             // Keyboard activation has no pointer position.
                             // Derive one from the element so confetti/audio
                             // anchoring still works.
                             const rect =
                                e.currentTarget.getBoundingClientRect();
                             actions.onToggleStatus(catIdx, task.id, variant, {
                                clientX: rect.left + rect.width / 2,
                                clientY: rect.top + rect.height / 2,
                             } as unknown as React.MouseEvent);
                          }
                  }
                  onClick={
                     isResultsLocked
                        ? undefined
                        : (e) =>
                             actions.onToggleStatus(catIdx, task.id, variant, e)
                  }
                  className={`flex items-start gap-3 flex-1 min-w-0 ${
                     isResultsLocked
                        ? "cursor-not-allowed opacity-70"
                        : "cursor-pointer"
                  }`}
                  title={isResultsLocked ? lockedTooltip : STATUS_HINT[status]}
               >
                  <div
                     className={`h-5 w-5 rounded flex items-center justify-center border transition-all shrink-0 mt-0.5 ${
                        status === "COMPLETED"
                           ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
                           : status === "IN_PROGRESS"
                             ? "border-amber-400/80 bg-amber-500/15 text-amber-400"
                             : status === "CROSSED_OUT"
                               ? "border-rose-500/80 bg-rose-500/15 text-rose-400"
                               : "border-white bg-transparent group-hover:border-gray-300"
                     }`}
                  >
                     {status === "COMPLETED" && (
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                     )}
                     {status === "IN_PROGRESS" && (
                        <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                     )}
                     {status === "CROSSED_OUT" && (
                        <X className="h-3.5 w-3.5 stroke-[2.5]" />
                     )}
                  </div>
                  <div className="flex-1 min-w-0">
                     <span
                        title={task.text}
                        className={`text-sm break-words leading-snug ${
                           expanded ? "line-clamp-none" : "line-clamp-2"
                        } ${
                           status === "COMPLETED"
                              ? "text-text-tertiary line-through"
                              : status === "CROSSED_OUT"
                                ? "text-text-tertiary line-through decoration-rose-500/60"
                                : status === "IN_PROGRESS"
                                  ? "text-white font-medium"
                                  : "text-white"
                        }`}
                     >
                        {task.text}
                     </span>
                     {isLongText && (
                        <button
                           type="button"
                           onClick={(e) => actions.onToggleExpand(task.id, e)}
                           title={
                              expanded
                                 ? "Show less"
                                 : "Show full task description"
                           }
                           className="text-text-tertiary hover:text-white text-xs font-medium mt-0.5 inline-flex items-center gap-1 transition-colors select-none group/expand cursor-pointer"
                        >
                           <span>{expanded ? "Show less" : "Show more"}</span>
                           <ChevronDown
                              className={`h-3 w-3 transition-transform duration-200 ${
                                 expanded ? "rotate-180" : ""
                              }`}
                           />
                        </button>
                     )}
                  </div>

                  {!(variant === "weekly" && status === "COMPLETED") && (
                     <button
                        type="button"
                        disabled={isResultsLocked}
                        onClick={
                           isResultsLocked
                              ? undefined
                              : (e) =>
                                   actions.onStatusAction(
                                      catIdx,
                                      task.id,
                                      variant,
                                      nextBadgeStatus,
                                      e
                                   )
                        }
                        aria-disabled={isResultsLocked || undefined}
                        title={
                           isResultsLocked
                              ? lockedTooltip
                              : status === "COMPLETED"
                                ? "Status: Completed. Click to reset to To-Do"
                                : status === "IN_PROGRESS"
                                  ? "Status: In Progress. Click to mark Completed"
                                  : status === "CROSSED_OUT"
                                    ? "Status: Crossed Out. Click to reset to To-Do"
                                    : "Status: To-Do. Click to set In Progress"
                        }
                        className={`${BADGE_CLASS[status]} ${
                           isResultsLocked
                              ? "cursor-not-allowed opacity-50"
                              : ""
                        }`}
                     >
                        {STATUS_LABEL[status]}
                     </button>
                  )}
               </div>

               {trailingAction}

               <button
                  type="button"
                  disabled={isResultsLocked}
                  onClick={
                     isResultsLocked
                        ? undefined
                        : (e) => {
                             e.preventDefault();
                             e.stopPropagation();
                             actions.onDelete(catIdx, task.id, variant);
                          }
                  }
                  className="opacity-0 group-hover:opacity-100 sm:opacity-0 max-sm:opacity-100 p-1 text-text-tertiary hover:text-feedback-error rounded hover:bg-input-bg transition-opacity shrink-0 mt-0.5 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-text-tertiary disabled:hover:bg-transparent"
                  title={isResultsLocked ? lockedTooltip : "Delete task"}
                  aria-label={`Delete task ${task.text}`}
                  aria-disabled={isResultsLocked || undefined}
               >
                  <Trash2 className="h-3.5 w-3.5" />
               </button>

               <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
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
                     <MenuItems
                        task={task}
                        catIdx={catIdx}
                        variant={variant}
                        actions={actions}
                        hasChallengeContext={hasChallengeContext}
                        linkableChallengeId={linkableChallengeId}
                        isResultsLocked={isResultsLocked}
                        effectiveTodayDate={effectiveTodayDate}
                        selectedDateKey={selectedDateKey}
                        dayOptions={dayOptions}
                        Item={DropdownMenuItem}
                        Separator={DropdownMenuSeparator}
                        Label={DropdownMenuLabel}
                     />
                  </DropdownMenuContent>
               </DropdownMenu>
            </div>
         </ContextMenuTrigger>
         <ContextMenuContent className="min-w-dropdown-min">
            <MenuItems
               task={task}
               catIdx={catIdx}
               variant={variant}
               actions={actions}
               hasChallengeContext={hasChallengeContext}
               linkableChallengeId={linkableChallengeId}
               isResultsLocked={isResultsLocked}
               effectiveTodayDate={effectiveTodayDate}
               selectedDateKey={selectedDateKey}
               dayOptions={dayOptions}
               Item={ContextMenuItem}
               Separator={ContextMenuSeparator}
               Label={ContextMenuLabel}
            />
         </ContextMenuContent>
      </ContextMenu>
   );
}

export const TaskRow = memo(TaskRowComponent);
