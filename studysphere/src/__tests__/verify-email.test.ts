import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    verificationToken: { findUnique: db.findUnique, deleteMany: db.deleteMany },
    user: { updateMany: db.updateMany },
    $transaction: db.transaction,
  },
}));

import { POST } from "@/app/api/auth/verify-email/route";

function verify(token: unknown = "verification-token") {
  return POST(new Request("https://studysphere.space/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  }));
}

describe("email verification activation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.findUnique.mockResolvedValue({
      userId: "user-1",
      expiresAt: new Date(Date.now() + 60_000),
    });
    db.updateMany.mockResolvedValue({ count: 1 });
    db.deleteMany.mockResolvedValue({ count: 1 });
    db.transaction.mockImplementation((operations) => Promise.all(operations));
  });

  it("activates only a pending account with a still valid token at the write", async () => {
    const response = await verify();
    expect(response.status).toBe(200);
    expect(db.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: "user-1",
        status: "PENDING_VERIFICATION",
        verificationTokens: {
          some: { token: "verification-token", expiresAt: { gte: expect.any(Date) } },
        },
      },
      data: { emailVerified: expect.any(Date), status: "ACTIVE" },
    });
    expect(db.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(db.transaction).toHaveBeenCalledWith([
      db.updateMany.mock.results[0].value,
      db.deleteMany.mock.results[0].value,
    ]);
  });

  it("rejects activation when suspension or token revocation wins the race", async () => {
    // The conditional database write matches no account in either case.
    db.updateMany.mockResolvedValue({ count: 0 });
    const response = await verify();
    expect(response.status).toBe(400);
    expect((await response.json()).ok).toBe(false);
    expect(db.updateMany).toHaveBeenCalledOnce();
  });

  it.each([null, { userId: "user-1", expiresAt: new Date(0) }])(
    "rejects missing or expired tokens without changing account state",
    async (record) => {
      db.findUnique.mockResolvedValue(record);
      expect((await verify()).status).toBe(400);
      expect(db.transaction).not.toHaveBeenCalled();
      expect(db.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each(["", 42])("rejects invalid token input %s", async (token) => {
    expect((await verify(token)).status).toBe(400);
    expect(db.findUnique).not.toHaveBeenCalled();
  });

  it("does not report success if token consumption fails", async () => {
    db.transaction.mockRejectedValue(new Error("transaction rolled back"));
    await expect(verify()).rejects.toThrow("transaction rolled back");
  });
});
