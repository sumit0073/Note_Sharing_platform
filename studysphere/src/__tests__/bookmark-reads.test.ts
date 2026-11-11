import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  requireActiveUser: vi.fn(),
  requireActivePageUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: { bookmark: { findMany: mocks.findMany } } }));
vi.mock("@/lib/session", () => ({
  requireActiveUser: mocks.requireActiveUser,
  requireActivePageUser: mocks.requireActivePageUser,
}));
vi.mock("@/components/note-card", () => ({
  NoteCard: ({ note }: { note: { title: string } }) => createElement("div", null, note.title),
}));
vi.mock("@/components/web-card", () => ({
  WebCard: ({ resource }: { resource: { title: string } }) => createElement("div", null, resource.title),
}));

import { GET } from "@/app/api/bookmarks/route";
import LibraryPage from "@/app/library/page";

function noteBookmark(status: string) {
  return {
    id: "bookmark-note",
    type: "NOTE",
    external: null,
    note: {
      id: "note-1",
      status,
      uploaderId: "owner",
      title: "Sensitive note title",
      description: "Sensitive description",
      fileUrl: "/uploads/private.pdf",
      ratings: [],
      tags: [],
      subject: { name: "Subject" },
    },
  };
}
const externalBookmark = {
  id: "bookmark-web",
  type: "EXTERNAL",
  note: null,
  external: { title: "External resource", url: "https://example.com", domain: "example.com" },
};

function setViewer(id: string, role: string) {
  const user = { id, role, status: "ACTIVE" };
  mocks.requireActiveUser.mockResolvedValue({ ok: true, user });
  mocks.requireActivePageUser.mockResolvedValue(user);
}

async function checkReaders(visible: boolean) {
  const response = await GET();
  const body = await response.json();
  expect(body.data).toEqual(visible ? [noteBookmark(currentStatus), externalBookmark] : [externalBookmark]);
  if (!visible) {
    expect(JSON.stringify(body)).not.toContain("Sensitive");
    expect(JSON.stringify(body)).not.toContain("/uploads/private.pdf");
  }
  const html = renderToStaticMarkup(await LibraryPage());
  expect(html.includes("Sensitive note title")).toBe(visible);
  expect(html).toContain("External resource");
}
let currentStatus = "PUBLISHED";

describe("bookmark metadata visibility in API and library", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setViewer("viewer", "STUDENT");
    currentStatus = "PUBLISHED";
    mocks.findMany.mockImplementation(async () => [noteBookmark(currentStatus), externalBookmark]);
  });

  it.each([
    ["PUBLISHED", "viewer", "STUDENT", true],
    ["PENDING", "viewer", "STUDENT", false],
    ["PENDING", "owner", "STUDENT", true],
    ["PENDING", "admin", "ADMIN", true],
    ["REMOVED", "viewer", "STUDENT", false],
    ["REMOVED", "owner", "STUDENT", false],
    ["REMOVED", "admin", "ADMIN", false],
    ["UNKNOWN", "admin", "ADMIN", false],
  ])("checks %s for %s (%s)", async (status, id, role, visible) => {
    currentStatus = status;
    setViewer(id, role);
    await checkReaders(visible);
    expect(mocks.findMany).toHaveBeenCalledTimes(2);
    for (const [query] of mocks.findMany.mock.calls) {
      expect(query.where).toEqual({ userId: id });
    }
  });

  it("rechecks visibility after status changes while the bookmark is retained", async () => {
    await checkReaders(true);
    currentStatus = "PENDING";
    await checkReaders(false);
    currentStatus = "REMOVED";
    await checkReaders(false);
  });

  it("shows the empty library state when all saved notes are inaccessible", async () => {
    mocks.findMany.mockResolvedValue([noteBookmark("REMOVED")]);
    expect((await (await GET()).json()).data).toEqual([]);
    expect(renderToStaticMarkup(await LibraryPage())).toContain("Nothing saved yet.");
  });

  it("returns the failed API guard before querying bookmarks", async () => {
    const response = new Response(null, { status: 401 });
    mocks.requireActiveUser.mockResolvedValue({ ok: false, response });
    expect(await GET()).toBe(response);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
