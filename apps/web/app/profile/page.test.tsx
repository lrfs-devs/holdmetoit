import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import ProfilePage from "./page";
import { auth } from "@/core/auth";
import * as globalProfileRepo from "@/features/participant-stats/data/global-profile.repository";

vi.mock("next/navigation", () => ({
   redirect: vi.fn(),
   RedirectType: { replace: "replace", push: "push" },
}));

vi.mock("@/core/auth", () => ({
   auth: vi.fn(),
}));

vi.mock("@/features/participant-stats/data/global-profile.repository", () => ({
   getGlobalUserProfile: vi.fn(),
}));

describe("ProfilePage (/profile)", () => {
   beforeEach(() => {
      vi.clearAllMocks();
   });

   const mockProfileData = {
      user: {
         id: "user_session",
         displayName: "Current User",
         username: "currentuser",
         image: null,
         role: "PARTICIPANT",
         joinedAt: "2026-01-01T00:00:00.000Z",
         trophyBalance: 500,
         yptId: "11223344",
      },
      careerStats: {
         lifetimeStudyHours: 10,
         lifetimeStudySeconds: 36000,
         lifetimeStudyClock: "10:00:00",
         lifetimeStudyHuman: "10h",
         totalActiveStudyDays: 3,
         currentStreak: 1,
         longestStreak: 2,
         totalChallengesEntered: 1,
         challengesCompleted: 0,
         totalTasksCompleted: 5,
         trophyTotal: 500,
         trophyRank: "Silver Scholar",
         pokedexCount: 2,
      },
      challengeHistory: [],
   };

   it("redirects unauthenticated users to home page", async () => {
      vi.mocked(auth).mockResolvedValue(null as any);

      await ProfilePage({});

      expect(redirect).toHaveBeenCalledWith("/");
   });

   it("redirects to home if user profile does not exist in database", async () => {
      vi.mocked(auth).mockResolvedValue({
         user: { id: "user_nonexistent" },
      } as any);
      vi.mocked(globalProfileRepo.getGlobalUserProfile).mockResolvedValue(null);

      await ProfilePage({});

      expect(redirect).toHaveBeenCalledWith("/");
   });

   it("canonical redirects authenticated user to their /@<platformUsername> profile", async () => {
      vi.mocked(auth).mockResolvedValue({
         user: { id: "user_session" },
      } as any);
      vi.mocked(globalProfileRepo.getGlobalUserProfile).mockResolvedValue(
         mockProfileData as any
      );

      await ProfilePage({
         searchParams: Promise.resolve({
            challengeId: "chal_1",
            tab: "settings",
         }),
      });

      expect(globalProfileRepo.getGlobalUserProfile).toHaveBeenCalledWith(
         "user_session"
      );
      expect(redirect).toHaveBeenCalledWith(
         "/@currentuser?challengeId=chal_1&tab=settings",
         "replace"
      );
   });
});
