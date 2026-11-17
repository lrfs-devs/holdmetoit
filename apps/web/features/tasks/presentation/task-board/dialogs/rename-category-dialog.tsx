"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export interface RenameCategoryDialogProps {
   open: boolean;
   name: string;
   onNameChange: (name: string) => void;
   onSave: () => void;
   onClose: () => void;
}

/** Rename-category dialog. Controlled by useCategoryMutations. */
export function RenameCategoryDialog({
   open,
   name,
   onNameChange,
   onSave,
   onClose,
}: RenameCategoryDialogProps) {
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
                  Rename Category
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
                     htmlFor="edit-category-name"
                     className="block text-xs font-medium text-text-secondary mb-1.5"
                  >
                     Category Name
                  </Label>
                  <Input
                     id="edit-category-name"
                     type="text"
                     value={name}
                     onChange={(e) => onNameChange(e.target.value)}
                     autoFocus
                     required
                     className="h-11 bg-input-bg border-input-border text-text-primary rounded-xl"
                  />
               </div>
               <div className="flex items-center justify-end gap-3 pt-3">
                  <Button
                     type="button"
                     variant="ghost"
                     onClick={onClose}
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
