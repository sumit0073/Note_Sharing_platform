import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { requireAdminPageUser } from "@/lib/session";

const items = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/notes", label: "Notes" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/subjects", label: "Subjects" },
  { href: "/admin/sources", label: "Sources" },
  { href: "/admin/analytics", label: "Analytics" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPageUser("/admin");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BrandLogo size="sm" showWordmark />
        <p className="text-xs uppercase tracking-[0.2em] text-terracotta">Admin</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm"
          >
            {item.label}
          </Link>
        ))}
      </div>
      <div className="mt-8">{children}</div>
    </div>
  );
}
