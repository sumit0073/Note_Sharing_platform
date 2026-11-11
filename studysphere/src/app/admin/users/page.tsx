import { requireAdminPageUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { AdminUsersClient } from "./users-client";

export default async function AdminUsersPage() {
  await requireAdminPageUser("/admin/users");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      department: true,
      _count: { select: { notes: true, reports: true } },
    },
  });

  return <AdminUsersClient initialUsers={users} />;
}
