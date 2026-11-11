import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { forgotPasswordSchema } from "@/lib/validations";
import { sendPasswordResetEmail, appUrl } from "@/lib/email";
import { jsonError, jsonOk } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import {
  TURNSTILE_FAILURE_MESSAGE,
  turnstileRemoteIp,
  verifyTurnstileToken,
} from "@/lib/turnstile";

export async function POST(request: Request) {
  const limited = rateLimit(clientKey(request, "forgot"), 5, 10 * 60_000);
  if (!limited.ok) return jsonError("Too many requests. Try again later.", 429);

  const body = await request.json().catch(() => null);
  const turnstileOk = await verifyTurnstileToken(body?.turnstileToken, {
    remoteIp: turnstileRemoteIp(request),
  });
  if (!turnstileOk) {
    return jsonError(TURNSTILE_FAILURE_MESSAGE, 400);
  }

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) return jsonError("Enter a valid email");

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });

  if (user) {
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    const token = randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const resetUrl = appUrl(`/reset-password?token=${token}`);
    await sendPasswordResetEmail({
      to: user.email,
      resetUrl,
    });
  }

  return jsonOk({
    message: "If that email exists, a reset link has been sent.",
  });
}
