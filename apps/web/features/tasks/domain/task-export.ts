/**
 * Pure domain functions for exporting Daily and Weekly Todo lists into Discord-ready text.
 * Law L7: Pure domain isolation (zero React, Next.js, or external UI dependencies).
 */

export type TaskExportStyle = "markdown" | "emoji";

export interface ExportableTaskItem {
   id?: string;
   title?: string;
   text?: string;
   completed?: boolean;
   isComplete?: boolean;
   status?: "TODO" | "IN_PROGRESS" | "COMPLETED" | "CROSSED_OUT";
   challengeId?: string | null;
   isChallengeGoal?: boolean;
}

export interface ExportableCategoryGroup {
   id?: string;
   name: string;
   tasks: ExportableTaskItem[];
}

export interface TaskProgressStats {
   total: number;
   completed: number;
   percentage: number;
}

export interface DailyExportParams {
   dateKey: string;
   dateLabel?: string;
   dayNumber?: number | null;
   categories: ExportableCategoryGroup[];
   style?: TaskExportStyle;
}

export interface WeeklyExportParams {
   weekRangeLabel: string;
   weekNumber?: number | null;
   categories: ExportableCategoryGroup[];
   style?: TaskExportStyle;
}

/** Formats a YYYY-MM-DD date key into a friendly date string (e.g. "Monday, Nov 9, 2026"). */
export function formatFullDayDate(dateKey: string): string {
   try {
      const parts = dateKey.split("-").map(Number);
      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
         const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
         return date.toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
         });
      }
   } catch {}
   return dateKey;
}

/** Determines whether an exportable task is completed. */
export function isTaskCompleted(task: ExportableTaskItem): boolean {
   return (
      task.status === "COMPLETED" || Boolean(task.completed || task.isComplete)
   );
}

/** Calculates total, completed, and completion percentage for a set of categorized tasks. */
export function calculateTaskProgress(
   categories: ExportableCategoryGroup[]
): TaskProgressStats {
   let total = 0;
   let completed = 0;

   for (const cat of categories) {
      for (const t of cat.tasks) {
         total += 1;
         if (isTaskCompleted(t)) {
            completed += 1;
         }
      }
   }

   const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
   return { total, completed, percentage };
}

/** Formats an individual task line based on export style and status. */
export function formatTaskLine(
   task: ExportableTaskItem,
   style: TaskExportStyle = "markdown"
): string {
   const rawTitle = (task.title ?? task.text ?? "").trim() || "Untitled Task";
   const completed = isTaskCompleted(task);
   const isChallenge = Boolean(task.isChallengeGoal || task.challengeId);
   const goalBadge = isChallenge ? "🏆 " : "";

   if (task.status === "CROSSED_OUT") {
      if (style === "emoji") {
         return `❌ ${goalBadge}~~${rawTitle}~~`;
      }
      return `- [ ] ${goalBadge}~~${rawTitle}~~`;
   }

   if (task.status === "IN_PROGRESS") {
      if (style === "emoji") {
         return `⏳ ${goalBadge}${rawTitle}`;
      }
      return `- [ ] ⏳ ${goalBadge}${rawTitle}`;
   }

   if (completed) {
      if (style === "emoji") {
         return `✅ ${goalBadge}${rawTitle}`;
      }
      return `- [x] ${goalBadge}${rawTitle}`;
   }

   // Default TODO
   if (style === "emoji") {
      return `⬜ ${goalBadge}${rawTitle}`;
   }
   return `- [ ] ${goalBadge}${rawTitle}`;
}

/**
 * Formats Daily Todos into a Discord-ready markdown or high-contrast emoji string.
 */
export function formatDailyTasksExport({
   dateKey,
   dateLabel,
   dayNumber,
   categories,
   style = "markdown",
}: DailyExportParams): string {
   const resolvedDateLabel = dateLabel?.trim() || formatFullDayDate(dateKey);
   const daySuffix = dayNumber && dayNumber > 0 ? ` (Day ${dayNumber})` : "";

   const titleLine =
      style === "emoji"
         ? `**📋 DAILY TODOS — ${resolvedDateLabel}${daySuffix}**`
         : `## 📋 Daily Todos — ${resolvedDateLabel}${daySuffix}`;

   const activeCategories = categories.filter(
      (c) => c.tasks && c.tasks.length > 0
   );
   const stats = calculateTaskProgress(categories);

   const sections: string[] = [titleLine, ""];

   if (activeCategories.length === 0) {
      sections.push("*(No tasks scheduled)*", "");
   } else {
      for (const cat of activeCategories) {
         const categoryHeader =
            style === "emoji"
               ? `**📂 ${cat.name || "General"}**`
               : `### 📂 ${cat.name || "General"}`;

         const taskLines = cat.tasks
            .map((t) => formatTaskLine(t, style))
            .join("\n");
         sections.push(categoryHeader, taskLines, "");
      }
   }

   const progressLine =
      stats.total > 0
         ? `> 📊 **Progress:** ${stats.completed}/${stats.total} completed (${stats.percentage}%) • *HoldMeToIt*`
         : `> 📊 **Progress:** 0/0 tasks • *HoldMeToIt*`;

   sections.push(progressLine);

   return sections.join("\n");
}

/**
 * Formats Weekly Todos into a Discord-ready markdown or high-contrast emoji string.
 */
export function formatWeeklyTasksExport({
   weekRangeLabel,
   weekNumber,
   categories,
   style = "markdown",
}: WeeklyExportParams): string {
   const weekSuffix =
      weekNumber && weekNumber > 0 ? ` (Week ${weekNumber})` : "";

   const titleLine =
      style === "emoji"
         ? `**🗓️ WEEKLY TODOS — ${weekRangeLabel}${weekSuffix}**`
         : `## 🗓️ Weekly Todos — ${weekRangeLabel}${weekSuffix}`;

   const activeCategories = categories.filter(
      (c) => c.tasks && c.tasks.length > 0
   );
   const stats = calculateTaskProgress(categories);

   const sections: string[] = [titleLine, ""];

   if (activeCategories.length === 0) {
      sections.push("*(No tasks scheduled)*", "");
   } else {
      for (const cat of activeCategories) {
         const categoryHeader =
            style === "emoji"
               ? `**📂 ${cat.name || "General"}**`
               : `### 📂 ${cat.name || "General"}`;

         const taskLines = cat.tasks
            .map((t) => formatTaskLine(t, style))
            .join("\n");
         sections.push(categoryHeader, taskLines, "");
      }
   }

   const progressLine =
      stats.total > 0
         ? `> 📊 **Progress:** ${stats.completed}/${stats.total} completed (${stats.percentage}%) • *HoldMeToIt*`
         : `> 📊 **Progress:** 0/0 tasks • *HoldMeToIt*`;

   sections.push(progressLine);

   return sections.join("\n");
}
