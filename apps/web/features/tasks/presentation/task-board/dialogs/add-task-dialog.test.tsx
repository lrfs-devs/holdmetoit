// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { AddTaskDialog } from "./add-task-dialog";

afterEach(cleanup);

function renderDialog(errorMessage?: string | null) {
   return render(
      createElement(AddTaskDialog, {
         open: true,
         modalType: "daily",
         text: "Read Chapter 4",
         selectedCategory: "Focus",
         customCategory: "",
         isCreatingCategory: false,
         status: "TODO",
         dateKey: "2026-11-17",
         challengeScope: "PERSONAL",
         weeklyCategoryOptions: [],
         independentDailyCategoryOptions: [],
         dailyCategoryOptions: ["Focus"],
         dayOptions: [],
         selectedDateKey: "2026-11-17",
         effectiveTodayDate: "2026-11-17",
         linkableChallengeId: null,
         hasChallengeContext: false,
         categoryInputRef: { current: null },
         categorySelectRef: { current: null },
         errorMessage,
         onTextChange: vi.fn(),
         onSelectedCategoryChange: vi.fn(),
         onCustomCategoryChange: vi.fn(),
         onCreatingCategoryChange: vi.fn(),
         onStatusChange: vi.fn(),
         onDateKeyChange: vi.fn(),
         onChallengeScopeChange: vi.fn(),
         onSubmit: vi.fn(),
         onClose: vi.fn(),
      })
   );
}

describe("AddTaskDialog", () => {
   it("announces a save failure without clearing the draft", () => {
      renderDialog("Could not save this task on this device.");

      expect(screen.getByRole("alert").textContent).toContain(
         "Could not save this task on this device."
      );
      // The draft survives so the user can retry.
      expect(
         (screen.getByLabelText(/todo content/i) as HTMLInputElement).value
      ).toBe("Read Chapter 4");
   });

   it("renders no alert when there is no error", () => {
      renderDialog();
      expect(screen.queryByRole("alert")).toBeNull();
   });
});
