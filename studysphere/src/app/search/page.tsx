import { SearchFilters } from "@/components/search-filters";
import { SearchForm } from "@/components/search-form";
import { NoteCard } from "@/components/note-card";
import { WebCard } from "@/components/web-card";
import { unifiedSearch } from "@/lib/search/unified";
import { auth } from "@/auth";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const value = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };
  const query = value("q")?.trim() ?? "";
  const page = Math.max(1, Number(value("page") ?? 1) || 1);
  const session = await auth();

  const result = query
    ? await unifiedSearch(
        query,
        {
          department: value("department"),
          semester: value("semester") ? Number(value("semester")) : undefined,
          subject: value("subject"),
          unit: value("unit"),
          type: value("type"),
          source: value("source"),
          sort: (value("sort") as "relevant" | "downloads" | "rating" | "newest") ?? "relevant",
          page,
        },
        session?.user.id,
      )
    : null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-serif text-4xl">Unified search</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Community notes and external educational resources, ranked together. External links always open on the original site.
      </p>
      <div className="mt-6 max-w-2xl">
        <SearchForm defaultQuery={query} />
      </div>
      {query && (
        <div className="mt-6">
          <SearchFilters
            values={{
              q: query,
              department: value("department"),
              semester: value("semester"),
              subject: value("subject"),
              type: value("type"),
              source: value("source"),
              sort: value("sort"),
            }}
          />
        </div>
      )}

      {!query && <p className="mt-10 text-muted">Enter a query to search notes and trusted web resources.</p>}

      {result && (
        <>
          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <section>
              <h2 className="font-serif text-2xl">Community notes</h2>
              <p className="mt-1 text-sm text-muted">
                {result.pagination.communityTotal === 1
                  ? "1 result"
                  : `${result.pagination.communityTotal} results`}
                {result.pagination.communityTotalPages > 1
                  ? ` · page ${result.pagination.page} of ${result.pagination.communityTotalPages}`
                  : ""}
              </p>
              <div className="mt-4 grid gap-4">
                {result.community.length === 0 && (
                  <p className="text-sm text-muted">No matching notes yet.</p>
                )}
                {result.community.map((note) => (
                  <NoteCard key={note.id} note={note} searchId={result.searchId} />
                ))}
              </div>
              {result.pagination.communityTotalPages > 1 && (
                <div className="mt-6 flex flex-wrap gap-2 text-sm">
                  {result.pagination.page > 1 && (
                    <a
                      className="rounded-full border border-line px-3 py-1.5 hover:bg-paper"
                      href={`/search?${new URLSearchParams({
                        q: query,
                        ...(value("department") ? { department: value("department")! } : {}),
                        ...(value("semester") ? { semester: value("semester")! } : {}),
                        ...(value("subject") ? { subject: value("subject")! } : {}),
                        ...(value("type") ? { type: value("type")! } : {}),
                        ...(value("source") ? { source: value("source")! } : {}),
                        ...(value("sort") ? { sort: value("sort")! } : {}),
                        page: String(result.pagination.page - 1),
                      }).toString()}`}
                    >
                      ← Previous
                    </a>
                  )}
                  {result.pagination.page < result.pagination.communityTotalPages && (
                    <a
                      className="rounded-full border border-line px-3 py-1.5 hover:bg-paper"
                      href={`/search?${new URLSearchParams({
                        q: query,
                        ...(value("department") ? { department: value("department")! } : {}),
                        ...(value("semester") ? { semester: value("semester")! } : {}),
                        ...(value("subject") ? { subject: value("subject")! } : {}),
                        ...(value("type") ? { type: value("type")! } : {}),
                        ...(value("source") ? { source: value("source")! } : {}),
                        ...(value("sort") ? { sort: value("sort")! } : {}),
                        page: String(result.pagination.page + 1),
                      }).toString()}`}
                    >
                      Next →
                    </a>
                  )}
                </div>
              )}
            </section>
            <section>
              <h2 className="font-serif text-2xl">Web resources</h2>
              <p className="mt-1 text-sm text-muted">
                External results are shown in full (not paged).
              </p>
              <div className="mt-4 grid gap-4">
                {result.web.length === 0 && (
                  <p className="text-sm text-muted">No matching web resources.</p>
                )}
                {result.web.map((resource) => (
                  <WebCard key={resource.url} resource={resource} searchId={result.searchId} />
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
