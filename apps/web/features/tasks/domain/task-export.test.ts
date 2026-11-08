import { describe, it, expect } from "vitest";
import {
   formatFullDayDate,
   isTaskCompleted,
   calculateTaskProgress,
   formatTaskLine,
   formatDailyTasksExport,
   formatWeeklyTasksExport,
   type ExportableCategoryGroup,
} from "./task-export";

describe("task-export domain", () => {
   describe("formatFullDayDate", () => {
      it("formats valid YYYY-MM-DD date key to friendly weekday and date", () => {
         const result = formatFullDayDate("2026-11-09");
         expect(result).toBe("Monday, Nov 9, 2026");
      });

      it("returns original string on invalid format", () => {
         expect(formatFullDayDate("invalid-date")).toBe("invalid-date");
      });
   });

   describe("isTaskCompleted", () => {
      it("returns true when status is COMPLETED", () => {
         expect(isTaskCompleted({ status: "COMPLETED" })).toBe(true);
      });

      it("returns true when completed flag is true", () => {
         expect(isTaskCompleted({ completed: true })).toBe(true);
      });

      it("returns true when isComplete flag is true", () => {
         expect(isTaskCompleted({ isComplete: true })).toBe(true);
      });

      it("returns false for TODO or incomplete tasks", () => {
         expect(isTaskCompleted({ status: "TODO", completed: false })).toBe(
            false
         );
         expect(isTaskCompleted({})).toBe(false);
      });
   });

   describe("calculateTaskProgress", () => {
      it("calculates progress statistics across categories accurately", () => {
         const categories: ExportableCategoryGroup[] = [
            {
               name: "Math",
               tasks: [
                  { title: "Task 1", completed: true },
                  { title: "Task 2", status: "TODO" },
               ],
            },
            {
               name: "Physics",
               tasks: [
                  { title: "Task 3", status: "COMPLETED" },
                  { title: "Task 4", status: "IN_PROGRESS" },
               ],
            },
         ];

         const stats = calculateTaskProgress(categories);
         expect(stats.total).toBe(4);
         expect(stats.completed).toBe(2);
         expect(stats.percentage).toBe(50);
      });

      it("handles zero tasks safely without NaN", () => {
         const stats = calculateTaskProgress([]);
         expect(stats.total).toBe(0);
         expect(stats.completed).toBe(0);
         expect(stats.percentage).toBe(0);
      });
   });

   describe("formatTaskLine", () => {
      it("formats standard TODO task in markdown and emoji styles", () => {
         const task = { title: "Study algorithms" };
         expect(formatTaskLine(task, "markdown")).toBe(
            "- [ ] Study algorithms"
         );
         expect(formatTaskLine(task, "emoji")).toBe("⬜ Study algorithms");
      });

      it("formats completed task in markdown and emoji styles", () => {
         const task = { text: "Review PR #260", completed: true };
         expect(formatTaskLine(task, "markdown")).toBe("- [x] Review PR #260");
         expect(formatTaskLine(task, "emoji")).toBe("✅ Review PR #260");
      });

      it("formats IN_PROGRESS task with hourglass", () => {
         const task = { title: "Write tests", status: "IN_PROGRESS" as const };
         expect(formatTaskLine(task, "markdown")).toBe("- [ ] ⏳ Write tests");
         expect(formatTaskLine(task, "emoji")).toBe("⏳ Write tests");
      });

      it("formats CROSSED_OUT task with strikethrough", () => {
         const task = {
            title: "Cancelled meeting",
            status: "CROSSED_OUT" as const,
         };
         expect(formatTaskLine(task, "markdown")).toBe(
            "- [ ] ~~Cancelled meeting~~"
         );
         expect(formatTaskLine(task, "emoji")).toBe("❌ ~~Cancelled meeting~~");
      });

      it("includes trophy badge for challenge goals", () => {
         const challengeTask = {
            title: "Score 4 hours",
            challengeId: "ch-123",
            completed: false,
         };
         expect(formatTaskLine(challengeTask, "markdown")).toBe(
            "- [ ] 🏆 Score 4 hours"
         );
         expect(formatTaskLine(challengeTask, "emoji")).toBe(
            "⬜ 🏆 Score 4 hours"
         );

         const completedChallenge = {
            title: "Score 4 hours",
            isChallengeGoal: true,
            status: "COMPLETED" as const,
         };
         expect(formatTaskLine(completedChallenge, "markdown")).toBe(
            "- [x] 🏆 Score 4 hours"
         );
         expect(formatTaskLine(completedChallenge, "emoji")).toBe(
            "✅ 🏆 Score 4 hours"
         );
      });

      it("defaults untitled tasks gracefully", () => {
         expect(formatTaskLine({}, "markdown")).toBe("- [ ] Untitled Task");
      });
   });

   describe("formatDailyTasksExport", () => {
      it("formats daily todos in Discord markdown format with day number and date", () => {
         const categories: ExportableCategoryGroup[] = [
            {
               name: "Computer Science",
               tasks: [
                  { text: "Implement WebSocket", status: "COMPLETED" },
                  { text: "Refactor connection pool", status: "IN_PROGRESS" },
               ],
            },
            {
               name: "Empty Category",
               tasks: [],
            },
            {
               name: "Mathematics",
               tasks: [{ text: "Calculus problem set", status: "TODO" }],
            },
         ];

         const output = formatDailyTasksExport({
            dateKey: "2026-11-09",
            dayNumber: 2,
            categories,
            style: "markdown",
         });

         expect(output).toContain(
            "## 📋 Daily Todos — Monday, Nov 9, 2026 (Day 2)"
         );
         expect(output).toContain("### 📂 Computer Science");
         expect(output).toContain("- [x] Implement WebSocket");
         expect(output).toContain("- [ ] ⏳ Refactor connection pool");
         expect(output).not.toContain("Empty Category");
         expect(output).toContain("### 📂 Mathematics");
         expect(output).toContain("- [ ] Calculus problem set");
         expect(output).toContain(
            "> 📊 **Progress:** 1/3 completed (33%) • *HoldMeToIt*"
         );
      });

      it("formats daily todos in high-contrast emoji format", () => {
         const categories: ExportableCategoryGroup[] = [
            {
               name: "Biology",
               tasks: [
                  { text: "Read Chapter 4", status: "COMPLETED" },
                  { text: "Lab notes", status: "TODO" },
               ],
            },
         ];

         const output = formatDailyTasksExport({
            dateKey: "2026-11-09",
            categories,
            style: "emoji",
         });

         expect(output).toContain("**📋 DAILY TODOS — Monday, Nov 9, 2026**");
         expect(output).toContain("**📂 Biology**");
         expect(output).toContain("✅ Read Chapter 4");
         expect(output).toContain("⬜ Lab notes");
         expect(output).toContain(
            "> 📊 **Progress:** 1/2 completed (50%) • *HoldMeToIt*"
         );
      });

      it("handles days with zero tasks", () => {
         const output = formatDailyTasksExport({
            dateKey: "2026-11-09",
            categories: [{ name: "General", tasks: [] }],
            style: "markdown",
         });

         expect(output).toContain("*(No tasks scheduled)*");
         expect(output).toContain(
            "> 📊 **Progress:** 0/0 tasks • *HoldMeToIt*"
         );
      });
   });

   describe("formatWeeklyTasksExport", () => {
      it("formats weekly todos in Discord markdown format with explicit date range", () => {
         const categories: ExportableCategoryGroup[] = [
            {
               name: "Study Goals",
               tasks: [
                  {
                     text: "Log 30 hours",
                     status: "IN_PROGRESS",
                     isChallengeGoal: true,
                  },
                  { text: "Submit final report", status: "TODO" },
               ],
            },
         ];

         const output = formatWeeklyTasksExport({
            weekRangeLabel: "Nov 2, 2026 – Nov 8, 2026",
            weekNumber: 45,
            categories,
            style: "markdown",
         });

         expect(output).toContain(
            "## 🗓️ Weekly Todos — Nov 2, 2026 – Nov 8, 2026 (Week 45)"
         );
         expect(output).toContain("### 📂 Study Goals");
         expect(output).toContain("- [ ] ⏳ 🏆 Log 30 hours");
         expect(output).toContain("- [ ] Submit final report");
         expect(output).toContain(
            "> 📊 **Progress:** 0/2 completed (0%) • *HoldMeToIt*"
         );
      });

      it("formats weekly todos in high-contrast emoji format", () => {
         const categories: ExportableCategoryGroup[] = [
            {
               name: "General",
               tasks: [{ text: "Organize notes", status: "COMPLETED" }],
            },
         ];

         const output = formatWeeklyTasksExport({
            weekRangeLabel: "Nov 2, 2026 – Nov 8, 2026",
            categories,
            style: "emoji",
         });

         expect(output).toContain(
            "**🗓️ WEEKLY TODOS — Nov 2, 2026 – Nov 8, 2026**"
         );
         expect(output).toContain("**📂 General**");
         expect(output).toContain("✅ Organize notes");
         expect(output).toContain(
            "> 📊 **Progress:** 1/1 completed (100%) • *HoldMeToIt*"
         );
      });
   });
});
