"use client";

import { Lock } from "lucide-react";
import {
   formatDayDate,
   validateMoveTaskChallengeDay,
   type ChallengeDayOption,
} from "@/features/study-logs/domain/challenge-day";
import type { DragOverInfo, DraggedItem } from "../task-board.types";

export interface DayPillSwitcherProps {
   dayOptions: ChallengeDayOption[];
   selectedDateKey: string;
   dayTaskCounts: Map<string, { total: number; completed: number }>;
   draggedItem: DraggedItem | null;
   dragOverInfo: DragOverInfo | null;
   hasChallengeContext: boolean;
   effectiveTodayDate: string;
   checkIsDayLocked: (dateKey: string) => boolean;
   onSelectDay: (opt: ChallengeDayOption) => void;
   onDayPillDragOver: (e: React.DragEvent, opt: ChallengeDayOption) => void;
   onDayPillDrop: (e: React.DragEvent, opt: ChallengeDayOption) => void;
   onDragLeave: (opt: ChallengeDayOption) => void;
}

/** Seven day pills for the daily board. */
export function DayPillSwitcher({
   dayOptions,
   selectedDateKey,
   dayTaskCounts,
   draggedItem,
   dragOverInfo,
   hasChallengeContext,
   effectiveTodayDate,
   checkIsDayLocked,
   onSelectDay,
   onDayPillDragOver,
   onDayPillDrop,
   onDragLeave,
}: DayPillSwitcherProps) {
   return (
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
            const allDone = stats.total > 0 && stats.completed === stats.total;

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
                           isTargetDayLocked: checkIsDayLocked(opt.dateKey),
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
                  onClick={() => onSelectDay(opt)}
                  onDragOver={(e) => onDayPillDragOver(e, opt)}
                  onDragLeave={(e) => {
                     e.preventDefault();
                     onDragLeave(opt);
                  }}
                  onDrop={(e) => onDayPillDrop(e, opt)}
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
                     {draggedItem?.type === "task" && !isDropAllowedOnOpt ? (
                        <Lock className="h-2.5 w-2.5 text-red-400/70" />
                     ) : (
                        <>
                           {opt.isToday && (
                              <span
                                 className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                    isSelected ? "bg-brand-2" : "bg-emerald-400"
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
   );
}
