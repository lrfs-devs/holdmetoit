// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import {
   render,
   screen,
   fireEvent,
   cleanup,
   waitFor,
} from "@testing-library/react";
import { TaskExportButton } from "./task-export-button";
import { toast } from "sonner";

vi.mock("sonner", () => ({
   toast: {
      success: vi.fn(),
      error: vi.fn(),
   },
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
   DropdownMenu: ({ children }: any) => <div>{children}</div>,
   DropdownMenuTrigger: ({ children, asChild }: any) => children,
   DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
   DropdownMenuItem: ({ children, onClick, ...props }: any) => (
      <button onClick={onClick} {...props}>
         {children}
      </button>
   ),
   DropdownMenuLabel: ({ children, ...props }: any) => (
      <div {...props}>{children}</div>
   ),
   DropdownMenuSeparator: (props: any) => <hr {...props} />,
}));

describe("TaskExportButton", () => {
   const originalClipboard = navigator.clipboard;
   let storageStore: Record<string, string> = {};

   beforeEach(() => {
      vi.clearAllMocks();
      storageStore = {};

      const mockStorage = {
         getItem: vi.fn((key: string) => storageStore[key] || null),
         setItem: vi.fn((key: string, value: string) => {
            storageStore[key] = value;
         }),
         removeItem: vi.fn((key: string) => {
            delete storageStore[key];
         }),
         clear: vi.fn(() => {
            storageStore = {};
         }),
      };
      Object.defineProperty(window, "localStorage", {
         value: mockStorage,
         writable: true,
      });

      Object.assign(navigator, {
         clipboard: {
            writeText: vi.fn().mockResolvedValue(undefined),
         },
      });
   });

   afterEach(() => {
      cleanup();
      Object.assign(navigator, { clipboard: originalClipboard });
      delete (document as any).execCommand;
   });

   it("renders the export button with Export label and chevron format trigger", () => {
      render(
         <TaskExportButton
            onExport={() => "export text"}
            scopeLabel="Daily"
            dataTestId="test-export-btn"
         />
      );

      const button = screen.getByTestId("test-export-btn");
      expect(button).toBeDefined();
      expect(button.getAttribute("title")).toContain("Export Daily tasks");
      expect(button.textContent).toContain("Export");

      const chevronTrigger = screen.getByTestId("test-export-btn-trigger");
      expect(chevronTrigger).toBeDefined();
      expect(chevronTrigger.getAttribute("title")).toBe(
         "Choose export format for Daily tasks"
      );
   });

   it("copies default style in one click when clicking the primary button directly", async () => {
      const mockExport = vi.fn().mockReturnValue("## 📋 One-Click Export");

      render(
         <TaskExportButton
            onExport={mockExport}
            scopeLabel="Daily"
            dataTestId="test-export-btn"
         />
      );

      // Click primary button directly in 1 click
      const button = screen.getByTestId("test-export-btn");
      fireEvent.click(button);

      await waitFor(() => {
         expect(mockExport).toHaveBeenCalledWith("markdown");
         expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            "## 📋 One-Click Export"
         );
         expect(toast.success).toHaveBeenCalledWith(
            expect.stringContaining(
               "Exported Daily (Markdown Checklist) to clipboard!"
            )
         );
         expect(screen.getByText("Copied!")).toBeDefined();
      });
   });

   it("copies markdown checklist to clipboard when markdown option is clicked", async () => {
      const mockExport = vi.fn().mockReturnValue("## 📋 Exported Tasks");

      render(
         <TaskExportButton
            onExport={mockExport}
            scopeLabel="Daily"
            dataTestId="test-export-btn"
         />
      );

      const markdownOption = screen.getByTestId("test-export-btn-markdown");
      fireEvent.click(markdownOption);

      await waitFor(() => {
         expect(mockExport).toHaveBeenCalledWith("markdown");
         expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            "## 📋 Exported Tasks"
         );
         expect(toast.success).toHaveBeenCalledWith(
            expect.stringContaining(
               "Exported Daily (Markdown Checklist) to clipboard!"
            )
         );
         expect(screen.getByText("Copied!")).toBeDefined();
      });
   });

   it("copies emoji format to clipboard when emoji option is clicked and stores preference for next 1-click", async () => {
      const mockExport = vi.fn().mockReturnValue("**📋 EMOJI TASKS**");

      render(
         <TaskExportButton
            onExport={mockExport}
            scopeLabel="Weekly"
            dataTestId="test-weekly-export"
         />
      );

      const emojiOption = screen.getByTestId("test-weekly-export-emoji");
      fireEvent.click(emojiOption);

      await waitFor(() => {
         expect(mockExport).toHaveBeenCalledWith("emoji");
         expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            "**📋 EMOJI TASKS**"
         );
         expect(toast.success).toHaveBeenCalledWith(
            expect.stringContaining(
               "Exported Weekly (Emoji Format) to clipboard!"
            )
         );
         expect(
            window.localStorage.getItem("holdmetoit_task_export_style")
         ).toBe("emoji");
      });

      // Subsequent 1-click on the primary button should now use the saved emoji format
      mockExport.mockClear();
      const primaryBtn = screen.getByTestId("test-weekly-export");
      fireEvent.click(primaryBtn);

      await waitFor(() => {
         expect(mockExport).toHaveBeenCalledWith("emoji");
      });
   });

   it("displays error toast when onExport returns empty string", async () => {
      const mockExport = vi.fn().mockReturnValue("");

      render(
         <TaskExportButton
            onExport={mockExport}
            scopeLabel="Daily"
            dataTestId="test-export-btn"
         />
      );

      const button = screen.getByTestId("test-export-btn");
      fireEvent.click(button);

      await waitFor(() => {
         expect(toast.error).toHaveBeenCalledWith(
            "No tasks available to export."
         );
         expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
      });
   });

   it("falls back to execCommand('copy') when navigator.clipboard is unavailable and cleans up textArea", async () => {
      // Mock clipboard unavailable
      Object.assign(navigator, { clipboard: undefined });
      const mockExport = vi.fn().mockReturnValue("Fallback exported text");

      const execCommandMock = vi.fn().mockReturnValue(true);
      document.execCommand = execCommandMock;

      render(
         <TaskExportButton
            onExport={mockExport}
            scopeLabel="Daily"
            dataTestId="test-export-btn"
         />
      );

      const button = screen.getByTestId("test-export-btn");
      fireEvent.click(button);

      await waitFor(() => {
         expect(execCommandMock).toHaveBeenCalledWith("copy");
         expect(toast.success).toHaveBeenCalledWith(
            expect.stringContaining("Exported Daily (Markdown Checklist)")
         );
         // Ensure temporary textarea is removed from DOM
         expect(document.querySelector("textarea")).toBeNull();
      });
   });

   it("shows error toast when execCommand('copy') returns false", async () => {
      Object.assign(navigator, { clipboard: undefined });
      const mockExport = vi.fn().mockReturnValue("Fallback exported text");

      const execCommandMock = vi.fn().mockReturnValue(false);
      document.execCommand = execCommandMock;

      render(
         <TaskExportButton
            onExport={mockExport}
            scopeLabel="Daily"
            dataTestId="test-export-btn"
         />
      );

      const button = screen.getByTestId("test-export-btn");
      fireEvent.click(button);

      await waitFor(() => {
         expect(execCommandMock).toHaveBeenCalledWith("copy");
         expect(toast.error).toHaveBeenCalledWith(
            "Failed to copy tasks to clipboard."
         );
         expect(document.querySelector("textarea")).toBeNull();
      });
   });
});
