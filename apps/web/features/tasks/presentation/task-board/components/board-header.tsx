"use client";

import type { ReactNode } from "react";
import { Lock } from "lucide-react";

export interface BoardHeaderProps {
   title: string;
   badgeLabel?: string;
   showTodayDot?: boolean;
   isLocked?: boolean;
   completed: number;
   total: number;
   /** Extra badge rendered next to the title (e.g. weekly challenge goals). */
   extraBadge?: ReactNode;
   children?: ReactNode;
}

/** Title row shared by the daily and weekly columns. */
export function BoardHeader({
   title,
   badgeLabel,
   showTodayDot,
   isLocked,
   completed,
   total,
   extraBadge,
   children,
}: BoardHeaderProps) {
   return (
      <>
         <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 shrink-0">
               <h3 className="text-lg font-bold text-white shrink-0">
                  {title}
               </h3>
               {extraBadge}
               <span className="px-2 py-0.5 rounded-full text-meta font-semibold bg-surface-nested text-text-secondary border border-border-strong inline-flex items-center gap-1.5 shrink-0">
                  {badgeLabel}
                  {showTodayDot && (
                     <span
                        className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                        title="Today"
                     />
                  )}
                  {isLocked && (
                     <span className="text-label text-text-tertiary flex items-center gap-1 font-normal">
                        <Lock className="h-3 w-3 text-text-tertiary" />
                        Locked
                     </span>
                  )}
               </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
               <span className="text-xs font-semibold text-text-secondary whitespace-nowrap">
                  {completed}/{total} Completed
               </span>
            </div>
         </div>
         {children}
      </>
   );
}
