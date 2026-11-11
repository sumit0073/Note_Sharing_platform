import { beforeEach, describe, expect, it, vi } from "vitest";

const { gate, find, ensure, open, update } = vi.hoisted(() => ({
  gate: vi.fn(), find: vi.fn(), ensure: vi.fn(), open: vi.fn(), update: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ requireActiveUser: gate }));
vi.mock("@/lib/db", () => ({ prisma: { note: { findFirst: find, findUnique: find, update } } }));
vi.mock("@/lib/note-files", () => ({ ensureNoteFile: ensure }));
vi.mock("@/lib/storage", () => ({ openStoredFile: open }));

import { GET as preview } from "@/app/api/files/[...path]/route";
import { GET as download } from "@/app/api/notes/[id]/download/route";

const note = { id: "note-1", fileUrl: "note-1/file.pdf", status: "PUBLISHED", title: "Notes", fileType: "pdf" };
const request = new Request("https://example.com/api/files/note-1/file.pdf");
const context = (filename = "file.pdf") => ({ params: Promise.resolve({ path: ["note-1", filename] }) });

describe("file stream ownership", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    gate.mockResolvedValue({ ok: true });
    find.mockResolvedValue(note);
    ensure.mockResolvedValue({ relativePath: note.fileUrl, available: true });
  });

  it("rejects incorrect preview filenames before touching storage", async () => {
    expect((await preview(request, context("wrong.pdf"))).status).toBe(404);
    expect(ensure).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it("does not open unavailable files", async () => {
    ensure.mockResolvedValue({ relativePath: note.fileUrl, available: false });
    expect((await preview(request, context())).status).toBe(404);
    expect(open).not.toHaveBeenCalled();
  });

  it("returns the stream for a valid preview", async () => {
    const cancel = vi.fn();
    open.mockResolvedValue({ stream: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("pdf")); c.close(); }, cancel }) });
    const response = await preview(request, context());
    expect(await response.text()).toBe("pdf");
    expect(cancel).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(note.fileUrl);
  });

  it("cancels a preview stream if response headers are invalid", async () => {
    const cancel = vi.fn();
    open.mockResolvedValue({ stream: new ReadableStream({ cancel }), contentType: "invalid\nheader" });
    await expect(preview(request, context())).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("cancels a download stream if updating the counter fails", async () => {
    const cancel = vi.fn();
    open.mockResolvedValue({ stream: new ReadableStream({ cancel }) });
    update.mockRejectedValue(new Error("database unavailable"));
    await expect(download(request, { params: Promise.resolve({ id: note.id }) })).rejects.toThrow("database unavailable");
    expect(cancel).toHaveBeenCalledOnce();
  });
});
