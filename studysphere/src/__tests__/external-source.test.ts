import { beforeEach, describe, expect, it, vi } from "vitest";
import { externalSource } from "@/lib/search/external-source";
import { scoreExternalResource } from "@/lib/search/ranking";

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(), trusted: vi.fn(), upsert: vi.fn(), findBookmark: vi.fn(),
  createBookmark: vi.fn(), gate: vi.fn(), bookmarks: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: {
  externalResource: { findMany: mocks.catalog, upsert: mocks.upsert },
  trustedDomain: { findMany: mocks.trusted },
  bookmark: { findFirst: mocks.findBookmark, create: mocks.createBookmark, findMany: mocks.bookmarks },
} }));
vi.mock("@/lib/session", () => ({ requireActiveUser: mocks.gate }));
import { POST, GET } from "@/app/api/bookmarks/route";
import { searchExternalResources } from "@/lib/search/external";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  mocks.gate.mockResolvedValue({ ok: true, user: { id: "student" } });
  mocks.upsert.mockResolvedValue({ id: "external" });
  mocks.createBookmark.mockResolvedValue({ id: "bookmark" });
});

const record = {
  id: "legacy", title: "Deadlock", description: "Deadlock prevention",
  url: "https://attacker.example/notes", domain: "ocw.mit.edu", sourceType: "university",
};

function save(url: string) {
  return POST(new Request("https://app.example/api/bookmarks", {
    method: "POST", body: JSON.stringify({ type: "EXTERNAL", external: { ...record, url } }),
    headers: { "Content-Type": "application/json" },
  }));
}

describe("destination source identity", () => {
  it.each([
    ["https://OCW.MIT.EDU./notes", "ocw.mit.edu", "university"],
    ["https://en.wikipedia.org/wiki/Deadlock", "en.wikipedia.org", "oer"],
    ["https://ocw.mit.edu@attacker.example/#wikipedia.org", "attacker.example", "educational"],
    ["https://wikipedia.org.attacker.example", "wikipedia.org.attacker.example", "educational"],
    ["https://mit.edu.attacker.example", "mit.edu.attacker.example", "educational"],
    ["https://mydocs.attacker.example", "mydocs.attacker.example", "educational"],
  ])("derives identity for %s", (url, domain, sourceType) => {
    expect(externalSource(url)).toEqual({ domain, sourceType });
  });

  it.each(["javascript:alert(1)", "data:text/html,test", "ftp://mit.edu/notes", "not a URL"])(
    "rejects %s", (url) => expect(externalSource(url)).toBeNull(),
  );

  it("ignores forged metadata on create and repairs an existing row on save", async () => {
    expect((await save(record.url)).status).toBe(201);
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { url: record.url },
      update: { domain: "attacker.example", sourceType: "educational" },
      create: { title: record.title, url: record.url, description: record.description,
        domain: "attacker.example", sourceType: "educational" },
    });
  });

  it.each(["javascript:alert(1)", "ftp://mit.edu/notes"])("does not store %s", async (url) => {
    expect((await save(url)).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.createBookmark).not.toHaveBeenCalled();
  });

  it("honors the active-user gate", async () => {
    mocks.gate.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    expect((await save(record.url)).status).toBe(401);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("removes forged trust and unsafe URLs from legacy catalog results", async () => {
    mocks.catalog.mockResolvedValue([record, { ...record, url: "javascript:alert(1)" }]);
    mocks.trusted.mockResolvedValue([{ domain: "ocw.mit.edu", boost: 2 }]);
    const results = await searchExternalResources("Deadlock");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ url: record.url, domain: "attacker.example",
      source: "attacker.example", sourceType: "educational",
      relevance: scoreExternalResource({ ...record, sourceType: "educational" }, "Deadlock", 1),
    });
  });

  it("normalizes legacy bookmark reads", async () => {
    mocks.bookmarks.mockResolvedValue([{ id: "bookmark", external: record }]);
    const response = await GET();
    expect((await response.json()).data[0].external).toMatchObject({
      domain: "attacker.example", sourceType: "educational",
    });
  });
});
