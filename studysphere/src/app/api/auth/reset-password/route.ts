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

  const passwordHash = await hash(parsed.data.password, 12);
  const updated = await prisma.$transaction(async (tx) => {
    // The earlier lookup is only a precheck; consumption authorizes the update.
    const consumed = await tx.passwordResetToken.deleteMany({
      where: {
        id: record.id,
        expiresAt: { gte: new Date() },
      },
    });
    if (consumed.count !== 1) return false;

    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    });
    await tx.passwordResetToken.deleteMany({ where: { userId: record.userId } });
    return true;
  });
  if (!updated) {
    return jsonError("This reset link is invalid or has expired");
  }

  return jsonOk({ message: "Password updated. You can now sign in." });
}
