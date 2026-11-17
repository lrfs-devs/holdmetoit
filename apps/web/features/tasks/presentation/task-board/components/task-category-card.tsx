"use client";

import { memo, type ReactNode } from "react";
import {
   ChevronDown,
   ChevronUp,
   GripVertical,
   MoreVertical,
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
import type { BoardCategory } from "../task-board.types";

export interface TaskCategoryCardProps {
   category: BoardCategory;
   variant: "daily" | "weekly";
   isCollapsed: boolean;
   isDragging: boolean;
   isOver: boolean;
   dropPosition?: "above" | "below";
   onToggleCollapse: () => void;
   onDragStart: (e: React.DragEvent) => void;
   onDragOver: (e: React.DragEvent) => void;
   onDrop: (e: React.DragEvent) => void;
   onDragEnd: () => void;
   menuContent: ReactNode;
   contextMenuContent: ReactNode;
   children: ReactNode;
}

/** Category header + task list container shared by both boards. */
function TaskCategoryCardComponent({
   category,
   variant,
   isCollapsed,
   isDragging,
   isOver,
   dropPosition,
   onToggleCollapse,
   onDragStart,
   onDragOver,
   onDrop,
   onDragEnd,
   menuContent,
   contextMenuContent,
   children,
}: TaskCategoryCardProps) {
   return (
      <div
         data-drag-card="category"
         data-category-variant={variant}
         onDragOver={onDragOver}
         onDrop={onDrop}
         className={`rounded-xl bg-surface-nested overflow-hidden border transition-all ${
            isDragging
               ? "opacity-30 border-dashed border-brand-2 bg-surface-elevated scale-[0.99]"
               : ""
         } ${
            isOver && dropPosition === "above"
               ? "border-t-2 border-t-[#e08a32] border-border-strong"
               : isOver && dropPosition === "below"
                 ? "border-b-2 border-b-[#e08a32] border-border-strong"
                 : isOver
                   ? "border-brand-2"
                   : "border-border-strong"
         }`}
      >
         <ContextMenu modal={false}>
            <ContextMenuTrigger asChild>
               <div
                  draggable
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onClick={onToggleCollapse}
                  className="w-full flex items-center justify-between px-3 py-3 text-left font-medium text-sm text-white hover:bg-surface-nested transition-colors cursor-grab active:cursor-grabbing select-none"
               >
                  <div
                     className="p-1 -ml-1 mr-1 text-text-tertiary hover:text-brand-2 rounded transition-colors shrink-0"
                     title="Drag category to reorder, move to day or across boards"
                     aria-label={`Drag category ${category.name}`}
                  >
                     <GripVertical className="h-4 w-4" />
                  </div>
                  <span className="truncate flex-1 pr-2">{category.name}</span>
                  <div
                     className="flex items-center gap-1.5 shrink-0"
                     onDragStart={(e) => e.stopPropagation()}
                     onClick={(e) => e.stopPropagation()}
                  >
                     <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                           <button
                              type="button"
                              className="p-1 rounded-md text-text-tertiary hover:text-white hover:bg-input-bg data-[state=open]:text-white data-[state=open]:bg-input-bg transition-colors"
                              title="Category options"
                              aria-label={`Options for category ${category.name}`}
                           >
                              <MoreVertical className="h-4 w-4" />
                           </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                           align="end"
                           className="min-w-dropdown-min"
                        >
                           {menuContent}
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
               {contextMenuContent}
            </ContextMenuContent>
         </ContextMenu>

         {!isCollapsed && (
            <div className="px-4 pb-3 pt-1 space-y-2.5 border-t border-border-strong">
               {children}
            </div>
         )}
      </div>
   );
}

export const TaskCategoryCard = memo(TaskCategoryCardComponent);
