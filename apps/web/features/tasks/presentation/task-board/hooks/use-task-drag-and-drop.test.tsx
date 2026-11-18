// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { useTaskDragAndDrop } from "./use-task-drag-and-drop";
import type { BoardCategory } from "../task-board.types";

const { commitLocalBatchMock } = vi.hoisted(() => ({
   commitLocalBatchMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/features/tasks/data/local/task-idb", async (importOriginal) => {
   const actual =
      await importOriginal<
         typeof import("@/features/tasks/data/local/task-idb")
      >();
   return { ...actual, commitLocalBatch: commitLocalBatchMock };
});

const userCategories: BoardCategory[] = [
   {
      id: "cat_x",
      name: "X",
      isCollapsed: false,
      tasks: [
         { id: "a", text: "A", completed: false, status: "TODO" },
         { id: "b", text: "B", completed: false, status: "TODO" },
      ],
   },
   {
      id: "cat_y",
      name: "Y",
      isCollapsed: false,
      tasks: [{ id: "c", text: "C", completed: false, status: "TODO" }],
   },
];

const persistTask = vi.fn();
const persistTasks = vi.fn();
const persistCategory = vi.fn();

beforeEach(() => {
   persistTask.mockReset().mockResolvedValue(undefined);
   persistTasks.mockReset().mockResolvedValue(undefined);
   persistCategory.mockReset().mockResolvedValue(undefined);
   commitLocalBatchMock.mockReset().mockResolvedValue(undefined);
});

function useHarness(
   initialCategories: BoardCategory[],
   initialDailyCategories: BoardCategory[] = []
) {
   const [weeklyCategories, setWeeklyCategories] =
      useState<BoardCategory[]>(initialCategories);
   const [dailyCategories, setDailyCategories] = useState<BoardCategory[]>(
      initialDailyCategories
   );

   const dnd = useTaskDragAndDrop({
      userId: "u_1",
      isLoggedIn: true,
      dailyCategories,
      weeklyCategories,
      setDailyCategories,
      setWeeklyCategories,
      selectedDateKey: "2026-11-17",
      activeWeeklyAnchorDateKey: "2026-11-17",
      effectiveTodayDate: "2026-11-17",
      hasChallengeContext: false,
      isPastDayLocked: false,
      dayOptions: [],
      checkIsDayLocked: () => false,
      getTaskDateKey: () => "2026-11-17",
      moveTaskToDay: vi.fn(),
      moveCategoryToDayAction: vi.fn(),
      commitTaskMove: vi.fn(),
      persistTask,
      persistTasks,
      persistCategory,
   });

   return { dnd, weeklyCategories, dailyCategories };
}

function dragEvent() {
   return {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      currentTarget: Object.assign(document.createElement("div"), {
         getBoundingClientRect: () => ({ top: 0, height: 20 }),
      }),
      clientY: 15,
      dataTransfer: { effectAllowed: "", dropEffect: "", setData: vi.fn() },
   } as unknown as React.DragEvent;
}

describe("useTaskDragAndDrop — cross-category drop", () => {
   it("emits MOVE with identity fields plus REORDER for ordering", () => {
      const { result } = renderHook(() => useHarness(userCategories));

      act(() => {
         result.current.dnd.handleTaskDragStart(dragEvent(), "a", 0, "weekly");
      });

      // Drop task "a" onto task "c", which lives in a different category.
      act(() => {
         result.current.dnd.handleTaskDrop(dragEvent(), "c", 1, "weekly");
      });

      expect(persistTask).toHaveBeenCalledTimes(1);
      const [, moveMutation] = persistTask.mock.calls[0];
      expect(moveMutation.action).toBe("MOVE");
      expect(moveMutation.payload).toMatchObject({
         taskId: "a",
         categoryId: "cat_y",
         taskType: "WEEKLY",
      });

      expect(persistTasks).toHaveBeenCalledTimes(1);
      const [, reorderMutation] = persistTasks.mock.calls[0];
      expect(reorderMutation.action).toBe("REORDER");
      expect(reorderMutation.payload.taskIds).toContain("a");
      expect(reorderMutation.payload.taskIds).toContain("c");
   });

   it("emits only REORDER for an intra-category drop", () => {
      const { result } = renderHook(() => useHarness(userCategories));

      act(() => {
         result.current.dnd.handleTaskDragStart(dragEvent(), "a", 0, "weekly");
      });
      act(() => {
         result.current.dnd.handleTaskDrop(dragEvent(), "b", 0, "weekly");
      });

      expect(persistTask).not.toHaveBeenCalled();
      expect(persistTasks).toHaveBeenCalledTimes(1);
      expect(persistTasks.mock.calls[0][1].action).toBe("REORDER");
   });
});

describe("useTaskDragAndDrop — intra-category ordering", () => {
   it("drops a task one slot down instead of two", () => {
      const { result } = renderHook(() => useHarness(userCategories));

      act(() => {
         result.current.dnd.handleTaskDragStart(dragEvent(), "a", 0, "weekly");
      });
      act(() => {
         result.current.dnd.handleTaskDragOver(dragEvent(), "b", 0, "weekly");
      });
      act(() => {
         result.current.dnd.handleTaskDrop(dragEvent(), "b", 0, "weekly");
      });

      const tasks = result.current.weeklyCategories[0].tasks.map((t) => t.id);
      expect(tasks).toEqual(["b", "a"]);
   });
});

describe("useTaskDragAndDrop — column and header drops", () => {
   it("persists the whole destination order for a category-header drop", () => {
      const { result } = renderHook(() => useHarness(userCategories));

      act(() => {
         result.current.dnd.handleTaskDragStart(dragEvent(), "c", 1, "weekly");
      });
      act(() => {
         result.current.dnd.handleCategoryDrop(dragEvent(), 0, "weekly");
      });

      // The moved task is first and the siblings keep distinct slots.
      const reorderCall = persistTasks.mock.calls.find(
         ([, mutation]) => mutation.action === "REORDER"
      );
      expect(reorderCall?.[1].payload.taskIds).toEqual(["c", "a", "b"]);
   });

   it("creates a weekly category when a daily task is dropped on an empty column", () => {
      const daily: BoardCategory[] = [
         {
            id: "cat_d",
            name: "Daily",
            isCollapsed: false,
            tasks: [{ id: "d1", text: "D1", completed: false, status: "TODO" }],
         },
      ];
      const { result } = renderHook(() => useHarness([], daily));

      act(() => {
         result.current.dnd.handleTaskDragStart(dragEvent(), "d1", 0, "daily");
      });
      act(() => {
         result.current.dnd.handleColumnDrop(dragEvent(), "weekly");
      });

      // The category and its first task land in a single batch: a task that
      // points at an unpersisted category is unloadable.
      expect(commitLocalBatchMock).toHaveBeenCalledTimes(1);
      const batch = commitLocalBatchMock.mock.calls[0][0];
      expect(batch.categories).toHaveLength(1);
      expect(batch.tasks).toHaveLength(1);
      const actions = batch.mutations.map(
         (mutation: { entityType: string; action: string }) =>
            `${mutation.entityType}/${mutation.action}`
      );
      expect(actions).toEqual(["CATEGORY/CREATE", "TASK/MOVE"]);
      expect(batch.mutations[0].payload).toMatchObject({
         taskType: "WEEKLY",
      });
      expect(result.current.weeklyCategories[0].tasks.map((t) => t.id)).toEqual(
         ["d1"]
      );
   });

   it("restores the source column when the empty-column batch fails", async () => {
      const daily: BoardCategory[] = [
         {
            id: "cat_d",
            name: "Daily",
            isCollapsed: false,
            tasks: [{ id: "d1", text: "D1", completed: false, status: "TODO" }],
         },
      ];
      commitLocalBatchMock.mockRejectedValueOnce(new Error("idb down"));
      const { result } = renderHook(() => useHarness([], daily));

      act(() => {
         result.current.dnd.handleTaskDragStart(dragEvent(), "d1", 0, "daily");
      });
      await act(async () => {
         result.current.dnd.handleColumnDrop(dragEvent(), "weekly");
      });

      expect(result.current.weeklyCategories).toHaveLength(0);
      expect(result.current.dailyCategories[0].tasks.map((t) => t.id)).toEqual([
         "d1",
      ]);
   });

   it("sends the viewed week with members moved to the weekly column", () => {
      const daily: BoardCategory[] = [
         {
            id: "cat_d",
            name: "Daily",
            isCollapsed: false,
            tasks: [{ id: "d1", text: "D1", completed: false, status: "TODO" }],
         },
      ];
      const { result } = renderHook(() => useHarness([], daily));

      act(() => {
         result.current.dnd.handleCategoryDragStart(dragEvent(), 0, "daily");
      });
      act(() => {
         result.current.dnd.handleCategoryDrop(dragEvent(), 0, "weekly");
      });

      const batch = commitLocalBatchMock.mock.calls[0]?.[0];
      const moveCall = (batch?.mutations ?? []).find(
         (mutation: { action: string; entityType: string }) =>
            mutation.action === "MOVE" && mutation.entityType === "TASK"
      );
      expect(moveCall?.payload).toMatchObject({
         taskType: "WEEKLY",
         dueDate: "2026-11-17",
      });
   });
});
