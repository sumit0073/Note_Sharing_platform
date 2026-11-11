import { requireAdminUser } from "@/lib/session";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NoteActions } from "@/components/note-actions";
import { canReadNoteMetadata } from "@/lib/note-access";
import { ensureNoteFile } from "@/lib/note-files";
import { average, formatBytes, timeAgo } from "@/lib/utils";

export default async function NotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const searchId = Array.isArray(sp.sid) ? sp.sid[0] : sp.sid;
  const session = await auth();

  const note = await prisma.note.findUnique({
    where: { id },
    include: {
      subject: true,
      uploader: { select: { id: true, name: true } },
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
    notFound();
  }

  const avgRating = average(note.ratings.map((r) => r.rating));
  const ensured = session?.user ? await ensureNoteFile(note) : null;
  const fileUrl = ensured?.relativePath ?? note.fileUrl;
  const previewUrl = `/api/files/${fileUrl}`;
  const fileAvailable = Boolean(ensured?.file);

  return (
    <section className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1.4fr_0.8fr]">
      <div>
        <p className="text-sm text-muted">
          {note.subject.department} · {note.subject.name}
          {note.unit ? ` · Unit ${note.unit}` : ""}
        </p>
        <h1 className="mt-2 font-serif text-4xl">{note.title}</h1>
        <p className="mt-4 text-muted">{note.description}</p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm text-muted">
          <span>★ {avgRating.toFixed(1)} · {note.ratings.length} ratings</span>
          <span>↓ {note.downloads} downloads</span>
          <span>{formatBytes(note.fileSize)}</span>
          <span>Uploaded {timeAgo(note.createdAt)} by {note.uploader.name}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {note.tags.map((entry) => (
            <span key={entry.tagId} className="rounded-full bg-leaf px-2 py-0.5 text-xs">
              {entry.tag.name}
            </span>
          ))}
        </div>
        <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-paper">
          {!session?.user ? (
            <div className="p-8 text-sm text-muted">
              Sign in to preview this file.{" "}
              <a href={`/login?next=/notes/${note.id}`} className="text-forest underline">
                Log in
              </a>
            </div>
          ) : !fileAvailable ? (
            <div className="p-8 text-sm text-muted">
              This file is currently unavailable. Please try again later.
            </div>
          ) : note.fileType === "pdf" ? (
            <iframe title="PDF preview" src={previewUrl} className="h-[70vh] w-full" />
          ) : (
            <div className="p-8 text-sm text-muted">
              Preview is available for PDFs. Download the {note.fileType.toUpperCase()} file to view
              it.
            </div>
          )}
        </div>
      </div>
      <aside className="space-y-4">
        <NoteActions
          noteId={note.id}
          searchId={searchId}
          isSignedIn={Boolean(session?.user)}
          fileAvailable={fileAvailable}
          canRate={Boolean(session?.user && session.user.id !== note.uploaderId)}
        />
      </aside>
    </section>
  );
}
