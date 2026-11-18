/**
 * Copy one user's task board and challenge data from one database to another
 * (typically production -> localhost).
 *
 *   npx tsx packages/database/prisma/copy-user-data.ts \
 *      --source "postgresql://…prod" \
 *      --target "postgresql://…localhost" \
 *      --user   "usr_abc123" \
 *      [--apply]
 *
 * Without --apply it only reports what would be copied; nothing is written.
 *
 * What is copied (scoped to the user):
 *   User (plus the identity rows of users who appear in the copied challenges)
 *   Category, Task
 *   Challenge (hosted, participated in, or referenced by the user's tasks)
 *   Team, ChallengeParticipant
 *   DailyStudyLog, PunishmentRecord, AuditLog
 *
 * Deliberately out of scope: wallets, ledger, study rewards, wagers, pokemon,
 * trophies, feedback, feature flags. Copy those separately if needed.
 *
 * Notes
 * - The source connection is only ever read.
 * - Writes use upsert / createMany(skipDuplicates), so the script is safe to
 *   re-run. Existing local rows with the same id are updated, not duplicated.
 * - Copying a challenge also copies the other participants and their study
 *   logs, because a challenge without them is not a faithful copy.
 * - If a unique identity field (email, discordId, yptId, username) is already
 *   taken locally by a *different* user id, that field is cleared on the copied
 *   row and reported, so the copy still succeeds. For the target user this is
 *   treated as a hard error instead.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

interface Args {
   source: string;
   target: string;
   userId: string;
   apply: boolean;
}

function parseArgs(argv: string[]): Args {
   const flag = (name: string): string | undefined => {
      const index = argv.indexOf(`--${name}`);
      return index === -1 ? undefined : argv[index + 1];
   };

   const source = flag("source") ?? process.env.SOURCE_DATABASE_URL;
   const target = flag("target") ?? process.env.TARGET_DATABASE_URL;
   const userId = flag("user") ?? flag("userId") ?? process.env.COPY_USER_ID;

   if (!source || !target || !userId) {
      console.error(
         "Usage: copy-user-data.ts --source <url> --target <url> --user <userId> [--apply]"
      );
      process.exit(1);
   }
   if (source === target) {
      console.error("--source and --target must be different databases.");
      process.exit(1);
   }

   return { source, target, userId, apply: argv.includes("--apply") };
}

function maskUrl(url: string): string {
   return url.replace(/:\/\/[^@]*@/, "://***@");
}

function chunk<T>(items: T[], size = 500): T[][] {
   const out: T[][] = [];
   for (let i = 0; i < items.length; i += size) {
      out.push(items.slice(i, i + size));
   }
   return out;
}

const args = parseArgs(process.argv.slice(2));

const source = new PrismaClient({
   adapter: new PrismaPg({ connectionString: args.source }),
});
const target = new PrismaClient({
   adapter: new PrismaPg({ connectionString: args.target }),
});

const warnings: string[] = [];

function warn(message: string) {
   warnings.push(message);
}

/** Clears optionally-unique identity fields that another local row already owns. */
async function reconcileIdentity<
   T extends {
      id: string;
      email?: string | null;
      discordId?: string | null;
      yptId?: string | null;
      username?: string | null;
   },
>(user: T, isTargetUser: boolean): Promise<T> {
   const local = await target.user.findUnique({ where: { id: user.id } });
   const or: Array<Record<string, string>> = [];
   if (user.email) or.push({ email: user.email });
   if (user.discordId) or.push({ discordId: user.discordId });
   if (user.yptId) or.push({ yptId: user.yptId });

   const clash =
      or.length > 0
         ? await target.user.findFirst({
              where: { id: { not: user.id }, OR: or },
              select: { id: true, email: true, discordId: true, yptId: true },
           })
         : null;

   const usernameClash = user.username
      ? await target.user.findFirst({
           where: {
              id: { not: user.id },
              username: { equals: user.username, mode: "insensitive" },
           },
           select: { id: true, username: true },
        })
      : null;

   if (!clash && !usernameClash) return user;

   if (isTargetUser && (clash || usernameClash)) {
      throw new Error(
         `The target database already has a different user (${(clash ?? usernameClash)!.id}) ` +
            `holding one of this user's unique identity fields. Reconcile them manually first.`
      );
   }

   const next = { ...user };
   if (clash?.email === user.email) {
      next.email = null;
      warn(`user ${user.id}: email already owned locally, cleared on copy`);
   }
   if (clash?.discordId === user.discordId) {
      next.discordId = null;
      warn(`user ${user.id}: discordId already owned locally, cleared on copy`);
   }
   if (clash?.yptId === user.yptId) {
      next.yptId = null;
      warn(`user ${user.id}: yptId already owned locally, cleared on copy`);
   }
   if (usernameClash) {
      next.username = local?.username ?? null;
      warn(
         `user ${user.id}: username already owned locally, kept the local one`
      );
   }
   return next;
}

async function main() {
   console.log(`source: ${maskUrl(args.source)}`);
   console.log(`target: ${maskUrl(args.target)}`);
   console.log(`user:   ${args.userId}`);
   console.log(args.apply ? "mode:   APPLY" : "mode:   dry run");
   console.log("");

   /* ---------------------------------------------------------------- user */

   const user = await source.user.findUnique({ where: { id: args.userId } });
   if (!user)
      throw new Error(`User ${args.userId} not found in the source DB.`);

   /* ----------------------------------------------------------- categories */

   const categories = await source.category.findMany({
      where: { userId: args.userId },
      orderBy: { createdAt: "asc" },
   });

   /* ------------------------------------------------------------ challenges */

   const hosted = await source.challenge.findMany({
      where: { hostId: args.userId },
      orderBy: { createdAt: "asc" },
   });
   const participated = await source.challenge.findMany({
      where: { participants: { some: { userId: args.userId } } },
      orderBy: { createdAt: "asc" },
   });

   const userTasks = await source.task.findMany({
      where: { userId: args.userId },
      orderBy: { createdAt: "asc" },
   });
   const taskChallengeIds = Array.from(
      new Set(userTasks.map((t) => t.challengeId).filter(Boolean) as string[])
   );

   const tasksChallengeRefs = taskChallengeIds.length
      ? await source.challenge.findMany({
           where: { id: { in: taskChallengeIds } },
           orderBy: { createdAt: "asc" },
        })
      : [];

   const challengeMap = new Map<string, (typeof hosted)[number]>();
   for (const challenge of [
      ...hosted,
      ...participated,
      ...tasksChallengeRefs,
   ]) {
      challengeMap.set(challenge.id, challenge);
   }
   const challenges = Array.from(challengeMap.values());
   const challengeIds = challenges.map((c) => c.id);

   /* --------------------------------------------------- challenge children */

   const teams = challengeIds.length
      ? await source.team.findMany({
           where: { challengeId: { in: challengeIds } },
        })
      : [];
   const participants = challengeIds.length
      ? await source.challengeParticipant.findMany({
           where: { challengeId: { in: challengeIds } },
        })
      : [];
   const participantIds = participants.map((p) => p.id);

   const studyLogs = participantIds.length
      ? await source.dailyStudyLog.findMany({
           where: { participantId: { in: participantIds } },
        })
      : [];
   const punishments = challengeIds.length
      ? await source.punishmentRecord.findMany({
           where: { challengeId: { in: challengeIds } },
        })
      : [];
   const auditLogs = challengeIds.length
      ? await source.auditLog.findMany({
           where: { challengeId: { in: challengeIds } },
        })
      : [];

   /* ------------------------------------------- referenced user identities */

   const referencedUserIds = Array.from(
      new Set(
         [
            ...challenges.map((c) => c.hostId),
            ...participants.map((p) => p.userId),
            ...studyLogs.map((l) => l.overrideById),
            ...punishments.map((p) => p.pardonedById),
            ...auditLogs.map((l) => l.actorId),
         ].filter(Boolean) as string[]
      )
   ).filter((id) => id !== args.userId);

   const referencedUsers = referencedUserIds.length
      ? await source.user.findMany({ where: { id: { in: referencedUserIds } } })
      : [];

   /* ------------------------------------------------------------- report */

   const rows: Array<[string, number]> = [
      ["User", 1],
      ["referenced Users", referencedUsers.length],
      ["Category", categories.length],
      ["Task", userTasks.length],
      ["Challenge", challenges.length],
      ["Team", teams.length],
      ["ChallengeParticipant", participants.length],
      ["DailyStudyLog", studyLogs.length],
      ["PunishmentRecord", punishments.length],
      ["AuditLog", auditLogs.length],
   ];
   for (const [label, count] of rows) {
      console.log(`  ${label.padEnd(22)} ${count}`);
   }
   console.log("");

   if (!args.apply) {
      console.log("Dry run. Nothing was written. Re-run with --apply to copy.");
      return;
   }

   /* -------------------------------------------------------------- users */

   const targetUser = await reconcileIdentity(user, true);
   await target.user.upsert({
      where: { id: targetUser.id },
      create: targetUser,
      update: targetUser,
   });
   console.log("users: target user copied");

   let copiedReferencedUsers = 0;
   for (const referenced of referencedUsers) {
      const reconciled = await reconcileIdentity(referenced, false);
      await target.user.upsert({
         where: { id: reconciled.id },
         create: reconciled,
         update: reconciled,
      });
      copiedReferencedUsers += 1;
   }
   console.log(`users: ${copiedReferencedUsers} referenced user(s) copied`);

   /* --------------------------------------------------------- categories */

   for (const category of categories) {
      await target.category.upsert({
         where: { id: category.id },
         create: category,
         update: category,
      });
   }
   console.log(`categories: ${categories.length}`);

   /* --------------------------------------------------------- challenges */

   for (const challenge of challenges) {
      await target.challenge.upsert({
         where: { id: challenge.id },
         create: challenge,
         update: challenge,
      });
   }
   console.log(`challenges: ${challenges.length}`);

   for (const team of teams) {
      await target.team.upsert({
         where: { id: team.id },
         create: team,
         update: team,
      });
   }
   console.log(`teams: ${teams.length}`);

   // Also uniquely keyed by (challengeId, userId), which may not match the id.
   for (const participant of participants) {
      const existing = await target.challengeParticipant.findFirst({
         where: {
            OR: [
               { id: participant.id },
               {
                  challengeId: participant.challengeId,
                  userId: participant.userId,
               },
            ],
         },
         select: { id: true },
      });

      if (existing) {
         const { id: _id, ...rest } = participant;
         await target.challengeParticipant.update({
            where: { id: existing.id },
            data: rest,
         });
      } else {
         await target.challengeParticipant.create({ data: participant });
      }
   }
   console.log(`participants: ${participants.length}`);

   /* --------------------------------------------------------------- tasks */

   for (const task of userTasks) {
      await target.task.upsert({
         where: { id: task.id },
         create: task,
         update: task,
      });
   }
   console.log(`tasks: ${userTasks.length}`);

   /* -------------------------------------------------------- high volume */

   // Also uniquely keyed by (participantId, logDate); update those in place so
   // a pre-existing local log is refreshed rather than silently skipped.
   for (const batch of chunk(studyLogs)) {
      for (const log of batch) {
         const existing = await target.dailyStudyLog.findFirst({
            where: {
               OR: [
                  { id: log.id },
                  { participantId: log.participantId, logDate: log.logDate },
               ],
            },
            select: { id: true },
         });

         if (existing) {
            const { id: _id, ...rest } = log;
            await target.dailyStudyLog.update({
               where: { id: existing.id },
               data: rest,
            });
         } else {
            await target.dailyStudyLog.create({ data: log });
         }
      }
   }
   console.log(`study logs: ${studyLogs.length}`);

   // PunishmentRecord is uniquely keyed by (challengeId, participantId), which
   // can differ from the source id. Match on both so a pre-existing local row
   // is updated instead of tripping the unique constraint.
   for (const punishment of punishments) {
      const existing = await target.punishmentRecord.findFirst({
         where: {
            OR: [
               { id: punishment.id },
               {
                  challengeId: punishment.challengeId,
                  participantId: punishment.participantId,
               },
            ],
         },
         select: { id: true },
      });

      if (existing) {
         const { id: _id, ...rest } = punishment;
         await target.punishmentRecord.update({
            where: { id: existing.id },
            data: rest,
         });
      } else {
         await target.punishmentRecord.create({ data: punishment });
      }
   }
   console.log(`punishments: ${punishments.length}`);

   for (const batch of chunk(auditLogs)) {
      await target.auditLog.createMany({
         data: batch.map((log) => ({
            ...log,
            // Prisma distinguishes SQL NULL from a JSON null value.
            previousValue:
               log.previousValue === null
                  ? Prisma.JsonNull
                  : (log.previousValue as Prisma.InputJsonValue),
            newValue:
               log.newValue === null
                  ? Prisma.JsonNull
                  : (log.newValue as Prisma.InputJsonValue),
         })),
         skipDuplicates: true,
      });
   }
   console.log(`audit logs: ${auditLogs.length}`);

   if (warnings.length > 0) {
      console.log("\nWarnings:");
      for (const warning of warnings) console.log(`  - ${warning}`);
   }

   console.log("\nCopy complete.");
   console.log(
      "Next: clear this user's browser site data so IndexedDB does not"
   );
   console.log("replay old queued mutations over the copied rows.");
}

main()
   .catch((error) => {
      console.error(
         "\nCopy failed:",
         error instanceof Error ? error.message : error
      );
      process.exitCode = 1;
   })
   .finally(async () => {
      await source.$disconnect();
      await target.$disconnect();
   });
