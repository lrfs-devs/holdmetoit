"use client";

import { Check, Lock, Trophy, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
   formatDayDate,
   type ChallengeDayOption,
} from "@/features/study-logs/domain/challenge-day";
import type { TaskStatus } from "@/features/tasks/domain/task.types";
import type { EditTaskModalState } from "../task-board.types";

export interface EditTaskDialogProps {
   open: boolean;
   task: EditTaskModalState | null;
   text: string;
   status: TaskStatus;
   dueDate: string;
   challengeId: string | null;
   isGraceLocked: boolean;
   hasChallengeContext: boolean;
   effectiveTodayDate: string;
   linkableChallengeId: string | null;
   dayOptions: ChallengeDayOption[];
   onTextChange: (value: string) => void;
   onStatusChange: (status: TaskStatus) => void;
   onDueDateChange: (dateKey: string) => void;
   onChallengeIdChange: (challengeId: string | null) => void;
   onSave: () => void;
   onClose: () => void;
}

/** Edit-task dialog. Controlled by the board's modal state. */
export function EditTaskDialog({
   open,
   task,
   text,
   status,
   dueDate,
   challengeId,
   isGraceLocked,
   hasChallengeContext,
   effectiveTodayDate,
   linkableChallengeId,
   dayOptions,
   onTextChange,
   onStatusChange,
   onDueDateChange,
   onChallengeIdChange,
   onSave,
   onClose,
}: EditTaskDialogProps) {
   return (
      <Dialog
         open={open}
         onOpenChange={(nextOpen) => {
            if (!nextOpen) onClose();
         }}
      >
         <DialogContent className="max-w-md rounded-2xl border-border-strong bg-surface-nested p-6 space-y-5">
            <div className="flex items-center justify-between">
               <DialogTitle className="text-xl font-bold text-white">
                  Edit Task
               </DialogTitle>
            </div>
            <form
               onSubmit={(e) => {
                  e.preventDefault();
                  onSave();
               }}
               className="space-y-4"
            >
               <div>
                  <Label
                     htmlFor="edit-task-title"
                     className="block text-xs font-medium text-text-secondary mb-1.5"
                  >
                     Task Title
                  </Label>
                  <Input
                     id="edit-task-title"
                     type="text"
                     value={text}
                     onChange={(e) => onTextChange(e.target.value)}
                     disabled={isGraceLocked}
                     autoFocus
                     required
                     className="h-11 bg-input-bg border-input-border text-text-primary rounded-xl"
                  />
               </div>

               {task?.taskType === "daily" && (
                  <div role="group" aria-labelledby="edit-task-day">
                     <Label
                        id="edit-task-day"
                        className="block text-xs font-medium text-text-secondary mb-1.5 flex items-center justify-between"
                     >
                        <span>
                           {hasChallengeContext
                              ? "Assigned Challenge Day"
                              : "Assigned Day"}
                        </span>
                        <span className="text-meta text-brand-2 font-semibold">
                           {formatDayDate(dueDate)}
                        </span>
                     </Label>
                     <div className="grid grid-cols-7 gap-1 w-full pb-1">
                        {dayOptions.map((opt) => {
                           const isSelected = dueDate === opt.dateKey;
                           const originalDateKey = task?.dueDate
                              ? typeof task?.dueDate === "string"
                                 ? task?.dueDate.slice(0, 10)
                                 : new Date(task?.dueDate)
                                      .toISOString()
                                      .slice(0, 10)
                              : "";
                           const isOriginalDate =
                              originalDateKey === opt.dateKey;
                           const isPastDay =
                              opt.isPast ?? opt.dateKey < effectiveTodayDate;
                           const isBlockedPastDay =
                              hasChallengeContext &&
                              isPastDay &&
                              !isOriginalDate;

                           if (isBlockedPastDay) {
                              return (
                                 <button
                                    key={opt.dateKey}
                                    type="button"
                                    disabled
                                    title={`${opt.label} (Past Day — Locked)`}
                                    className="py-1.5 px-1 flex flex-col items-center justify-center rounded-xl text-xs font-semibold border border-border-default bg-surface-primary text-text-tertiary opacity-40 cursor-not-allowed overflow-hidden"
                                 >
                                    <span className="text-label uppercase font-bold tracking-wider leading-none truncate max-w-full">
                                       {opt.isToday
                                          ? "Today"
                                          : opt.shortLabel.startsWith("Day ")
                                            ? `D${opt.dayNumber}`
                                            : opt.shortLabel.slice(0, 3)}
                                    </span>
                                    <span className="text-caption opacity-60 mt-0.5 leading-none truncate max-w-full">
                                       {formatDayDate(opt.dateKey)}
                                    </span>
                                    <span className="text-micro text-text-tertiary mt-1 flex items-center justify-center">
                                       <Lock className="h-2 w-2" />
                                    </span>
                                 </button>
                              );
                           }

                           return (
                              <button
                                 key={opt.dateKey}
                                 type="button"
                                 onClick={() => onDueDateChange(opt.dateKey)}
                                 title={
                                    opt.isToday
                                       ? "Today"
                                       : opt.isYesterday
                                         ? `Yesterday (${opt.label})`
                                         : opt.label
                                 }
                                 className={`py-1.5 px-1 flex flex-col items-center justify-center rounded-xl text-xs font-semibold border transition-all overflow-hidden ${
                                    isSelected
                                       ? "bg-brand-2 text-white border-brand-2 shadow-sm shadow-brand-2/30 ring-1 ring-brand-2"
                                       : "bg-surface-elevated text-text-tertiary border-border-strong hover:text-white hover:bg-surface-nested"
                                 }`}
                              >
                                 <span className="text-label uppercase font-bold tracking-wider leading-none truncate max-w-full">
                                    {opt.isToday
                                       ? "Today"
                                       : opt.shortLabel.startsWith("Day ")
                                         ? `D${opt.dayNumber}`
                                         : opt.shortLabel.slice(0, 3)}
                                 </span>
                                 <span className="text-caption opacity-80 mt-0.5 leading-none truncate max-w-full">
                                    {formatDayDate(opt.dateKey)}
                                 </span>
                                 {opt.isToday && (
                                    <span
                                       className={`h-1 w-1 rounded-full mt-1 ${
                                          isSelected ? "bg-white" : "bg-brand-2"
                                       }`}
                                    />
                                 )}
                              </button>
                           );
                        })}
                     </div>
                  </div>
               )}

               {task?.taskType === "weekly" && Boolean(linkableChallengeId) && (
                  <div role="group" aria-labelledby="edit-task-scope">
                     <Label
                        id="edit-task-scope"
                        className="block text-xs font-medium text-text-secondary mb-1.5"
                     >
                        Goal Scope
                     </Label>
                     <div className="grid grid-cols-2 gap-2">
                        <button
                           type="button"
                           disabled={isGraceLocked}
                           onClick={() =>
                              onChallengeIdChange(linkableChallengeId)
                           }
                           className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                              challengeId
                                 ? "bg-emerald-500/10 border-emerald-500/50 text-white ring-1 ring-emerald-500/40"
                                 : "bg-input-bg border-input-border text-text-tertiary hover:text-text-secondary hover:bg-surface-nested"
                           }`}
                        >
                           <div className="flex items-center gap-1.5 font-semibold text-xs text-emerald-400">
                              <Trophy className="h-3.5 w-3.5" />
                              <span>Challenge Goal</span>
                           </div>
                           <p className="text-meta text-text-tertiary leading-tight">
                              Mandatory for challenge completion; evaluated at
                              challenge lock under Law L6.
                           </p>
                        </button>
                        <button
                           type="button"
                           disabled={isGraceLocked}
                           onClick={() => onChallengeIdChange(null)}
                           className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                              !challengeId
                                 ? "bg-surface-nested border-border-strong text-white ring-1 ring-border-strong"
                                 : "bg-input-bg border-input-border text-text-tertiary hover:text-text-secondary hover:bg-surface-nested"
                           }`}
                        >
                           <div className="flex items-center gap-1.5 font-semibold text-xs text-text-secondary">
                              <User className="h-3.5 w-3.5" />
                              <span>Personal Task</span>
                           </div>
                           <p className="text-meta text-text-tertiary leading-tight">
                              Personal study goal; excluded from challenge lock
                              evaluation.
                           </p>
                        </button>
                     </div>
                  </div>
               )}

               <div role="group" aria-labelledby="edit-task-status">
                  <Label
                     id="edit-task-status"
                     className="block text-xs font-medium text-text-secondary mb-1.5"
                  >
                     Task Status
                  </Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                     <button
                        type="button"
                        onClick={() => onStatusChange("TODO")}
                        className={`flex items-center justify-center gap-1.5 h-10 px-2 rounded-xl text-xs font-semibold border transition-all ${
                           status === "TODO"
                              ? "bg-surface-nested text-white border-white/30 shadow-inner ring-1 ring-white/20"
                              : "bg-surface-elevated text-text-tertiary border-border-strong hover:text-white hover:bg-surface-nested"
                        }`}
                     >
                        <span
                           className={`h-2 w-2 rounded-full ${
                              status === "TODO" ? "bg-white" : "bg-input-bg"
                           }`}
                        />
                        <span>To-Do</span>
                     </button>
                     <button
                        type="button"
                        onClick={() => onStatusChange("IN_PROGRESS")}
                        className={`flex items-center justify-center gap-1.5 h-10 px-2 rounded-xl text-xs font-semibold border transition-all ${
                           status === "IN_PROGRESS"
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-inner ring-1 ring-amber-500/30"
                              : "bg-surface-elevated text-text-tertiary border-border-strong hover:text-white hover:bg-surface-nested"
                        }`}
                     >
                        <span
                           className={`h-2 w-2 rounded-full ${
                              status === "IN_PROGRESS"
                                 ? "bg-amber-400"
                                 : "bg-input-bg"
                           }`}
                        />
                        <span>In Progress</span>
                     </button>
                     <button
                        type="button"
                        onClick={() => onStatusChange("COMPLETED")}
                        className={`flex items-center justify-center gap-1.5 h-10 px-2 rounded-xl text-xs font-semibold border transition-all ${
                           status === "COMPLETED"
                              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-inner ring-1 ring-emerald-500/30"
                              : "bg-surface-elevated text-text-tertiary border-border-strong hover:text-white hover:bg-surface-nested"
                        }`}
                     >
                        <Check
                           className={`h-3.5 w-3.5 ${
                              status === "COMPLETED"
                                 ? "text-emerald-400 stroke-[3]"
                                 : "text-text-tertiary"
                           }`}
                        />
                        <span>Completed</span>
                     </button>
                     <button
                        type="button"
                        onClick={() => onStatusChange("CROSSED_OUT")}
                        className={`flex items-center justify-center gap-1.5 h-10 px-2 rounded-xl text-xs font-semibold border transition-all ${
                           status === "CROSSED_OUT"
                              ? "bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-inner ring-1 ring-rose-500/30"
                              : "bg-surface-elevated text-text-tertiary border-border-strong hover:text-white hover:bg-surface-nested"
                        }`}
                     >
                        <X
                           className={`h-3.5 w-3.5 ${
                              status === "CROSSED_OUT"
                                 ? "text-rose-400 stroke-[2.5]"
                                 : "text-text-tertiary"
                           }`}
                        />
                        <span>Crossed Out</span>
                     </button>
                  </div>
               </div>

               <div className="flex items-center justify-end gap-3 pt-3">
                  <Button
                     type="button"
                     variant="ghost"
                     onClick={() => onClose()}
                     className="h-11 px-5 rounded-xl bg-input-bg text-white hover:bg-input-bg text-xs font-medium"
                  >
                     Cancel
                  </Button>
                  <Button
                     type="submit"
                     className="h-11 px-6 rounded-xl bg-white text-text-inverse hover:bg-white/90 text-xs font-semibold"
                  >
                     Save Changes
                  </Button>
               </div>
            </form>
         </DialogContent>
      </Dialog>
   );
}
