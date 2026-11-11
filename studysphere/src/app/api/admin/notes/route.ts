import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { requireAdminUser } from "@/lib/session";
import { deleteStoredFile } from "@/lib/storage";
import { z } from "zod";

const patchSchema = z.object({
  id: z.string(),
  status: z.enum(["PUBLISHED", "REMOVED", "PENDING"]),
});

export async function GET() {
  const gate = await requireAdminUser();
  if (!gate.ok) return gate.response;
  const notes = await prisma.note.findMany({
    include: {
      uploader: { select: { name: true, email: true } },
      subject: true,
      _count: { select: { reports: true, ratings: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return jsonOk(notes);
}

export async function PATCH(request: Request) {
  const gate = await requireAdminUser();
  if (!gate.ok) return gate.response;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid update");
  // Revoke upload completion even when moderation leaves the status PENDING.
  const note = await prisma.note.update({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status, uploadPending: false },
  });
  if (parsed.data.status === "REMOVED") {
    await deleteStoredFile(note.fileUrl);
  }
  return jsonOk(note);
}
