/**
 * Replace padded demo download counts (from the original seed) with small
 * realistic numbers so the homepage stats match a 5-note catalog.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BY_COUNT: Array<{ from: number; to: number }> = [
  { from: 1203, to: 14 },
  { from: 980, to: 11 },
  { from: 640, to: 8 },
  { from: 410, to: 6 },
  { from: 220, to: 4 },
];

const BY_TITLE: Array<{ title: string; to: number }> = [
  { title: "Operating Systems Unit 3 Notes", to: 14 },
  { title: "DBMS Normalization Notes", to: 11 },
  { title: "Data Structures: Trees and Graphs", to: 8 },
  { title: "Computer Networks Layered Architecture", to: 6 },
  { title: "Operating System Deadlock Prevention Cheatsheet", to: 4 },
];

async function main() {
  let updated = 0;
  for (const { from, to } of BY_COUNT) {
    const result = await prisma.note.updateMany({
      where: { downloads: from },
      data: { downloads: to },
    });
    updated += result.count;
  }
  for (const { title, to } of BY_TITLE) {
    const result = await prisma.note.updateMany({
      where: { title, downloads: { gt: to } },
      data: { downloads: to },
    });
    updated += result.count;
  }
  console.info(`[normalize-seed-downloads] updated ${updated} notes`);
}

main()
  .catch((error) => {
    console.error("[normalize-seed-downloads] aborted");
    console.error(error instanceof Error ? error.name : "Error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
