"use client";

import { useState, useCallback, useEffect } from "react";
import { Copy, Check, ChevronDown, Sparkles, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TaskExportStyle } from "@/features/tasks/domain/task-export";

const STORAGE_KEY = "holdmetoit_task_export_style";

export interface TaskExportButtonProps {
   /** Callback to generate the text to export for the given style. */
   onExport: (style: TaskExportStyle) => string;
   /** Label indicating the scope of the export (e.g. "Daily" or "Weekly"). */
   scopeLabel?: string;
   /** Optional data-testid attribute for testing. */
   dataTestId?: string;
   /** Additional CSS classes for styling. */
   className?: string;
}

export function TaskExportButton({
   onExport,
   scopeLabel = "Todos",
   dataTestId = "task-export-button",
   className,
}: TaskExportButtonProps) {
   const [preferredStyle, setPreferredStyle] =
      useState<TaskExportStyle>("markdown");
   const [copied, setCopied] = useState(false);

   // Load preferred style from localStorage after mount
   useEffect(() => {
      try {
         const saved = localStorage.getItem(STORAGE_KEY);
         if (saved === "markdown" || saved === "emoji") {
            setPreferredStyle(saved);
         }
      } catch {}
   }, []);

   const handleCopy = useCallback(
      async (style: TaskExportStyle) => {
         try {
            const text = onExport(style);
            if (!text || !text.trim()) {
               toast.error("No tasks available to export.");
               return;
            }

            if (navigator?.clipboard?.writeText) {
               await navigator.clipboard.writeText(text);
            } else {
               // Fallback for non-secure contexts
               const textArea = document.createElement("textarea");
               textArea.value = text;
               textArea.style.position = "fixed";
               textArea.style.opacity = "0";
               document.body.appendChild(textArea);
               textArea.select();
               document.execCommand("copy");
               document.body.removeChild(textArea);
            }

            // Save preference
            try {
               localStorage.setItem(STORAGE_KEY, style);
               setPreferredStyle(style);
            } catch {}

            setCopied(true);
            const styleName =
               style === "emoji" ? "Emoji Format" : "Markdown Checklist";
            toast.success(
               `Exported ${scopeLabel} (${styleName}) to clipboard! Ready to paste into Discord.`
            );

            setTimeout(() => {
               setCopied(false);
            }, 2000);
         } catch {
            toast.error("Failed to copy tasks to clipboard.");
         }
      },
      [onExport, scopeLabel]
   );

   return (
      <DropdownMenu>
         <DropdownMenuTrigger asChild>
            <Button
               type="button"
               variant="outline"
               size="sm"
               data-testid={dataTestId}
               className={`h-7 px-2 sm:px-2.5 text-xs font-medium border-border-default bg-surface-nested hover:bg-surface-secondary transition-all gap-1.5 shrink-0 ${
                  copied
                     ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                     : "text-text-secondary hover:text-white"
               } ${className || ""}`}
               title={`Export ${scopeLabel} tasks for Discord`}
               aria-label={`Export ${scopeLabel} tasks for Discord`}
            >
               {copied ? (
                  <>
                     <Check className="h-3.5 w-3.5 text-emerald-400 animate-in zoom-in-50 duration-150" />
                     <span>Copied!</span>
                  </>
               ) : (
                  <>
                     <Copy className="h-3.5 w-3.5" />
                     <span>Export</span>
                     <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                  </>
               )}
            </Button>
         </DropdownMenuTrigger>
         <DropdownMenuContent
            align="end"
            className="w-56 bg-surface-primary border-border-default shadow-xl"
         >
            <DropdownMenuLabel className="text-micro text-text-tertiary uppercase tracking-wider font-semibold">
               Export {scopeLabel} for Discord
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border-subtle" />
            <DropdownMenuItem
               data-testid={`${dataTestId}-markdown`}
               onClick={() => handleCopy("markdown")}
               className="cursor-pointer text-xs flex items-center justify-between text-text-secondary hover:text-white focus:text-white focus:bg-surface-secondary py-2"
            >
               <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-brand-2" />
                  <div className="flex flex-col">
                     <span className="font-medium text-white">
                        Markdown Checklist
                     </span>
                     <span className="text-micro text-text-tertiary">
                        Standard - [ ] and - [x]
                     </span>
                  </div>
               </div>
               {preferredStyle === "markdown" && (
                  <span className="text-micro text-emerald-400 font-semibold">
                     Default
                  </span>
               )}
            </DropdownMenuItem>
            <DropdownMenuItem
               data-testid={`${dataTestId}-emoji`}
               onClick={() => handleCopy("emoji")}
               className="cursor-pointer text-xs flex items-center justify-between text-text-secondary hover:text-white focus:text-white focus:bg-surface-secondary py-2"
            >
               <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  <div className="flex flex-col">
                     <span className="font-medium text-white">
                        High-Contrast Emojis
                     </span>
                     <span className="text-micro text-text-tertiary">
                        Visual ⬜, ✅, ⏳, ❌
                     </span>
                  </div>
               </div>
               {preferredStyle === "emoji" && (
                  <span className="text-micro text-emerald-400 font-semibold">
                     Default
                  </span>
               )}
            </DropdownMenuItem>
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
