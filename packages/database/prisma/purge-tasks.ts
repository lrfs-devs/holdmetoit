/**
 * DESTRUCTIVE — wipes every row from the `Task` and `Category` tables.
 *
 *   npx tsx --env-file=.env prisma/purge-tasks.ts            # dry run (counts only)
 *   npx tsx --env-file=.env prisma/purge-tasks.ts --apply    # actually delete
 *
 * This is a hard delete, not the soft delete used by the app. There is no
 * undo. Every user's daily and weekly tasks and categories are removed.
 *
 * Before running against a shared database:
 *   - take a backup (`npm run db:backup` if configured, or `pg_dump`);
 *   - stop the Tasker bot, which also writes to these tables;
 *   - tell users, because their browsers still hold the old rows in IndexedDB.
 *
 * After the purge, a client that still has queued mutations will replay them
 * on its next sync and recreate the rows. Clear the site data for those users,
 * or expect the tasks to come back.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const apply = process.argv.includes("--apply");

/**
 * Prints only the allowlisted parts of the connection string. Masking the
 * userinfo alone is not enough: credentials can also arrive as query
 * parameters (`?password=...`).
 */
function describeDatabase(rawUrl: string): string {
   try {
      const url = new URL(rawUrl);
      const database = url.pathname.replace(/^\//, "");
      return `${url.host}${database ? `/${database}` : ""}`;
   } catch {
      return "(unparseable DATABASE_URL)";
   }
}

const adapter = new PrismaPg({
   connectionString: process.env.DATABASE_URL as string,
});
const prisma = new PrismaClient({ adapter });

async function main() {
   const [taskCount, categoryCount, deletedTaskCount, deletedCategoryCount] =
      await Promise.all([
         prisma.task.count(),
         prisma.category.count(),
         prisma.task.count({ where: { isDeleted: true } }),
         prisma.category.count({ where: { isDeleted: true } }),
      ]);

   console.log("Task / Category purge");
   console.log(`  tasks:      ${taskCount} (${deletedTaskCount} soft-deleted)`);
   console.log(
      `  categories: ${categoryCount} (${deletedCategoryCount} soft-deleted)`
   );
   console.log(
      `  database:   ${describeDatabase(process.env.DATABASE_URL ?? "")}`
   );

   if (!apply) {
      console.log("\nDry run. Nothing was deleted.");
      console.log("Re-run with --apply to delete these rows permanently.");
      return;
   }

   const result = await prisma.$transaction(async (tx) => {
      // Tasks first: a Task row references its Category.
      const tasks = await tx.task.deleteMany();
      const categories = await tx.category.deleteMany();
      return { tasks: tasks.count, categories: categories.count };
   });

   console.log(
      `\nDeleted ${result.tasks} task(s) and ${result.categories} categor(ies).`
   );
}

main()
   .catch((error) => {
      console.error(error);
      process.exitCode = 1;
   })
   .finally(async () => {
      await prisma.$disconnect();
   });
