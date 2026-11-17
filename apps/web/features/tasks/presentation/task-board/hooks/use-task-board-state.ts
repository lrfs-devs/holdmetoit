"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
   cleanupExpiredRolloverSnooze,
   getCollapsedCategoriesStorageKey,
   isRolloverSnoozedForDate,
   readCollapsedCategoryIds,
   setRolloverSnoozedForDate,
   toggleCategoryCollapseKey,
   writeCollapsedCategoryIds,
} from "@/features/study-logs/presentation/cockpit/cockpit-tasks-storage";
import type {
   TaskStatus,
   UserCategorizedTasks,
} from "@/features/tasks/domain/task.types";
import type { BoardCategory } from "../task-board.types";

export interface UseTaskBoardStateOptions {
   userId?: string | null;
   userTasks?: UserCategorizedTasks | null;
   initialCollapsedCategoryIds?: string[];
   initialIsRolloverSnoozed?: boolean;
   effectiveTodayDate: string;
}

export interface TaskBoardState {
   dailyCategories: BoardCategory[];
   setDailyCategories: React.Dispatch<React.SetStateAction<BoardCategory[]>>;
   weeklyCategories: BoardCategory[];
   setWeeklyCategories: React.Dispatch<React.SetStateAction<BoardCategory[]>>;
   expandedTaskIds: Set<string>;
   setExpandedTaskIds: React.Dispatch<React.SetStateAction<Set<string>>>;
   toggleTaskExpand: (taskId: string, e?: React.MouseEvent) => void;
   mobileActiveTab: "daily" | "weekly";
   setMobileActiveTab: React.Dispatch<React.SetStateAction<"daily" | "weekly">>;
   collapsedCategoryIds: Set<string>;
   setCollapsedCategoryIds: React.Dispatch<React.SetStateAction<Set<string>>>;
   collapsedCategoryIdsRef: React.MutableRefObject<Set<string>>;
   toggleDailyCollapse: (index: number) => void;
   toggleWeeklyCollapse: (index: number) => void;
   isRolloverSnoozed: boolean;
   setIsRolloverSnoozed: React.Dispatch<React.SetStateAction<boolean>>;
   isRolloverDismissed: boolean;
   setIsRolloverDismissed: React.Dispatch<React.SetStateAction<boolean>>;
   handleSnoozeRolloverToday: () => void;
}

function mapServerCategories(
   categories: UserCategorizedTasks["dailyCategories"] | undefined
): BoardCategory[] {
   if (!categories || categories.length === 0) return [];

   return categories
      .filter((c) => !c.isDeleted)
      .map((c) => ({
         id: c.id,
         name: c.name,
         sortOrder: c.sortOrder ?? 0,
         createdAt: c.createdAt
            ? typeof c.createdAt === "string"
               ? c.createdAt
               : c.createdAt.toISOString()
            : undefined,
         updatedAt: c.updatedAt
            ? typeof c.updatedAt === "string"
               ? c.updatedAt
               : c.updatedAt.toISOString()
            : undefined,
         isCollapsed: false,
         tasks: c.tasks
            .filter((t) => !t.isDeleted)
            .map((t) => ({
               id: t.id,
               text: t.title,
               completed: t.isComplete,
               status:
                  (t.status as TaskStatus) ||
                  (t.isComplete ? "COMPLETED" : "TODO"),
               dueDate: t.dueDate ?? null,
               createdAt: t.createdAt
                  ? new Date(t.createdAt).toISOString()
                  : undefined,
               challengeId: t.challengeId ?? null,
            })),
      }));
}

/**
 * Owns the board's local UI state: board arrays, expansion, collapse persistence,
 * the mobile tab, and the rollover snooze flag.
 */
export function useTaskBoardState({
   userId,
   userTasks,
   initialCollapsedCategoryIds,
   initialIsRolloverSnoozed,
   effectiveTodayDate,
}: UseTaskBoardStateOptions): TaskBoardState {
   const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(
      () => new Set()
   );
   const [mobileActiveTab, setMobileActiveTab] = useState<"daily" | "weekly">(
      "daily"
   );

   const toggleTaskExpand = useCallback(
      (taskId: string, e?: React.MouseEvent) => {
         e?.preventDefault();
         e?.stopPropagation();
         setExpandedTaskIds((prev) => {
            const next = new Set(prev);
            if (next.has(taskId)) {
               next.delete(taskId);
            } else {
               next.add(taskId);
            }
            return next;
         });
      },
      []
   );

   const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<
      Set<string>
   >(() => {
      if (initialCollapsedCategoryIds !== undefined) {
         return new Set(
            initialCollapsedCategoryIds.filter(
               (k) =>
                  typeof k === "string" &&
                  (k.startsWith("daily:") || k.startsWith("weekly:"))
            )
         );
      }
      return readCollapsedCategoryIds(userId);
   });
   const collapsedCategoryIdsRef = useRef<Set<string>>(collapsedCategoryIds);
   collapsedCategoryIdsRef.current = collapsedCategoryIds;

   useEffect(() => {
      const stored = readCollapsedCategoryIds(userId);
      if (stored.size > 0) {
         setCollapsedCategoryIds(stored);
         collapsedCategoryIdsRef.current = stored;
         writeCollapsedCategoryIds(userId, stored);
      }
   }, [userId]);

   useEffect(() => {
      if (typeof window === "undefined") return;
      const handleStorage = (e: StorageEvent) => {
         if (e.key === getCollapsedCategoriesStorageKey(userId)) {
            const stored = readCollapsedCategoryIds(userId);
            setCollapsedCategoryIds(stored);
            collapsedCategoryIdsRef.current = stored;
         }
      };
      window.addEventListener("storage", handleStorage);
      return () => {
         window.removeEventListener("storage", handleStorage);
      };
   }, [userId]);

   const [dailyCategories, setDailyCategories] = useState<BoardCategory[]>(() =>
      mapServerCategories(userTasks?.dailyCategories)
   );

   const [weeklyCategories, setWeeklyCategories] = useState<BoardCategory[]>(
      () => mapServerCategories(userTasks?.weeklyCategories)
   );

   const [isRolloverSnoozed, setIsRolloverSnoozed] = useState<boolean>(
      Boolean(initialIsRolloverSnoozed)
   );
   const [isRolloverDismissed, setIsRolloverDismissed] = useState(false);

   useEffect(() => {
      cleanupExpiredRolloverSnooze(userId, effectiveTodayDate);
      const isSnoozed = isRolloverSnoozedForDate(userId, effectiveTodayDate);
      if (isSnoozed) {
         if (!isRolloverSnoozed) {
            setIsRolloverSnoozed(true);
         }
         // Sync to cookie so all future reloads have the cookie on the server
         setRolloverSnoozedForDate(userId, effectiveTodayDate);
      }
   }, [userId, effectiveTodayDate, isRolloverSnoozed]);

   const handleSnoozeRolloverToday = useCallback(() => {
      setIsRolloverDismissed(true);
      setIsRolloverSnoozed(true);
      setRolloverSnoozedForDate(userId, effectiveTodayDate);
   }, [userId, effectiveTodayDate]);

   const toggleDailyCollapse = (index: number) => {
      const targetCat = dailyCategories[index];
      if (!targetCat) return;

      const nextCollapsed = toggleCategoryCollapseKey(
         "daily",
         targetCat,
         collapsedCategoryIds
      );
      setCollapsedCategoryIds(nextCollapsed);
      collapsedCategoryIdsRef.current = nextCollapsed;
      writeCollapsedCategoryIds(userId, nextCollapsed);
   };

   const toggleWeeklyCollapse = (index: number) => {
      const targetCat = weeklyCategories[index];
      if (!targetCat) return;

      const nextCollapsed = toggleCategoryCollapseKey(
         "weekly",
         targetCat,
         collapsedCategoryIds
      );
      setCollapsedCategoryIds(nextCollapsed);
      collapsedCategoryIdsRef.current = nextCollapsed;
      writeCollapsedCategoryIds(userId, nextCollapsed);
   };

   return {
      dailyCategories,
      setDailyCategories,
      weeklyCategories,
      setWeeklyCategories,
      expandedTaskIds,
      setExpandedTaskIds,
      toggleTaskExpand,
      mobileActiveTab,
      setMobileActiveTab,
      collapsedCategoryIds,
      setCollapsedCategoryIds,
      collapsedCategoryIdsRef,
      toggleDailyCollapse,
      toggleWeeklyCollapse,
      isRolloverSnoozed,
      setIsRolloverSnoozed,
      isRolloverDismissed,
      setIsRolloverDismissed,
      handleSnoozeRolloverToday,
   };
}
