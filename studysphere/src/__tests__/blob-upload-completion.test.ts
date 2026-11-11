import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { updateMany } = vi.hoisted(() => ({ updateMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { note: { updateMany } } }));
vi.mock("@/lib/session", () => ({ requireActiveUser: vi.fn() }));

import { POST } from "@/app/api/blob/upload/route";

const token = "vercel_blob_rw_test_synthetic";

function completion(tokenPayload: string | null, validSignature = true) {
  const body = JSON.stringify({
    type: "blob.upload-completed",
    payload: { blob: { pathname: "note-1/file.pdf" }, tokenPayload },
  });
  return new Request("https://example.test/api/blob/upload", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vercel-signature": createHmac("sha256", validSignature ? token : "wrong")
        .update(body).digest("hex"),
    },
    body,
  });
}

describe("Blob completion publication authorization", () => {
  beforeEach(() => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", token);
    updateMany.mockReset().mockResolvedValue({ count: 1 });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("checks current ACTIVE eligibility and the exact pending reservation in the write", async () => {
    const response = await POST(completion(JSON.stringify({ noteId: "note-1", userId: "user-1" })));
    expect(response.status).toBe(200);
    expect(updateMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: "note-1",
        uploaderId: "user-1",
        status: "PENDING",
        fileUrl: "note-1/file.pdf",
        uploader: { is: { status: "ACTIVE" } },
      },
      data: { status: "PUBLISHED" },
    });
  });

  it("acknowledges an ineligible or replayed completion without an unconditional fallback", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const response = await POST(completion(JSON.stringify({ noteId: "note-1", userId: "user-1" })));
    expect(response.status).toBe(200);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it.each([null, "{}", '{"noteId":"note-1"}', '{"userId":"user-1"}'])(
    "does not publish with incomplete grant metadata: %s", async (payload) => {
      expect((await POST(completion(payload))).status).toBe(200);
      expect(updateMany).not.toHaveBeenCalled();
    },
  );

  it("rejects an invalid callback signature before touching the database", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await POST(completion(JSON.stringify({ noteId: "note-1", userId: "user-1" }), false))).status).toBe(400);
      expect(updateMany).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
