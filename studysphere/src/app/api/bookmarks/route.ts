import { prisma } from "@/lib/db";
import { canReadNoteMetadata } from "@/lib/note-access";
import { jsonError, jsonOk } from "@/lib/http";
import { createNoteBookmark } from "@/lib/bookmarks";
import { requireActiveUser } from "@/lib/session";
import { z } from "zod";

const createSchema = z.object({
  type: z.enum(["NOTE", "EXTERNAL"]),
  noteId: z.string().optional(),
  external: z
    .object({
      title: z.string().min(1),
      url: z.string().url(),
      domain: z.string().min(1),
      description: z.string().optional(),
      sourceType: z.string().optional(),
    })
    .optional(),
});

export async function GET() {
  const gate = await requireActiveUser("Unauthorized");
  if (!gate.ok) return gate.response;

  const bookmarks = await prisma.bookmark.findMany({
    where: { userId: gate.user.id },
    include: {
      note: {
        include: {
          subject: true,
          tags: { include: { tag: true } },
        },
      },
      external: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const visibleBookmarks = bookmarks.filter((bookmark) =>
    !bookmark.note || canReadNoteMetadata({
      status: bookmark.note.status,
      uploaderId: bookmark.note.uploaderId,
      viewerId: gate.user.id,
      viewerRole: gate.user.role,
    }),
  );

  return jsonOk(visibleBookmarks);
}

export async function POST(request: Request) {
  const gate = await requireActiveUser("Sign in to bookmark resources");
  if (!gate.ok) return gate.response;
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid bookmark");

  if (parsed.data.type === "NOTE") {
    if (!parsed.data.noteId) return jsonError("noteId is required");
    const result = await createNoteBookmark({
      userId: gate.user.id,
      noteId: parsed.data.noteId,
    });
    if (!result.ok) return jsonError(result.error, result.status);
    return jsonOk(result.bookmark, result.status);
  }

  if (!parsed.data.external) return jsonError("External resource is required");
  const resource = await prisma.externalResource.upsert({
    where: { url: parsed.data.external.url },
    update: {},
    create: {
      title: parsed.data.external.title,
      url: parsed.data.external.url,
      domain: parsed.data.external.domain,
      description: parsed.data.external.description ?? "",
      sourceType: parsed.data.external.sourceType ?? "educational",
    },
  });

  const existing = await prisma.bookmark.findFirst({
    where: { userId: gate.user.id, externalId: resource.id },
  });
  if (existing) return jsonOk(existing);

  const bookmark = await prisma.bookmark.create({
    data: {
      userId: gate.user.id,
      type: "EXTERNAL",
      externalId: resource.id,
    },
  });
  return jsonOk(bookmark, 201);
}

export async function DELETE(request: Request) {
  const gate = await requireActiveUser("Unauthorized");
  if (!gate.ok) return gate.response;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return jsonError("Bookmark id is required");
  await prisma.bookmark.deleteMany({
    where: { id, userId: gate.user.id },
  });
  return jsonOk({ deleted: true });
}
