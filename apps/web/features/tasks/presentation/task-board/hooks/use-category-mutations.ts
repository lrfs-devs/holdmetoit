"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { isWeeklyTaskGraceExpired } from "@/features/tasks/domain/task-lock";
import { logTaskSync } from "@/features/tasks/data/local/task-idb";
import { scheduleSync } from "@/features/tasks/data/local/task-sync.service";
import { writeCollapsedCategoryIds } from "@/features/study-logs/presentation/cockpit/cockpit-tasks-storage";
import type { TaskBoardPersistence } from "./use-task-board-persistence";
import type {
   BoardCategory,
   BoardTask,
   DeleteCategoryModalState,
   EditCategoryModalState,
} from "../task-board.types";

export interface UseCategoryMutationsOptions {
   userId?: string | null;
   dailyCategories: BoardCategory[];
   weeklyCategories: BoardCategory[];
   setDailyCategories: Dispatch<SetStateAction<BoardCategory[]>>;
   setWeeklyCategories: Dispatch<SetStateAction<BoardCategory[]>>;
   dailyCategoryNameToId: Map<string, string>;
   weeklyCategoryNameToId: Map<string, string>;
   persistCategory: TaskBoardPersistence["persistCategory"];
   deleteCategoryWithMutation: TaskBoardPersistence["deleteCategoryWithMutation"];
   editCategoryModal: EditCategoryModalState | null;
   setEditCategoryModal: Dispatch<
      SetStateAction<EditCategoryModalState | null>
   >;
   deleteCategoryModal: DeleteCategoryModalState | null;
   setDeleteCategoryModal: Dispatch<
      SetStateAction<DeleteCategoryModalState | null>
   >;
   setCollapsedCategoryIds: Dispatch<SetStateAction<Set<string>>>;
   collapsedCategoryIdsRef: MutableRefObject<Set<string>>;
   getTaskDateKey: (task: BoardTask) => string;
   checkIsDayLocked: (dateKey: string) => boolean;
   /** Challenges whose results are locked; their goals cannot be deleted. */
   completedChallengeIdSet?: Set<string>;
}

export interface CategoryMutations {
   handleSaveEditCategory: (newName: string) => void;
   handleConfirmDeleteCategory: () => void;
}

/** Owns category rename and delete, including collapse-state cleanup. */
export function useCategoryMutations({
   userId,
   dailyCategories,
   weeklyCategories,
   setDailyCategories,
   setWeeklyCategories,
   dailyCategoryNameToId,
   weeklyCategoryNameToId,
   persistCategory,
   deleteCategoryWithMutation,
   editCategoryModal,
   setEditCategoryModal,
   deleteCategoryModal,
   setDeleteCategoryModal,
   setCollapsedCategoryIds,
   collapsedCategoryIdsRef,
   getTaskDateKey,
   checkIsDayLocked,
   completedChallengeIdSet,
}: UseCategoryMutationsOptions): CategoryMutations {
   const handleSaveEditCategory = (newName: string) => {
      if (!editCategoryModal || !newName.trim()) return;
      const oldName = editCategoryModal.name;
      const trimmed = newName.trim();
      const catType = editCategoryModal.taskType;
      const catId =
         editCategoryModal.id ||
         (catType === "daily"
            ? dailyCategoryNameToId.get(oldName) ||
              dailyCategories.find((c) => c.name === oldName)?.id
            : weeklyCategoryNameToId.get(oldName) ||
              weeklyCategories.find((c) => c.name === oldName)?.id);

      if (oldName === trimmed) {
         setEditCategoryModal(null);
         return;
      }

      setDailyCategories((prev) =>
         prev.map((cat) =>
            (catId && cat.id === catId) || cat.name === oldName
               ? { ...cat, name: trimmed }
               : cat
         )
      );
      setWeeklyCategories((prev) =>
         prev.map((cat) =>
            (catId && cat.id === catId) || cat.name === oldName
               ? { ...cat, name: trimmed }
               : cat
         )
      );

      if (catId) {
         persistCategory(
            {
               id: catId,
               userId: userId ?? null,
               name: trimmed,
               taskType: catType === "daily" ? "DAILY" : "WEEKLY",
               createdAt: new Date().toISOString(),
               updatedAt: new Date().toISOString(),
               syncState: "pending",
            },
            {
               id: crypto.randomUUID(),
               entityType: "CATEGORY",
               action: "UPDATE",
               payload: { categoryId: catId, name: trimmed },
               createdAt: Date.now(),
               retryCount: 0,
            }
         )
            .then(() => scheduleSync(userId))
            .catch(() => {});
      }

      logTaskSync("Category updated", { categoryId: catId, name: trimmed });
      setEditCategoryModal(null);
   };

   const handleConfirmDeleteCategory = () => {
      if (!deleteCategoryModal) return;
      const targetName = deleteCategoryModal.name;
      const catType = deleteCategoryModal.taskType;
      const catId =
         deleteCategoryModal.id ||
         dailyCategoryNameToId.get(targetName) ||
         weeklyCategoryNameToId.get(targetName) ||
         dailyCategories.find((c) => c.name === targetName)?.id ||
         weeklyCategories.find((c) => c.name === targetName)?.id;

      const dailyTargetCat = dailyCategories.find((c) =>
         catId ? c.id === catId : catType === "daily" && c.name === targetName
      );
      const hasLockedTasks = Boolean(
         dailyTargetCat?.tasks.some((t) => {
            const dateKey = getTaskDateKey(t);
            return checkIsDayLocked(dateKey);
         })
      );

      const weeklyTargetCat = weeklyCategories.find((c) =>
         catId ? c.id === catId : catType === "weekly" && c.name === targetName
      );
      const hasGraceLockedTasks = Boolean(
         weeklyTargetCat?.tasks.some((t) =>
            isWeeklyTaskGraceExpired({
               taskType: "WEEKLY",
               challengeId: t.challengeId,
               createdAt: t.createdAt ?? new Date(),
            })
         )
      );

      const hasResultsLockedTasks = Boolean(
         weeklyTargetCat?.tasks.some(
            (t) => t.challengeId && completedChallengeIdSet?.has(t.challengeId)
         )
      );

      if (hasLockedTasks || hasGraceLockedTasks || hasResultsLockedTasks) {
         setDeleteCategoryModal(null);
         return;
      }

      if (catType === "weekly") {
         setWeeklyCategories((prev) =>
            prev.filter((cat) =>
               catId ? cat.id !== catId : cat.name !== targetName
            )
         );
         setDailyCategories((prev) =>
            prev.filter((cat) =>
               catId ? cat.id !== catId : cat.name !== targetName
            )
         );
      } else {
         setDailyCategories((prev) =>
            prev.filter((cat) =>
               catId ? cat.id !== catId : cat.name !== targetName
            )
         );
      }

      if (catId) {
         deleteCategoryWithMutation(catId, {
            id: crypto.randomUUID(),
            entityType: "CATEGORY",
            action: "DELETE",
            payload: { categoryId: catId },
            createdAt: Date.now(),
            retryCount: 0,
         })
            .then(() => scheduleSync(userId))
            .catch(() => {});
      }

      if (catId || targetName) {
         setCollapsedCategoryIds((prev) => {
            const next = new Set(prev);
            if (catId) {
               next.delete(catId);
               next.delete(`daily:${catId}`);
               next.delete(`weekly:${catId}`);
            }
            if (targetName) {
               next.delete(targetName);
               next.delete(`daily:name:${targetName}`);
               next.delete(`weekly:name:${targetName}`);
            }
            writeCollapsedCategoryIds(userId, next);
            collapsedCategoryIdsRef.current = next;
            return next;
         });
      }

      logTaskSync("Category deleted", { categoryId: catId, name: targetName });
      setDeleteCategoryModal(null);
   };

   return { handleSaveEditCategory, handleConfirmDeleteCategory };
}
