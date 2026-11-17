"use client";

import {
   useEffect,
   useRef,
   useState,
   type Dispatch,
   type RefObject,
   type SetStateAction,
} from "react";
import { isWeeklyTaskGraceExpired } from "@/features/tasks/domain/task-lock";
import type { TaskScope } from "@/features/tasks/domain/task-scope";
import type { TaskStatus } from "@/features/tasks/domain/task.types";
import type { ChallengeDayOption } from "@/features/study-logs/domain/challenge-day";
import type { EditTaskModalState } from "../task-board.types";

export interface AddTaskModalState {
   open: boolean;
   type: "daily" | "weekly" | null;
   text: string;
   selectedCategory: string;
   customCategory: string;
   isCreatingCategory: boolean;
   status: TaskStatus;
   dateKey: string;
   challengeScope: TaskScope;
   categoryInputRef: RefObject<HTMLInputElement | null>;
   categorySelectRef: RefObject<HTMLButtonElement | null>;
   setText: (value: string) => void;
   setSelectedCategory: (value: string) => void;
   setCustomCategory: (value: string) => void;
   setIsCreatingCategory: (value: boolean) => void;
   setStatus: (status: TaskStatus) => void;
   setDateKey: (dateKey: string) => void;
   setChallengeScope: (scope: TaskScope) => void;
   openDaily: (targetDateKey?: string) => void;
   openWeekly: () => void;
   close: () => void;
}

export interface EditTaskModalView {
   modal: EditTaskModalState | null;
   text: string;
   status: TaskStatus;
   dueDate: string;
   challengeId: string | null;
   isGraceLocked: boolean;
   setModal: Dispatch<SetStateAction<EditTaskModalState | null>>;
   setText: (value: string) => void;
   setStatus: (status: TaskStatus) => void;
   setDueDate: (dateKey: string) => void;
   setChallengeId: (challengeId: string | null) => void;
   close: () => void;
}

export interface TaskModals {
   add: AddTaskModalState;
   editTask: EditTaskModalView;
}

export interface UseTaskModalsOptions {
   selectedDateKey: string;
   effectiveTodayDate: string;
   todayDayOption: ChallengeDayOption;
   dayOptions: ChallengeDayOption[];
   checkIsDayLocked: (dateKey: string) => boolean;
   dailyCategoryOptions: string[];
   weeklyCategoryOptions: string[];
   linkableChallengeId: string | null;
}

/**
 * Owns the add-task and edit-task modal state machines, including the
 * category-input autofocus behavior and the weekly grace-lock derivation.
 */
export function useTaskModals({
   selectedDateKey,
   effectiveTodayDate,
   todayDayOption,
   dayOptions,
   checkIsDayLocked,
   dailyCategoryOptions,
   weeklyCategoryOptions,
   linkableChallengeId,
}: UseTaskModalsOptions): TaskModals {
   const [addModalType, setAddModalType] = useState<"daily" | "weekly" | null>(
      null
   );
   const [text, setText] = useState("");
   const [selectedCategory, setSelectedCategory] = useState("");
   const [customCategory, setCustomCategory] = useState("");
   const [isCreatingCategory, setIsCreatingCategory] = useState(false);
   const [status, setStatus] = useState<TaskStatus>("TODO");
   const [dateKey, setDateKey] = useState<string>("");
   const [challengeScope, setChallengeScope] = useState<TaskScope>("CHALLENGE");

   const categoryInputRef = useRef<HTMLInputElement>(null);
   const categorySelectRef = useRef<HTMLButtonElement>(null);

   useEffect(() => {
      if (isCreatingCategory && addModalType) {
         const timer = setTimeout(() => {
            categoryInputRef.current?.focus();
            categoryInputRef.current?.select();
         }, 50);
         return () => clearTimeout(timer);
      }
   }, [isCreatingCategory, addModalType]);

   const openDaily = (targetDateKey?: string) => {
      const rawDateKey = targetDateKey || selectedDateKey;
      const isTargetLocked = checkIsDayLocked(rawDateKey);

      // If the target day is a locked past challenge day, clamp to today or
      // the first available non-past day.
      const initialDateKey = isTargetLocked
         ? todayDayOption?.dateKey ||
           dayOptions.find((d) => !checkIsDayLocked(d.dateKey))?.dateKey ||
           effectiveTodayDate
         : rawDateKey;

      setDateKey(initialDateKey);
      setText("");
      if (dailyCategoryOptions.length > 0) {
         setSelectedCategory(dailyCategoryOptions[0]);
         setIsCreatingCategory(false);
      } else {
         setSelectedCategory("");
         setIsCreatingCategory(true);
      }
      setCustomCategory("");
      setStatus("TODO");
      setAddModalType("daily");
   };

   const openWeekly = () => {
      setChallengeScope(linkableChallengeId ? "CHALLENGE" : "PERSONAL");
      setText("");
      setStatus("TODO");
      setCustomCategory("");
      if (weeklyCategoryOptions.length > 0) {
         setSelectedCategory(weeklyCategoryOptions[0]);
         setIsCreatingCategory(false);
      } else {
         setSelectedCategory("");
         setIsCreatingCategory(true);
      }
      setAddModalType("weekly");
   };

   const [editTaskModal, setEditTaskModal] =
      useState<EditTaskModalState | null>(null);
   const [editTaskText, setEditTaskText] = useState("");
   const [editTaskStatus, setEditTaskStatus] = useState<TaskStatus>("TODO");
   const [editTaskDueDate, setEditTaskDueDate] = useState<string>("");
   const [editTaskChallengeId, setEditTaskChallengeId] = useState<
      string | null
   >(null);

   const isEditTaskGraceLocked = Boolean(
      editTaskModal &&
      isWeeklyTaskGraceExpired({
         taskType: editTaskModal.taskType === "weekly" ? "WEEKLY" : "DAILY",
         challengeId: editTaskModal.challengeId,
         createdAt: editTaskModal.createdAt ?? new Date(),
      })
   );

   return {
      add: {
         open: Boolean(addModalType),
         type: addModalType,
         text,
         selectedCategory,
         customCategory,
         isCreatingCategory,
         status,
         dateKey,
         challengeScope,
         categoryInputRef,
         categorySelectRef,
         setText,
         setSelectedCategory,
         setCustomCategory,
         setIsCreatingCategory,
         setStatus,
         setDateKey,
         setChallengeScope,
         openDaily,
         openWeekly,
         close: () => setAddModalType(null),
      },
      editTask: {
         modal: editTaskModal,
         text: editTaskText,
         status: editTaskStatus,
         dueDate: editTaskDueDate,
         challengeId: editTaskChallengeId,
         isGraceLocked: isEditTaskGraceLocked,
         setModal: setEditTaskModal,
         setText: setEditTaskText,
         setStatus: setEditTaskStatus,
         setDueDate: setEditTaskDueDate,
         setChallengeId: setEditTaskChallengeId,
         close: () => setEditTaskModal(null),
      },
   };
}
