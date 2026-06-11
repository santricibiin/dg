import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { resolveTenantId } from "@/lib/tenant";
import SettingsForm from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "superadmin") redirect("/dashboard");

  const tenantId = await resolveTenantId(session);
  if (!Number.isInteger(tenantId)) redirect("/dashboard");

  const setting = await prisma.setting.findUnique({
    where: { tenantId },
  });

  const initial = {
    hasCookie: setting?.cookie ? !!decryptSecret(setting.cookie) : false,
    speed: setting?.speed || "normal",
    concurrency: setting?.concurrency ?? 1,
    groupDelayMs: setting?.groupDelayMs ?? 3000,
    userAgent: setting?.userAgent || "",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-900 dark:text-slate-100">Pengaturan</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Konfigurasi cookie sesi dan parameter eksekusi.</p>
      </div>
      <SettingsForm initial={initial} />
    </div>
  );
}
