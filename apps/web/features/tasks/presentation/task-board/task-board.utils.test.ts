import { describe, expect, it } from "vitest";
import type { BoardTask } from "./task-board.types";
import { buildBoardTaskRecord, buildMoveIntent } from "./task-board.utils";

function task(overrides: Partial<BoardTask> = {}): BoardTask {
   return {
      id: "t1",
      text: "Study",
      completed: false,
      ...overrides,
   };
}

describe("buildBoardTaskRecord", () => {
   it("writes every field, including sortOrder and challengeId", () => {
      const record = buildBoardTaskRecord({
         task: task({
            createdAt: "2026-11-01T10:00:00.000Z",
            challengeId: "c1",
            dueDate: "2026-11-18",
         }),
         userId: "u1",
         categoryId: "cat1",
         taskType: "WEEKLY",
         sortOrder: 3,
         nowIso: "2026-11-17T12:00:00.000Z",
      });

      expect(record).toEqual({
         id: "t1",
         userId: "u1",
         categoryId: "cat1",
         challengeId: "c1",
         title: "Study",
         taskType: "WEEKLY",
         sortOrder: 3,
         isComplete: false,
         status: "TODO",
         dueDate: "2026-11-18",
         createdAt: "2026-11-01T10:00:00.000Z",
         updatedAt: "2026-11-17T12:00:00.000Z",
         completedAt: null,
         syncState: "pending",
      });
   });

   it("sets completedAt only when the task is complete", () => {
      const nowIso = "2026-11-17T12:00:00.000Z";
      const done = buildBoardTaskRecord({
         task: task({ completed: true }),
         userId: null,
         categoryId: "c",
         taskType: "DAILY",
         sortOrder: 0,
         nowIso,
      });
      const todo = buildBoardTaskRecord({
         task: task(),
         userId: null,
         categoryId: "c",
         taskType: "DAILY",
         sortOrder: 0,
         nowIso,
      });

      expect(done.isComplete).toBe(true);
      expect(done.status).toBe("COMPLETED");
      expect(done.completedAt).toBe(nowIso);
      expect(todo.completedAt).toBeNull();
   });

   it("honors explicit field overrides", () => {
      const record = buildBoardTaskRecord({
         task: task({ status: "IN_PROGRESS", challengeId: "old" }),
         userId: "u1",
         categoryId: "newCat",
         taskType: "DAILY",
         sortOrder: 5,
         isComplete: true,
         status: "COMPLETED",
         challengeId: null,
         title: "Renamed",
         dueDate: "2026-11-19",
         nowIso: "2026-11-17T12:00:00.000Z",
      });

      expect(record.title).toBe("Renamed");
      expect(record.categoryId).toBe("newCat");
      expect(record.status).toBe("COMPLETED");
      expect(record.challengeId).toBeNull();
      expect(record.dueDate).toBe("2026-11-19");
   });
});

describe("buildMoveIntent", () => {
   it("detects a same-category reorder", () => {
      expect(
         buildMoveIntent({
            taskId: "t1",
            sourceCategoryId: "c1",
            sourceColumn: "weekly",
            targetCategoryId: "c1",
            targetColumn: "weekly",
            insertIndex: 2,
         })
      ).toMatchObject({
         categoryChanged: false,
         columnChanged: false,
         targetTaskType: "WEEKLY",
         targetDueDate: null,
         insertIndex: 2,
      });
   });

   it("detects a cross-category same-column move", () => {
      expect(
         buildMoveIntent({
            taskId: "t1",
            sourceCategoryId: "c1",
            sourceColumn: "weekly",
            targetCategoryId: "c2",
            targetColumn: "weekly",
            insertIndex: 0,
         })
      ).toMatchObject({ categoryChanged: true, columnChanged: false });
   });

   it("detects weekly to daily and stamps the selected day", () => {
      expect(
         buildMoveIntent({
            taskId: "t1",
            sourceCategoryId: "w",
            sourceColumn: "weekly",
            targetCategoryId: "d",
            targetColumn: "daily",
            targetDueDate: "2026-11-18",
            insertIndex: 1,
         })
      ).toMatchObject({
         categoryChanged: true,
         columnChanged: true,
         targetTaskType: "DAILY",
         targetDueDate: "2026-11-18",
      });
   });

   it("detects daily to weekly and clears the due date", () => {
      expect(
         buildMoveIntent({
            taskId: "t1",
            sourceCategoryId: "d",
            sourceColumn: "daily",
            targetCategoryId: "w",
            targetColumn: "weekly",
            insertIndex: 0,
         })
      ).toMatchObject({
         categoryChanged: true,
         columnChanged: true,
         targetTaskType: "WEEKLY",
         targetDueDate: null,
      });
   });

   it("keeps the source due date for a same-day daily reorder", () => {
      expect(
         buildMoveIntent({
            taskId: "t1",
            sourceCategoryId: "d",
            sourceColumn: "daily",
            targetCategoryId: "d",
            targetColumn: "daily",
            sourceDueDate: "2026-11-17",
            insertIndex: 0,
         })
      ).toMatchObject({
         targetDueDate: "2026-11-17",
         columnChanged: false,
      });
   });
});
