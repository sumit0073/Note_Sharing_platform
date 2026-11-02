"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Menu, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

export type MobileNavLink = {
  href: string;
  label: string;
  tone?: "default" | "accent" | "cta";
};

type MobileNavProps = {
  links: MobileNavLink[];
  signedIn?: boolean;
};

export function MobileNav({ links, signedIn = false }: MobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [menuPathname, setMenuPathname] = useState(pathname);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  if (pathname !== menuPathname) {
    setMenuPathname(pathname);
    if (open) setOpen(false);
  }

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const firstLink = panelRef.current?.querySelector<HTMLElement>("a, button");
    firstLink?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink hover:bg-parchment"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
      </button>

      {open && (
        <div
          id={panelId}
          ref={panelRef}
          className="absolute inset-x-0 top-full z-50 border-b border-line bg-paper shadow-[0_12px_24px_rgba(28,25,21,0.08)]"
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
        >
          <nav className="mx-auto flex max-w-6xl flex-col px-4 py-3" aria-label="Mobile">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={close}
                className={
                  link.tone === "cta"
                    ? "mt-1 rounded-xl bg-forest px-3 py-3 text-center text-sm text-white hover:bg-forest-dark"
                    : link.tone === "accent"
                      ? "rounded-xl px-3 py-3 text-sm text-terracotta hover:bg-parchment hover:text-ink"
                      : "rounded-xl px-3 py-3 text-sm text-muted hover:bg-parchment hover:text-ink"
                }
              >
                {link.label}
              </Link>
            ))}
            {signedIn ? (
              <div className="mt-1 border-t border-line pt-1">
                <button
                  type="button"
                  onClick={() => {
                    close();
                    void signOut({ callbackUrl: "/" });
                  }}
                  className="w-full rounded-xl px-3 py-3 text-left text-sm text-muted hover:bg-parchment hover:text-ink"
                >
                  Log out
                </button>
              </div>
            ) : null}
          </nav>
        </div>
      )}
    </div>
  );
}
