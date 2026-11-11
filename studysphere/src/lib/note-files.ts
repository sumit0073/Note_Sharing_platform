import { prisma } from "@/lib/db";
import { buildSimplePdf } from "@/lib/simple-pdf";
import {
  buildNoteRelativePath,
  isBlobStorageEnabled,
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
 * Ensure a note's stored PDF is available without opening a stream. If Blob/local storage is missing the object
 * (common for seed notes after the Vercel migration), write a replacement
 * PDF at a stable path and update the row.
 */
export async function ensureNoteFile(note: NoteFileRecord): Promise<{
  relativePath: string;
  available: boolean;
  restored: boolean;
}> {
  if (note.fileUrl && note.fileUrl !== "pending") {
    const existing = await verifyStoredObject(note.fileUrl);
    if (existing) {
      return { relativePath: note.fileUrl, available: true, restored: false };
    }
  }

  if (!isBlobStorageEnabled() && process.env.ALLOW_LOCAL_RESTORE !== "1") {
    return { relativePath: note.fileUrl, available: false, restored: false };
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

    return { relativePath, available: true, restored: true };
  } catch {
    console.error("[note-files] could not restore missing file");
    return { relativePath: note.fileUrl, available: false, restored: false };
  }
}
