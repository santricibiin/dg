import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import TenantsManager from "@/components/TenantsManager";

export const dynamic = "force-dynamic";

export default async function TenantsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "superadmin") redirect("/dashboard");

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      plan: true,
      monthlyQuota: true,
      trialEndsAt: true,
      expiresAt: true,
      createdAt: true,
      _count: { select: { users: true, activities: true } },
    },
  });

  // pemakaian operasi bulan berjalan, dikelompokkan per tenant (1 query)
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const usageRows = await prisma.activity.groupBy({
by: ["tenantId"],
    where: { createdAt: { gte: startOfMonth } },
    _sum: { count: true },
  });
  const usageMap = new Map(usageRows.map((r) => [r.tenantId, r._sum.count || 0]));

  // serialize dates
  const data = tenants.map((t) => ({
    ...t,
    monthlyUsage: usageMap.get(t.id) || 0,
    trialEndsAt: t.trialEndsAt ? t.trialEndsAt.toISOString() : null,
    expiresAt: t.expiresAt ? t.expiresAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-900 dark:text-slate-100">Manajemen Tenant</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Kelola langganan, status, dan masa aktif setiap penyewa.
        </p>
      </div>
      <TenantsManager initialTenants={data} />
    </div>
  );
}
