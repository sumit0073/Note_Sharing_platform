import { hash } from "bcryptjs";
import { prisma } from "@/lib/db";
import { resetPasswordSchema } from "@/lib/validations";
import { jsonError, jsonOk } from "@/lib/http";
import {
  TURNSTILE_FAILURE_MESSAGE,
  turnstileRemoteIp,
  verifyTurnstileToken,
} from "@/lib/turnstile";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const turnstileOk = await verifyTurnstileToken(body?.turnstileToken, {
    remoteIp: turnstileRemoteIp(request),
  });
  if (!turnstileOk) {
    return jsonError(TURNSTILE_FAILURE_MESSAGE, 400);
  }

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Password must be at least 8 characters and include a letter and a number");
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { token: parsed.data.token },
  });
  if (!record || record.expiresAt < new Date()) {
    return jsonError("This reset link is invalid or has expired");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: {
        passwordHash: await hash(parsed.data.password, 12),
        sessionVersion: { increment: 1 },
      },
    }),
    prisma.passwordResetToken.deleteMany({ where: { userId: record.userId } }),
  ]);

  return jsonOk({ message: "Password updated. You can now sign in." });
}
