import { afterEach, describe, expect, it } from "vitest";
import {
  canonicalAppOrigin,
  ensureProductionAuthUrl,
  loginUrl,
  originFromRequest,
  publicSiteOrigin,
  wantsHtml,
} from "@/lib/app-origin";

const env = process.env as Record<string, string | undefined>;
const originalAuthUrl = process.env.AUTH_URL;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalAuthUrl === undefined) delete env.AUTH_URL;
  else env.AUTH_URL = originalAuthUrl;
  env.NODE_ENV = originalNodeEnv;
});

describe("canonical origins", () => {
  it("never uses localhost for public site links", () => {
    env.AUTH_URL = "http://localhost:3000";
    expect(publicSiteOrigin()).toBe("https://studysphere.space");
    expect(canonicalAppOrigin()).toBe("https://www.studysphere.space");
  });

  it("keeps a configured public AUTH_URL", () => {
    env.AUTH_URL = "https://www.studysphere.space";
    expect(canonicalAppOrigin()).toBe("https://www.studysphere.space");
  });

  it("overwrites localhost AUTH_URL in production", () => {
    env.AUTH_URL = "http://localhost:3000";
    env.NODE_ENV = "production";
    expect(ensureProductionAuthUrl()).toBe("https://www.studysphere.space");
    expect(process.env.AUTH_URL).toBe("https://www.studysphere.space");
  });
});

describe("request origin helpers", () => {
  it("prefers forwarded host over localhost", () => {
    const request = new Request("http://localhost:3000/dashboard", {
      headers: {
        host: "localhost:3000",
        "x-forwarded-host": "www.studysphere.space",
        "x-forwarded-proto": "https",
      },
    });
    expect(originFromRequest(request)).toBe("https://www.studysphere.space");
  });

  it("builds a login URL with next= for HTML guests", () => {
    const request = new Request("https://www.studysphere.space/api/notes/abc/download", {
      headers: {
        host: "www.studysphere.space",
        "x-forwarded-proto": "https",
        accept: "text/html",
      },
    });
    expect(wantsHtml(request)).toBe(true);
    expect(loginUrl(request, "/notes/abc").toString()).toBe(
      "https://www.studysphere.space/login?next=%2Fnotes%2Fabc",
    );
  });
});
