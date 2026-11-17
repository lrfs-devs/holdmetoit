"use client";

import { useMemo, useRef } from "react";
import type { TaskStatus } from "@/features/tasks/domain/task.types";
import type { BoardTask } from "../task-board.types";

type Column = "daily" | "weekly";
type ClickOrigin =
   | React.MouseEvent
   | MouseEvent
   | { clientX: number; clientY: number }
   | Element
   | null;

export interface TaskRowActions {
   onToggleExpand: (taskId: string, origin: React.MouseEvent) => void;
   onToggleStatus: (
      catIdx: number,
      taskId: string,
      variant: Column,
      origin: React.MouseEvent
   ) => void;
   onStatusAction: (
      catIdx: number,
      taskId: string,
      variant: Column,
      status: TaskStatus,
      origin: React.MouseEvent
   ) => void;
   onDragStart: (
      e: React.DragEvent,
      taskId: string,
      catIdx: number,
      variant: Column
   ) => void;
   onDragOver: (
      e: React.DragEvent,
      taskId: string,
      catIdx: number,
      variant: Column
   ) => void;
   onDrop: (
      e: React.DragEvent,
      taskId: string,
      catIdx: number,
      variant: Column
   ) => void;
   onDragEnd: () => void;
   onDelete: (catIdx: number, taskId: string, variant: Column) => void;
   onRollover: (taskId: string, sourceDateKey: string) => void;
   onSetStatus: (
      catIdx: number,
      taskId: string,
      variant: Column,
      status: TaskStatus
   ) => void;
   onMoveToDay: (
      taskId: string,
      dateKey: string,
      catIdx: number,
      variant: Column
   ) => void;
   onEditTask: (task: BoardTask, catIdx: number, variant: Column) => void;
   onToggleChallengeScope: (taskId: string, challengeId: string | null) => void;
}

export interface UseTaskRowActionsOptions {
   toggleTaskExpand: (taskId: string, e?: React.MouseEvent) => void;
   toggleDailyTask: (
      catIdx: number,
      taskId: string,
      origin?: ClickOrigin
   ) => void;
   toggleWeeklyTask: (
      catIdx: number,
      taskId: string,
      origin?: ClickOrigin
   ) => void;
   setTaskStatus: (
      catIdx: number,
      taskId: string,
      taskType: Column,
      next: TaskStatus | boolean,
      origin?: ClickOrigin
   ) => void;
   handleTaskDragStart: (
      e: React.DragEvent,
      taskId: string,
      catIdx: number,
      column: Column
   ) => void;
   handleTaskDragOver: (
      e: React.DragEvent,
      taskId: string,
      catIdx: number,
      column: Column
   ) => void;
   handleTaskDrop: (
      e: React.DragEvent,
      taskId: string,
      catIdx: number,
      column: Column
   ) => void;
   handleDragEnd: () => void;
   handleDeleteTask: (catIdx: number, taskId: string, taskType: Column) => void;
   handleRolloverIncompleteTasks: (options?: {
      sourceDateKey?: string;
      taskId?: string;
   }) => void;
   moveTaskToDay: (
      taskId: string,
      dateKey: string,
      sourceCatIdx?: number,
      sourceColumn?: Column
   ) => void;
   toggleTaskChallengeScope: (
      taskId: string,
      challengeId: string | null
   ) => void;
   openEditTask: (task: BoardTask, catIdx: number, variant: Column) => void;
}

/**
 * Returns referentially stable row callbacks that always read the latest
 * handlers. Memoized rows can then skip re-renders without going stale.
 */
export function useTaskRowActions(
   handlers: UseTaskRowActionsOptions
): TaskRowActions {
   const latest = useRef(handlers);
   latest.current = handlers;

   return useMemo<TaskRowActions>(
      () => ({
         onToggleExpand: (taskId, origin) =>
            latest.current.toggleTaskExpand(taskId, origin),
         onToggleStatus: (catIdx, taskId, variant, origin) => {
            if (variant === "daily") {
               latest.current.toggleDailyTask(catIdx, taskId, origin);
            } else {
               latest.current.toggleWeeklyTask(catIdx, taskId, origin);
            }
         },
         onStatusAction: (catIdx, taskId, variant, status, origin) =>
            latest.current.setTaskStatus(
               catIdx,
               taskId,
               variant,
               status,
               origin
            ),
         onDragStart: (e, taskId, catIdx, variant) =>
            latest.current.handleTaskDragStart(e, taskId, catIdx, variant),
         onDragOver: (e, taskId, catIdx, variant) =>
            latest.current.handleTaskDragOver(e, taskId, catIdx, variant),
         onDrop: (e, taskId, catIdx, variant) =>
            latest.current.handleTaskDrop(e, taskId, catIdx, variant),
         onDragEnd: () => latest.current.handleDragEnd(),
         onDelete: (catIdx, taskId, variant) =>
            latest.current.handleDeleteTask(catIdx, taskId, variant),
         onRollover: (taskId, sourceDateKey) =>
            latest.current.handleRolloverIncompleteTasks({
               taskId,
               sourceDateKey,
            }),
         onSetStatus: (catIdx, taskId, variant, status) =>
            latest.current.setTaskStatus(catIdx, taskId, variant, status),
         onMoveToDay: (taskId, dateKey, catIdx, variant) =>
            latest.current.moveTaskToDay(taskId, dateKey, catIdx, variant),
         onEditTask: (task, catIdx, variant) =>
            latest.current.openEditTask(task, catIdx, variant),
         onToggleChallengeScope: (taskId, challengeId) =>
            latest.current.toggleTaskChallengeScope(taskId, challengeId),
      }),
      []
   );
}
