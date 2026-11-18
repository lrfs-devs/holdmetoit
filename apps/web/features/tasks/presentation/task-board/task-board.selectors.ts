import {
   formatWeekRange,
   getCalendarWeekDayOptions,
   getChallengeDayOptions,
   isSameCalendarWeek,
   type ChallengeDayOption,
} from "@/features/study-logs/domain/challenge-day";
import type {
   CategoryItem,
   TaskStatus,
} from "@/features/tasks/domain/task.types";
import type {
   LocalCategoryRecord,
   LocalTaskRecord,
} from "@/features/tasks/domain/task-sync.types";
import type { BoardCategory, BoardTask } from "./task-board.types";

export interface DayOptionContext {
   hasChallengeContext: boolean;
   effectiveStartDate?: string;
   effectiveTodayDate: string;
   totalChallengeDays: number;
}

export interface WeeklyWeekFilterContext {
   activeWeeklyAnchorDateKey: string;
   hasChallengeContext: boolean;
   linkableChallengeId: string | null;
   effectiveStartDate?: string;
   isViewingCurrentWeeklyWeek: boolean;
}

/** Resolves "today" for the board, ignoring a completed challenge's stale date. */
export function selectEffectiveTodayDate(params: {
   hasChallengeContext: boolean;
   challengeStatus?: "UPCOMING" | "ACTIVE" | "COMPLETED";
   todayDate?: string;
}): string {
   if (!params.hasChallengeContext && params.challengeStatus === "COMPLETED") {
      return new Date().toISOString().slice(0, 10);
   }
   return params.todayDate || new Date().toISOString().slice(0, 10);
}

/** Builds the seven day pills for the selected week. */
export function selectDayOptions(
   context: DayOptionContext,
   activeWeekAnchorDateKey: string
): ChallengeDayOption[] {
   const {
      hasChallengeContext,
      effectiveStartDate,
      effectiveTodayDate,
      totalChallengeDays,
   } = context;

   if (hasChallengeContext && effectiveStartDate) {
      const challengeOptions = getChallengeDayOptions(
         effectiveStartDate,
         effectiveTodayDate,
         totalChallengeDays
      ).slice(0, 7);

      const anchorKey = activeWeekAnchorDateKey.slice(0, 10);
      const startKey = effectiveStartDate.slice(0, 10);

      const isViewingChallengeWeek =
         challengeOptions.some((d) => d.dateKey === anchorKey) ||
         isSameCalendarWeek(anchorKey, startKey);

      if (isViewingChallengeWeek) {
         return challengeOptions;
      }
   }

   return getCalendarWeekDayOptions(
      activeWeekAnchorDateKey,
      effectiveTodayDate
   ).slice(0, 7);
}

export function selectTodayDayOption(
   dayOptions: ChallengeDayOption[]
): ChallengeDayOption {
   return dayOptions.find((d) => d.isToday) || dayOptions[0];
}

export function selectInitialDayOption(
   dayOptions: ChallengeDayOption[],
   initialSelectedDateKey?: string
): ChallengeDayOption | undefined {
   if (!initialSelectedDateKey) return undefined;
   return dayOptions.find((d) => d.dateKey === initialSelectedDateKey);
}

export function selectActiveDayOption(
   dayOptions: ChallengeDayOption[],
   selectedDateKey: string,
   todayDayOption?: ChallengeDayOption
): ChallengeDayOption {
   return (
      dayOptions.find((d) => d.dateKey === selectedDateKey) ||
      todayDayOption ||
      dayOptions[0]
   );
}

export function selectActiveWeekDateKeys(
   activeWeekAnchorDateKey: string,
   effectiveTodayDate: string,
   dayOptions: ChallengeDayOption[]
): string[] {
   const calendarDays = getCalendarWeekDayOptions(
      activeWeekAnchorDateKey,
      effectiveTodayDate
   );
   const keys = new Set(calendarDays.map((d) => d.dateKey));
   dayOptions.forEach((d) => keys.add(d.dateKey));
   return Array.from(keys);
}

export function selectWeekRangeLabel(
   activeWeekAnchorDateKey: string,
   effectiveTodayDate: string,
   dayOptions: ChallengeDayOption[]
): string {
   const calendarDays = getCalendarWeekDayOptions(
      activeWeekAnchorDateKey,
      effectiveTodayDate
   );
   if (calendarDays.length >= 7) {
      return formatWeekRange(calendarDays[0].dateKey, calendarDays[6].dateKey);
   }
   if (dayOptions.length > 0) {
      return formatWeekRange(
         dayOptions[0].dateKey,
         dayOptions[dayOptions.length - 1].dateKey
      );
   }
   return "";
}

export function selectActiveWeeklyWeekDateKeys(
   activeWeeklyAnchorDateKey: string,
   effectiveTodayDate: string
): string[] {
   return getCalendarWeekDayOptions(
      activeWeeklyAnchorDateKey,
      effectiveTodayDate
   ).map((d) => d.dateKey);
}

export function selectWeeklyRangeLabel(
   activeWeeklyAnchorDateKey: string,
   effectiveTodayDate: string
): string {
   const calendarDays = getCalendarWeekDayOptions(
      activeWeeklyAnchorDateKey,
      effectiveTodayDate
   );
   if (calendarDays.length >= 7) {
      return formatWeekRange(calendarDays[0].dateKey, calendarDays[6].dateKey);
   }
   return "";
}

export function selectIsViewingCurrentWeeklyWeek(
   activeWeeklyAnchorDateKey: string,
   effectiveTodayDate: string
): boolean {
   return isSameCalendarWeek(activeWeeklyAnchorDateKey, effectiveTodayDate);
}

/** Normalizes a task date value (string or Date) to a YYYY-MM-DD key. */
export function toDateKey(value: string | Date): string {
   return typeof value === "string"
      ? value.slice(0, 10)
      : new Date(value).toISOString().slice(0, 10);
}

export function selectTaskDateKey(
   task: BoardTask,
   fallbackDate: string
): string {
   if (task.dueDate) {
      return toDateKey(task.dueDate);
   }
   if (task.createdAt) {
      return toDateKey(task.createdAt);
   }
   return fallbackDate;
}

/** A weekly task is scoped to the calendar week of its due date, else its origin week. */
export function selectIsTaskInWeeklyWeek(
   task: BoardTask,
   context: WeeklyWeekFilterContext
): boolean {
   if (task.dueDate) {
      return isSameCalendarWeek(
         toDateKey(task.dueDate),
         context.activeWeeklyAnchorDateKey
      );
   }

   if (
      context.hasChallengeContext &&
      task.challengeId &&
      task.challengeId === context.linkableChallengeId
   ) {
      const challengeAnchor = context.effectiveStartDate
         ? toDateKey(context.effectiveStartDate)
         : task.createdAt
           ? toDateKey(task.createdAt)
           : null;
      if (challengeAnchor) {
         return isSameCalendarWeek(
            challengeAnchor,
            context.activeWeeklyAnchorDateKey
         );
      }
      return context.isViewingCurrentWeeklyWeek;
   }

   if (task.createdAt) {
      return isSameCalendarWeek(
         toDateKey(task.createdAt),
         context.activeWeeklyAnchorDateKey
      );
   }

   return context.isViewingCurrentWeeklyWeek;
}

export function selectCompletedChallengeIdSet(
   completedChallengeIds: string[] | undefined,
   challengeStatus: "UPCOMING" | "ACTIVE" | "COMPLETED" | undefined,
   challengeId: string | undefined
): Set<string> {
   const ids = new Set(completedChallengeIds ?? []);
   if (challengeStatus === "COMPLETED" && challengeId) {
      ids.add(challengeId);
   }
   return ids;
}

export function selectVisibleWeeklyCategories(
   weeklyCategories: BoardCategory[],
   completedChallengeIdSet: Set<string>
): BoardCategory[] {
   return weeklyCategories.map((category) => ({
      ...category,
      tasks: category.tasks.filter(
         (task) =>
            !(task.challengeId && completedChallengeIdSet.has(task.challengeId))
      ),
   }));
}

export function selectWeeklyCategoryOptions(
   categories: CategoryItem[] | undefined,
   weeklyCategories: BoardCategory[]
): string[] {
   return Array.from(
      new Set([
         ...(categories
            ?.filter((c) => c.taskType === "WEEKLY")
            .map((c) => c.name) ?? []),
         ...weeklyCategories.map((c) => c.name),
      ])
   );
}

/**
 * Daily categories are their own set: a category is never shared with the
 * weekly column, so weekly names are not offered here.
 */
export function selectIndependentDailyCategoryOptions(
   categories: CategoryItem[] | undefined,
   dailyCategories: BoardCategory[],
   _weeklyCategoryOptions?: string[]
): string[] {
   return Array.from(
      new Set([
         ...(categories
            ?.filter((c) => c.taskType === "DAILY")
            .map((c) => c.name) ?? []),
         ...dailyCategories.map((c) => c.name),
      ])
   );
}

export function selectDailyCategoryOptions(
   _weeklyCategoryOptions: string[],
   independentDailyCategoryOptions: string[]
): string[] {
   return Array.from(new Set([...independentDailyCategoryOptions]));
}

export function selectWeeklyCategoryNameToId(
   categories: CategoryItem[] | undefined
): Map<string, string> {
   return new Map(
      categories
         ?.filter((c) => c.taskType === "WEEKLY")
         .map((c) => [c.name, c.id]) ?? []
   );
}

export function selectDailyCategoryNameToId(
   categories: CategoryItem[] | undefined,
   weeklyCategories: BoardCategory[],
   dailyCategories: BoardCategory[]
): Map<string, string> {
   return new Map([
      ...(categories?.map((c) => [c.name, c.id] as [string, string]) ?? []),
      ...weeklyCategories
         .filter((c) => Boolean(c.id))
         .map((c) => [c.name, c.id!] as [string, string]),
      ...dailyCategories
         .filter((c) => Boolean(c.id))
         .map((c) => [c.name, c.id!] as [string, string]),
   ]);
}

export function selectCategoryTotals(categories: BoardCategory[]): {
   total: number;
   completed: number;
} {
   let total = 0;
   let completed = 0;
   for (const category of categories) {
      total += category.tasks.length;
      completed += category.tasks.filter((t) => t.completed).length;
   }
   return { total, completed };
}

export function selectTasksForDateKey(
   categories: BoardCategory[],
   dateKey: string,
   getDateKey: (task: BoardTask) => string
): BoardTask[] {
   return categories.flatMap((cat) =>
      cat.tasks.filter((t) => getDateKey(t) === dateKey)
   );
}

export function selectDayTaskCounts(
   dayOptions: ChallengeDayOption[],
   dailyCategories: BoardCategory[],
   getDateKey: (task: BoardTask) => string
): Map<string, { total: number; completed: number }> {
   const counts = new Map<string, { total: number; completed: number }>();
   for (const opt of dayOptions) {
      counts.set(opt.dateKey, { total: 0, completed: 0 });
   }
   for (const cat of dailyCategories) {
      for (const task of cat.tasks) {
         const key = getDateKey(task);
         const entry = counts.get(key);
         if (entry) {
            entry.total += 1;
            if (task.completed) entry.completed += 1;
         } else {
            counts.set(key, { total: 1, completed: task.completed ? 1 : 0 });
         }
      }
   }
   return counts;
}

export function selectWeekScopedTotals(
   categories: BoardCategory[],
   isInWeek: (task: BoardTask) => boolean
): { total: number; completed: number } {
   let total = 0;
   let completed = 0;
   for (const category of categories) {
      for (const task of category.tasks) {
         if (!isInWeek(task)) continue;
         total += 1;
         if (task.completed) completed += 1;
      }
   }
   return { total, completed };
}

export interface LocalBoardMappingOptions {
   isCollapsed: (
      column: "daily" | "weekly",
      category: LocalCategoryRecord
   ) => boolean;
}

export interface LocalBoardMapping {
   dailyCategories: BoardCategory[];
   weeklyCategories: BoardCategory[];
   tasksToHeal: LocalTaskRecord[];
}

function compareLocalRecords(
   a: { sortOrder?: number; createdAt?: string; id?: string },
   b: { sortOrder?: number; createdAt?: string; id?: string }
): number {
   const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
   if (orderDiff !== 0) return orderDiff;
   const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
   const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
   if (aTime !== bTime) return aTime - bTime;
   return (a.id || "").localeCompare(b.id || "");
}

/**
 * Rebuilds the daily/weekly board from IndexedDB records.
 * Pure: the caller supplies the collapse lookup.
 */
export function mapLocalRecordsToBoard(
   localTasks: LocalTaskRecord[],
   localCats: LocalCategoryRecord[],
   options: LocalBoardMappingOptions
): LocalBoardMapping {
   const sortedCats = [...localCats]
      .filter((c) => !c.isDeleted)
      .sort(compareLocalRecords);
   const sortedTasks = [...localTasks]
      .filter((t) => !t.isDeleted)
      .sort(compareLocalRecords);

   const tasksToHeal: LocalTaskRecord[] = [];

   const toBoardTask = (t: LocalTaskRecord): BoardTask => {
      const effectiveDueDate = t.dueDate
         ? typeof t.dueDate === "string"
            ? t.dueDate.slice(0, 10)
            : new Date(t.dueDate).toISOString().slice(0, 10)
         : null;
      const effectiveStatus =
         (t.status as TaskStatus) || (t.isComplete ? "COMPLETED" : "TODO");

      if (!t.status) {
         tasksToHeal.push({
            ...t,
            dueDate: effectiveDueDate,
            status: effectiveStatus,
         });
      }

      return {
         id: t.id,
         text: t.title,
         completed: t.isComplete,
         status: effectiveStatus,
         dueDate: effectiveDueDate,
         createdAt: t.createdAt,
         updatedAt: t.updatedAt,
         challengeId: t.challengeId ?? null,
         syncState: t.syncState,
      };
   };

   const dailyCategories = sortedCats
      .filter(
         (c) =>
            c.taskType === "DAILY" ||
            sortedTasks.some(
               (t) => t.categoryId === c.id && t.taskType === "DAILY"
            )
      )
      .map((c) => ({
         id: c.id,
         name: c.name,
         sortOrder: c.sortOrder ?? 0,
         createdAt: c.createdAt,
         updatedAt: c.updatedAt,
         isCollapsed: options.isCollapsed("daily", c),
         tasks: sortedTasks
            .filter((t) => t.categoryId === c.id && t.taskType === "DAILY")
            .map(toBoardTask),
      }));

   const weeklyCategories = sortedCats
      .filter((c) => c.taskType === "WEEKLY")
      .map((c) => ({
         id: c.id,
         name: c.name,
         sortOrder: c.sortOrder ?? 0,
         createdAt: c.createdAt,
         updatedAt: c.updatedAt,
         isCollapsed: options.isCollapsed("weekly", c),
         tasks: sortedTasks
            .filter((t) => t.categoryId === c.id && t.taskType === "WEEKLY")
            .map(toBoardTask),
      }));

   return { dailyCategories, weeklyCategories, tasksToHeal };
}

export interface BoardSnapshot {
   dailyCategories: BoardCategory[];
   weeklyCategories: BoardCategory[];
}

/**
 * Re-applies optimistic task placements on top of a freshly hydrated board.
 *
 * Pending tasks are removed from wherever the snapshot put them and re-inserted
 * into the category they currently occupy in memory, so an unacknowledged move
 * (category, column, or day) is not undone by a background sync.
 */
export function applyPendingTasks(
   board: BoardSnapshot,
   current: BoardSnapshot,
   pendingTaskIds: Set<string>
): BoardSnapshot {
   if (pendingTaskIds.size === 0) return board;

   // IndexedDB is authoritative for rows that are still pending. Overlaying
   // the in-memory snapshot would replace a queued offline edit with the older
   // server copy. Only rows whose stored record is already synced get the
   // in-memory overlay (a move that exists only in React state).
   const storedTasks = new Map<string, BoardTask>();
   for (const category of [
      ...board.dailyCategories,
      ...board.weeklyCategories,
   ]) {
      for (const task of category.tasks) {
         storedTasks.set(task.id, task);
      }
   }

   const currentTasks = new Map<string, BoardTask>();
   for (const category of [
      ...current.dailyCategories,
      ...current.weeklyCategories,
   ]) {
      for (const task of category.tasks) {
         if (!pendingTaskIds.has(task.id)) continue;
         const stored = storedTasks.get(task.id);
         // A queued record outranks the server snapshot: it holds the user's
         // offline edit, which the snapshot predates. Legacy records without a
         // syncState keep the previous overlay behaviour.
         if (stored?.syncState && stored.syncState !== "synced") continue;
         currentTasks.set(task.id, task);
      }
   }

   if (currentTasks.size === 0) return board;

   const strip = (categories: BoardCategory[]): BoardCategory[] =>
      categories.map((category) => ({
         ...category,
         tasks: category.tasks.filter((task) => !currentTasks.has(task.id)),
      }));

   const insertInto = (
      categories: BoardCategory[],
      categoryId: string | undefined,
      categoryName: string,
      task: BoardTask
   ): boolean => {
      const index = categories.findIndex(
         (category) =>
            (categoryId && category.id === categoryId) ||
            category.name === categoryName
      );
      if (index === -1) return false;

      const target = categories[index];
      categories[index] = {
         ...target,
         tasks: [...target.tasks, task].sort((a, b) =>
            (a.text || "").localeCompare(b.text || "")
         ),
      };
      return true;
   };

   const nextDaily = strip(board.dailyCategories);
   const nextWeekly = strip(board.weeklyCategories);

   for (const [taskId, task] of currentTasks) {
      const currentCategory = [
         ...current.dailyCategories,
         ...current.weeklyCategories,
      ].find((category) => category.tasks.some((t) => t.id === taskId));
      if (!currentCategory) continue;

      const isDaily = current.dailyCategories.some((category) =>
         category.tasks.some((t) => t.id === taskId)
      );
      const targetBoard = isDaily ? nextDaily : nextWeekly;

      if (
         !insertInto(
            targetBoard,
            currentCategory.id,
            currentCategory.name,
            task
         )
      ) {
         // The category is not in the snapshot (created locally, not yet
         // synced): keep the whole current category.
         const exists = targetBoard.some(
            (category) =>
               (currentCategory.id && category.id === currentCategory.id) ||
               category.name === currentCategory.name
         );
         if (!exists) targetBoard.push(currentCategory);
      }
   }

   return { dailyCategories: nextDaily, weeklyCategories: nextWeekly };
}
