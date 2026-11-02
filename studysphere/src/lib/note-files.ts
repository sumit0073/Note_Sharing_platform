import { prisma } from "@/lib/db";
import { buildSimplePdf } from "@/lib/simple-pdf";
import {
  buildNoteRelativePath,
  isBlobStorageEnabled,
  openStoredFile,
  verifyStoredObject,
  writeStoredFile,
} from "@/lib/storage";

type NoteFileRecord = {
  id: string;
  title: string;
  description: string;
  fileUrl: string;
};

/**
 * Open a note's stored PDF. If Blob/local storage is missing the object
 * (common for seed notes after the Vercel migration), write a replacement
 * PDF at a stable path and update the row.
 */
export async function ensureNoteFile(note: NoteFileRecord): Promise<{
  relativePath: string;
  file: { stream: ReadableStream; contentType?: string } | null;
  restored: boolean;
}> {
  if (note.fileUrl && note.fileUrl !== "pending") {
    const existing = await verifyStoredObject(note.fileUrl);
    if (existing) {
      const file = await openStoredFile(note.fileUrl);
      if (file) {
        return { relativePath: note.fileUrl, file, restored: false };
      }
    }
  }

  if (!isBlobStorageEnabled() && process.env.ALLOW_LOCAL_RESTORE !== "1") {
    return { relativePath: note.fileUrl, file: null, restored: false };
  }

  const relativePath =
    note.fileUrl && note.fileUrl !== "pending"
      ? note.fileUrl
      : buildNoteRelativePath({
          noteId: note.id,
          originalName: "notes.pdf",
          extension: "pdf",
        });

  try {
    const buffer = buildSimplePdf(note.title, [
      note.description || "StudySphere notes",
      "This copy was rebuilt because the original file was missing from storage.",
    ]);

    await writeStoredFile(relativePath, buffer, "application/pdf");

    await prisma.note.update({
      where: { id: note.id },
      data: {
        fileUrl: relativePath,
        fileSize: buffer.length,
        fileType: "pdf",
      },
    });

    const file = await openStoredFile(relativePath);
    return { relativePath, file, restored: true };
  } catch {
    console.error("[note-files] could not restore missing file");
    return { relativePath: note.fileUrl, file: null, restored: false };
  }
}
