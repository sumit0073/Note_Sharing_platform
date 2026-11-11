import { requireAdminPageUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { AdminNotesClient } from "./notes-client";

export default async function AdminNotesPage() {
  await requireAdminPageUser("/admin/notes");

  const notes = await prisma.note.findMany({
    include: {
      uploader: { select: { name: true, email: true } },
      _count: { select: { reports: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <AdminNotesClient
      initialNotes={notes.map((note) => ({
        id: note.id,
        title: note.title,
        status: note.status,
        downloads: note.downloads,
        uploader: note.uploader,
        _count: note._count,
      }))}
    />
  );
}
