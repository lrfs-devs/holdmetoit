import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskRow } from "./task-row";
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

function renderRow(
   overrides: Partial<BoardTask> = {},
   variant: "daily" | "weekly" = "daily"
) {
   return renderToStaticMarkup(
      createElement(TaskRow, {
         task: task(overrides),
         variant,
         expanded: false,
         isDragging: false,
         isOver: false,
         onToggleExpand: noop,
         onToggleStatus: noop,
         onStatusAction: noop,
         onDragStart: noop,
         onDragOver: noop,
         onDrop: noop,
         onDragEnd: noop,
         onDelete: noop,
         menuContent: null,
         contextMenuContent: null,
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

   it("renders the completed treatment and hides the weekly completed badge", () => {
      const html = renderRow({ status: "COMPLETED", completed: true });
      expect(html).toContain("Completed");
      expect(html).toContain("line-through");

      const weekly = renderRow(
         { status: "COMPLETED", completed: true },
         "weekly"
      );
      expect(weekly).not.toContain("line-through decoration-rose-500/60");
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
});
