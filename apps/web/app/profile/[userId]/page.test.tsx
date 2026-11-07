import { beforeEach, describe, expect, it, vi } from "vitest";
import { notFound, redirect } from "next/navigation";
import UserProfilePage, { generateMetadata } from "./page";
import { auth } from "@/core/auth";
import * as globalProfileRepo from "@/features/participant-stats/data/global-profile.repository";

vi.mock("next/navigation", () => ({
   notFound: vi.fn(),
   redirect: vi.fn(),
   RedirectType: { replace: "replace", push: "push" },
}));

vi.mock("@/core/auth", () => ({
   auth: vi.fn(),
}));

vi.mock("@/features/participant-stats/data/global-profile.repository", () => ({
   getGlobalUserProfile: vi.fn(),
   getChallengeSnapshotForUser: vi.fn(),
}));

describe("UserProfilePage (/profile/[userId])", () => {
   beforeEach(() => {
      vi.clearAllMocks();
   });

   const mockProfileData = {
      user: {
         id: "user_target",
         displayName: "Bob Builder",
         username: "bobbuilder",
         image: "https://example.com/bob.png",
         role: "PARTICIPANT",
         joinedAt: "2026-03-01T00:00:00.000Z",
         trophyBalance: 800,
         yptId: null,
      },
      careerStats: {
         lifetimeStudyHours: 20,
         lifetimeStudySeconds: 72000,
         lifetimeStudyClock: "20:00:00",
         lifetimeStudyHuman: "20h",
         totalActiveStudyDays: 5,
         currentStreak: 2,
         longestStreak: 3,
         totalChallengesEntered: 1,
         challengesCompleted: 1,
         totalTasksCompleted: 10,
         trophyTotal: 800,
         trophyRank: "Gold Scholar",
         pokedexCount: 4,
      },
      challengeHistory: [
         {
            challengeId: "chal_1",
            participantId: "part_1",
            title: "Sprint 1",
            mode: "SOLOS",
            status: "COMPLETED",
            startDate: "2026-10-01T00:00:00.000Z",
            endDate: "2026-10-08T00:00:00.000Z",
            targetHours: 20,
            loggedHours: 20,
            trophyDelta: 50,
         },
      ],
   };

   describe("generateMetadata", () => {
      it("returns fallback title when user does not exist", async () => {
         vi.mocked(globalProfileRepo.getGlobalUserProfile).mockResolvedValue(
            null
         );

         const meta = await generateMetadata({
            params: Promise.resolve({ userId: "missing_user" }),
         });
         expect(meta.title).toBe("Scholar Not Found | HoldMeToIt");
      });

      it("returns customized profile meta tags when user exists", async () => {
         vi.mocked(globalProfileRepo.getGlobalUserProfile).mockResolvedValue(
            mockProfileData as any
         );

         const meta = await generateMetadata({
            params: Promise.resolve({ userId: "user_target" }),
         });
         expect(meta.title).toBe("@bobbuilder | HoldMeToIt Profile");
         expect(meta.description).toContain("20h study");
      });
   });

   describe("Page rendering", () => {
      it("redirects unauthenticated visitor to /", async () => {
         vi.mocked(auth).mockResolvedValue(null as any);

         await UserProfilePage({
            params: Promise.resolve({ userId: "user_target" }),
         });

         expect(redirect).toHaveBeenCalledWith("/");
      });

      it("triggers notFound when user profile does not exist", async () => {
         vi.mocked(auth).mockResolvedValue({
            user: { id: "user_viewer", role: "PARTICIPANT" },
         } as any);
         vi.mocked(globalProfileRepo.getGlobalUserProfile).mockResolvedValue(
            null
         );

         await UserProfilePage({
            params: Promise.resolve({ userId: "missing_user" }),
         });
         expect(notFound).toHaveBeenCalled();
      });

      it("canonical redirects to /@<platformUsername> forwarding query parameters", async () => {
         vi.mocked(auth).mockResolvedValue({
            user: { id: "user_viewer", role: "PARTICIPANT" },
         } as any);
         vi.mocked(globalProfileRepo.getGlobalUserProfile).mockResolvedValue(
            mockProfileData as any
         );

         await UserProfilePage({
            params: Promise.resolve({ userId: "user_target" }),
            searchParams: Promise.resolve({
               challengeId: "chal_1",
               tab: "history",
            }),
         });

         expect(redirect).toHaveBeenCalledWith(
            "/@bobbuilder?challengeId=chal_1&tab=history",
            "replace"
         );
      });

      it("resolves target userId when 'me' alias is used by authenticated session", async () => {
         vi.mocked(auth).mockResolvedValue({
            user: { id: "user_me", role: "PARTICIPANT" },
         } as any);
         vi.mocked(globalProfileRepo.getGlobalUserProfile).mockResolvedValue(
            mockProfileData as any
         );

         await UserProfilePage({ params: Promise.resolve({ userId: "me" }) });

         expect(globalProfileRepo.getGlobalUserProfile).toHaveBeenCalledWith(
            "user_me"
         );
         expect(redirect).toHaveBeenCalledWith("/@bobbuilder", "replace");
      });
   });
});
