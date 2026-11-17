import type { TaskStatus, TaskType } from "@/features/tasks/domain/task.types";
import type { LocalTaskRecord } from "@/features/tasks/domain/task-sync.types";
import type { BoardTask } from "./task-board.types";

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

export interface BuildBoardTaskRecordParams {
   task: BoardTask;
   userId: string | null;
   categoryId: string;
   taskType: TaskType;
   sortOrder: number;
   dueDate?: string | null;
   title?: string;
   isComplete?: boolean;
   status?: TaskStatus;
   challengeId?: string | null;
   nowIso?: string;
}

/**
 * Builds the complete IndexedDB row for a task. Every write path uses this so
 * fields like `sortOrder` and `challengeId` can never be dropped accidentally.
 */
export function buildBoardTaskRecord(
   params: BuildBoardTaskRecordParams
): LocalTaskRecord {
   const nowIso = params.nowIso ?? new Date().toISOString();
   const isComplete = params.isComplete ?? params.task.completed;
   const status =
      params.status ??
      (params.isComplete !== undefined
         ? isComplete
            ? "COMPLETED"
            : "TODO"
         : (params.task.status ?? (isComplete ? "COMPLETED" : "TODO")));
   const dueDate =
      params.dueDate !== undefined
         ? params.dueDate
         : (params.task.dueDate ?? null);
   const challengeId =
      params.challengeId !== undefined
         ? params.challengeId
         : (params.task.challengeId ?? null);

   return {
      id: params.task.id,
      userId: params.userId,
      categoryId: params.categoryId,
      challengeId,
      title: params.title ?? params.task.text,
      taskType: params.taskType,
      sortOrder: params.sortOrder,
      isComplete,
      status,
      dueDate,
      createdAt: params.task.createdAt ?? nowIso,
      updatedAt: nowIso,
      completedAt: isComplete ? nowIso : null,
      syncState: "pending",
   };
}

export interface MoveIntent {
   taskId: string;
   targetCategoryId: string;
   targetTaskType: TaskType;
   targetDueDate: string | null | undefined;
   insertIndex: number;
   categoryChanged: boolean;
   columnChanged: boolean;
}

export interface BuildMoveIntentParams {
   taskId: string;
   sourceCategoryId?: string;
   sourceColumn: "daily" | "weekly";
   targetCategoryId: string;
   targetColumn: "daily" | "weekly";
   targetDueDate?: string | null;
   sourceDueDate?: string | null;
   insertIndex: number;
}

/** Normalizes any drop/day-pill gesture into one move description. */
export function buildMoveIntent(params: BuildMoveIntentParams): MoveIntent {
   return {
      taskId: params.taskId,
      targetCategoryId: params.targetCategoryId,
      targetTaskType: params.targetColumn === "daily" ? "DAILY" : "WEEKLY",
      targetDueDate:
         params.targetDueDate !== undefined
            ? params.targetDueDate
            : params.targetColumn === "weekly"
              ? null
              : (params.sourceDueDate ?? null),
      insertIndex: params.insertIndex,
      categoryChanged: Boolean(
         params.sourceCategoryId &&
         params.sourceCategoryId !== params.targetCategoryId
      ),
      columnChanged: params.sourceColumn !== params.targetColumn,
   };
}
