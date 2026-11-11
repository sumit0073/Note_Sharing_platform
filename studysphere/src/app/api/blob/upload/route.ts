import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { prisma } from "@/lib/db";
import { ALLOWED_UPLOAD_CONTENT_TYPES } from "@/lib/notes-upload";
import { BlobUploadDenied, blobUploadClientError } from "@/lib/blob-upload-errors";
import { requireActiveUser } from "@/lib/session";
import { isBlobStorageEnabled } from "@/lib/storage";
import { MAX_FILE_SIZE } from "@/lib/constants";
import { NextResponse } from "next/server";

/**
 * Issues scoped private Blob client tokens and handles upload-completed webhooks.
 * Token issuance requires an authenticated owner of a PENDING note whose reserved
 * pathname matches the upload target exactly.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isBlobStorageEnabled()) {
    return NextResponse.json(
      { error: "File upload is temporarily unavailable" },
      { status: 400 },
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const gate = await requireActiveUser("Sign in to upload notes");
        if (!gate.ok) {
          const status = gate.response.status;
          if (status === 401) {
            throw new BlobUploadDenied(401, "unauthenticated token request");
          }
          if (status === 403) {
            throw new BlobUploadDenied(403, "suspended user token request");
          }
          throw new BlobUploadDenied(400, `active-user gate status ${status}`);
        }

        const noteId = clientPayload?.trim();
        if (!noteId) {
          throw new BlobUploadDenied(400, "missing note id in client payload");
        }

        const note = await prisma.note.findFirst({
          where: {
            id: noteId,
            uploaderId: gate.user.id,
            status: "PENDING",
            uploadPending: true,
          },
        });
        if (!note) {
          throw new BlobUploadDenied(400, "pending reservation not found for caller");
        }
        if (pathname !== note.fileUrl) {
          throw new BlobUploadDenied(400, "pathname does not match reserved fileUrl");
        }

        return {
          allowedContentTypes: ALLOWED_UPLOAD_CONTENT_TYPES,
          maximumSizeInBytes: MAX_FILE_SIZE,
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({
            noteId: note.id,
            userId: gate.user.id,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (!tokenPayload) return;
        const payload = JSON.parse(tokenPayload) as { noteId?: string; userId?: string };
        if (!payload.noteId || !payload.userId) return;

        const note = await prisma.note.findFirst({
          where: {
            id: payload.noteId,
            uploaderId: payload.userId,
            status: "PENDING",
            uploadPending: true,
          },
        });
        if (!note) return;
        if (blob.pathname !== note.fileUrl) return;

        await prisma.note.updateMany({
          where: {
            id: note.id,
            uploaderId: payload.userId,
            status: "PENDING",
            uploadPending: true,
          },
          data: { status: "PUBLISHED", uploadPending: false },
        });
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const mapped = blobUploadClientError(error);
    console.error(`[blob/upload] ${mapped.log}`);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
