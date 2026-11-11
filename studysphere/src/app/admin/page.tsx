import { requireAdminPageUser } from "@/lib/session";
import { prisma } from "@/lib/db";

export default async function AdminHomePage() {
  await requireAdminPageUser("/admin");

  const [users, notes, reports, searches] = await Promise.all([
    prisma.user.count(),
    prisma.note.count({ where: { status: "PUBLISHED" } }),
    prisma.report.count({ where: { status: "OPEN" } }),
    prisma.searchEvent.count(),
  ]);

  return (
    <section>
      <h1 className="font-serif text-4xl">Moderation overview</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        {[
          ["Users", users],
          ["Published notes", notes],
          ["Open reports", reports],
          ["Searches", searches],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-line bg-paper p-5">
            <p className="font-serif text-3xl">{value}</p>
            <p className="text-sm text-muted">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
