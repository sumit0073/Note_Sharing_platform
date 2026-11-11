import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextAuthConfig } from "next-auth";
import type { JWT } from "next-auth/jwt";

const mocks = vi.hoisted(() => ({
  config: null as NextAuthConfig | null,
  findUser: vi.fn(),
  findReset: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
  transaction: vi.fn(),
  hash: vi.fn(),
  compare: vi.fn(),
  turnstile: vi.fn(),
}));
vi.mock("next-auth", () => ({
  CredentialsSignin: class extends Error {},
  default: (config: NextAuthConfig) => {
    mocks.config = config;
    return { handlers: {} };
  },
}));
vi.mock("@/lib/db", () => ({ prisma: {
  user: { findUnique: mocks.findUser, update: mocks.update },
  passwordResetToken: { findUnique: mocks.findReset, deleteMany: mocks.deleteMany },
  $transaction: mocks.transaction,
} }));
vi.mock("bcryptjs", () => ({ hash: mocks.hash, compare: mocks.compare }));
vi.mock("@/lib/turnstile", () => ({
  verifyTurnstileToken: mocks.turnstile,
  turnstileRemoteIp: () => undefined,
  TURNSTILE_FAILURE_MESSAGE: "Security check failed",
}));
import "@/auth";
import { POST } from "@/app/api/auth/reset-password/route";

const jwt = (token: Partial<JWT>, user?: Record<string, unknown>) =>
  mocks.config!.callbacks!.jwt!({ token, user } as unknown as Parameters<NonNullable<NonNullable<NextAuthConfig["callbacks"]>["jwt"]>>[0]);
const reset = () => POST(new Request("https://example.com/api/auth/reset-password", {
  method: "POST",
  body: JSON.stringify({ token: "reset-token", password: "NewPassword123" }),
}));

describe("password recovery session revocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.turnstile.mockResolvedValue(true);
    mocks.hash.mockResolvedValue("new-hash");
    mocks.findReset.mockResolvedValue({ userId: "u1", expiresAt: new Date(Date.now() + 60000) });
    mocks.findUser.mockResolvedValue({ sessionVersion: 0 });
    mocks.transaction.mockResolvedValue([]);
  });

  it("revokes a previously valid session after reset and accepts a fresh login", async () => {
    const old = { id: "u1", sessionVersion: 0 };
    expect(await jwt(old)).toEqual(old);
    expect((await reset()).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { passwordHash: "new-hash", sessionVersion: { increment: 1 } },
    });
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    mocks.findUser.mockResolvedValue({ sessionVersion: 1 });
    expect(await jwt(old)).toBeNull();
    const fresh = await jwt({}, { id: "u1", role: "STUDENT", status: "ACTIVE", sessionVersion: 1 });
    expect(fresh).toMatchObject({ id: "u1", sessionVersion: 1 });
    expect(await jwt(fresh!)).toEqual(fresh);
  });

  it("copies the database version only after successful credential verification", async () => {
    const provider = mocks.config!.providers[0] as unknown as { options: { authorize: (credentials: Record<string, unknown>, request: Request) => Promise<unknown> } };
    mocks.findUser.mockResolvedValue({ id: "u1", email: "student@example.com", name: "Student", passwordHash: "hash", role: "STUDENT", status: "ACTIVE", emailVerified: new Date(), sessionVersion: 3 });
    mocks.compare.mockResolvedValue(true);
    await expect(provider.options.authorize({ email: "student@example.com", password: "Password123" }, new Request("https://example.com"))).resolves.toMatchObject({ id: "u1", sessionVersion: 3 });
    mocks.compare.mockResolvedValue(false);
    await expect(provider.options.authorize({ email: "student@example.com", password: "wrong" }, new Request("https://example.com"))).resolves.toBeNull();
  });

  it("rejects legacy sessions and deleted accounts", async () => {
    expect(await jwt({ id: "u1" })).toBeNull();
    expect(mocks.findUser).not.toHaveBeenCalled();
    mocks.findUser.mockResolvedValue(null);
    expect(await jwt({ id: "u1", sessionVersion: 0 })).toBeNull();
  });

  it("rejects a login that raced with a password reset", async () => {
    mocks.findUser.mockResolvedValue({ sessionVersion: 1 });
    expect(await jwt({}, { id: "u1", role: "STUDENT", status: "ACTIVE", sessionVersion: 0 })).toBeNull();
  });

  it("does not change credentials or session versions for an expired reset", async () => {
    mocks.findReset.mockResolvedValue({ userId: "u1", expiresAt: new Date(0) });
    expect((await reset()).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
