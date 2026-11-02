import { prisma } from "@/lib/db";
import { requireActivePageUser } from "@/lib/session";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const sessionUser = await requireActivePageUser("/profile");
  const profile = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      name: true,
      department: true,
      semester: true,
      bio: true,
    },
  });

  return (
    <section className="mx-auto max-w-xl px-4 py-10">
      <h1 className="font-serif text-4xl">Profile</h1>
      <ProfileForm
        initial={{
          name: profile?.name ?? sessionUser.name ?? "",
          department: profile?.department ?? null,
          semester: profile?.semester ?? null,
          bio: profile?.bio ?? null,
        }}
      />
    </section>
  );
}
