/**
 * Pure domain functions for HoldMeToIt profile embeds and Discord link unfurling metadata.
 * Governed by Law L7 (Pure Domain Isolation): Zero Next.js, React, or Prisma imports.
 */

import type { GlobalUserProfile } from "./global-profile.types";

export interface DiscordEmbedField {
   name: string;
   value: string;
   inline?: boolean;
}

export interface ProfileDiscordEmbed {
   title: string;
   description: string;
   url?: string;
   color: number;
   thumbnail?: { url: string };
   fields: DiscordEmbedField[];
   footer?: { text: string };
   timestamp?: string;
}

/**
 * Resolves hex color code based on trophy rank for Discord embed accent stripe.
 */
export function getRankThemeColor(trophyRank?: string): {
   hex: string;
   int: number;
} {
   const normalized = (trophyRank || "").toLowerCase();
   if (normalized.includes("obsidian"))
      return { hex: "#10b981", int: 0x10b981 };
   if (normalized.includes("diamond")) return { hex: "#38bdf8", int: 0x38bdf8 };
   if (normalized.includes("platinum"))
      return { hex: "#a78bfa", int: 0xa78bfa };
   if (normalized.includes("gold")) return { hex: "#f59e0b", int: 0xf59e0b };
   if (normalized.includes("silver")) return { hex: "#94a3b8", int: 0x94a3b8 };
   if (normalized.includes("bronze")) return { hex: "#d97706", int: 0xd97706 };
   // Cozy default brand green
   return { hex: "#22c55e", int: 0x22c55e };
}

/**
 * Builds canonical title for OpenGraph and social metadata.
 */
export function buildProfileEmbedTitle(profile: GlobalUserProfile): string {
   const handle = profile.user.username
      ? `@${profile.user.username}`
      : profile.user.displayName || "Scholar";
   return `${handle} | HoldMeToIt Profile`;
}

/**
 * Builds concise, format-aware summary description for link previews and embeds.
 */
export function buildProfileEmbedDescription(
   profile: GlobalUserProfile
): string {
   const { careerStats } = profile;
   const parts: string[] = [
      `⏱️ ${careerStats.lifetimeStudyHuman || "0h"} study`,
      `🔥 ${careerStats.currentStreak}-day streak`,
   ];

   if (careerStats.totalChallengesEntered > 0) {
      parts.push(
         `⚔️ ${careerStats.challengesCompleted}/${careerStats.totalChallengesEntered} challenges`
      );
   }
   return parts.join(" • ");
}

/**
 * Builds structured Discord embed object for Discord link previews or bot broadcasts.
 */
export function buildProfileDiscordEmbed(
   profile: GlobalUserProfile,
   profileUrl?: string
): ProfileDiscordEmbed {
   const { int } = getRankThemeColor(profile.careerStats.trophyRank);
   const handle = profile.user.username
      ? `@${profile.user.username}`
      : profile.user.displayName || "Scholar";

   const fields: DiscordEmbedField[] = [
      {
         name: "⏱️ Lifetime Study",
         value: profile.careerStats.lifetimeStudyHuman || "0h",
         inline: true,
      },
      {
         name: "🔥 Active Streak",
         value: `${profile.careerStats.currentStreak} day${
            profile.careerStats.currentStreak === 1 ? "" : "s"
         }`,
         inline: true,
      },
      {
         name: "⚔️ Challenges",
         value: `${profile.careerStats.challengesCompleted} won / ${profile.careerStats.totalChallengesEntered} entered`,
         inline: true,
      },
   ];

   return {
      title: `${handle} — Profile & Career Stats`,
      description: buildProfileEmbedDescription(profile),
      url: profileUrl,
      color: int,
      thumbnail: profile.user.image ? { url: profile.user.image } : undefined,
      fields,
      footer: { text: "HoldMeToIt • Gamified Study Accountability" },
   };
}
