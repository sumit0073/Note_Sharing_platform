import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token) return jsonError("Verification token is required");

  const record = await prisma.verificationToken.findUnique({
    where: { token },
  });
  if (!record || record.expiresAt < new Date()) {
    return jsonError("This verification link is invalid or has expired");
  }

  const [activation] = await prisma.$transaction([
    prisma.user.updateMany({
      // Check status and token authority at the write, so suspension wins races.
      where: {
        id: record.userId,
        status: "PENDING_VERIFICATION",
        verificationTokens: { some: { token, expiresAt: { gte: new Date() } } },
      },
      data: { emailVerified: new Date(), status: "ACTIVE" },
    }),
    prisma.verificationToken.deleteMany({ where: { userId: record.userId } }),
  ]);

  if (activation.count === 0) {
    return jsonError("This verification link is no longer valid for this account");
  }

  return jsonOk({ message: "Email verified. You can now sign in." });
}
