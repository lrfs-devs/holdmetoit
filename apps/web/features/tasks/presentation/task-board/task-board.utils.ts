import type { TaskStatus, TaskType } from "@/features/tasks/domain/task.types";
import type { LocalTaskRecord } from "@/features/tasks/domain/task-sync.types";
import type { BoardCategory, BoardTask } from "./task-board.types";

/** Derives the presentation status for a task item. */
export function getTaskStatus(task: BoardTask): TaskStatus {
   if (task.status) return task.status;
   return task.completed ? "COMPLETED" : "TODO";
}

/** Any shape a task arrives in from a drag gesture or a domain move helper. */
export interface LooseTask {
   id: string;
   text?: string;
   title?: string;
   completed?: boolean;
   isComplete?: boolean;
   status?: string;
   dueDate?: string | null;
   createdAt?: string | Date;
   updatedAt?: string;
   challengeId?: string | null;
   syncState?: string;
}

/**
 * Narrows any drag/shape variant to a full `BoardTask`. Domain move helpers are
 * generic over looser interfaces, so records coming back from them need this
 * before they can be re-inserted into board state.
 */
export function toBoardTask(task: LooseTask): BoardTask {
   return {
      id: task.id,
      text: task.text ?? task.title ?? "",
      completed: Boolean(task.completed ?? task.isComplete),
      status: task.status as TaskStatus | undefined,
      dueDate: task.dueDate ?? null,
      createdAt:
         task.createdAt instanceof Date
            ? task.createdAt.toISOString()
            : task.createdAt,
      updatedAt: task.updatedAt,
      challengeId: task.challengeId ?? null,
      syncState: task.syncState,
   };
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

/** Minimal board shape needed to reverse one task move. */
export interface MoveRollbackBoard {
   dailyCategories: BoardCategory[];
   weeklyCategories: BoardCategory[];
}

export interface RevertTaskMoveParams {
   taskId: string;
   /** Pre-move record, re-inserted into its source category. */
   task: BoardTask;
   sourceColumn: "daily" | "weekly";
   sourceCategoryId?: string;
   sourceCategoryName: string;
   /** Category created purely by this move; dropped if it ends up empty. */
   createdCategoryId?: string;
}

/**
 * Reverses a single task move against the CURRENT board.
 *
 * Unlike restoring a pre-move snapshot, this preserves any task or category
 * change that landed while the persistence batch was pending.
 */
export function revertTaskMove(
   board: MoveRollbackBoard,
   params: RevertTaskMoveParams
): MoveRollbackBoard {
   const strip = (categories: BoardCategory[]): BoardCategory[] =>
      categories.map((category) => ({
         ...category,
         tasks: category.tasks.filter((task) => task.id !== params.taskId),
      }));

   const insertBack = (categories: BoardCategory[]): BoardCategory[] => {
      // Id wins globally: a same-named category earlier in the list must not
      // capture a task that belongs to the id-matched one.
      const byId = params.sourceCategoryId
         ? categories.findIndex(
              (category) => category.id === params.sourceCategoryId
           )
         : -1;
      const index =
         byId !== -1
            ? byId
            : categories.findIndex(
                 (category) => category.name === params.sourceCategoryName
              );

      if (index === -1) {
         return [
            ...categories,
            {
               id: params.sourceCategoryId,
               name: params.sourceCategoryName,
               isCollapsed: false,
               tasks: [params.task],
            },
         ];
      }

      return categories.map((category, i) =>
         i === index
            ? {
                 ...category,
                 tasks: [...category.tasks, params.task].sort((a, b) =>
                    (a.text || "").localeCompare(b.text || "")
                 ),
              }
            : category
      );
   };

   const daily = strip(board.dailyCategories);
   const weekly = strip(board.weeklyCategories).filter(
      (category) =>
         !(params.createdCategoryId && category.id === params.createdCategoryId)
   );

   return params.sourceColumn === "daily"
      ? { dailyCategories: insertBack(daily), weeklyCategories: weekly }
      : { dailyCategories: daily, weeklyCategories: insertBack(weekly) };
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
