import { formatDayDate } from "@/features/study-logs/domain/challenge-day";
import type { TaskStatus } from "@/features/tasks/domain/task.types";
import type { BoardTask } from "./task-board.types";

export { formatDayDate };

/** Derives the presentation status for a task item. */
export function getTaskStatus(task: BoardTask): TaskStatus {
   if (task.status) return task.status;
   return task.completed ? "COMPLETED" : "TODO";
}

/** A task is hidden from the weekly column once its challenge results are locked. */
export function isWeeklyTaskVisible(
   task: BoardTask,
   completedChallengeIds: Set<string>
): boolean {
   return !(task.challengeId && completedChallengeIds.has(task.challengeId));
}

export const SAMPLE_STUDY_TASKS = [
   "Complete 2h Deep Work block",
   "Link YPT account",
   "Join an active Study Challenge",
] as const;

export const LOAD_SAMPLE_TASK_EVENT = "holdmetoit:load-sample-task";
