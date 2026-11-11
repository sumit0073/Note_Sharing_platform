import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, findNote, findUser, ensureNoteFile, notFound } = vi.hoisted(() => ({
  auth: vi.fn(),
  findNote: vi.fn(),
  findUser: vi.fn(),
  ensureNoteFile: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
}));

vi.mock("@/auth", () => ({ auth }));
vi.mock("@/lib/db", () => ({
  prisma: { note: { findUnique: findNote }, user: { findUnique: findUser } },
}));
vi.mock("next/navigation", () => ({ notFound, redirect: vi.fn() }));
vi.mock("@/lib/note-files", () => ({ ensureNoteFile }));
vi.mock("@/lib/storage", () => ({ deleteStoredFile: vi.fn() }));
vi.mock("@/components/note-actions", () => ({ NoteActions: () => null }));

import { GET } from "@/app/api/notes/[id]/route";
import NotePage from "@/app/notes/[id]/page";

const note = {
  id: "note-1", status: "PENDING", uploaderId: "owner-1",
  title: "Private title", description: "Private description", fileUrl: "private.pdf",
  subject: { name: "Subject", department: "Department" },
  uploader: { name: "Owner" }, tags: [], ratings: [],
  fileSize: 100, fileType: "pdf", downloads: 0, createdAt: new Date(),
};

for (const consumer of ["API", "page"] as const) {
  describe(`${consumer} metadata authorization`, () => {
    beforeEach(() => {
      vi.resetAllMocks();
      vi.stubGlobal("React", React);
      notFound.mockImplementation(() => { throw new Error("NOT_FOUND"); });
      auth.mockResolvedValue({ user: { id: "viewer-1", role: "ADMIN", status: "ACTIVE" } });
      findNote.mockResolvedValue(note);
      ensureNoteFile.mockResolvedValue(null);
    });

    afterEach(() => vi.unstubAllGlobals());

    async function read() {
      const params = Promise.resolve({ id: note.id });
      if (consumer === "API") {
        return GET(new Request("https://example.com/api/notes/note-1"), { params });
      }
      return NotePage({ params, searchParams: Promise.resolve({}) });
    }

    async function expectDenied() {
      if (consumer === "API") {
        const response = await read() as Response;
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ ok: false, error: "Note not found" });
      } else {
        await expect(read()).rejects.toThrow("NOT_FOUND");
        expect(ensureNoteFile).not.toHaveBeenCalled();
      }
    }

    it.each([
      { role: "STUDENT", status: "ACTIVE" },
      { role: "ADMIN", status: "SUSPENDED" },
      { role: "ADMIN", status: "PENDING_VERIFICATION" },
      null,
    ])("denies a stale ADMIN JWT when the current account is %j", async (record) => {
      findUser.mockResolvedValue(record && { id: "viewer-1", ...record });
      await expectDenied();
      expect(findUser).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "viewer-1" } }));
    });

    it("allows a current active admin even with a stale STUDENT claim", async () => {
      auth.mockResolvedValue({ user: { id: "viewer-1", role: "STUDENT" } });
      findUser.mockResolvedValue({ id: "viewer-1", role: "ADMIN", status: "ACTIVE" });
      const result = await read();
      if (consumer === "API") expect((result as Response).status).toBe(200);
      else expect(result).toBeTruthy();
    });

    it("preserves owner access without an administrator lookup", async () => {
      auth.mockResolvedValue({ user: { id: note.uploaderId, role: "STUDENT" } });
      const result = await read();
      if (consumer === "API") expect((result as Response).status).toBe(200);
      expect(notFound).not.toHaveBeenCalled();
      expect(findUser).not.toHaveBeenCalled();
    });

    it("keeps published metadata public", async () => {
      auth.mockResolvedValue(null);
      findNote.mockResolvedValue({ ...note, status: "PUBLISHED" });
      const result = await read();
      if (consumer === "API") expect((result as Response).status).toBe(200);
      expect(notFound).not.toHaveBeenCalled();
      expect(findUser).not.toHaveBeenCalled();
    });

    it.each(["PENDING", "REMOVED"])("denies anonymous access to %s metadata", async (status) => {
      auth.mockResolvedValue(null);
      findNote.mockResolvedValue({ ...note, status });
      await expectDenied();
      expect(findUser).not.toHaveBeenCalled();
    });
  });
}
