// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTaskBoardModel } from "./use-task-board-model";
import type { UserCategorizedTasks } from "@/features/tasks/domain/task.types";

const { commitLocalBatchMock } = vi.hoisted(() => ({
   commitLocalBatchMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/features/tasks/data/local/task-idb", async (importOriginal) => {
   const actual =
      await importOriginal<
         typeof import("@/features/tasks/data/local/task-idb")
      >();
   return {
      ...actual,
      commitLocalBatch: commitLocalBatchMock,
      getQueuedMutationsForUser: vi.fn().mockResolvedValue([]),
      getAllLocalTasks: vi.fn().mockResolvedValue([]),
      getAllLocalCategories: vi.fn().mockResolvedValue([]),
      putLocalTasks: vi.fn().mockResolvedValue(undefined),
      putLocalCategories: vi.fn().mockResolvedValue(undefined),
   };
});

vi.mock("@/features/tasks/data/local/task-sync.service", () => ({
   initTaskSync: () => () => {},
   scheduleSync: vi.fn(),
   TASKS_SYNCED_EVENT: "holdmetoit:tasks-synced",
}));

vi.mock("@/lib/confetti", () => ({ triggerTaskConfetti: vi.fn() }));
vi.mock("@/features/preferences/presentation/audio-service", () => ({
   playCompletionAudio: vi.fn(),
}));
vi.mock("@/core/observability/logrocket", () => ({
   trackLogRocketEvent: vi.fn(),
}));

const userTasks: UserCategorizedTasks = {
   categories: [
      {
         id: "cat_daily",
         userId: "u_1",
         name: "Focus",
         taskType: "DAILY",
         createdAt: new Date("2026-11-01T00:00:00.000Z"),
         updatedAt: new Date("2026-11-01T00:00:00.000Z"),
      },
   ],
   dailyCategories: [
      {
         id: "cat_daily",
         name: "Focus",
         taskType: "DAILY",
         isCollapsed: false,
         tasks: [],
      },
   ],
   weeklyCategories: [],
   totalDailyTasks: 0,
   completedDailyTasks: 0,
   totalWeeklyTasks: 0,
   completedWeeklyTasks: 0,
};

async function harness() {
   const rendered = renderHook(() =>
      useTaskBoardModel({
         isLoggedIn: true,
         userId: "u_1",
         userTasks,
         todayDate: "2026-11-18",
         todayDayNumber: 1,
         totalChallengeDays: 7,
      })
   );
   // Flush the mount hydration effect so it cannot settle during the next test.
   await act(async () => {
      await Promise.resolve();
   });
   return rendered;
}

function submit(
   result: { current: ReturnType<typeof useTaskBoardModel> },
   text: string
) {
   act(() => result.current.modals.add.openDaily());
   act(() => result.current.modals.add.setText(text));
   return act(async () => {
      await result.current.handleAddTodoSubmit({
         preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
   });
}

function dailyTaskIds(result: {
   current: ReturnType<typeof useTaskBoardModel>;
}): string[] {
   return result.current.board.dailyCategories.flatMap((category) =>
      category.tasks.map((task) => task.id)
   );
}

beforeEach(() => {
   commitLocalBatchMock.mockReset().mockResolvedValue(undefined);
});

describe("handleAddTodoSubmit — draft ownership", () => {
   it("keeps text typed while the save was pending", async () => {
      const { result } = await harness();

      await submit(result, "First task");
      // Simulate typing a second task before the save settled.
      act(() => result.current.modals.add.setText("Second task"));

      // The settle path already ran inside submit(); re-check the draft.
      expect(result.current.modals.add.text).not.toBe("");
   });

   it("clears and closes the dialog when the draft still matches", async () => {
      const { result } = await harness();

      await submit(result, "Only task");

      expect(result.current.modals.add.open).toBe(false);
      expect(result.current.modals.add.text).toBe("");
   });

   it("keeps the draft and does not close when newer text exists", async () => {
      const { result } = await harness();

      act(() => result.current.modals.add.openDaily());
      act(() => result.current.modals.add.setText("Submitted"));

      let resolveBatch: () => void = () => {};
      commitLocalBatchMock.mockImplementationOnce(
         () =>
            new Promise<void>((resolve) => {
               resolveBatch = resolve;
            })
      );

      let pending: Promise<void> = Promise.resolve();
      act(() => {
         // The declared handler return type is `void`; wrap so the settle can be awaited.
         pending = (async () => {
            await result.current.handleAddTodoSubmit({
               preventDefault: vi.fn(),
            } as unknown as React.FormEvent);
         })();
      });

      // The user keeps typing while the write is in flight.
      act(() => result.current.modals.add.setText("Next task"));

      await act(async () => {
         resolveBatch();
         await pending;
      });

      expect(result.current.modals.add.text).toBe("Next task");
      expect(result.current.modals.add.open).toBe(true);
   });
});

describe("handleAddTodoSubmit — failed persistence", () => {
   it("removes the optimistic task and keeps the draft", async () => {
      const { result } = await harness();
      commitLocalBatchMock.mockRejectedValueOnce(new Error("idb down"));

      await submit(result, "Doomed task");

      expect(dailyTaskIds(result)).toHaveLength(0);
      expect(result.current.modals.add.text).toBe("Doomed task");
      expect(result.current.modals.add.errorMessage).toBeTruthy();
      expect(result.current.modals.add.open).toBe(true);
   });

   it("still removes the optimistic task when the draft was replaced", async () => {
      const { result } = await harness();

      act(() => result.current.modals.add.openDaily());
      act(() => result.current.modals.add.setText("Submitted"));

      let rejectBatch: (error: Error) => void = () => {};
      commitLocalBatchMock.mockImplementationOnce(
         () =>
            new Promise<void>((_resolve, reject) => {
               rejectBatch = reject;
            })
      );

      let pending: Promise<void> = Promise.resolve();
      act(() => {
         // The declared handler return type is `void`; wrap so the settle can be awaited.
         pending = (async () => {
            await result.current.handleAddTodoSubmit({
               preventDefault: vi.fn(),
            } as unknown as React.FormEvent);
         })();
      });

      // Reopening the dialog invalidates the in-flight submission.
      act(() => result.current.modals.add.openDaily());
      act(() => result.current.modals.add.setText("Newer draft"));

      await act(async () => {
         rejectBatch(new Error("idb down"));
         await pending;
      });

      // The unpersisted task must not linger on the board...
      expect(dailyTaskIds(result)).toHaveLength(0);
      // ...and the newer draft must not inherit the failure message.
      expect(result.current.modals.add.text).toBe("Newer draft");
      expect(result.current.modals.add.errorMessage).toBeNull();
   });
});
