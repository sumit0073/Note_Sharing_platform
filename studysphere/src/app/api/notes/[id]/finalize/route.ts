import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { requireActiveUser } from "@/lib/session";
import { isBlobStorageEnabled, verifyStoredObject } from "@/lib/storage";

/**
 * Confirms the reserved private Blob object exists, then publishes the PENDING note.
 * Required because Blob's onUploadCompleted webhook may not reach localhost.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isBlobStorageEnabled()) {
    return jsonError("Blob storage is not configured", 400);
  }

  const gate = await requireActiveUser("Sign in to finish upload");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const note = await prisma.note.findFirst({
    where: {
      id,
      uploaderId: gate.user.id,
      status: "PENDING",
    },
  });
  if (!note) return jsonError("Pending upload not found", 404);

  const stored = await verifyStoredObject(note.fileUrl);
  if (!stored) {
    return jsonError("Uploaded file not found in storage", 404);
  }

  if (stored.size > note.fileSize * 1.05 + 1024) {
    // Reject unexpectedly larger objects vs the size declared at prepare time.
    return jsonError("Uploaded file exceeds the declared size", 400);
  }

  try {
    const published = await prisma.note.update({
      // Recheck authorization in the write so a concurrent removal wins.
      where: { id: note.id, uploaderId: gate.user.id, status: "PENDING" },
      data: {
        status: "PUBLISHED",
        fileSize: stored.size,
      },
      include: { subject: true },
    });

    return jsonOk(published);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return jsonError("Pending upload is no longer available", 409);
    }
    throw error;
  }
}
