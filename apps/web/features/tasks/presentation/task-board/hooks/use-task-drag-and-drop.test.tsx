// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { useTaskDragAndDrop } from "./use-task-drag-and-drop";
import type { BoardCategory } from "../task-board.types";

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
});

function useHarness(initialCategories: BoardCategory[]) {
   const [weeklyCategories, setWeeklyCategories] =
      useState<BoardCategory[]>(initialCategories);
   const [dailyCategories, setDailyCategories] = useState<BoardCategory[]>([]);

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

   return { dnd, weeklyCategories };
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
