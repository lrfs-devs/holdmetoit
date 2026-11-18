"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
   getAdjacentWeekAnchor,
   isChallengeDayDateLocked,
   isSameCalendarWeek,
   type ChallengeDayOption,
} from "@/features/study-logs/domain/challenge-day";
import type { BoardTask } from "../task-board.types";
import {
   selectActiveDayOption,
   selectActiveWeekDateKeys,
   selectActiveWeeklyWeekDateKeys,
   selectDayOptions,
   selectInitialDayOption,
   selectIsTaskInWeeklyWeek,
   selectIsViewingCurrentWeeklyWeek,
   selectTaskDateKey,
   selectTodayDayOption,
   selectWeekRangeLabel,
   selectWeeklyRangeLabel,
} from "../task-board.selectors";

export interface UseWeekNavigationOptions {
   initialSelectedDateKey?: string;
   hasChallengeContext: boolean;
   effectiveStartDate?: string;
   effectiveTodayDate: string;
   totalChallengeDays: number;
   todayDayNumber?: number;
   challengeStartDate?: string;
   challengeStatus?: "UPCOMING" | "ACTIVE" | "COMPLETED";
   linkableChallengeId: string | null;
}

export interface WeekNavigation {
   activeWeekAnchorDateKey: string;
   setActiveWeekAnchorDateKey: (value: string) => void;
   dayOptions: ChallengeDayOption[];
   todayDayOption: ChallengeDayOption;
   initialDayOption: ChallengeDayOption | undefined;
   selectedDateKey: string;
   setSelectedDateKey: (value: string) => void;
   selectedDayNumber: number;
   setSelectedDayNumber: (value: number) => void;
   activeDayOption: ChallengeDayOption;
   isActiveDayToday: boolean;
   isActiveDayPast: boolean;
   checkIsDayLocked: (dateKey: string) => boolean;
   isPastDayLocked: boolean;
   activeWeekDateKeys: string[];
   weekRangeLabel: string;
   handleSelectDay: (opt: ChallengeDayOption) => void;
   handleJumpToToday: () => void;
   handlePreviousWeek: () => void;
   handleNextWeek: () => void;
   handleSelectDateFromPicker: (targetDateKey: string) => void;
   activeWeeklyAnchorDateKey: string;
   setActiveWeeklyAnchorDateKey: (value: string) => void;
   activeWeeklyWeekDateKeys: string[];
   weeklyRangeLabel: string;
   isViewingCurrentWeeklyWeek: boolean;
   handleWeeklyPreviousWeek: () => void;
   handleWeeklyNextWeek: () => void;
   handleWeeklyJumpToCurrentWeek: () => void;
   handleSelectWeeklyDateFromPicker: (targetDateKey: string) => void;
   isTaskInWeeklyWeek: (task: BoardTask) => boolean;
   getTaskDateKey: (task: BoardTask) => string;
}

/**
 * Owns day/week selection for both boards: anchors, pills, ranges and lock checks.
 */
export function useWeekNavigation({
   initialSelectedDateKey,
   hasChallengeContext,
   effectiveStartDate,
   effectiveTodayDate,
   totalChallengeDays,
   todayDayNumber,
   challengeStartDate,
   challengeStatus,
   linkableChallengeId,
}: UseWeekNavigationOptions): WeekNavigation {
   const [activeWeekAnchorDateKey, setActiveWeekAnchorDateKey] =
      useState<string>(() => {
         if (initialSelectedDateKey) return initialSelectedDateKey;
         if (hasChallengeContext && effectiveStartDate) {
            const startKey = effectiveStartDate.slice(0, 10);
            if (isSameCalendarWeek(effectiveTodayDate, startKey)) {
               return effectiveTodayDate;
            }
            return startKey;
         }
         return effectiveTodayDate;
      });

   const dayOptions: ChallengeDayOption[] = useMemo(
      () =>
         selectDayOptions(
            {
               hasChallengeContext,
               effectiveStartDate,
               effectiveTodayDate,
               totalChallengeDays,
            },
            activeWeekAnchorDateKey
         ),
      [
         hasChallengeContext,
         effectiveStartDate,
         effectiveTodayDate,
         activeWeekAnchorDateKey,
         totalChallengeDays,
      ]
   );

   const todayDayOption = useMemo(
      () => selectTodayDayOption(dayOptions),
      [dayOptions]
   );

   const initialDayOption = useMemo(
      () => selectInitialDayOption(dayOptions, initialSelectedDateKey),
      [dayOptions, initialSelectedDateKey]
   );

   const [selectedDateKey, setSelectedDateKey] = useState<string>(
      () =>
         initialDayOption?.dateKey ||
         initialSelectedDateKey ||
         todayDayOption?.dateKey ||
         effectiveTodayDate
   );
   const [selectedDayNumber, setSelectedDayNumber] = useState<number>(
      () =>
         initialDayOption?.dayNumber ||
         todayDayOption?.dayNumber ||
         (hasChallengeContext ? todayDayNumber : undefined) ||
         1
   );

   const activeDayOption = useMemo(
      () => selectActiveDayOption(dayOptions, selectedDateKey, todayDayOption),
      [dayOptions, selectedDateKey, todayDayOption]
   );

   useEffect(() => {
      if (
         dayOptions.length > 0 &&
         !dayOptions.some((d) => d.dateKey === selectedDateKey)
      ) {
         const fallback = dayOptions.find((d) => d.isToday) || dayOptions[0];
         if (fallback) {
            setSelectedDateKey(fallback.dateKey);
            setSelectedDayNumber(fallback.dayNumber);
         }
      }
   }, [dayOptions, selectedDateKey]);

   const isActiveDayToday =
      selectedDateKey === effectiveTodayDate ||
      Boolean(activeDayOption?.isToday);
   const isActiveDayPast =
      selectedDateKey < effectiveTodayDate || Boolean(activeDayOption?.isPast);

   const checkIsDayLocked = useCallback(
      (dateKey: string): boolean => {
         return isChallengeDayDateLocked(dateKey, effectiveTodayDate, {
            challengeStartDate,
            totalChallengeDays,
            challengeStatus,
         });
      },
      [
         effectiveTodayDate,
         challengeStartDate,
         totalChallengeDays,
         challengeStatus,
      ]
   );

   const isPastDayLocked = checkIsDayLocked(selectedDateKey);

   const activeWeekDateKeys = useMemo(
      () =>
         selectActiveWeekDateKeys(
            activeWeekAnchorDateKey,
            effectiveTodayDate,
            dayOptions
         ),
      [activeWeekAnchorDateKey, effectiveTodayDate, dayOptions]
   );

   const weekRangeLabel = useMemo(
      () =>
         selectWeekRangeLabel(
            activeWeekAnchorDateKey,
            effectiveTodayDate,
            dayOptions
         ),
      [activeWeekAnchorDateKey, effectiveTodayDate, dayOptions]
   );

   const handleSelectDay = (opt: ChallengeDayOption) => {
      setSelectedDateKey(opt.dateKey);
      setSelectedDayNumber(opt.dayNumber);
   };

   const handleJumpToToday = () => {
      setActiveWeekAnchorDateKey(effectiveTodayDate);
      setSelectedDateKey(effectiveTodayDate);
      try {
         const parts = effectiveTodayDate.split("-").map(Number);
         if (parts[0] && parts[1] && parts[2]) {
            const dayOfWeek = new Date(
               Date.UTC(parts[0], parts[1] - 1, parts[2])
            ).getUTCDay();
            setSelectedDayNumber(((dayOfWeek + 6) % 7) + 1);
         }
      } catch {
         setSelectedDayNumber(1);
      }
   };

   const handlePreviousWeek = () => {
      const newAnchor = getAdjacentWeekAnchor(activeWeekAnchorDateKey, -1);
      setActiveWeekAnchorDateKey(newAnchor);
      const newSelected = getAdjacentWeekAnchor(selectedDateKey, -1);
      setSelectedDateKey(newSelected);
   };

   const handleNextWeek = () => {
      const newAnchor = getAdjacentWeekAnchor(activeWeekAnchorDateKey, 1);
      setActiveWeekAnchorDateKey(newAnchor);
      const newSelected = getAdjacentWeekAnchor(selectedDateKey, 1);
      setSelectedDateKey(newSelected);
   };

   const handleSelectDateFromPicker = (targetDateKey: string) => {
      setActiveWeekAnchorDateKey(targetDateKey);
      setSelectedDateKey(targetDateKey);
      try {
         const parts = targetDateKey.split("-").map(Number);
         if (parts[0] && parts[1] && parts[2]) {
            const dayOfWeek = new Date(
               Date.UTC(parts[0], parts[1] - 1, parts[2])
            ).getUTCDay();
            setSelectedDayNumber(((dayOfWeek + 6) % 7) + 1);
         }
      } catch {
         setSelectedDayNumber(1);
      }
   };

   // Weekly Todos Week Navigation (adapted for weekly system)
   const [activeWeeklyAnchorDateKey, setActiveWeeklyAnchorDateKey] =
      useState<string>(() => {
         if (initialSelectedDateKey) return initialSelectedDateKey;
         if (hasChallengeContext && effectiveStartDate) {
            const startKey = effectiveStartDate.slice(0, 10);
            if (isSameCalendarWeek(effectiveTodayDate, startKey)) {
               return effectiveTodayDate;
            }
            return startKey;
         }
         return effectiveTodayDate;
      });

   const activeWeeklyWeekDateKeys = useMemo(
      () =>
         selectActiveWeeklyWeekDateKeys(
            activeWeeklyAnchorDateKey,
            effectiveTodayDate
         ),
      [activeWeeklyAnchorDateKey, effectiveTodayDate]
   );

   const weeklyRangeLabel = useMemo(
      () =>
         selectWeeklyRangeLabel(activeWeeklyAnchorDateKey, effectiveTodayDate),
      [activeWeeklyAnchorDateKey, effectiveTodayDate]
   );

   const isViewingCurrentWeeklyWeek = useMemo(
      () =>
         selectIsViewingCurrentWeeklyWeek(
            activeWeeklyAnchorDateKey,
            effectiveTodayDate
         ),
      [activeWeeklyAnchorDateKey, effectiveTodayDate]
   );

   const handleWeeklyPreviousWeek = () => {
      const newAnchor = getAdjacentWeekAnchor(activeWeeklyAnchorDateKey, -1);
      setActiveWeeklyAnchorDateKey(newAnchor);
   };

   const handleWeeklyNextWeek = () => {
      const newAnchor = getAdjacentWeekAnchor(activeWeeklyAnchorDateKey, 1);
      setActiveWeeklyAnchorDateKey(newAnchor);
   };

   const handleWeeklyJumpToCurrentWeek = () => {
      setActiveWeeklyAnchorDateKey(effectiveTodayDate);
   };

   const handleSelectWeeklyDateFromPicker = (targetDateKey: string) => {
      setActiveWeeklyAnchorDateKey(targetDateKey);
   };

   const isTaskInWeeklyWeek = useCallback(
      (task: BoardTask): boolean =>
         selectIsTaskInWeeklyWeek(task, {
            activeWeeklyAnchorDateKey,
            hasChallengeContext,
            linkableChallengeId,
            effectiveStartDate,
            isViewingCurrentWeeklyWeek,
         }),
      [
         activeWeeklyAnchorDateKey,
         hasChallengeContext,
         linkableChallengeId,
         effectiveStartDate,
         isViewingCurrentWeeklyWeek,
      ]
   );

   const getTaskDateKey = useCallback(
      (task: BoardTask): string => selectTaskDateKey(task, effectiveTodayDate),
      [effectiveTodayDate]
   );

   return {
      activeWeekAnchorDateKey,
      setActiveWeekAnchorDateKey,
      dayOptions,
      todayDayOption,
      initialDayOption,
      selectedDateKey,
      setSelectedDateKey,
      selectedDayNumber,
      setSelectedDayNumber,
      activeDayOption,
      isActiveDayToday,
      isActiveDayPast,
      checkIsDayLocked,
      isPastDayLocked,
      activeWeekDateKeys,
      weekRangeLabel,
      handleSelectDay,
      handleJumpToToday,
      handlePreviousWeek,
      handleNextWeek,
      handleSelectDateFromPicker,
      activeWeeklyAnchorDateKey,
      setActiveWeeklyAnchorDateKey,
      activeWeeklyWeekDateKeys,
      weeklyRangeLabel,
      isViewingCurrentWeeklyWeek,
      handleWeeklyPreviousWeek,
      handleWeeklyNextWeek,
      handleWeeklyJumpToCurrentWeek,
      handleSelectWeeklyDateFromPicker,
      isTaskInWeeklyWeek,
      getTaskDateKey,
   };
}
