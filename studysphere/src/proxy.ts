import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { originFromRequest } from "@/lib/app-origin";

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = Boolean(req.auth);
  const origin = originFromRequest(req);

  if (pathname.startsWith("/admin")) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login", origin));
    }
    if (req.auth?.user.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", origin));
    }
  }

  const protectedPaths = ["/dashboard", "/upload", "/library", "/profile"];
  if (protectedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    if (!isLoggedIn) {
      const login = new URL("/login", origin);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/upload",
    "/upload/:path*",
    "/library",
    "/library/:path*",
    "/admin",
    "/admin/:path*",
    "/profile",
    "/profile/:path*",
  ],
};
