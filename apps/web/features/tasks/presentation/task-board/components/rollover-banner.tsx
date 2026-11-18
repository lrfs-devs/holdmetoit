"use client";

import { RotateCcw, X } from "lucide-react";
import {
   ROLLOVER_SNOOZE_COOKIE,
   ROLLOVER_SNOOZE_STORAGE_PREFIX,
} from "@/features/study-logs/presentation/cockpit/cockpit-tasks-storage";

export interface RolloverSummaryView {
   yesterdayIncompleteCount: number;
   totalPastIncompleteCount: number;
   selectedDayIncompleteCount: number;
   isViewingPastDay: boolean;
}

export interface RolloverBannerProps {
   summary: RolloverSummaryView;
   isActiveDayToday: boolean;
   isDismissed: boolean;
   isSnoozed: boolean;
   userId?: string | null;
   effectiveTodayDate: string;
   onRolloverAll: () => void;
   onRolloverDay: () => void;
   onSnooze: () => void;
}

/** Rollover helper banners shown above the daily task list. */
export function RolloverBanner({
   summary,
   isActiveDayToday,
   isDismissed,
   isSnoozed,
   userId,
   effectiveTodayDate,
   onRolloverAll,
   onRolloverDay,
   onSnooze,
}: RolloverBannerProps) {
   return (
      <>
         {isActiveDayToday &&
            summary.totalPastIncompleteCount > 0 &&
            !isDismissed &&
            !isSnoozed && (
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
                        ).replace(/</g, "\\u003c")};var u=${JSON.stringify(
                           userId && userId.trim().length > 0
                              ? userId.trim()
                              : "guest"
                        ).replace(/</g, "\\u003c")};var d=${JSON.stringify(
                           effectiveTodayDate
                        ).replace(/</g, "\\u003c")};var c=${JSON.stringify(
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
                              {summary.yesterdayIncompleteCount > 0 &&
                              summary.totalPastIncompleteCount ===
                                 summary.yesterdayIncompleteCount
                                 ? `${summary.yesterdayIncompleteCount} incomplete task${
                                      summary.yesterdayIncompleteCount > 1
                                         ? "s"
                                         : ""
                                   } from yesterday`
                                 : `${summary.totalPastIncompleteCount} incomplete task${
                                      summary.totalPastIncompleteCount > 1
                                         ? "s"
                                         : ""
                                   } from earlier days`}
                           </p>
                           <p className="text-meta text-text-tertiary mt-0.5">
                              Carry over unfinished tasks to today with one
                              click.
                           </p>
                        </div>
                     </div>
                     <button
                        type="button"
                        onClick={onSnooze}
                        aria-label="Dismiss rollover helper"
                        className="p-1 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-elevated transition-colors shrink-0 -mr-1 -mt-1"
                     >
                        <X className="h-4 w-4" />
                     </button>
                  </div>
                  <div className="flex items-center flex-wrap gap-2 pt-0.5">
                     <button
                        type="button"
                        onClick={() => onRolloverAll()}
                        data-testid="rollover-all-button"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition-colors shadow-sm"
                     >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Roll over to Today</span>
                     </button>
                     <button
                        type="button"
                        onClick={onSnooze}
                        title="Don't remind today"
                        data-testid="rollover-snooze-today-button"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-xl text-text-tertiary hover:text-text-primary hover:bg-surface-elevated transition-colors border border-border-subtle/60 hover:border-border-subtle"
                     >
                        <span>Don&apos;t remind today</span>
                     </button>
                  </div>
               </div>
            )}

         {summary.isViewingPastDay &&
            summary.selectedDayIncompleteCount > 0 && (
               <div
                  data-testid="rollover-past-day-banner"
                  className="p-2.5 rounded-xl bg-surface-nested border border-amber-500/20 flex items-center justify-between gap-2 animate-in fade-in duration-200"
               >
                  <div className="flex items-center gap-2 text-xs text-text-secondary min-w-0">
                     <RotateCcw className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                     <span className="truncate">
                        {summary.selectedDayIncompleteCount} incomplete task
                        {summary.selectedDayIncompleteCount > 1 ? "s" : ""} on
                        this day
                     </span>
                  </div>
                  <button
                     type="button"
                     onClick={() => onRolloverDay()}
                     data-testid="rollover-day-button"
                     className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-colors shrink-0"
                  >
                     <RotateCcw className="h-3 w-3" />
                     <span>Roll over to Today</span>
                  </button>
               </div>
            )}
      </>
   );
}
