"use client";

import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface DeleteCategoryDialogProps {
   open: boolean;
   categoryName?: string;
   onConfirm: () => void;
   onClose: () => void;
}

/** Confirmation dialog for deleting a category and its tasks. */
export function DeleteCategoryDialog({
   open,
   categoryName,
   onConfirm,
   onClose,
}: DeleteCategoryDialogProps) {
   return (
      <AlertDialog
         open={open}
         onOpenChange={(nextOpen) => {
            if (!nextOpen) onClose();
         }}
      >
         <AlertDialogContent>
            <AlertDialogHeader>
               <AlertDialogTitle>Delete Category</AlertDialogTitle>
               <AlertDialogDescription>
                  Are you sure you want to delete{" "}
                  <span className="font-semibold text-white">
                     &quot;{categoryName}&quot;
                  </span>
                  ? All daily and weekly tasks inside this category will also be
                  permanently deleted.
               </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
               <AlertDialogCancel>Cancel</AlertDialogCancel>
               <AlertDialogAction onClick={onConfirm}>
                  Delete Category
               </AlertDialogAction>
            </AlertDialogFooter>
         </AlertDialogContent>
      </AlertDialog>
   );
}
