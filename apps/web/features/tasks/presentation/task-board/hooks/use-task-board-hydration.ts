"use client";

import {
   useEffect,
   useRef,
   type Dispatch,
   type MutableRefObject,
   type SetStateAction,
} from "react";
import {
   getAllLocalCategories,
   getAllLocalTasks,
   getQueuedMutationsForUser,
   logTaskSync,
   putLocalCategories,
   putLocalTasks,
} from "@/features/tasks/data/local/task-idb";
import {
   initTaskSync,
   TASKS_SYNCED_EVENT,
} from "@/features/tasks/data/local/task-sync.service";
import {
   isCategoryCollapsed,
   readCollapsedCategoryIds,
} from "@/features/study-logs/presentation/cockpit/cockpit-tasks-storage";
import type {
   TaskStatus,
   UserCategorizedTasks,
} from "@/features/tasks/domain/task.types";
import type {
   LocalCategoryRecord,
   LocalTaskRecord,
} from "@/features/tasks/domain/task-sync.types";
import {
   applyPendingTasks,
   mapLocalRecordsToBoard,
} from "../task-board.selectors";
import type { BoardCategory } from "../task-board.types";

export interface UseTaskBoardHydrationOptions {
   userId?: string | null;
   userTasks?: UserCategorizedTasks | null;
   collapsedCategoryIdsRef: MutableRefObject<Set<string>>;
   dailyCategoriesRef: MutableRefObject<BoardCategory[]>;
   weeklyCategoriesRef: MutableRefObject<BoardCategory[]>;
   setDailyCategories: Dispatch<SetStateAction<BoardCategory[]>>;
   setWeeklyCategories: Dispatch<SetStateAction<BoardCategory[]>>;
}

function buildSeedRecords(
   userTasks: UserCategorizedTasks | null | undefined,
   userId: string | null | undefined
): { seedCats: LocalCategoryRecord[]; seedTasks: LocalTaskRecord[] } {
   const seedCats: LocalCategoryRecord[] = (userTasks?.categories ?? [])
      .filter((c) => !c.isDeleted)
      .map((c) => ({
         id: c.id,
         userId: userId || null,
         name: c.name,
         taskType: c.taskType,
         sortOrder: c.sortOrder ?? 0,
         revision: c.revision,
         createdAt: new Date(c.createdAt).toISOString(),
         updatedAt: new Date(c.updatedAt).toISOString(),
         syncState: "synced",
      }));

   const seedTasks: LocalTaskRecord[] = [
      ...(userTasks?.dailyCategories ?? [])
         .filter((c) => !c.isDeleted)
         .flatMap((c) => c.tasks.filter((t) => !t.isDeleted)),
      ...(userTasks?.weeklyCategories ?? [])
         .filter((c) => !c.isDeleted)
         .flatMap((c) => c.tasks.filter((t) => !t.isDeleted)),
   ].map((t) => ({
      id: t.id,
      userId: userId || null,
      categoryId: t.categoryId,
      challengeId: t.challengeId ?? null,
      title: t.title,
      taskType: t.taskType,
      sortOrder: t.sortOrder ?? 0,
      isComplete: t.isComplete,
      status: (t.status as TaskStatus) || (t.isComplete ? "COMPLETED" : "TODO"),
      dueDate: t.dueDate ?? null,
      createdAt: new Date(t.createdAt).toISOString(),
      updatedAt: new Date(t.updatedAt).toISOString(),
      completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : null,
      revision: t.revision,
      syncState: "synced",
   }));

   return { seedCats, seedTasks };
}

/**
 * Mounts the task sync loop and keeps the board in step with IndexedDB.
 * Server data wins on first mount; queued mutations win over the snapshot.
 */
export function useTaskBoardHydration({
   userId,
   userTasks,
   collapsedCategoryIdsRef,
   dailyCategoriesRef,
   weeklyCategoriesRef,
   setDailyCategories,
   setWeeklyCategories,
}: UseTaskBoardHydrationOptions): void {
   // A record stored before this instant was restored from a previous visit;
   // anything newer was produced by this mount.
   const mountStartedAtRef = useRef(Date.now());

   useEffect(() => {
      const cleanup = initTaskSync(userId);
      let isCancelled = false;

      const handleSyncEvent = () => {
         if (!isCancelled) {
            logTaskSync("Live task sync event received, re-hydrating view...");
            hydrateFromIndexedDB({ isSyncEvent: true });
         }
      };

      if (typeof window !== "undefined") {
         window.addEventListener(TASKS_SYNCED_EVENT, handleSyncEvent);
      }

      async function hydrateFromIndexedDB(options?: { isSyncEvent?: boolean }) {
         try {
            const isSyncEvent = options?.isSyncEvent ?? false;
            const pendingMutations = userId
               ? await getQueuedMutationsForUser(userId)
               : [];
            const pendingTaskIds = new Set(
               pendingMutations.map((m) => {
                  const p = m.payload as Record<string, unknown>;
                  return String(p.taskId || p.id || "");
               })
            );
            pendingTaskIds.delete("");
            const hasServerTasks = Boolean(
               userTasks &&
               (userTasks.dailyCategories?.length > 0 ||
                  userTasks.weeklyCategories?.length > 0)
            );

            // On initial mount with no pending offline mutations and fresh server data,
            // do not overwrite fresh React state with stale IndexedDB records to prevent
            // a visual flash of old goals before sync finishes.
            if (
               !isSyncEvent &&
               hasServerTasks &&
               pendingMutations.length === 0
            ) {
               logTaskSync(
                  "Skipping initial IndexedDB state overwrite; seeding cache from server userTasks..."
               );
               if (
                  userTasks &&
                  userTasks.categories &&
                  userTasks.categories.length > 0
               ) {
                  const { seedCats, seedTasks } = buildSeedRecords(
                     userTasks,
                     userId
                  );

                  // The pending check runs inside each write transaction: a
                  // local edit committed while the categories were being
                  // written must not be replaced by server fields.
                  if (seedCats.length > 0) {
                     await putLocalCategories(seedCats, {
                        skipIfPending: true,
                     });
                  }
                  if (seedTasks.length > 0) {
                     await putLocalTasks(seedTasks, { skipIfPending: true });
                  }
               }
               return;
            }

            const localTasks = await getAllLocalTasks(userId ?? null);
            const localCats = await getAllLocalCategories(userId ?? null);

            if (isCancelled) return;

            if (localCats.length > 0 || localTasks.length > 0) {
               logTaskSync("Hydrated tasks from IndexedDB", {
                  cats: localCats.length,
                  tasks: localTasks.length,
               });

               const activeCollapsed =
                  collapsedCategoryIdsRef.current.size > 0
                     ? collapsedCategoryIdsRef.current
                     : readCollapsedCategoryIds(userId);

               const { dailyCategories, weeklyCategories, tasksToHeal } =
                  mapLocalRecordsToBoard(localTasks, localCats, {
                     isCollapsed: (column, category) =>
                        isCategoryCollapsed(column, category, activeCollapsed),
                  });

               if (tasksToHeal.length > 0) {
                  putLocalTasks(tasksToHeal).catch(() => {});
               }

               // Re-apply optimistic placements so a background sync cannot
               // undo an unacknowledged move (category, column, or day).
               const merged = applyPendingTasks(
                  { dailyCategories, weeklyCategories },
                  {
                     dailyCategories: dailyCategoriesRef.current,
                     weeklyCategories: weeklyCategoriesRef.current,
                  },
                  pendingTaskIds,
                  mountStartedAtRef.current
               );
               setDailyCategories(merged.dailyCategories);
               setWeeklyCategories(merged.weeklyCategories);
            } else if (userTasks && userTasks.categories.length > 0) {
               logTaskSync("Seeding IndexedDB from server userTasks...");
               const { seedCats, seedTasks } = buildSeedRecords(
                  userTasks,
                  userId
               );

               await putLocalCategories(seedCats);
               await putLocalTasks(seedTasks);
            }
         } catch (err) {
            logTaskSync("Error hydrating from IndexedDB:", err);
         }
      }

      hydrateFromIndexedDB({ isSyncEvent: false });

      return () => {
         isCancelled = true;
         if (typeof window !== "undefined") {
            window.removeEventListener(TASKS_SYNCED_EVENT, handleSyncEvent);
         }
         cleanup();
      };
   }, [
      userId,
      userTasks,
      collapsedCategoryIdsRef,
      dailyCategoriesRef,
      weeklyCategoriesRef,
      setDailyCategories,
      setWeeklyCategories,
   ]);
}
