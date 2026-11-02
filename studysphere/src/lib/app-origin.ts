const APEX_ORIGIN = "https://studysphere.space";
const WWW_ORIGIN = "https://www.studysphere.space";

export function isLocalOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(origin);
  }
}

/**
 * Public origin for Auth.js redirects and cookies.
 * Live traffic is on www (apex 308s there), so localhost AUTH_URL must never win.
 */
export function canonicalAppOrigin(): string {
  const configured = process.env.AUTH_URL?.trim().replace(/\/$/, "") || "";
  if (configured && !isLocalOrigin(configured)) return configured;
  return WWW_ORIGIN;
}

/** Email links can stay on the apex host; Cloudflare/Vercel 308 to www. */
export function publicSiteOrigin(): string {
  const configured = process.env.AUTH_URL?.trim().replace(/\/$/, "") || "";
  if (configured && !isLocalOrigin(configured)) return configured;
  return APEX_ORIGIN;
}

/**
 * Auth.js reads AUTH_URL at init. If production still has localhost (a common
 * leftover from .env.example), overwrite it before NextAuth starts.
 */
export function ensureProductionAuthUrl(): string {
  const resolved = canonicalAppOrigin();
  if (process.env.NODE_ENV === "production") {
    process.env.AUTH_URL = resolved;
  }
  return resolved;
}

export function originFromRequest(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host =
    forwardedHost?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim() ||
    "";
  if (host && !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) {
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    return `${proto}://${host}`;
  }
  return canonicalAppOrigin();
}

export function loginUrl(request: Request, nextPath: string): URL {
  const login = new URL("/login", `${originFromRequest(request)}/`);
  if (nextPath.startsWith("/")) login.searchParams.set("next", nextPath);
  return login;
}

export function wantsHtml(request: Request): boolean {
  return (request.headers.get("accept") ?? "").includes("text/html");
}
