import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { notFound, redirect } from "next/navigation";
import ScholarProfilePage, { generateMetadata } from "./page";
import { auth } from "@/core/auth";
import * as globalProfileRepo from "@/features/participant-stats/data/global-profile.repository";
import * as privacyDomain from "@/features/participant-stats/domain/profile-privacy";
import * as privacyRepo from "@/features/participant-stats/data/profile-privacy.repository";

vi.mock("next/navigation", () => ({
   notFound: vi.fn(),
   redirect: vi.fn(),
   RedirectType: { replace: "replace", push: "push" },
   useRouter: () => ({
      refresh: vi.fn(),
      push: vi.fn(),
      replace: vi.fn(),
   }),
   useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/core/auth", () => ({
   auth: vi.fn(),
}));

vi.mock("@/features/participant-stats/data/global-profile.repository", () => ({
   getGlobalUserProfile: vi.fn(),
   getChallengeSnapshotForUser: vi.fn(),
}));

vi.mock("@/features/participant-stats/domain/profile-privacy", () => ({
   canViewFullProfileHistory: vi.fn(),
}));

vi.mock("@/features/participant-stats/data/profile-privacy.repository", () => ({
   checkAreAcceptedFriends: vi.fn(),
}));

vi.mock("@/features/feature-flags/api/server", () => ({
   isFeatureEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock(
   "@/features/participant-stats/presentation/global-profile-view",
   () => ({
      GlobalProfileView: (props: any) =>
         createElement(
            "div",
            { "data-testid": "global-profile-view", ...props },
            "Global Profile View"
         ),
   })
);

describe("ScholarProfilePage (/@[userHandle])", () => {
   beforeEach(() => {
      vi.clearAllMocks();
   });

   const mockProfileData = {
      user: {
         id: "usr_cmuv5m72y0000jm04j9wcrpf9",
         displayName: "Speedy Scholar",
         username: "speedy",
         image: "https://example.com/avatar.png",
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
      it("returns fallback title when handle does not start with @", async () => {
         const metadata = await generateMetadata({
            params: Promise.resolve({ userHandle: "random-page" }),
         });
         expect(metadata.title).toBe("Page Not Found | HoldMeToIt");
      });

      it("returns fallback title when scholar does not exist", async () => {
         vi.mocked(globalProfileRepo.getGlobalUserProfile).mockResolvedValue(
            null
         );

         const metadata = await generateMetadata({
            params: Promise.resolve({ userHandle: "@nonexistent" }),
         });

         expect(metadata.title).toBe("Scholar Not Found | HoldMeToIt");
      });

      it("generates rich OpenGraph, Twitter, and themeColor metadata for valid scholar", async () => {
         vi.mocked(globalProfileRepo.getGlobalUserProfile).mockResolvedValue(
            mockProfileData as any
         );

         const metadata = await generateMetadata({
            params: Promise.resolve({ userHandle: "@speedy" }),
         });

         expect(metadata.title).toBe("@speedy | HoldMeToIt Scholar Profile");
         expect(metadata.description).toContain("20h study");
         expect(metadata.description).toContain("2-day streak");
         expect(metadata.themeColor).toBe("#f59e0b"); // Gold Scholar
         expect(metadata.openGraph?.title).toBe(
            "@speedy | HoldMeToIt Scholar Profile"
         );
         expect((metadata.twitter as any)?.card).toBe("summary");
      });
   });

   describe("Page Component", () => {
      it("calls notFound when handle does not start with @", async () => {
         await ScholarProfilePage({
            params: Promise.resolve({ userHandle: "invalid-route" }),
         });

         expect(notFound).toHaveBeenCalled();
      });

      it("calls notFound when handle is just @ with no username", async () => {
         await ScholarProfilePage({
            params: Promise.resolve({ userHandle: "@" }),
         });

         expect(notFound).toHaveBeenCalled();
      });

      it("redirects unauthenticated visitor to /", async () => {
         vi.mocked(auth).mockResolvedValue(null as any);

         await ScholarProfilePage({
            params: Promise.resolve({ userHandle: "@speedy" }),
         });

         expect(redirect).toHaveBeenCalledWith("/");
      });

      it("calls notFound when scholar does not exist in DB", async () => {
         vi.mocked(auth).mockResolvedValue({
            user: { id: "usr_viewer", role: "PARTICIPANT" },
         } as any);
         vi.mocked(globalProfileRepo.getGlobalUserProfile).mockResolvedValue(
            null
         );

         await ScholarProfilePage({
            params: Promise.resolve({ userHandle: "@ghost" }),
         });

         expect(notFound).toHaveBeenCalled();
      });

      it("redirects CUID handle to platform username canonical URL", async () => {
         vi.mocked(auth).mockResolvedValue({
            user: { id: "usr_viewer", role: "PARTICIPANT" },
         } as any);
         vi.mocked(globalProfileRepo.getGlobalUserProfile).mockResolvedValue(
            mockProfileData as any
         );

         await ScholarProfilePage({
            params: Promise.resolve({
               userHandle: `@${mockProfileData.user.id}`,
            }),
            searchParams: Promise.resolve({ challengeId: "chal_1" }),
         });

         expect(redirect).toHaveBeenCalledWith(
            "/@speedy?challengeId=chal_1",
            "replace"
         );
      });

      it("renders GlobalProfileView when authenticated and scholar exists", async () => {
         vi.mocked(auth).mockResolvedValue({
            user: { id: "usr_cmuv5m72y0000jm04j9wcrpf9", role: "PARTICIPANT" },
         } as any);
         vi.mocked(globalProfileRepo.getGlobalUserProfile).mockResolvedValue(
            mockProfileData as any
         );
         vi.mocked(privacyDomain.canViewFullProfileHistory).mockReturnValue(
            true
         );
         vi.mocked(privacyRepo.checkAreAcceptedFriends).mockResolvedValue(true);

         const element = (await ScholarProfilePage({
            params: Promise.resolve({ userHandle: "@speedy" }),
         })) as any;

         expect(element).toBeDefined();
         expect(element?.props.profile).toEqual(mockProfileData);
         expect(element?.props.isOwnProfile).toBe(true);
      });

      it("handles URL-encoded %40 handle cleanly", async () => {
         vi.mocked(auth).mockResolvedValue({
            user: { id: "usr_viewer", role: "PARTICIPANT" },
         } as any);
         vi.mocked(globalProfileRepo.getGlobalUserProfile).mockResolvedValue(
            mockProfileData as any
         );
         vi.mocked(privacyDomain.canViewFullProfileHistory).mockReturnValue(
            true
         );

         const element = await ScholarProfilePage({
            params: Promise.resolve({ userHandle: "%40speedy" }),
         });

         expect(element).toBeDefined();
         expect(globalProfileRepo.getGlobalUserProfile).toHaveBeenCalledWith(
            "speedy"
         );
      });
   });
});
