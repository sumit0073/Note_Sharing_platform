import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { canUsePlatform, isAdmin, type SessionUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import type { NextResponse } from "next/server";

export type ActiveUser = SessionUser & { status: "ACTIVE" };

type GuardOk = { ok: true; user: ActiveUser };
type GuardFail = { ok: false; response: NextResponse };

/**
 * Resolves the caller's JWT session, then re-reads role/status from the database.
 * JWT values alone are never trusted for authorization — they can go stale after
 * an admin suspends or demotes the account.
 */
async function loadCurrentUser(): Promise<
  | { state: "unauthenticated" }
  | { state: "forbidden"; reason: "missing" | "inactive" }
  | { state: "ok"; user: ActiveUser }
> {
  const session = await auth();
  if (!session?.user?.id) return { state: "unauthenticated" };

  const record = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      role: true,
      status: true,
      email: true,
      name: true,
    },
  });

  if (!record) return { state: "forbidden", reason: "missing" };
  if (!canUsePlatform(record.status)) {
    return { state: "forbidden", reason: "inactive" };
  }

  return {
    state: "ok",
    user: {
      id: record.id,
      role: record.role as ActiveUser["role"],
      status: "ACTIVE",
      email: record.email,
      name: record.name,
    },
  };
}

/** Authenticated platform actions: uploads, ratings, bookmarks, downloads, etc. */
export async function requireActiveUser(
  unauthorizedMessage = "Unauthorized",
): Promise<GuardOk | GuardFail> {
  const result = await loadCurrentUser();
  if (result.state === "unauthenticated" || result.state === "forbidden") {
    if (result.state === "unauthenticated" || result.reason === "missing") {
      return { ok: false, response: jsonError(unauthorizedMessage, 401) };
    }
    return { ok: false, response: jsonError("This account is suspended", 403) };
  }
  return { ok: true, user: result.user };
}

/** Admin API routes — requires an ACTIVE user whose DB role is ADMIN. */
export async function requireAdminUser(): Promise<GuardOk | GuardFail> {
  const result = await loadCurrentUser();
  if (result.state === "unauthenticated" || result.state === "forbidden") {
    return { ok: false, response: jsonError("Forbidden", 403) };
  }
  if (!isAdmin(result.user.role)) {
    return { ok: false, response: jsonError("Forbidden", 403) };
  }
  return { ok: true, user: result.user };
}

/** Server pages gated by session — redirects instead of returning JSON. */
export async function requireActivePageUser(nextPath: string): Promise<ActiveUser> {
  const result = await loadCurrentUser();
  if (result.state === "unauthenticated" || result.state === "forbidden") {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return result.user;
}

/** Admin pages must authorize before reading data, independently of layouts. */
export async function requireAdminPageUser(nextPath: string): Promise<ActiveUser> {
  const user = await requireActivePageUser(nextPath);
  if (!isAdmin(user.role)) redirect("/dashboard");
  return user;
}
