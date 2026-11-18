// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTaskModals } from "./use-task-modals";

const dayOptions = [
   {
      dayNumber: 1,
      dateKey: "2026-11-17",
      label: "Day 1",
      shortLabel: "D1",
      weekday: "Tue",
      isPast: false,
      isToday: true,
      isYesterday: false,
      isFuture: false,
   },
];

function harness() {
   return renderHook(() =>
      useTaskModals({
         selectedDateKey: "2026-11-17",
         effectiveTodayDate: "2026-11-17",
         todayDayOption: dayOptions[0],
         dayOptions,
         checkIsDayLocked: () => false,
         dailyCategoryOptions: ["Focus"],
         weeklyCategoryOptions: [],
         linkableChallengeId: null,
      })
   );
}

beforeEach(() => {
   vi.clearAllMocks();
});

describe("useTaskModals — submission token", () => {
   it("invalidates an in-flight submission when the dialog closes", () => {
      const { result } = harness();

      act(() => result.current.add.openDaily());
      const token = result.current.add.submissionTokenRef.current;

      act(() => result.current.add.close());

      expect(result.current.add.submissionTokenRef.current).not.toBe(token);
   });

   it("invalidates again when the dialog reopens for a new draft", () => {
      const { result } = harness();

      act(() => result.current.add.openDaily());
      const first = result.current.add.submissionTokenRef.current;

      act(() => result.current.add.close());
      act(() => result.current.add.openDaily());
      const second = result.current.add.submissionTokenRef.current;

      expect(second).not.toBe(first);
   });

   it("leaves the token stable while the draft is edited", () => {
      const { result } = harness();

      act(() => result.current.add.openDaily());
      const token = result.current.add.submissionTokenRef.current;

      act(() => result.current.add.setText("Read Chapter 4"));
      act(() => result.current.add.setStatus("IN_PROGRESS"));

      expect(result.current.add.submissionTokenRef.current).toBe(token);
   });
});
