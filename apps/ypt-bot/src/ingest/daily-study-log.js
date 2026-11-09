import { prisma } from "../db/client.js";
import {
   clampDailyStudySeconds,
   cappedLiveStudyMs,
   MAX_DAILY_STUDY_SECONDS,
   MAX_CONTINUOUS_SESSION_MS,
} from "../config/limits.js";
import {
   getActiveChallenge,
   getParticipantMap,
   getChallengeLifecycle,
   lockExpiredChallengesAfterGrace,
} from "../db/challenge-repository.js";
import { logger } from "../lib/logger.js";
import {
   computeChallengeDayLogDate,
   deriveStudyStatus,
} from "./date-buckets.js";

/**
 * Ingests scraped YPT members into DailyStudyLog (canonical shared table)
 * for the currently active challenge in UTC time.
 *
 * Performance Optimized: Pre-fetches existing daily logs in a single query
 * and performs concurrent upserts to eliminate N+1 latency.
 *
 * @param {string|number} groupId
 * @param {Array<object>} members
 * @param {Date} [nowUtc=new Date()]
 * @param {import('winston').Logger} [log=logger]
 * @returns {Promise<object>}
 */
export async function ingestGroupMembersToDailyStudyLogs(
   groupId,
   members,
   nowUtc = new Date(),
   log = logger
) {
   const startTime = Date.now();

   // 0. Auto-lock any challenges whose end time has passed (challenge ended)
   await lockExpiredChallengesAfterGrace(nowUtc, log);

   // 1. Resolve the anchor challenge in UTC. The cron is challenge-window independent:
   //    locked/ended challenges still anchor telemetry via fallback. No challenge at all
   //    means there is no participant to key rows to, so fail loudly.
   const challenge = await getActiveChallenge(nowUtc, { allowFallback: true });
   if (!challenge) {
      throw new Error("No challenge available to anchor study telemetry");
   }

   const lifecycle =
      challenge.lifecycle || getChallengeLifecycle(challenge, nowUtc);

   // Challenge-anchored day bucket (derived from challenge start in UTC)
   const logDate = computeChallengeDayLogDate(nowUtc, challenge.startAt);

   // 2. Resolve in-memory participant lookup table (yptId -> participantId)
   const participantMap = await getParticipantMap(challenge.id);

   // 3. Pre-fetch existing logs for today in a single query to eliminate N+1 roundtrips
   const participantIds = Array.from(participantMap.values()).map(
      (p) => p.participantId
   );
   const existingRecords = await prisma.dailyStudyLog.findMany({
      where: {
         logDate,
         participantId: { in: participantIds },
      },
      select: {
         id: true,
         participantId: true,
         durationSeconds: true,
         status: true,
         isOverride: true,
      },
   });
   const existingMap = new Map(
      existingRecords.map((r) => [r.participantId, r])
   );

   const targetLogDateStr = logDate.toISOString().slice(0, 10);

   let matchedCount = 0;
   let unlinkedCount = 0;
   let skippedOverrides = 0;
   let protectedRollovers = 0;
   let protectedZeroDrops = 0;
   let cappedCount = 0;
   let sessionCappedCount = 0;
   let upsertedCount = 0;

   const upsertOperations = [];

   for (const member of members) {
      const yptId = String(
         member.userId || member.ud || member.id || ""
      ).trim();
      if (!yptId) continue;

      const participant = participantMap.get(yptId);

      // If member has not linked their YPT ID to a participant in this challenge
      if (!participant) {
         unlinkedCount++;
         continue;
      }

      matchedCount++;

      const existing = existingMap.get(participant.participantId);

      // Calculate real-time integer seconds. Continuous sessions capped at 4h before daily 14h clamp.
      const cappedLiveMs = cappedLiveStudyMs(
         member.todayStudyMs,
         member.sessionElapsedMs
      );
      const studyMs = Math.max(
         cappedLiveMs,
         Number(member.todayStudyMs || 0),
         Number(member.studyMs || 0)
      );
      const rawSeconds = Math.floor(studyMs / 1000);
      const durationSeconds = clampDailyStudySeconds(rawSeconds);
      if (rawSeconds > MAX_DAILY_STUDY_SECONDS) cappedCount++;
      if (Number(member.sessionElapsedMs || 0) > MAX_CONTINUOUS_SESSION_MS)
         sessionCappedCount++;
      const status = deriveStudyStatus(member);

      // 4. Admin Override Safety (Law L5)
      // Check if an existing row has isOverride: true. If so, do not overwrite durationSeconds.

      if (existing?.isOverride) {
         skippedOverrides++;
         // Still update live status without touching durationSeconds
         upsertOperations.push(
            prisma.dailyStudyLog.update({
               where: { id: existing.id },
               data: { status },
            })
         );
         continue;
      }

      // 5. Zero-Drop & Rollover Glitch Guard
      // - If YPT has already rolled over to a future day (member.studyDate > targetLogDateStr),
      //   incoming telemetry belongs to tomorrow; preserve today's completed study duration.
      // - If incoming duration is 0 but existing record has durationSeconds > 0, preserve existing duration.
      const isFutureYptDate = Boolean(
         member.studyDate && member.studyDate > targetLogDateStr
      );
      const isZeroDrop = Boolean(
         durationSeconds === 0 && existing && existing.durationSeconds > 0
      );

      let finalDurationSeconds = durationSeconds;
      if (isFutureYptDate && existing) {
         finalDurationSeconds = existing.durationSeconds;
         protectedRollovers++;
      } else if (isZeroDrop) {
         finalDurationSeconds = existing.durationSeconds;
         protectedZeroDrops++;
      }

      // 6. Upsert DailyStudyLog
      upsertOperations.push(
         prisma.dailyStudyLog.upsert({
            where: {
               participantId_logDate: {
                  participantId: participant.participantId,
                  logDate,
               },
            },
            create: {
               participantId: participant.participantId,
               logDate,
               durationSeconds: finalDurationSeconds,
               status,
               source: "YPT_BOT",
               isOverride: false,
            },
            update: {
               durationSeconds: finalDurationSeconds,
               status,
            },
         })
      );

      upsertedCount++;
   }

   // Execute all upserts concurrently
   await Promise.all(upsertOperations);

   const durationMs = Date.now() - startTime;
   log.info("Ingest complete", {
      challengeId: challenge.id,
      challengeTitle: challenge.title,
      logDate: logDate.toISOString().slice(0, 10),
      matchedCount,
      upsertedCount,
      skippedOverrides,
      protectedRollovers,
      protectedZeroDrops,
      cappedCount,
      sessionCappedCount,
      unlinkedCount,
      durationMs,
   });

   return {
      success: true,
      challengeId: challenge.id,
      challengeTitle: challenge.title,
      logDate,
      matchedCount,
      unlinkedCount,
      skippedOverrides,
      protectedRollovers,
      protectedZeroDrops,
      cappedCount,
      sessionCappedCount,
      upsertedCount,
      durationMs,
   };
}
