import { prisma } from "@/core/db";
import type { Prisma, ChallengeFeedback } from "@prisma/client";

export interface SaveChallengeFeedbackParams {
   challengeId: string;
   userId: string;
   consistency: string;
   fairnessRating: number;
   teamBattleFeedback?: string | null;
   joinReason?: string | null;
   soloIdeas?: string | null;
   trackingPreference?: string | null;
   workSchoolHours?: string | null;
   soloStyle?: string | null;
   soloPunishment?: string | null;
   discordMessageId?: string | null;
}

/**
 * Persists or updates a participant's challenge feedback survey response in PostgreSQL.
 * Uses an idempotent upsert on (challengeId, userId).
 */
export async function saveChallengeFeedback(
   data: SaveChallengeFeedbackParams,
   tx: Prisma.TransactionClient = prisma
): Promise<ChallengeFeedback> {
   return tx.challengeFeedback.upsert({
      where: {
         challengeId_userId: {
            challengeId: data.challengeId,
            userId: data.userId,
         },
      },
      create: {
         challengeId: data.challengeId,
         userId: data.userId,
         consistency: data.consistency,
         fairnessRating: data.fairnessRating,
         trackingPreference: data.trackingPreference || null,
         teamBattleFeedback: data.teamBattleFeedback || null,
         workSchoolHours: data.workSchoolHours || null,
         soloStyle: data.soloStyle || null,
         joinReason: data.joinReason?.trim() || null,
         soloPunishment: data.soloPunishment || null,
         soloIdeas: data.soloIdeas || null,
         discordMessageId: data.discordMessageId || null,
      },
      update: {
         consistency: data.consistency,
         fairnessRating: data.fairnessRating,
         trackingPreference: data.trackingPreference || null,
         teamBattleFeedback: data.teamBattleFeedback || null,
         workSchoolHours: data.workSchoolHours || null,
         soloStyle: data.soloStyle || null,
         joinReason: data.joinReason?.trim() || null,
         soloPunishment: data.soloPunishment || null,
         soloIdeas: data.soloIdeas || null,
         discordMessageId: data.discordMessageId || null,
      },
   });
}

/**
 * Retrieves a user's feedback record for a specific challenge, if it exists.
 */
export async function getChallengeFeedback(
   challengeId: string,
   userId: string,
   tx: Prisma.TransactionClient = prisma
): Promise<ChallengeFeedback | null> {
   return tx.challengeFeedback.findUnique({
      where: {
         challengeId_userId: {
            challengeId,
            userId,
         },
      },
   });
}

/**
 * Lists all feedback responses submitted for a challenge, ordered newest first.
 */
export async function listChallengeFeedbacks(
   challengeId: string,
   tx: Prisma.TransactionClient = prisma
): Promise<ChallengeFeedback[]> {
   return tx.challengeFeedback.findMany({
      where: { challengeId },
      orderBy: { createdAt: "desc" },
   });
}

/**
 * Updates the recorded Discord message ID on an existing feedback record.
 */
export async function updateChallengeFeedbackDiscordMessageId(
   id: string,
   discordMessageId: string,
   tx: Prisma.TransactionClient = prisma
): Promise<ChallengeFeedback> {
   return tx.challengeFeedback.update({
      where: { id },
      data: { discordMessageId },
   });
}
