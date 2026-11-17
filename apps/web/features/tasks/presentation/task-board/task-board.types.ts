import type {
   TaskStatus,
   UserCategorizedTasks,
} from "@/features/tasks/domain/task.types";

/** Presentation view model for a task card on the daily/weekly board. */
export interface BoardTask {
   id: string;
   text: string;
   completed: boolean;
   status?: TaskStatus;
   dueDate?: string | null;
   createdAt?: string;
   challengeId?: string | null;
}

/** Presentation view model for a category column on the board. */
export interface BoardCategory {
   id?: string;
   name: string;
   isCollapsed: boolean;
   sortOrder?: number;
   createdAt?: string | Date;
   updatedAt?: string | Date;
   tasks: BoardTask[];
}

export interface CockpitTasksSectionProps {
   isLoggedIn: boolean;
   userId?: string | null;
   userTasks?: UserCategorizedTasks | null;
   completedChallengeIds?: string[];
   challengeStartDate?: string;
   challengeId?: string;
   challengeStatus?: "UPCOMING" | "ACTIVE" | "COMPLETED";
   todayDate?: string;
   todayDayNumber?: number;
   totalChallengeDays?: number;
   initialSelectedDateKey?: string;
   onOpenHoursModal?: (dayNumber?: number) => void;
   isAdmin?: boolean;
   initialCollapsedCategoryIds?: string[];
   initialIsRolloverSnoozed?: boolean;
}

export interface EditTaskModalState {
   id: string;
   text: string;
   completed: boolean;
   status: TaskStatus;
   dueDate?: string | null;
   createdAt?: string;
   challengeId?: string | null;
   catIdx: number;
   taskType: "daily" | "weekly";
}

export interface CategoryModalTarget {
   id?: string;
   name: string;
   taskType: "daily" | "weekly";
}

export type EditCategoryModalState = CategoryModalTarget;
export type DeleteCategoryModalState = CategoryModalTarget;

export interface DraggedItem {
   type: "task" | "category";
   id?: string;
   sourceCatIdx: number;
   sourceColumn: "daily" | "weekly";
   sourceDateKey?: string;
}

export interface DragOverInfo {
   type: "task" | "category" | "column" | "day";
   targetId?: string;
   targetCatIdx?: number;
   targetColumn?: "daily" | "weekly";
   targetDateKey?: string;
   position?: "above" | "below";
}
