import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  hash: vi.fn(),
  findUnique: vi.fn(),
  deleteMany: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/lib/turnstile", () => ({
  TURNSTILE_FAILURE_MESSAGE: "Security check failed",
  turnstileRemoteIp: () => undefined,
  verifyTurnstileToken: mocks.verify,
}));
vi.mock("bcryptjs", () => ({ hash: mocks.hash }));
vi.mock("@/lib/db", () => ({
  prisma: {
    passwordResetToken: { findUnique: mocks.findUnique },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
      passwordResetToken: { deleteMany: mocks.deleteMany },
      user: { update: mocks.update },
    }),
  },
}));
import { POST } from "@/app/api/auth/reset-password/route";

function request() {
  return new Request("https://studysphere.space/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "reset-token-123", password: "Password123", turnstileToken: "captcha" }),
  });
}

describe("password reset authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.verify.mockResolvedValue(true);
    mocks.hash.mockResolvedValue("new-hash");
    mocks.findUnique.mockResolvedValue({ id: "token-id", userId: "user-id", expiresAt: new Date(Date.now() + 60_000) });
    mocks.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("consumes an unexpired token before updating and cleaning up remaining tokens", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.hash).toHaveBeenCalledWith("Password123", 12);
    expect(mocks.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { id: "token-id", expiresAt: { gte: expect.any(Date) } },
    });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "user-id" }, data: { passwordHash: "new-hash" } });
    expect(mocks.deleteMany).toHaveBeenNthCalledWith(2, { where: { userId: "user-id" } });
    expect(mocks.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0]);
  });

  it("rejects a token consumed by another request after the lookup", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "This reset link is invalid or has expired" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.deleteMany).toHaveBeenCalledOnce();
  });

  it("checks expiry again after hashing", async () => {
    const afterHash = new Date(Date.now() + 120_000);
    mocks.hash.mockImplementation(async () => {
      vi.useFakeTimers();
      vi.setSystemTime(afterHash);
      return "new-hash";
    });
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    try {
      expect((await POST(request())).status).toBe(400);
      expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { id: "token-id", expiresAt: { gte: afterHash } } });
      expect(mocks.update).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([null, { expiresAt: new Date(0) }])("rejects missing or expired tokens", async (record) => {
    mocks.findUnique.mockResolvedValue(record);
    expect((await POST(request())).status).toBe(400);
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("keeps the Turnstile gate before token lookup", async () => {
    mocks.verify.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(400);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
