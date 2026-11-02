import { auth, signOut } from "@/auth";
import { BrandLogo } from "@/components/brand-logo";
import { MobileNav, type MobileNavLink } from "@/components/mobile-nav";
import Link from "next/link";

const desktopLinks = [
  { href: "/explore", label: "Explore" },
  { href: "/search", label: "Search" },
  { href: "/upload", label: "Upload" },
  { href: "/library", label: "Library" },
];

export async function SiteHeader() {
  const session = await auth();

  const mobileLinks: MobileNavLink[] = [
    ...desktopLinks,
    ...(session?.user
      ? [
          { href: "/dashboard", label: "Dashboard" } satisfies MobileNavLink,
          { href: "/profile", label: "Profile" } satisfies MobileNavLink,
        ]
      : [
          { href: "/login", label: "Log in" } satisfies MobileNavLink,
          { href: "/register", label: "Join", tone: "cta" as const } satisfies MobileNavLink,
        ]),
    ...(session?.user.role === "ADMIN"
      ? [{ href: "/admin", label: "Admin", tone: "accent" as const }]
      : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
      <div className="relative mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <BrandLogo size="md" showTagline priority className="shrink-0" />
        <div className="ml-auto flex items-center gap-2 sm:gap-5">
          <nav className="hidden items-center gap-5 text-sm md:flex" aria-label="Primary">
            {desktopLinks.map((link) => (
              <Link key={link.href} href={link.href} className="text-muted hover:text-ink">
                {link.label}
              </Link>
            ))}
            {session?.user.role === "ADMIN" && (
              <Link href="/admin" className="text-terracotta hover:text-ink">
                Admin
              </Link>
            )}
          </nav>
          <div className="hidden items-center gap-2 text-sm md:flex">
            {session?.user ? (
              <>
                <Link href="/dashboard" className="text-muted hover:text-ink">
                  {session.user.name}
                </Link>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/" });
                  }}
                >
                  <button className="rounded-full border border-line px-3 py-1.5 hover:bg-parchment">
                    Log out
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" className="px-3 py-1.5 text-muted hover:text-ink">
                  Log in
                </Link>
                <Link
                  href="/register"
                  className="rounded-full bg-forest px-3 py-1.5 text-white hover:bg-forest-dark"
                >
                  Join
                </Link>
              </>
            )}
          </div>
          <MobileNav links={mobileLinks} signedIn={Boolean(session?.user)} />
        </div>
      </div>
    </header>
  );
}
