/**
 * Re-upload missing note files to local disk or Vercel Blob without wiping data.
 *
 * Production notes were created without Blob objects. Run from a machine that
 * has DATABASE_URL and (in production) BLOB_READ_WRITE_TOKEN:
 *
 *   npm run db:restore-files
 */
import { PrismaClient } from "@prisma/client";
import {
  isBlobStorageEnabled,
  saveNoteFile,
  verifyStoredObject,
} from "../src/lib/storage";
import { buildSimplePdf } from "../src/lib/simple-pdf";

const prisma = new PrismaClient();

async function main() {
  if (!isBlobStorageEnabled() && process.env.ALLOW_LOCAL_RESTORE !== "1") {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID is required so restored files go to Vercel Blob. Set ALLOW_LOCAL_RESTORE=1 only for a local filesystem restore.",
    );
  }

  const notes = await prisma.note.findMany({
    where: { status: { not: "REMOVED" } },
    select: {
      id: true,
      title: true,
      description: true,
      fileUrl: true,
      fileType: true,
    },
  });

  let restored = 0;
  let skipped = 0;
  let failed = 0;

  for (const note of notes) {
    const existing =
      note.fileUrl && note.fileUrl !== "pending"
        ? await verifyStoredObject(note.fileUrl)
        : null;
    if (existing) {
      skipped += 1;
      continue;
    }

    try {
      const buffer = buildSimplePdf(note.title, [
        note.description || "StudySphere notes",
        "This file was restored because the original upload was missing from storage.",
      ]);
      const stored = await saveNoteFile({
        noteId: note.id,
        originalName: "notes.pdf",
        buffer,
        extension: note.fileType === "pdf" ? "pdf" : "pdf",
      });
      await prisma.note.update({
        where: { id: note.id },
        data: {
          fileUrl: stored.relativePath,
          fileSize: buffer.length,
          fileType: "pdf",
        },
      });
      restored += 1;
      console.info(`[restore-files] restored note ${note.id}`);
    } catch (error) {
      failed += 1;
      const name = error instanceof Error ? error.name : "Error";
      console.error(`[restore-files] failed for ${note.id} (${name})`);
    }
  }

  console.info(
    `[restore-files] done restored=${restored} skipped=${skipped} failed=${failed} total=${notes.length}`,
  );
}

main()
  .catch((error) => {
    console.error("[restore-files] aborted");
    console.error(error instanceof Error ? error.name : "Error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
