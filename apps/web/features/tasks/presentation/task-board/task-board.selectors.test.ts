import { describe, expect, it } from "vitest";
import { getCalendarWeekDayOptions } from "@/features/study-logs/domain/challenge-day";
import type { CategoryItem } from "@/features/tasks/domain/task.types";
import type { BoardCategory, BoardTask } from "./task-board.types";
import {
   selectCategoryTotals,
   selectDailyCategoryOptions,
   selectDayTaskCounts,
   selectIndependentDailyCategoryOptions,
   selectIsTaskInWeeklyWeek,
   selectTaskDateKey,
   selectTasksForDateKey,
   selectVisibleWeeklyCategories,
   selectWeekScopedTotals,
   selectWeeklyCategoryOptions,
   applyPendingTasks,
} from "./task-board.selectors";

function task(overrides: Partial<BoardTask> = {}): BoardTask {
   return {
      id: "task_1",
      text: "Study",
      completed: false,
      ...overrides,
   };
}

function category(name: string, tasks: BoardTask[]): BoardCategory {
   return { id: name, name, isCollapsed: false, tasks };
}

function categoryItem(
   id: string,
   name: string,
   taskType: "DAILY" | "WEEKLY"
): CategoryItem {
   return {
      id,
      userId: "u_1",
      name,
      taskType,
      createdAt: new Date("2026-11-01T00:00:00Z"),
      updatedAt: new Date("2026-11-01T00:00:00Z"),
   };
}

const weeklyContext = {
   activeWeeklyAnchorDateKey: "2026-11-16",
   hasChallengeContext: false,
   linkableChallengeId: null,
   effectiveStartDate: undefined,
   isViewingCurrentWeeklyWeek: true,
};

describe("task-board selectors", () => {
   it("prefers dueDate, then createdAt, then the fallback for a task date key", () => {
      expect(
         selectTaskDateKey(task({ dueDate: "2026-11-18" }), "2026-11-17")
      ).toBe("2026-11-18");
      expect(
         selectTaskDateKey(
            task({ createdAt: "2026-11-10T12:00:00Z" }),
            "2026-11-17"
         )
      ).toBe("2026-11-10");
      expect(selectTaskDateKey(task(), "2026-11-17")).toBe("2026-11-17");
   });

   it("scopes a weekly task to the week of its explicit dueDate", () => {
      expect(
         selectIsTaskInWeeklyWeek(
            task({ dueDate: "2026-11-18" }),
            weeklyContext
         )
      ).toBe(true);
      expect(
         selectIsTaskInWeeklyWeek(
            task({ dueDate: "2026-11-05" }),
            weeklyContext
         )
      ).toBe(false);
   });

   it("falls back to the challenge start week for linked tasks without a dueDate", () => {
      expect(
         selectIsTaskInWeeklyWeek(task({ challengeId: "c_1" }), {
            ...weeklyContext,
            hasChallengeContext: true,
            linkableChallengeId: "c_1",
            effectiveStartDate: "2026-11-16T00:00:00Z",
         })
      ).toBe(true);
   });

   it("falls back to the createdAt week for personal tasks without a dueDate", () => {
      expect(
         selectIsTaskInWeeklyWeek(
            task({ createdAt: "2026-11-10T09:00:00Z" }),
            weeklyContext
         )
      ).toBe(false);
   });

   it("hides weekly tasks whose challenge results are locked", () => {
      const categories = [
         category("Sprint", [
            task({ id: "locked", challengeId: "c_done" }),
            task({ id: "personal" }),
         ]),
      ];
      const visible = selectVisibleWeeklyCategories(
         categories,
         new Set(["c_done"])
      );
      expect(visible[0].tasks.map((t) => t.id)).toEqual(["personal"]);
      expect(categories[0].tasks).toHaveLength(2);
   });

   it("counts totals and week-scoped totals", () => {
      const categories = [
         category("A", [
            task({ id: "a1", completed: true, dueDate: "2026-11-17" }),
            task({ id: "a2", dueDate: "2026-11-09" }),
         ]),
         category("B", [
            task({ id: "b1", completed: true, dueDate: "2026-11-18" }),
         ]),
      ];

      expect(selectCategoryTotals(categories)).toEqual({
         total: 3,
         completed: 2,
      });
      expect(
         selectWeekScopedTotals(categories, (t) =>
            selectIsTaskInWeeklyWeek(t, weeklyContext)
         )
      ).toEqual({ total: 2, completed: 2 });
   });

   it("selects tasks for a date key and fills day counts", () => {
      const categories = [
         category("A", [
            task({ id: "a1", dueDate: "2026-11-17" }),
            task({ id: "a2", dueDate: "2026-11-18", completed: true }),
         ]),
      ];
      const getDateKey = (t: BoardTask) => selectTaskDateKey(t, "2026-11-17");
      const dayOptions = getCalendarWeekDayOptions("2026-11-16", "2026-11-17");

      expect(
         selectTasksForDateKey(categories, "2026-11-18", getDateKey).map(
            (t) => t.id
         )
      ).toEqual(["a2"]);

      const counts = selectDayTaskCounts(dayOptions, categories, getDateKey);
      expect(counts.get("2026-11-17")).toEqual({ total: 1, completed: 0 });
      expect(counts.get("2026-11-18")).toEqual({ total: 1, completed: 1 });
   });

   it("keeps daily and weekly category options separate", () => {
      const categories = [
         categoryItem("c_w", "Sprint", "WEEKLY"),
         categoryItem("c_d", "Morning", "DAILY"),
      ];

      const weeklyOptions = selectWeeklyCategoryOptions(categories, []);
      const independentDaily = selectIndependentDailyCategoryOptions(
         categories,
         [],
         weeklyOptions
      );
      const dailyOptions = selectDailyCategoryOptions(
         weeklyOptions,
         independentDaily
      );

      expect(weeklyOptions).toEqual(["Sprint"]);
      expect(independentDaily).toEqual(["Morning"]);
      // A category belongs to exactly one board, so weekly names are not
      // offered as daily options.
      expect(dailyOptions).toEqual(["Morning"]);
   });
});

describe("applyPendingTasks", () => {
   function category(
      id: string,
      name: string,
      tasks: BoardTask[]
   ): BoardCategory {
      return { id, name, isCollapsed: false, tasks };
   }

   it("returns the same board reference when nothing is pending", () => {
      const board = {
         dailyCategories: [category("d1", "Daily", [task({ id: "a" })])],
         weeklyCategories: [],
      };
      const result = applyPendingTasks(board, board, new Set());
      expect(result).toBe(board);
   });

   it("keeps a pending task in its newer category", () => {
      const board = {
         dailyCategories: [
            category("cx", "X", [task({ id: "a" })]),
            category("cy", "Y", []),
         ],
         weeklyCategories: [],
      };
      const current = {
         dailyCategories: [
            category("cx", "X", []),
            category("cy", "Y", [task({ id: "a" })]),
         ],
         weeklyCategories: [],
      };

      const result = applyPendingTasks(board, current, new Set(["a"]));

      expect(result.dailyCategories[0].tasks).toHaveLength(0);
      expect(result.dailyCategories[1].tasks.map((t) => t.id)).toEqual(["a"]);
   });

   it("keeps a queued IndexedDB placement instead of the in-memory snapshot", () => {
      const board = {
         dailyCategories: [
            category("cx", "X", [task({ id: "a", syncState: "pending" })]),
            category("cy", "Y", []),
         ],
         weeklyCategories: [],
      };
      const current = {
         dailyCategories: [
            category("cx", "X", []),
            category("cy", "Y", [task({ id: "a" })]),
         ],
         weeklyCategories: [],
      };

      const result = applyPendingTasks(board, current, new Set(["a"]));

      // The queued record outranks the (older) server snapshot.
      expect(result.dailyCategories[0].tasks.map((t) => t.id)).toEqual(["a"]);
      expect(result.dailyCategories[1].tasks).toHaveLength(0);
   });

   it("keeps a pending task in its newer column", () => {
      const board = {
         dailyCategories: [category("d1", "Daily", [task({ id: "a" })])],
         weeklyCategories: [category("w1", "Weekly", [])],
      };
      const current = {
         dailyCategories: [category("d1", "Daily", [])],
         weeklyCategories: [category("w1", "Weekly", [task({ id: "a" })])],
      };

      const result = applyPendingTasks(board, current, new Set(["a"]));

      expect(result.dailyCategories[0].tasks).toHaveLength(0);
      expect(result.weeklyCategories[0].tasks.map((t) => t.id)).toEqual(["a"]);
   });

   it("adds a pending task that is absent from the snapshot", () => {
      const board = {
         dailyCategories: [category("d1", "Daily", [])],
         weeklyCategories: [],
      };
      const current = {
         dailyCategories: [category("d1", "Daily", [task({ id: "new" })])],
         weeklyCategories: [],
      };

      const result = applyPendingTasks(board, current, new Set(["new"]));

      expect(result.dailyCategories[0].tasks).toHaveLength(1);
   });

   it("lets the snapshot win for non-pending tasks", () => {
      const board = {
         dailyCategories: [
            category("d1", "Daily", [task({ id: "a", text: "from server" })]),
         ],
         weeklyCategories: [],
      };
      const current = {
         dailyCategories: [
            category("d1", "Daily", [task({ id: "a", text: "stale local" })]),
         ],
         weeklyCategories: [],
      };

      const result = applyPendingTasks(board, current, new Set());

      expect(result.dailyCategories[0].tasks[0].text).toBe("from server");
   });
});
