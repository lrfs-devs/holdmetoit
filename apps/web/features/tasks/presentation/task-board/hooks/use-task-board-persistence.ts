"use client";

import { useCallback } from "react";
import {
   commitCategoryMutation,
   commitTaskBatch,
   commitTaskMutation,
   deleteLocalCategory,
   deleteLocalTask,
   putLocalCategory,
   putLocalTask,
   putLocalTasks,
} from "@/features/tasks/data/local/task-idb";
import type {
   LocalCategoryRecord,
   LocalTaskRecord,
   QueuedMutation,
} from "@/features/tasks/domain/task-sync.types";

export interface TaskBoardPersistenceOptions {
   isLoggedIn: boolean;
   userId?: string | null;
}

export interface TaskBoardPersistence {
   persistTask: (
      task: LocalTaskRecord,
      mutation: Omit<QueuedMutation, "userId">
   ) => Promise<void>;
   persistTasks: (
      tasks: LocalTaskRecord[],
      mutation: Omit<QueuedMutation, "userId">
   ) => Promise<void>;
   persistCategory: (
      category: LocalCategoryRecord,
      mutation: Omit<QueuedMutation, "userId">
   ) => Promise<void>;
   deleteTaskWithMutation: (
      taskId: string,
      mutation: Omit<QueuedMutation, "userId">
   ) => Promise<void>;
   deleteCategoryWithMutation: (
      categoryId: string,
      mutation: Omit<QueuedMutation, "userId">
   ) => Promise<void>;
}

/**
 * Provides the atomic IndexedDB write helpers used by every board mutation.
 * Guests write only to IndexedDB; authenticated users also enqueue a mutation.
 */
export function useTaskBoardPersistence({
   isLoggedIn,
   userId,
}: TaskBoardPersistenceOptions): TaskBoardPersistence {
   const persistTask = useCallback(
      (
         task: LocalTaskRecord,
         mutation: Omit<QueuedMutation, "userId">
      ): Promise<void> =>
         isLoggedIn && userId
            ? commitTaskMutation(task, { ...mutation, userId })
            : putLocalTask(task),
      [isLoggedIn, userId]
   );

   const persistTasks = useCallback(
      (
         tasks: LocalTaskRecord[],
         mutation: Omit<QueuedMutation, "userId">
      ): Promise<void> =>
         isLoggedIn && userId
            ? commitTaskBatch(tasks, { ...mutation, userId })
            : putLocalTasks(tasks),
      [isLoggedIn, userId]
   );

   const persistCategory = useCallback(
      (
         category: LocalCategoryRecord,
         mutation: Omit<QueuedMutation, "userId">
      ): Promise<void> =>
         isLoggedIn && userId
            ? commitCategoryMutation(category, { ...mutation, userId })
            : putLocalCategory(category),
      [isLoggedIn, userId]
   );

   const deleteTaskWithMutation = useCallback(
      (
         taskId: string,
         mutation: Omit<QueuedMutation, "userId">
      ): Promise<void> =>
         isLoggedIn && userId
            ? commitTaskMutation(
                 null,
                 { ...mutation, userId },
                 {
                    deleteTaskId: taskId,
                 }
              )
            : deleteLocalTask(taskId),
      [isLoggedIn, userId]
   );

   const deleteCategoryWithMutation = useCallback(
      (
         categoryId: string,
         mutation: Omit<QueuedMutation, "userId">
      ): Promise<void> =>
         isLoggedIn && userId
            ? commitCategoryMutation(
                 null,
                 { ...mutation, userId },
                 {
                    deleteCategoryId: categoryId,
                 }
              )
            : deleteLocalCategory(categoryId),
      [isLoggedIn, userId]
   );

   return {
      persistTask,
      persistTasks,
      persistCategory,
      deleteTaskWithMutation,
      deleteCategoryWithMutation,
   };
}
