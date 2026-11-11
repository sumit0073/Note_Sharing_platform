import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { requireAdminUser } from "@/lib/session";
import { z } from "zod";

const patchSchema = z.object({
  id: z.string(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  role: z.enum(["STUDENT", "ADMIN"]).optional(),
});

export async function GET() {
  const gate = await requireAdminUser();
  if (!gate.ok) return gate.response;
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      department: true,
      semester: true,
      createdAt: true,
      _count: { select: { notes: true, reports: true } },
    },
  });
  return jsonOk(users);
}

export async function PATCH(request: Request) {
  const gate = await requireAdminUser();
  if (!gate.ok) return gate.response;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid update");
  const user = await prisma.user.update({
    where: { id: parsed.data.id },
    data: {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.role ? { role: parsed.data.role } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      department: true,
      semester: true,
      bio: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return jsonOk(user);
}
