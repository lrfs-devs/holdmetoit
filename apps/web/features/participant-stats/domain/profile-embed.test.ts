import { describe, expect, it } from "vitest";
import {
   buildProfileDiscordEmbed,
   buildProfileEmbedDescription,
   buildProfileEmbedTitle,
   getRankThemeColor,
} from "./profile-embed";
import type { GlobalUserProfile } from "./global-profile.types";

const mockProfile: GlobalUserProfile = {
   user: {
      id: "usr_123",
      displayName: "Alice Scholar",
      username: "alice_s",
      image: "https://example.com/avatar.png",
      role: "PARTICIPANT",
      joinedAt: "2026-01-01T00:00:00.000Z",
      trophyBalance: 1200,
   },
   careerStats: {
      lifetimeStudyHours: 42,
      lifetimeStudySeconds: 151200,
      lifetimeStudyClock: "42:00:00",
      lifetimeStudyHuman: "42h",
      totalActiveStudyDays: 14,
      currentStreak: 5,
      longestStreak: 7,
      totalChallengesEntered: 3,
      challengesCompleted: 2,
      totalTasksCompleted: 25,
      trophyTotal: 1200,
      trophyRank: "Gold Scholar",
      pokedexCount: 8,
   },
   challengeHistory: [],
};

describe("profile-embed", () => {
   describe("getRankThemeColor", () => {
      it("maps gold rank to gold hex/int", () => {
         expect(getRankThemeColor("Gold Scholar")).toEqual({
            hex: "#f59e0b",
            int: 0xf59e0b,
         });
      });

      it("maps obsidian rank to emerald hex/int", () => {
         expect(getRankThemeColor("Obsidian Champion")).toEqual({
            hex: "#10b981",
            int: 0x10b981,
         });
      });

      it("falls back to cozy brand green for unknown/unranked", () => {
         expect(getRankThemeColor("Recruit")).toEqual({
            hex: "#22c55e",
            int: 0x22c55e,
         });
      });
   });

   describe("buildProfileEmbedTitle", () => {
      it("uses platform username with @ prefix", () => {
         expect(buildProfileEmbedTitle(mockProfile)).toBe(
            "@alice_s | HoldMeToIt Scholar Profile"
         );
      });

      it("falls back to displayName if username is null", () => {
         const profileWithoutUsername: GlobalUserProfile = {
            ...mockProfile,
            user: { ...mockProfile.user, username: null },
         };
         expect(buildProfileEmbedTitle(profileWithoutUsername)).toBe(
            "Alice Scholar | HoldMeToIt Scholar Profile"
         );
      });
   });

   describe("buildProfileEmbedDescription", () => {
      it("includes study time, streak, trophies, challenges, and tasks", () => {
         const description = buildProfileEmbedDescription(mockProfile);
         expect(description).toContain("⏱️ 42h study");
         expect(description).toContain("🔥 5-day streak");
         expect(description).toContain("🏆 Gold Scholar (1200 🏆)");
         expect(description).toContain("⚔️ 2/3 challenges");
         expect(description).toContain("✅ 25 tasks");
      });
   });

   describe("buildProfileDiscordEmbed", () => {
      it("builds a full Discord embed object with rank color and fields", () => {
         const embed = buildProfileDiscordEmbed(
            mockProfile,
            "https://holdmetoit.vercel.app/@alice_s"
         );
         expect(embed.title).toBe("@alice_s — Profile & Career Stats");
         expect(embed.url).toBe("https://holdmetoit.vercel.app/@alice_s");
         expect(embed.color).toBe(0xf59e0b);
         expect(embed.thumbnail).toEqual({
            url: "https://example.com/avatar.png",
         });
         expect(embed.fields).toHaveLength(6);
         expect(embed.fields[0]).toEqual({
            name: "⏱️ Lifetime Study",
            value: "42h",
            inline: true,
         });
         expect(embed.fields[1]).toEqual({
            name: "🔥 Active Streak",
            value: "5 days",
            inline: true,
         });
      });
   });
});
