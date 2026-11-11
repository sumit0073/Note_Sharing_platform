import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { parseTags, notePrepareSchema } from "@/lib/notes-upload";
import { requireActiveUser } from "@/lib/session";
import { buildNoteRelativePath, isBlobStorageEnabled } from "@/lib/storage";
import { validateUploadFile } from "@/lib/validations";
import { randomUUID } from "crypto";

/**
 * Creates a PENDING note owned by the current user and reserves the Blob pathname.
 * PDF bytes are uploaded separately (browser → private Blob).
 */
export async function POST(request: Request) {
  if (!isBlobStorageEnabled()) {
    return jsonError("Direct Blob uploads are not configured. Use local FormData upload.", 400);
  }

  const gate = await requireActiveUser("Sign in to upload notes");
  if (!gate.ok) return gate.response;

  const limited = rateLimit(clientKey(request, `upload:${gate.user.id}`), 10, 60 * 60_000);
  if (!limited.ok) return jsonError("Upload limit reached. Try again later.", 429);

  const body = await request.json().catch(() => null);
  const parsed = notePrepareSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid note details");
  }

  const fileCheck = validateUploadFile({
    type: parsed.data.fileType,
    size: parsed.data.fileSize,
    name: parsed.data.fileName,
  });
  if (!fileCheck.ok) return jsonError(fileCheck.error);

  const subject = await prisma.subject.findUnique({
    where: { id: parsed.data.subjectId },
  });
  if (!subject) return jsonError("Subject not found");

  const noteId = randomUUID();
  const relativePath = buildNoteRelativePath({
    noteId,
    originalName: parsed.data.fileName,
    extension: fileCheck.extension,
  });

  const tagNames = parseTags(parsed.data.tags);
  const note = await prisma.note.create({
    data: {
      id: noteId,
      title: parsed.data.title,
      description: parsed.data.description,
      fileUrl: relativePath,
      fileType: fileCheck.extension,
      fileSize: parsed.data.fileSize,
      resourceType: parsed.data.resourceType,
      unit: parsed.data.unit,
      uploaderId: gate.user.id,
      subjectId: subject.id,
      status: "PENDING",
      uploadPending: true,
      tags: {
        create: await Promise.all(
          tagNames.map(async (name) => {
            const tag = await prisma.tag.upsert({
              where: { name },
              update: {},
              create: { name },
            });
            return { tagId: tag.id };
          }),
        ),
      },
    },
    select: { id: true, fileUrl: true, fileType: true, fileSize: true },
  });

  return jsonOk(
    {
      noteId: note.id,
      pathname: note.fileUrl,
      fileType: note.fileType,
      fileSize: note.fileSize,
    },
    201,
  );
}
