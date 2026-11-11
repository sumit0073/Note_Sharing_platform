import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, deleteMany, create, sendPasswordResetEmail, rateLimit, verifyTurnstileToken } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  deleteMany: vi.fn(),
  create: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  rateLimit: vi.fn(),
  verifyTurnstileToken: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique },
    passwordResetToken: { deleteMany, create },
  },
}));
vi.mock("@/lib/email", () => ({
  appUrl: (path: string) => `https://studysphere.example${path}`,
  sendPasswordResetEmail,
}));
vi.mock("@/lib/rate-limit", () => ({ clientKey: () => "test", rateLimit }));
vi.mock("@/lib/turnstile", () => ({
  TURNSTILE_FAILURE_MESSAGE: "Please complete the security check and try again.",
  turnstileRemoteIp: () => "127.0.0.1",
  verifyTurnstileToken,
}));

import { POST } from "@/app/api/auth/forgot-password/route";

function request(email = "Student@example.com") {
  return new Request("https://studysphere.example/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, turnstileToken: "valid-token" }),
  });
}

const acknowledgement = {
  ok: true,
  data: { message: "If that email exists, a reset link has been sent." },
};

describe("password recovery response confidentiality", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    rateLimit.mockReturnValue({ ok: true });
    verifyTurnstileToken.mockResolvedValue(true);
    findUnique.mockResolvedValue({ id: "user-1", email: "student@example.com" });
    sendPasswordResetEmail.mockResolvedValue(true);
  });
  afterEach(() => vi.unstubAllEnvs());

  describe.each(["development", "test", "production"])("in %s", (mode) => {
    it.each([true, false])("keeps the token private when email delivery returns %s", async (delivered) => {
      vi.stubEnv("NODE_ENV", mode);
      sendPasswordResetEmail.mockResolvedValue(delivered);
      const response = await POST(request());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(acknowledgement);
      expect(findUnique).toHaveBeenCalledWith({ where: { email: "student@example.com" } });
      expect(deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
      expect(create).toHaveBeenCalledOnce();
      const { token, userId, expiresAt } = create.mock.calls[0][0].data;
      expect(token).toMatch(/^[a-f0-9]{64}$/);
      expect(userId).toBe("user-1");
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(sendPasswordResetEmail).toHaveBeenCalledExactlyOnceWith({
        to: "student@example.com",
        resetUrl: `https://studysphere.example/reset-password?token=${token}`,
      });
    });

    it("returns the same acknowledgement for an unknown email", async () => {
      vi.stubEnv("NODE_ENV", mode);
      findUnique.mockResolvedValue(null);
      const response = await POST(request());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(acknowledgement);
      expect(create).not.toHaveBeenCalled();
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  it("still rejects rate-limited requests before account lookup", async () => {
    rateLimit.mockReturnValue({ ok: false });
    expect((await POST(request())).status).toBe(429);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("still requires a successful Turnstile check", async () => {
    verifyTurnstileToken.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(400);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("still rejects invalid email addresses", async () => {
    expect((await POST(request("invalid"))).status).toBe(400);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
