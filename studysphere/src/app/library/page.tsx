import { prisma } from "@/lib/db";
import { canReadNoteMetadata } from "@/lib/note-access";
import { NoteCard } from "@/components/note-card";
import { WebCard } from "@/components/web-card";
import { requireActivePageUser } from "@/lib/session";
import { average } from "@/lib/utils";

export default async function LibraryPage() {
  const user = await requireActivePageUser("/library");

  const bookmarks = await prisma.bookmark.findMany({
    where: { userId: user.id },
    include: {
      note: {
        include: {
          subject: true,
          ratings: true,
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
      viewerId: user.id,
      viewerRole: user.role,
    }),
  );

  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-serif text-4xl">My library</h1>
      <p className="mt-2 text-muted">Community notes and external resources you saved.</p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {visibleBookmarks.length === 0 && <p className="text-muted">Nothing saved yet.</p>}
        {visibleBookmarks.map((bookmark) =>
          bookmark.note ? (
            <NoteCard
              key={bookmark.id}
              note={{
                id: bookmark.note.id,
                title: bookmark.note.title,
                description: bookmark.note.description,
                avgRating: average(bookmark.note.ratings.map((r) => r.rating)),
                ratingCount: bookmark.note.ratings.length,
                downloads: bookmark.note.downloads,
                resourceType: bookmark.note.resourceType,
                tags: bookmark.note.tags.map((entry) => entry.tag.name),
                subject: bookmark.note.subject,
              }}
            />
          ) : bookmark.external ? (
            <WebCard
              key={bookmark.id}
              resource={{
                title: bookmark.external.title,
                description: bookmark.external.description,
                url: bookmark.external.url,
                domain: bookmark.external.domain,
                source: bookmark.external.domain,
                sourceType: bookmark.external.sourceType,
              }}
            />
          ) : null,
        )}
      </div>
    </section>
  );
}
