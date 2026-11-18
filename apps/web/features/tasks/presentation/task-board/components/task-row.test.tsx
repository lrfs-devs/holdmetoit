import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskRow } from "./task-row";
import type { TaskRowActions } from "../hooks/use-task-row-actions";
import type { BoardTask } from "../task-board.types";

function task(overrides: Partial<BoardTask> = {}): BoardTask {
   return {
      id: "t_1",
      text: "Study Chemistry",
      completed: false,
      status: "TODO",
      ...overrides,
   };
}

const noop = vi.fn();

const actions: TaskRowActions = {
   onToggleExpand: noop,
   onToggleStatus: noop,
   onStatusAction: noop,
   onDragStart: noop,
   onDragOver: noop,
   onDrop: noop,
   onDragEnd: noop,
   onDelete: noop,
   onRollover: noop,
   onSetStatus: noop,
   onMoveToDay: noop,
   onEditTask: noop,
   onToggleChallengeScope: noop,
};

function renderRow(
   overrides: Partial<BoardTask> = {},
   variant: "daily" | "weekly" = "daily",
   isResultsLocked = false
) {
   return renderToStaticMarkup(
      createElement(TaskRow, {
         task: task(overrides),
         catIdx: 0,
         variant,
         expanded: false,
         isDragging: false,
         isOver: false,
         actions,
         hasChallengeContext: false,
         linkableChallengeId: null,
         effectiveTodayDate: "2026-11-17",
         selectedDateKey: "2026-11-17",
         dayOptions: [],
         showRollover: false,
         isResultsLocked,
      })
   );
}

describe("TaskRow", () => {
   it("renders the task text and drag metadata", () => {
      const html = renderRow();
      expect(html).toContain("Study Chemistry");
      expect(html).toContain('data-drag-card="task"');
      expect(html).toContain('data-task-id="t_1"');
      expect(html).toContain('aria-label="Drag task Study Chemistry"');
   });

   it("renders the completed treatment", () => {
      const html = renderRow({ status: "COMPLETED", completed: true });
      expect(html).toContain("Completed");
      expect(html).toContain("line-through");
   });

   it("omits the weekly completed badge", () => {
      const weekly = renderRow(
         { status: "COMPLETED", completed: true },
         "weekly"
      );
      expect(weekly).not.toContain(">Completed<");
   });

   it("shows a Show more control for long descriptions", () => {
      const html = renderRow({
         text: "A very long study task description that exceeds the limit",
      });
      expect(html).toContain("Show more");
   });

   it("does not show the control for short descriptions", () => {
      expect(renderRow()).not.toContain("Show more");
   });

   it("makes every mutating control inert for a results-locked goal", () => {
      const html = renderRow({}, "weekly", true);

      // The drag handle is no longer draggable and advertises the lock.
      expect(html).not.toMatch(/draggable="true"/);
      expect(html).toContain("this goal is read-only");

      // Status badge and delete are disabled.
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>To-Do<\/button>/);
      expect(html).toMatch(/aria-label="Delete task Study Chemistry"[^>]*/);
      expect(html.match(/disabled=""/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
   });

   it("keeps expand and the options menu available when locked", () => {
      const html = renderRow(
         { text: "A very long study task description that exceeds the limit" },
         "weekly",
         true
      );

      expect(html).toContain("Show more");
      expect(html).toContain("Options for task");
   });

   it("leaves unlocked rows fully interactive", () => {
      const html = renderRow({}, "weekly", false);
      expect(html).not.toContain("this goal is read-only");
      expect(html).not.toContain('disabled=""');
   });
});
