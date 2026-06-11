import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isTenantUsable, tenantStatusReason, getQuotaInfo } from "@/lib/tenant";
import DashboardShell from "@/components/DashboardShell";

export default async function DashboardLayout({ children }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: Number(session.sub) },
    select: { id: true, name: true, email: true, role: true, active: true, tenantId: true },
  });

  if (!user || !user.active) redirect("/login");

  // Superadmin operates the platform and has no tenant.
  let tenantBanner = null;
  if (user.role !== "superadmin") {
    const tenant = user.tenantId
      ? await prisma.tenant.findUnique({ where: { id: user.tenantId } })
      : null;
  if (!isTenantUsable(tenant)) {
      tenantBanner = tenantStatusReason(tenant);
    } else {
      const parts = [];
 if (tenant?.status === "trial" && tenant.trialEndsAt) {
        const daysLeft = Math.ceil(
(new Date(tenant.trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
        );
        parts.push(`Uji coba: ${daysLeft} hari tersisa`);
   }
      const quota = await getQuotaInfo(tenant);
      if (!quota.unlimited) {
   parts.push(`Kuota operasi bulan ini: ${quota.used}/${quota.limit}`);
      }
      if (parts.length) tenantBanner = parts.join(" • ");
    }
  }

  return (
    <DashboardShell user={user} tenantBanner={tenantBanner}>
      {children}
</DashboardShell>
  );
}
