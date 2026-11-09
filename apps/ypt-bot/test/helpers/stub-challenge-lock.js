/**
 * Stubs the interactive transaction and the FOR SHARE challenge row read used by
 * ingestGroupMembersToDailyStudyLogs. The transaction client is the mocked prisma
 * object itself, so existing per-model mocks keep working inside the transaction.
 *
 * @param {object} prisma
 * @param {{ endAt: Date, resultsLockedAt: Date|null }} row Mutable row returned by the lock query.
 * @returns {() => void} restore function
 */
export function stubChallengeLock(prisma, row) {
   const originalTransaction = prisma.$transaction;
   const originalQueryRaw = prisma.$queryRaw;

   prisma.$transaction = async (callback) => callback(prisma);
   prisma.$queryRaw = async () => [row];

   return () => {
      prisma.$transaction = originalTransaction;
      prisma.$queryRaw = originalQueryRaw;
   };
}
