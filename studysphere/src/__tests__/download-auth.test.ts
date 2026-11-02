import { beforeEach, describe, expect, it, vi } from "vitest";

const requireActiveUser = vi.fn();
const findUnique = vi.fn();
const openStoredFile = vi.fn();

vi.mock("@/lib/session", () => ({
  requireActiveUser: (...args: unknown[]) => requireActiveUser(...args),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    note: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/storage", () => ({
  openStoredFile: (...args: unknown[]) => openStoredFile(...args),
}));

import { GET } from "@/app/api/notes/[id]/download/route";
import { jsonError } from "@/lib/http";

describe("note download guest handling", () => {
  beforeEach(() => {
    requireActiveUser.mockReset();
    findUnique.mockReset();
    openStoredFile.mockReset();
  });

  it("redirects browser guests to login instead of returning JSON", async () => {
    requireActiveUser.mockResolvedValue({
      ok: false,
      response: jsonError("Sign in to download notes", 401),
    });

    const response = await GET(
      new Request("https://www.studysphere.space/api/notes/note-1/download", {
        headers: {
          accept: "text/html,application/xhtml+xml",
          host: "www.studysphere.space",
          "x-forwarded-proto": "https",
        },
      }),
      { params: Promise.resolve({ id: "note-1" }) },
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://www.studysphere.space/login?next=%2Fnotes%2Fnote-1",
    );
  });

  it("still returns JSON for API clients that are not signed in", async () => {
    requireActiveUser.mockResolvedValue({
      ok: false,
      response: jsonError("Sign in to download notes", 401),
    });

    const response = await GET(
      new Request("https://www.studysphere.space/api/notes/note-1/download", {
        headers: { accept: "application/json" },
      }),
      { params: Promise.resolve({ id: "note-1" }) },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Sign in to download notes",
    });
  });
});
