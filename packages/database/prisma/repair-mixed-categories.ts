/**
 * One-off repair: reassign tasks that live in a category of the other column.
 *
 *   npx tsx --env-file=.env prisma/repair-mixed-categories.ts           # dry run
 *   npx tsx --env-file=.env prisma/repair-mixed-categories.ts --apply   # write
 *
 * A task's `taskType` must equal its category's `taskType`. Before categories
 * became single-column, a daily task could be filed under a weekly category.
 * This script moves each such task into a category of its own type with the
 * same name, reviving a soft-deleted category or creating one when needed.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const apply = process.argv.includes("--apply");

const adapter = new PrismaPg({
   connectionString: process.env.DATABASE_URL as string,
});
const prisma = new PrismaClient({ adapter });

interface RepairPlan {
   taskId: string;
   fromCategoryId: string;
   toCategoryId: string;
   taskType: "DAILY" | "WEEKLY";
   categoryName: string;
}

async function main() {
   const mismatched = await prisma.task.findMany({
      where: { isDeleted: false },
      select: {
         id: true,
         userId: true,
         taskType: true,
         category: {
            select: { id: true, name: true, taskType: true, isDeleted: true },
         },
      },
   });

   const broken = mismatched.filter(
      (task) => task.category && task.category.taskType !== task.taskType
   );

   if (broken.length === 0) {
      console.log("No mixed-type tasks found. Nothing to repair.");
      return;
   }

   const plan: RepairPlan[] = [];
   const createdCategories: string[] = [];

   for (const task of broken) {
      const categoryName = task.category!.name;

      const existing = await prisma.category.findFirst({
         where: {
            userId: task.userId,
            name: categoryName,
            taskType: task.taskType,
            isDeleted: false,
         },
         select: { id: true },
      });

      let targetId = existing?.id;

      if (!targetId) {
         const softDeleted = await prisma.category.findFirst({
            where: {
               userId: task.userId,
               name: categoryName,
               taskType: task.taskType,
               isDeleted: true,
            },
            select: { id: true },
         });

         if (softDeleted) {
            targetId = softDeleted.id;
            plan.push({
               taskId: task.id,
               fromCategoryId: task.category!.id,
               toCategoryId: targetId,
               taskType: task.taskType as "DAILY" | "WEEKLY",
               categoryName,
            });
            continue;
         }

         if (!apply) {
            plan.push({
               taskId: task.id,
               fromCategoryId: task.category!.id,
               toCategoryId: "(new)",
               taskType: task.taskType as "DAILY" | "WEEKLY",
               categoryName,
            });
            continue;
         }

         const created = await prisma.category.create({
            data: {
               userId: task.userId,
               name: categoryName,
               taskType: task.taskType,
               sortOrder: 0,
            },
            select: { id: true },
         });
         targetId = created.id;
         createdCategories.push(created.id);
      }

      plan.push({
         taskId: task.id,
         fromCategoryId: task.category!.id,
         toCategoryId: targetId,
         taskType: task.taskType as "DAILY" | "WEEKLY",
         categoryName,
      });
   }

   console.log(
      `${apply ? "Applying" : "Dry run:"} ${plan.length} task(s) to reassign.`
   );
   for (const entry of plan) {
      console.log(
         `  ${entry.taskId}: ${entry.fromCategoryId} -> ${entry.toCategoryId} (${entry.taskType} "${entry.categoryName}")`
      );
   }

   if (!apply) {
      console.log("\nRe-run with --apply to write these changes.");
      return;
   }

   for (const entry of plan) {
      if (entry.toCategoryId === "(new)") continue;

      await prisma.$transaction(async (tx) => {
         const revived = await tx.category.findFirst({
            where: { id: entry.toCategoryId, isDeleted: true },
         });
         if (revived) {
            await tx.category.update({
               where: { id: revived.id },
               data: {
                  isDeleted: false,
                  deletionTime: null,
                  revision: { increment: 1 },
               },
            });
         }

         await tx.task.update({
            where: { id: entry.taskId },
            data: {
               categoryId: entry.toCategoryId,
               revision: { increment: 1 },
            },
         });
      });
   }

   console.log(
      `\nDone. Reassigned ${plan.length} task(s); created ${createdCategories.length} category(ies).`
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
