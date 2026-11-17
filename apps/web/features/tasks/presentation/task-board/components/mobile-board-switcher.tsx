"use client";

export interface MobileBoardSwitcherProps {
   activeTab: "daily" | "weekly";
   onTabChange: (tab: "daily" | "weekly") => void;
   dailyCompleted: number;
   dailyTotal: number;
   weeklyCompleted: number;
   weeklyTotal: number;
}

/** Small-screen Daily/Weekly segmented switcher. */
export function MobileBoardSwitcher({
   activeTab,
   onTabChange,
   dailyCompleted,
   dailyTotal,
   weeklyCompleted,
   weeklyTotal,
}: MobileBoardSwitcherProps) {
   return (
      <div
         role="tablist"
         aria-label="Tasks board view switcher"
         className="flex sm:hidden items-center justify-between p-1 rounded-2xl bg-surface-primary border border-border-default mb-4"
      >
         <button
            type="button"
            role="tab"
            aria-selected={activeTab === "daily"}
            onClick={() => onTabChange("daily")}
            className={`flex-1 min-h-control-sm py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
               activeTab === "daily"
                  ? "bg-white text-black shadow-sm"
                  : "text-text-tertiary hover:text-white"
            }`}
         >
            <span>Daily</span>
            <span
               className={`px-1.5 py-0.5 rounded-full text-micro font-semibold tabular-nums ${
                  activeTab === "daily"
                     ? "bg-black/10 text-black"
                     : "bg-surface-nested text-text-tertiary"
               }`}
            >
               {dailyCompleted}/{dailyTotal}
            </span>
         </button>
         <button
            type="button"
            role="tab"
            aria-selected={activeTab === "weekly"}
            onClick={() => onTabChange("weekly")}
            className={`flex-1 min-h-control-sm py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
               activeTab === "weekly"
                  ? "bg-white text-black shadow-sm"
                  : "text-text-tertiary hover:text-white"
            }`}
         >
            <span>Weekly</span>
            <span
               className={`px-1.5 py-0.5 rounded-full text-micro font-semibold tabular-nums ${
                  activeTab === "weekly"
                     ? "bg-black/10 text-black"
                     : "bg-surface-nested text-text-tertiary"
               }`}
            >
               {weeklyCompleted}/{weeklyTotal}
            </span>
         </button>
      </div>
   );
}
