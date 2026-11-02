import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { SearchForm } from "@/components/search-form";
import { prisma } from "@/lib/db";

export default async function HomePage() {
  const published = { status: "PUBLISHED" as const };
  const [notes, users, downloads] = await Promise.all([
    prisma.note.count({ where: published }),
    prisma.user.count({ where: { status: "ACTIVE", role: "STUDENT" } }),
    prisma.note.aggregate({
      where: published,
      _sum: { downloads: true },
    }),
  ]);

  return (
    <>
      <section className="border-b border-line bg-[radial-gradient(circle_at_top_left,#dceee4,transparent_28%),linear-gradient(180deg,#fffaf2,transparent)]">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center">
          <div className="mb-6 flex justify-center">
            <BrandLogo size="lg" showTagline align="center" href={null} priority />
          </div>
          <h1 className="mt-2 font-serif text-4xl leading-tight text-ink sm:text-5xl">
            Search notes and trusted educational sources in one place.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
            StudySphere searches community notes and the open web together, then ranks what is
            actually useful for the query.
          </p>
          <div className="mx-auto mt-8 max-w-2xl">
            <SearchForm size="lg" />
          </div>
          <p className="mt-4 text-sm text-muted">
            Try “Operating System deadlock” or “DBMS normalization”.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-12 sm:grid-cols-3">
        {[
          { label: "Community notes", value: notes },
          { label: "Students", value: users },
          { label: "Downloads", value: downloads._sum.downloads ?? 0 },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-line bg-paper p-6">
            <p className="font-serif text-4xl">{stat.value}</p>
            <p className="mt-1 text-sm text-muted">{stat.label}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl bg-ink p-8 text-paper">
            <p className="text-xs uppercase tracking-[0.2em] text-gold">Community notes</p>
            <h2 className="mt-3 font-serif text-3xl">Upload once. Help a whole class.</h2>
            <p className="mt-3 text-paper/75">
              Notes stay on StudySphere with ratings, downloads, previews, and moderation.
            </p>
            <Link href="/upload" className="mt-6 inline-block rounded-full bg-gold px-4 py-2 text-ink">
              Upload notes
            </Link>
          </div>
          <div className="rounded-3xl border border-line bg-paper p-8">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Web resources</p>
            <h2 className="mt-3 font-serif text-3xl">Discover, don’t rehost.</h2>
            <p className="mt-3 text-muted">
              External results open on the original university, documentation, or OER site. Trusted
              domains get a ranking boost.
            </p>
            <Link
              href="/explore"
              className="mt-6 inline-block rounded-full border border-line px-4 py-2"
            >
              Browse the library
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
