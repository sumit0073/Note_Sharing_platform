import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  note: {} as Record<string, unknown>,
  verify: vi.fn(),
  active: vi.fn(),
  admin: vi.fn(),
  handleUpload: vi.fn(),
  deleteFile: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: { note: {
  findFirst: vi.fn(async ({ where }) =>
    Object.entries(where).every(([key, value]) => mocks.note[key] === value)
      ? { ...mocks.note } : null),
  findUnique: vi.fn(async () => ({ ...mocks.note })),
  update: vi.fn(async ({ data }) => Object.assign(mocks.note, data)),
  updateMany: vi.fn(async ({ where, data }) => {
    if (!Object.entries(where).every(([key, value]) => mocks.note[key] === value)) {
      return { count: 0 };
    }
    Object.assign(mocks.note, data);
    return { count: 1 };
  }),
} } }));
vi.mock("@/lib/session", () => ({
  requireActiveUser: mocks.active, requireAdminUser: mocks.admin,
}));
vi.mock("@/lib/storage", () => ({
  isBlobStorageEnabled: () => true,
  verifyStoredObject: mocks.verify,
  deleteStoredFile: mocks.deleteFile,
}));
vi.mock("@vercel/blob/client", () => ({ handleUpload: mocks.handleUpload }));

import { POST as finalize } from "@/app/api/notes/[id]/finalize/route";
import { POST as blobUpload } from "@/app/api/blob/upload/route";
import { PATCH as moderate } from "@/app/api/admin/notes/route";

const finish = () => finalize(new Request("https://example.test"), {
  params: Promise.resolve({ id: "note" }),
});
const restrict = (status = "PENDING") => moderate(new Request("https://example.test", {
  method: "PATCH", body: JSON.stringify({ id: "note", status }),
}));
type UploadOptions = {
  onBeforeGenerateToken: (pathname: string, payload: string) => Promise<unknown>;
  onUploadCompleted: (event: { blob: { pathname: string }; tokenPayload: string }) => Promise<void>;
};
async function callback(action: (options: UploadOptions) => Promise<unknown>) {
  mocks.handleUpload.mockImplementationOnce(async (options) => {
    await action(options);
    return {};
  });
  return blobUpload(new Request("https://example.test", {
    method: "POST", body: "{}",
  }));
}
const completeWebhook = (options: UploadOptions) => options.onUploadCompleted({
  blob: { pathname: "note/file.pdf" },
  tokenPayload: JSON.stringify({ noteId: "note", userId: "owner" }),
});

describe("upload reservations and moderation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.note = { id: "note", uploaderId: "owner", status: "PENDING",
      uploadPending: true, fileUrl: "note/file.pdf", fileSize: 100 };
    mocks.active.mockResolvedValue({ ok: true, user: { id: "owner" } });
    mocks.admin.mockResolvedValue({ ok: true, user: { id: "admin" } });
    mocks.verify.mockResolvedValue({ size: 100 });
  });

  it("publishes a verified reservation and consumes it", async () => {
    expect((await finish()).status).toBe(200);
    expect(mocks.note).toMatchObject({ status: "PUBLISHED", uploadPending: false });
    expect((await finish()).status).toBe(404);
  });
  it("does not let an uploader undo an admin restriction of a published note", async () => {
    mocks.note.status = "PUBLISHED";
    mocks.note.uploadPending = false;
    await restrict();
    expect((await finish()).status).toBe(404);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.note.status).toBe("PENDING");
  });
  it.each(["PENDING", "REMOVED"])("preserves an admin %s decision during storage verification", async (status) => {
    mocks.verify.mockImplementationOnce(async () => {
      await restrict(status);
      return { size: 100 };
    });
    expect((await finish()).status).toBe(404);
    expect(mocks.note).toMatchObject({ status, uploadPending: false });
  });
  it("rejects nonowners and unverified or oversized objects", async () => {
    mocks.active.mockResolvedValueOnce({ ok: true, user: { id: "other" } });
    expect((await finish()).status).toBe(404);
    mocks.verify.mockResolvedValueOnce(null);
    expect((await finish()).status).toBe(404);
    mocks.verify.mockResolvedValueOnce({ size: 9999 });
    expect((await finish()).status).toBe(400);
    expect(mocks.note.status).toBe("PENDING");
  });
  it("lets the webhook complete only an eligible reservation", async () => {
    await callback(completeWebhook);
    expect(mocks.note).toMatchObject({ status: "PUBLISHED", uploadPending: false });
    await restrict();
    await callback(completeWebhook);
    expect(mocks.note.status).toBe("PENDING");
  });
  it("denies upload tokens for admin-restricted reservations", async () => {
    await restrict();
    await callback(async (options) => {
      await expect(options.onBeforeGenerateToken("note/file.pdf", "note")).rejects.toThrow();
    });
  });
  it("preserves moderation between webhook lookup and publication", async () => {
    // A getter yields the reserved path but applies moderation after the lookup.
    await callback(async (options) => options.onUploadCompleted({
      blob: { get pathname() {
        mocks.note.status = "PENDING";
        mocks.note.uploadPending = false;
        return "note/file.pdf";
      } },
      tokenPayload: JSON.stringify({ noteId: "note", userId: "owner" }),
    }));
    expect(mocks.note).toMatchObject({ status: "PENDING", uploadPending: false });
  });
});
