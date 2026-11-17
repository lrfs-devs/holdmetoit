"use client";

import { TaskBoard } from "./components/task-board";
import { AddTaskDialog } from "./dialogs/add-task-dialog";
import { EditTaskDialog } from "./dialogs/edit-task-dialog";
import { RenameCategoryDialog } from "./dialogs/rename-category-dialog";
import { DeleteCategoryDialog } from "./dialogs/delete-category-dialog";
import { useTaskBoardModel } from "./hooks/use-task-board-model";
import type {
   BoardCategory,
   BoardTask,
   CockpitTasksSectionProps,
   DeleteCategoryModalState,
   DragOverInfo,
   DraggedItem,
   EditCategoryModalState,
   EditTaskModalState,
} from "./task-board.types";
import {
   getTaskStatus,
   isWeeklyTaskVisible,
   LOAD_SAMPLE_TASK_EVENT,
   SAMPLE_STUDY_TASKS,
} from "./task-board.utils";

export type {
   BoardCategory,
   BoardTask,
   CockpitTasksSectionProps,
   DeleteCategoryModalState,
   DragOverInfo,
   DraggedItem,
   EditCategoryModalState,
   EditTaskModalState,
} from "./task-board.types";
export {
   getTaskStatus,
   isWeeklyTaskVisible,
   LOAD_SAMPLE_TASK_EVENT,
   SAMPLE_STUDY_TASKS,
} from "./task-board.utils";

/** Renders the participant's categorized task board and task actions. */
export function CockpitTasksSection(props: CockpitTasksSectionProps) {
   const m = useTaskBoardModel(props);
   const add = m.modals.add;
   const edit = m.modals.editTask;

   return (
      <>
         <TaskBoard model={m.board} />

         <AddTaskDialog
            open={add.open}
            modalType={add.type}
            text={add.text}
            selectedCategory={add.selectedCategory}
            customCategory={add.customCategory}
            isCreatingCategory={add.isCreatingCategory}
            status={add.status}
            dateKey={add.dateKey}
            challengeScope={add.challengeScope}
            weeklyCategoryOptions={m.weeklyCategoryOptions}
            independentDailyCategoryOptions={m.independentDailyCategoryOptions}
            dailyCategoryOptions={m.dailyCategoryOptions}
            dayOptions={m.dayOptions}
            selectedDateKey={m.selectedDateKey}
            effectiveTodayDate={m.effectiveTodayDate}
            linkableChallengeId={m.linkableChallengeId}
            hasChallengeContext={m.hasChallengeContext}
            categoryInputRef={add.categoryInputRef}
            categorySelectRef={add.categorySelectRef}
            onTextChange={add.setText}
            onSelectedCategoryChange={add.setSelectedCategory}
            onCustomCategoryChange={add.setCustomCategory}
            onCreatingCategoryChange={add.setIsCreatingCategory}
            onStatusChange={add.setStatus}
            onDateKeyChange={add.setDateKey}
            onChallengeScopeChange={add.setChallengeScope}
            onSubmit={m.handleAddTodoSubmit}
            onClose={add.close}
         />

         <EditTaskDialog
            open={Boolean(edit.modal)}
            task={edit.modal}
            text={edit.text}
            status={edit.status}
            dueDate={edit.dueDate}
            challengeId={edit.challengeId}
            isGraceLocked={edit.isGraceLocked}
            hasChallengeContext={m.hasChallengeContext}
            effectiveTodayDate={m.effectiveTodayDate}
            linkableChallengeId={m.linkableChallengeId}
            dayOptions={m.dayOptions}
            onTextChange={edit.setText}
            onStatusChange={edit.setStatus}
            onDueDateChange={edit.setDueDate}
            onChallengeIdChange={edit.setChallengeId}
            onSave={() =>
               m.handleSaveEditTask(edit.text, edit.status, edit.dueDate)
            }
            onClose={edit.close}
         />

         <RenameCategoryDialog
            open={Boolean(m.editCategoryModal)}
            name={m.editCategoryInputName}
            onNameChange={m.setEditCategoryInputName}
            onSave={() => m.handleSaveEditCategory(m.editCategoryInputName)}
            onClose={() => m.setEditCategoryModal(null)}
         />

         <DeleteCategoryDialog
            open={Boolean(m.deleteCategoryModal)}
            categoryName={m.deleteCategoryModal?.name}
            onConfirm={m.handleConfirmDeleteCategory}
            onClose={() => m.setDeleteCategoryModal(null)}
         />
      </>
   );
}
