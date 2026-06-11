import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ProfileForm from "@/components/ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: Number(session.sub) },
    select: { name: true, email: true },
  });
  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-900 dark:text-slate-100">Profil Saya</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Kelola informasi akun dan kata sandi Anda.</p>
      </div>
      <ProfileForm initial={user} />
    </div>
  );
}
