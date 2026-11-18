// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTaskRowActions } from "./use-task-row-actions";

function buildHandlers(label: string) {
   return {
      toggleTaskExpand: vi.fn(),
      toggleDailyTask: vi.fn(),
      toggleWeeklyTask: vi.fn(),
      setTaskStatus: vi.fn(),
      handleTaskDragStart: vi.fn(),
      handleTaskDragOver: vi.fn(),
      handleTaskDrop: vi.fn(),
      handleDragEnd: vi.fn(),
      handleDeleteTask: vi.fn(),
      handleRolloverIncompleteTasks: vi.fn(),
      moveTaskToDay: vi.fn(),
      toggleTaskChallengeScope: vi.fn(),
      openEditTask: vi.fn(),
      label,
   };
}

describe("useTaskRowActions", () => {
   it("returns the same object identity across re-renders", () => {
      const { result, rerender } = renderHook(() =>
         useTaskRowActions(buildHandlers("first"))
      );

      const first = result.current;
      rerender();
      rerender();

      expect(result.current).toBe(first);
   });

   it("dispatches to the latest handlers without changing identity", () => {
      const initial = buildHandlers("initial");
      const { result, rerender } = renderHook(
         ({ handlers }) => useTaskRowActions(handlers),
         { initialProps: { handlers: initial } }
      );

      const actions = result.current;

      const latest = buildHandlers("latest");
      rerender({ handlers: latest });

      // Identity must not change, so memoized rows do not re-render.
      expect(result.current).toBe(actions);

      actions.onDelete(2, "task_1", "daily");
      expect(latest.handleDeleteTask).toHaveBeenCalledWith(
         2,
         "task_1",
         "daily"
      );
      expect(initial.handleDeleteTask).not.toHaveBeenCalled();
   });

   it("routes status toggles to the correct board handler", () => {
      const handlers = buildHandlers("routing");
      const { result } = renderHook(() => useTaskRowActions(handlers));

      const event = {} as React.MouseEvent;
      result.current.onToggleStatus(0, "t_1", "daily", event);
      expect(handlers.toggleDailyTask).toHaveBeenCalledWith(0, "t_1", event);

      result.current.onToggleStatus(1, "t_2", "weekly", event);
      expect(handlers.toggleWeeklyTask).toHaveBeenCalledWith(1, "t_2", event);
   });

   it("forwards the origin event to status actions", () => {
      const handlers = buildHandlers("status");
      const { result } = renderHook(() => useTaskRowActions(handlers));

      const event = {} as React.MouseEvent;
      result.current.onStatusAction(3, "t_9", "weekly", "COMPLETED", event);
      expect(handlers.setTaskStatus).toHaveBeenCalledWith(
         3,
         "t_9",
         "weekly",
         "COMPLETED",
         event
      );
   });
});
