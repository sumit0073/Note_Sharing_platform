import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { requireActiveUser } from "@/lib/session";
import { reportSchema } from "@/lib/validations";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireActiveUser("Sign in to report notes");
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) return jsonError("Select a report reason");

  const note = await prisma.note.findUnique({ where: { id } });
  if (!note || note.status !== "PUBLISHED") return jsonError("Note not found", 404);

  const existing = await prisma.report.findFirst({
    where: { noteId: id, userId: gate.user.id, status: "OPEN" },
  });
  if (existing) return jsonError("You already have an open report for this note");

  try {
    const report = await prisma.report.create({
      data: {
        noteId: id,
        userId: gate.user.id,
        reason: parsed.data.reason,
        details: parsed.data.details,
      },
    });
    return jsonOk(report, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError("You already have an open report for this note");
    }
    throw error;
  }
}
