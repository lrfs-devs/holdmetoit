import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskCategoryCard } from "./task-category-card";
import type { BoardCategory } from "../task-board.types";

const noop = vi.fn();

const category: BoardCategory = {
   id: "cat_1",
   name: "Morning Focus",
   isCollapsed: false,
   tasks: [],
};

function renderCard(isCollapsed: boolean) {
   return renderToStaticMarkup(
      createElement(
         TaskCategoryCard,
         {
            category,
            variant: "daily",
            isCollapsed,
            isDragging: false,
            isOver: false,
            onToggleCollapse: noop,
            onDragStart: noop,
            onDragOver: noop,
            onDrop: noop,
            onDragEnd: noop,
            menuContent: createElement("span", null, "menu"),
            contextMenuContent: createElement("span", null, "context"),
         },
         createElement("p", null, "task list contents")
      )
   );
}

describe("TaskCategoryCard", () => {
   it("renders the category header, drag metadata and options trigger", () => {
      const html = renderCard(false);
      expect(html).toContain("Morning Focus");
      expect(html).toContain('data-drag-card="category"');
      expect(html).toContain('aria-label="Options for category Morning Focus"');
      expect(html).toContain('aria-label="Drag category Morning Focus"');
   });

   it("renders the task list when expanded", () => {
      expect(renderCard(false)).toContain("task list contents");
   });

   it("hides the task list when collapsed", () => {
      expect(renderCard(true)).not.toContain("task list contents");
   });
});
