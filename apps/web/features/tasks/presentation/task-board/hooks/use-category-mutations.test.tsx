// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { useCategoryMutations } from "./use-category-mutations";
import type {
   BoardCategory,
   DeleteCategoryModalState,
} from "../task-board.types";

const persistCategory = vi.fn();
const deleteCategoryWithMutation = vi.fn();

beforeEach(() => {
   persistCategory.mockReset().mockResolvedValue(undefined);
   deleteCategoryWithMutation.mockReset().mockResolvedValue(undefined);
});

function harness(
   initialDaily: BoardCategory[],
   initialWeekly: BoardCategory[]
) {
   return renderHook(() => {
      const [dailyCategories, setDailyCategories] =
         useState<BoardCategory[]>(initialDaily);
      const [weeklyCategories, setWeeklyCategories] =
         useState<BoardCategory[]>(initialWeekly);
      const [editCategoryModal, setEditCategoryModal] = useState<{
         id?: string;
         name: string;
         taskType: "daily" | "weekly";
      } | null>(null);
      const [deleteCategoryModal, setDeleteCategoryModal] =
         useState<DeleteCategoryModalState | null>(null);
      const [collapsedCategoryIds, setCollapsedCategoryIds] = useState(
         new Set<string>()
      );

      const mutations = useCategoryMutations({
         userId: "u_1",
         dailyCategories,
         weeklyCategories,
         setDailyCategories,
         setWeeklyCategories,
         dailyCategoryNameToId: new Map([["Study", "cat_daily"]]),
         weeklyCategoryNameToId: new Map([["Study", "cat_weekly"]]),
         persistCategory,
         deleteCategoryWithMutation,
         editCategoryModal,
         setEditCategoryModal,
         deleteCategoryModal,
         setDeleteCategoryModal,
         setCollapsedCategoryIds,
         collapsedCategoryIdsRef: { current: collapsedCategoryIds },
         getTaskDateKey: () => "2026-11-17",
         checkIsDayLocked: () => false,
      });

      return {
         mutations,
         dailyCategories,
         weeklyCategories,
         setEditCategoryModal,
      };
   });
}

describe("useCategoryMutations — rename", () => {
   it("renames only the selected column when both share a name", () => {
      const { result } = harness(
         [
            {
               id: "cat_daily",
               name: "Study",
               isCollapsed: false,
               tasks: [],
            },
         ],
         [
            {
               id: "cat_weekly",
               name: "Study",
               isCollapsed: false,
               tasks: [],
            },
         ]
      );

      act(() => {
         result.current.setEditCategoryModal({
            id: "cat_weekly",
            name: "Study",
            taskType: "weekly",
         });
      });
      act(() => {
         result.current.mutations.handleSaveEditCategory("Weekly Study");
      });

      expect(result.current.weeklyCategories[0].name).toBe("Weekly Study");
      // The same-named daily category must be untouched.
      expect(result.current.dailyCategories[0].name).toBe("Study");
   });

   it("falls back to the old name when the modal has no id", () => {
      const { result } = harness(
         [
            {
               id: "cat_daily",
               name: "Study",
               isCollapsed: false,
               tasks: [],
            },
         ],
         []
      );

      act(() => {
         result.current.setEditCategoryModal({
            name: "Study",
            taskType: "daily",
         });
      });
      act(() => {
         result.current.mutations.handleSaveEditCategory("Focus");
      });

      expect(result.current.dailyCategories[0].name).toBe("Focus");
   });
});
