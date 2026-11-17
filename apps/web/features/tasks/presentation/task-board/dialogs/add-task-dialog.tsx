"use client";

import type { RefObject } from "react";
import { Calendar, Check, Lock, Plus, Trophy, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
   Select,
   SelectContent,
   SelectGroup,
   SelectItem,
   SelectLabel,
   SelectTrigger,
   SelectValue,
} from "@/components/ui/select";
import {
   formatDayDate,
   type ChallengeDayOption,
} from "@/features/study-logs/domain/challenge-day";
import type { TaskScope } from "@/features/tasks/domain/task-scope";
import type { TaskStatus } from "@/features/tasks/domain/task.types";

export interface AddTaskDialogProps {
   open: boolean;
   modalType: "daily" | "weekly" | null;
   text: string;
   selectedCategory: string;
   customCategory: string;
   isCreatingCategory: boolean;
   status: TaskStatus;
   dateKey: string;
   challengeScope: TaskScope;
   weeklyCategoryOptions: string[];
   independentDailyCategoryOptions: string[];
   dailyCategoryOptions: string[];
   dayOptions: ChallengeDayOption[];
   selectedDateKey: string;
   effectiveTodayDate: string;
   linkableChallengeId: string | null;
   hasChallengeContext: boolean;
   categoryInputRef: RefObject<HTMLInputElement | null>;
   categorySelectRef: RefObject<HTMLButtonElement | null>;
   onTextChange: (value: string) => void;
   onSelectedCategoryChange: (value: string) => void;
   onCustomCategoryChange: (value: string) => void;
   onCreatingCategoryChange: (value: boolean) => void;
   onStatusChange: (status: TaskStatus) => void;
   onDateKeyChange: (dateKey: string) => void;
   onChallengeScopeChange: (scope: TaskScope) => void;
   onSubmit: (e: React.FormEvent) => void;
   onClose: () => void;
}

/** Add-task dialog. Controlled by the board's modal state. */
export function AddTaskDialog({
   open,
   modalType,
   text,
   selectedCategory,
   customCategory,
   isCreatingCategory,
   status,
   dateKey,
   challengeScope,
   weeklyCategoryOptions,
   independentDailyCategoryOptions,
   dailyCategoryOptions,
   dayOptions,
   selectedDateKey,
   effectiveTodayDate,
   linkableChallengeId,
   hasChallengeContext,
   categoryInputRef,
   categorySelectRef,
   onTextChange,
   onSelectedCategoryChange,
   onCustomCategoryChange,
   onCreatingCategoryChange,
   onStatusChange,
   onDateKeyChange,
   onChallengeScopeChange,
   onSubmit,
   onClose,
}: AddTaskDialogProps) {
   return (
      <Dialog
         open={open}
         onOpenChange={(open) => {
            if (!open) onClose();
         }}
      >
         <DialogContent className="max-w-md rounded-2xl border-border-strong bg-surface-nested p-6 space-y-5">
            <div className="flex items-center justify-between">
               <DialogTitle className="text-xl font-bold text-white">
                  Add {modalType === "daily" ? "Daily" : "Weekly"} Todo
               </DialogTitle>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
               <div>
                  <Label
                     htmlFor="add-todo-content"
                     className="block text-xs font-medium text-text-secondary mb-1.5"
                  >
                     Todo Content
                  </Label>
                  <Input
                     id="add-todo-content"
                     type="text"
                     placeholder="What needs to get done?"
                     value={text}
                     onChange={(e) => onTextChange(e.target.value)}
                     autoFocus
                     required
                     className="h-11 bg-input-bg border-input-border text-text-primary placeholder-text-secondary rounded-xl"
                  />
               </div>

               <div role="group" aria-labelledby="add-todo-category">
                  <Label
                     id="add-todo-category"
                     className="block text-xs font-medium text-text-secondary mb-1.5"
                  >
                     Todo Category
                  </Label>
                  {!isCreatingCategory ? (
                     <div className="flex gap-2">
                        <Select
                           value={selectedCategory}
                           onValueChange={(value) => {
                              if (value === "__NEW__") {
                                 onCreatingCategoryChange(true);
                                 setTimeout(() => {
                                    categoryInputRef.current?.focus();
                                    categoryInputRef.current?.select();
                                 }, 50);
                              } else {
                                 onSelectedCategoryChange(value);
                              }
                           }}
                        >
                           <SelectTrigger
                              ref={categorySelectRef}
                              data-testid="todo-category-select"
                              className="h-11 w-full rounded-xl border-input-border bg-input-bg px-3 text-sm text-text-primary"
                           >
                              <SelectValue placeholder="Select a category" />
                           </SelectTrigger>
                           <SelectContent>
                              {modalType === "daily" ? (
                                 <>
                                    {weeklyCategoryOptions.length > 0 && (
                                       <SelectGroup>
                                          <SelectLabel>
                                             Weekly Categories (Inherited)
                                          </SelectLabel>
                                          {weeklyCategoryOptions.map(
                                             (catName) => (
                                                <SelectItem
                                                   key={catName}
                                                   value={catName}
                                                >
                                                   {catName}
                                                </SelectItem>
                                             )
                                          )}
                                       </SelectGroup>
                                    )}
                                    {independentDailyCategoryOptions.length >
                                       0 && (
                                       <SelectGroup>
                                          <SelectLabel>
                                             Independent Daily Categories
                                          </SelectLabel>
                                          {independentDailyCategoryOptions.map(
                                             (catName) => (
                                                <SelectItem
                                                   key={catName}
                                                   value={catName}
                                                >
                                                   {catName}
                                                </SelectItem>
                                             )
                                          )}
                                       </SelectGroup>
                                    )}
                                    <SelectItem value="__NEW__">
                                       + Create Independent Category...
                                    </SelectItem>
                                 </>
                              ) : (
                                 <>
                                    {weeklyCategoryOptions.map((catName) => (
                                       <SelectItem
                                          key={catName}
                                          value={catName}
                                       >
                                          {catName}
                                       </SelectItem>
                                    ))}
                                    <SelectItem value="__NEW__">
                                       + Create New Category...
                                    </SelectItem>
                                 </>
                              )}
                           </SelectContent>
                        </Select>
                     </div>
                  ) : (
                     <div className="flex gap-2">
                        <Input
                           ref={categoryInputRef}
                           type="text"
                           placeholder={
                              modalType === "daily"
                                 ? "Independent category name (e.g. Unplanned, Urgent)"
                                 : "Category name"
                           }
                           value={customCategory}
                           onChange={(e) =>
                              onCustomCategoryChange(e.target.value)
                           }
                           autoFocus
                           className="h-11 bg-input-bg border-input-border text-text-primary rounded-xl"
                        />
                        {(modalType === "daily"
                           ? dailyCategoryOptions
                           : weeklyCategoryOptions
                        ).length > 0 && (
                           <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                 onCreatingCategoryChange(false);
                                 setTimeout(() => {
                                    categorySelectRef.current?.focus();
                                 }, 50);
                              }}
                              className="h-11 border-input-border text-xs text-white"
                           >
                              Back
                           </Button>
                        )}
                     </div>
                  )}
               </div>

               {modalType === "daily" && (
                  <div role="group" aria-labelledby="add-todo-day">
                     <Label
                        id="add-todo-day"
                        className="block text-xs font-medium text-text-secondary mb-1.5 flex items-center justify-between"
                     >
                        <span>
                           {hasChallengeContext
                              ? "Assigned Challenge Day"
                              : "Assigned Day"}
                        </span>
                        <span className="text-meta text-brand-2 font-semibold">
                           {formatDayDate(dateKey || selectedDateKey)}
                        </span>
                     </Label>
                     <div className="grid grid-cols-7 gap-1 w-full pb-1">
                        {dayOptions.map((opt) => {
                           const isSelected =
                              (dateKey || selectedDateKey) === opt.dateKey;
                           const isPastDay =
                              opt.isPast ?? opt.dateKey < effectiveTodayDate;
                           const isDayLocked = hasChallengeContext && isPastDay;

                           if (isDayLocked) {
                              return (
                                 <button
                                    key={opt.dateKey}
                                    type="button"
                                    disabled
                                    title={`${opt.label} (Past Day — Locked for new tasks)`}
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
                                 onClick={() => onDateKeyChange(opt.dateKey)}
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

               {modalType === "weekly" && Boolean(linkableChallengeId) && (
                  <div role="group" aria-labelledby="add-todo-scope">
                     <Label
                        id="add-todo-scope"
                        className="block text-xs font-medium text-text-secondary mb-1.5"
                     >
                        Goal Scope
                     </Label>
                     <div className="grid grid-cols-2 gap-2">
                        <button
                           type="button"
                           onClick={() => onChallengeScopeChange("CHALLENGE")}
                           className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                              challengeScope === "CHALLENGE"
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
                           onClick={() => onChallengeScopeChange("PERSONAL")}
                           className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                              challengeScope === "PERSONAL"
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

               <div role="group" aria-labelledby="add-todo-status">
                  <Label
                     id="add-todo-status"
                     className="block text-xs font-medium text-text-secondary mb-1.5"
                  >
                     Initial Status
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
                     Submit
                  </Button>
               </div>
            </form>
         </DialogContent>
      </Dialog>
   );
}
