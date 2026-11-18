// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, act } from "react";
import { cleanup, render } from "@testing-library/react";
import { CockpitTasksSection } from "@/features/tasks/presentation/task-board";
import { LOAD_SAMPLE_TASK_EVENT } from "@/features/tasks/presentation/task-board";
import type { UserCategorizedTasks } from "@/features/tasks/domain/task.types";
import * as taskIdb from "@/features/tasks/data/local/task-idb";

vi.mock("@/features/tasks/data/local/task-idb", async (importOriginal) => {
   const actual =
      await importOriginal<
         typeof import("@/features/tasks/data/local/task-idb")
      >();
   return {
      ...actual,
      getAllLocalCategories: vi.fn().mockResolvedValue([]),
      getAllLocalTasks: vi.fn().mockResolvedValue([]),
      getQueuedMutationsForUser: vi.fn().mockResolvedValue([]),
      putLocalCategories: vi.fn().mockResolvedValue(undefined),
      putLocalTasks: vi.fn().mockResolvedValue(undefined),
      putLocalTask: vi.fn().mockResolvedValue(undefined),
      putLocalCategory: vi.fn().mockResolvedValue(undefined),
      commitTaskMutation: vi.fn().mockResolvedValue(undefined),
      commitTaskBatch: vi.fn().mockResolvedValue(undefined),
      commitCategoryMutation: vi.fn().mockResolvedValue(undefined),
      commitLocalBatch: vi.fn().mockResolvedValue(undefined),
      logTaskSync: vi.fn(),
   };
});

vi.mock(
   "@/features/tasks/data/local/task-sync.service",
   async (importOriginal) => {
      const actual =
         await importOriginal<
            typeof import("@/features/tasks/data/local/task-sync.service")
         >();
      return {
         ...actual,
         scheduleSync: vi.fn(),
         initTaskSync: vi.fn(() => vi.fn()),
      };
   }
);

const emptyTasks: UserCategorizedTasks = {
   categories: [],
   dailyCategories: [],
   weeklyCategories: [],
   totalDailyTasks: 0,
   completedDailyTasks: 0,
   totalWeeklyTasks: 0,
   completedWeeklyTasks: 0,
};

function addSampleTask(title: string) {
   act(() => {
      window.dispatchEvent(
         new CustomEvent(LOAD_SAMPLE_TASK_EVENT, { detail: { title } })
      );
   });
}

describe("sample task persistence", () => {
   beforeEach(() => {
      cleanup();
      vi.mocked(taskIdb.commitLocalBatch).mockClear();
      vi.mocked(taskIdb.putLocalTask).mockClear();
   });

   it("enqueues CREATE mutations for a logged-in user", () => {
      render(
         createElement(CockpitTasksSection, {
            isLoggedIn: true,
            userId: "user_1",
            userTasks: emptyTasks,
         })
      );

      addSampleTask("Complete 2h Deep Work block");

      expect(taskIdb.commitLocalBatch).toHaveBeenCalledTimes(1);
      const [batch] = vi.mocked(taskIdb.commitLocalBatch).mock.calls[0];
      const actions = (batch.mutations ?? []).map((m) => m.action);
      expect(actions).toContain("CREATE");
      expect(batch.tasks).toHaveLength(1);
      expect(batch.tasks?.[0]).toMatchObject({
         userId: "user_1",
         syncState: "pending",
      });
   });

   it("writes only locally for a guest", () => {
      render(
         createElement(CockpitTasksSection, {
            isLoggedIn: false,
            userTasks: emptyTasks,
         })
      );

      addSampleTask("Link YPT account");

      expect(taskIdb.commitLocalBatch).toHaveBeenCalledTimes(1);
      const [batch] = vi.mocked(taskIdb.commitLocalBatch).mock.calls[0];
      expect(batch.mutations ?? []).toHaveLength(0);
      expect(batch.tasks).toHaveLength(1);
   });
});
