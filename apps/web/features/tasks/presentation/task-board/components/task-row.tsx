"use client";

import { memo, type ReactNode } from "react";
import {
   Check,
   ChevronDown,
   GripVertical,
   MoreVertical,
   Trash2,
   X,
} from "lucide-react";
import {
   ContextMenu,
   ContextMenuContent,
   ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TaskStatus } from "@/features/tasks/domain/task.types";
import type { BoardTask } from "../task-board.types";
import { getTaskStatus } from "../task-board.utils";

export interface TaskRowProps {
   task: BoardTask;
   variant: "daily" | "weekly";
   expanded: boolean;
   isDragging: boolean;
   isOver: boolean;
   dropPosition?: "above" | "below";
   onToggleExpand: (origin: React.MouseEvent) => void;
   onToggleStatus: (origin: React.MouseEvent) => void;
   onStatusAction: (status: TaskStatus, origin: React.MouseEvent) => void;
   onDragStart: (e: React.DragEvent) => void;
   onDragOver: (e: React.DragEvent) => void;
   onDrop: (e: React.DragEvent) => void;
   onDragEnd: () => void;
   onDelete: (origin: React.MouseEvent) => void;
   /** Extra action rendered before the delete button (rollover or scope badge). */
   trailingAction?: ReactNode;
   /** Dropdown menu items. */
   menuContent: ReactNode;
   /** Right-click menu items. */
   contextMenuContent: ReactNode;
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

/**
 * Presentational task card shared by the daily and weekly boards.
 * Variant-specific actions arrive as slots so the row stays memoizable.
 */
function TaskRowComponent({
   task,
   variant,
   expanded,
   isDragging,
   isOver,
   dropPosition,
   onToggleExpand,
   onToggleStatus,
   onStatusAction,
   onDragStart,
   onDragOver,
   onDrop,
   onDragEnd,
   onDelete,
   trailingAction,
   menuContent,
   contextMenuContent,
}: TaskRowProps) {
   const status = getTaskStatus(task);
   const isLongText = task.text.length > 45 || task.text.includes("\n");

   return (
      <ContextMenu modal={false}>
         <ContextMenuTrigger asChild>
            <div
               data-drag-card="task"
               data-task-id={task.id}
               onDragOver={onDragOver}
               onDrop={onDrop}
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
                  draggable
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onClick={(e) => e.stopPropagation()}
                  className="p-1 -ml-1 text-text-tertiary hover:text-brand-2 cursor-grab active:cursor-grabbing rounded transition-colors shrink-0 mt-0.5"
                  title="Drag task to reorder or move across categories"
                  aria-label={`Drag task ${task.text}`}
               >
                  <GripVertical className="h-3.5 w-3.5" />
               </div>

               <div
                  role="checkbox"
                  aria-checked={status === "COMPLETED"}
                  onClick={onToggleStatus}
                  className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer"
                  title={STATUS_HINT[status]}
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
                           onClick={onToggleExpand}
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
                        onClick={(e) =>
                           onStatusAction(
                              variant === "daily" && status === "TODO"
                                 ? "IN_PROGRESS"
                                 : status === "COMPLETED" ||
                                     status === "CROSSED_OUT"
                                   ? "TODO"
                                   : "COMPLETED",
                              e
                           )
                        }
                        title={
                           status === "COMPLETED"
                              ? "Status: Completed. Click to reset to To-Do"
                              : status === "IN_PROGRESS"
                                ? "Status: In Progress. Click to mark Completed"
                                : status === "CROSSED_OUT"
                                  ? "Status: Crossed Out. Click to reset to To-Do"
                                  : "Status: To-Do. Click to set In Progress"
                        }
                        className={BADGE_CLASS[status]}
                     >
                        {STATUS_LABEL[status]}
                     </button>
                  )}
               </div>

               {trailingAction}

               <button
                  type="button"
                  onClick={onDelete}
                  className="opacity-0 group-hover:opacity-100 sm:opacity-0 max-sm:opacity-100 p-1 text-text-tertiary hover:text-feedback-error rounded hover:bg-input-bg transition-opacity shrink-0 mt-0.5"
                  title="Delete task"
                  aria-label={`Delete task ${task.text}`}
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
                     {menuContent}
                  </DropdownMenuContent>
               </DropdownMenu>
            </div>
         </ContextMenuTrigger>
         <ContextMenuContent className="min-w-dropdown-min">
            {contextMenuContent}
         </ContextMenuContent>
      </ContextMenu>
   );
}

export const TaskRow = memo(TaskRowComponent);
