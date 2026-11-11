import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
  requireActiveUser: vi.fn(), verifyStoredObject: vi.fn(), handleUpload: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: { note: mocks } }));
vi.mock("@/lib/session", () => ({ requireActiveUser: mocks.requireActiveUser }));
vi.mock("@/lib/storage", () => ({
  isBlobStorageEnabled: () => true,
  verifyStoredObject: mocks.verifyStoredObject,
}));
vi.mock("@vercel/blob/client", () => ({ handleUpload: mocks.handleUpload }));

import { POST as finalize } from "@/app/api/notes/[id]/finalize/route";
import { POST as upload } from "@/app/api/blob/upload/route";

const reservation = {
  id: "note-1", uploaderId: "owner-1", status: "PENDING",
  fileUrl: "note-1/file.pdf", fileSize: 100,
};
let current: typeof reservation;
let beforeWrite: () => void;

beforeEach(() => {
  vi.resetAllMocks();
  current = { ...reservation };
  beforeWrite = () => {};
  mocks.requireActiveUser.mockResolvedValue({ ok: true, user: { id: "owner-1" } });
  mocks.findFirst.mockImplementation(async ({ where }) =>
    Object.entries(where).every(([key, value]) => current[key as keyof typeof current] === value)
      ? { ...current } : null,
  );
  mocks.verifyStoredObject.mockResolvedValue({ size: 101 });
  // Model the database's atomic conditional write, after a concurrent mutation.
  const write = ({ where, data }: { where: Record<string, unknown>; data: object }) => {
    beforeWrite();
    const matches = Object.entries(where).every(
      ([key, value]) => current[key as keyof typeof current] === value,
    );
    if (matches) Object.assign(current, data);
    return matches;
  };
  mocks.update.mockImplementation(async (args) => {
    if (!write(args)) {
      throw new Prisma.PrismaClientKnownRequestError("No matching note", {
        code: "P2025", clientVersion: "6.19.3",
      });
    }
    return { ...current, subject: { id: "subject-1" } };
  });
  mocks.updateMany.mockImplementation(async (args) => ({ count: write(args) ? 1 : 0 }));
  mocks.handleUpload.mockImplementation(async ({ onUploadCompleted }) => {
    await onUploadCompleted({
      blob: { pathname: reservation.fileUrl },
      tokenPayload: JSON.stringify({ noteId: reservation.id, userId: reservation.uploaderId }),
    });
    return { type: "blob.upload-completed", response: "ok" };
  });
});

const finish = () => finalize(new Request("https://example.test/finalize"), {
  params: Promise.resolve({ id: reservation.id }),
});
const complete = () => upload(new Request("https://example.test/upload", {
  method: "POST", body: JSON.stringify({ type: "blob.upload-completed" }),
}));

describe("conditional note publication", () => {
  it("finalizes an owner's pending note with the verified size and subject", async () => {
    const response = await finish();
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      status: "PUBLISHED", fileSize: 101, subject: { id: "subject-1" },
    });
  });

  it.each(["REMOVED", "PUBLISHED"])("finalize cannot overwrite a concurrent %s state", async (status) => {
    beforeWrite = () => { current.status = status; };
    expect((await finish()).status).toBe(409);
    expect(current.status).toBe(status);
    expect(current.fileSize).toBe(100);
  });

  it("finalize cannot publish after ownership changes", async () => {
    beforeWrite = () => { current.uploaderId = "other-owner"; };
    expect((await finish()).status).toBe(409);
    expect(current.status).toBe("PENDING");
  });

  it("publishes a matching pending upload callback", async () => {
    expect((await complete()).status).toBe(200);
    expect(current.status).toBe("PUBLISHED");
  });

  it.each(["REMOVED", "PUBLISHED"])("callback ignores a concurrent %s state", async (status) => {
    beforeWrite = () => { current.status = status; };
    expect((await complete()).status).toBe(200);
    expect(current.status).toBe(status);
  });

  it("callback cannot publish after ownership changes", async () => {
    beforeWrite = () => { current.uploaderId = "other-owner"; };
    expect((await complete()).status).toBe(200);
    expect(current.status).toBe("PENDING");
  });

  it("retains the callback pathname check", async () => {
    current.fileUrl = "different.pdf";
    await complete();
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(current.status).toBe("PENDING");
  });

  it("propagates unexpected finalize database failures", async () => {
    mocks.update.mockRejectedValue(new Error("database unavailable"));
    await expect(finish()).rejects.toThrow("database unavailable");
  });
});
