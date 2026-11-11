import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { canReadNoteMetadata } from "@/lib/note-access";
import { canManageNote } from "@/lib/permissions";
import { requireActiveUser, requireAdminUser } from "@/lib/session";
import { deleteStoredFile } from "@/lib/storage";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const session = await auth();
  const note = await prisma.note.findUnique({
    where: { id },
    include: {
      subject: true,
      uploader: { select: { id: true, name: true, department: true } },
      tags: { include: { tag: true } },
      ratings: true,
    },
  });

  // Only the administrator exception needs a live role/status check.
  const adminGate =
    note?.status === "PENDING" &&
    session?.user?.id &&
    session.user.id !== note.uploaderId
      ? await requireAdminUser()
      : null;

  if (
    !note ||
    !canReadNoteMetadata({
      status: note.status,
      uploaderId: note.uploaderId,
      viewerId: session?.user?.id,
      viewerRole: adminGate?.ok ? adminGate.user.role : undefined,
    })
  ) {
    return jsonError("Note not found", 404);
  }

  const ratings = note.ratings.map((r) => r.rating);
  const avgRating =
    ratings.length === 0
      ? 0
      : ratings.reduce((sum, value) => sum + value, 0) / ratings.length;

  return jsonOk({
    ...note,
    tags: note.tags.map((entry) => entry.tag.name),
    avgRating: Number(avgRating.toFixed(1)),
    ratingCount: ratings.length,
    helpfulCount: note.ratings.filter((r) => r.helpful).length,
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireActiveUser("Unauthorized");
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) return jsonError("Note not found", 404);
  if (
    !canManageNote({
      role: gate.user.role,
      userId: gate.user.id,
      uploaderId: note.uploaderId,
    })
  ) {
    return jsonError("You cannot delete this note", 403);
  }

  await prisma.note.update({
    where: { id },
    data: { status: "REMOVED" },
  });
  await deleteStoredFile(note.fileUrl);
  return jsonOk({ message: "Note removed" });
}
