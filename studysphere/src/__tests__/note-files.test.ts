import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyStoredObject = vi.fn();
const openStoredFile = vi.fn();
const writeStoredFile = vi.fn();
const isBlobStorageEnabled = vi.fn();
const updateNote = vi.fn();

vi.mock("@/lib/storage", () => ({
  buildNoteRelativePath: () => "note-1/restored.pdf",
  isBlobStorageEnabled: () => isBlobStorageEnabled(),
  openStoredFile: (...args: unknown[]) => openStoredFile(...args),
  verifyStoredObject: (...args: unknown[]) => verifyStoredObject(...args),
  writeStoredFile: (...args: unknown[]) => writeStoredFile(...args),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    note: {
      update: (...args: unknown[]) => updateNote(...args),
    },
  },
}));

import { ensureNoteFile } from "@/lib/note-files";

const note = {
  id: "note-1",
  title: "Operating System Deadlock Prevention Cheatsheet",
  description: "Short cheatsheet covering deadlock prevention.",
  fileUrl: "note-1/original.pdf",
};

describe("ensureNoteFile", () => {
  beforeEach(() => {
    verifyStoredObject.mockReset();
    openStoredFile.mockReset();
    writeStoredFile.mockReset();
    isBlobStorageEnabled.mockReset();
    updateNote.mockReset();
  });

  it("returns the existing object when storage already has it", async () => {
    verifyStoredObject.mockResolvedValue({ size: 100 });
    openStoredFile.mockResolvedValue({ stream: {} });
    isBlobStorageEnabled.mockReturnValue(true);

    const result = await ensureNoteFile(note);
    expect(result.restored).toBe(false);
    expect(result.available).toBe(true);
    expect(openStoredFile).not.toHaveBeenCalled();
    expect(writeStoredFile).not.toHaveBeenCalled();
    expect(updateNote).not.toHaveBeenCalled();
  });

  it("rebuilds a PDF into Blob when the original object is missing", async () => {
    verifyStoredObject.mockResolvedValue(null);
    isBlobStorageEnabled.mockReturnValue(true);
    writeStoredFile.mockResolvedValue({ relativePath: note.fileUrl });
    openStoredFile.mockResolvedValue({ stream: {}, contentType: "application/pdf" });
    updateNote.mockResolvedValue({});

    const result = await ensureNoteFile(note);
    expect(result.restored).toBe(true);
    expect(writeStoredFile).toHaveBeenCalledOnce();
    expect(updateNote).toHaveBeenCalledOnce();
    expect(result.available).toBe(true);
    expect(openStoredFile).not.toHaveBeenCalled();
  });
});
