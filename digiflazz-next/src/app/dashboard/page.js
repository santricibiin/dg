import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UsageBarChart, ActionPieChart } from "@/components/Charts";
import { Activity, Trash2, PlusCircle, Store, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

const ACTION_LABEL = { delete: "Hapus", add: "Tambah", seller: "Ubah Seller" };

async function getStats(scope) {
  // scope: { tenantId } for owners/members, {} for superadmin (all tenants)
  const where = scope;

  const [total, success, byAction, recent] = await Promise.all([
    prisma.activity.count({ where }),
    prisma.activity.count({ where: { ...where, status: "success" } }),
    prisma.activity.groupBy({
      by: ["action"],
      where,
      _count: { _all: true },
      _sum: { count: true },
    }),
    prisma.activity.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { name: true } } },
    }),
  ]);

  const days = [];
  const today = startOfDay(new Date());
  for (let i = 6; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    days.push({ key: day, day: day.toLocaleDateString("id-ID", { weekday: "short" }), total: 0 });
  }
  const weekStart = days[0].key;
  const weekRows = await prisma.activity.findMany({
    where: { ...where, createdAt: { gte: weekStart } },
    select: { createdAt: true },
  });
  for (const row of weekRows) {
    const ds = startOfDay(row.createdAt).getTime();
    const bucket = days.find((d) => d.key.getTime() === ds);
    if (bucket) bucket.total += 1;
  }

  const pie = byAction.map((a) => ({
    name: ACTION_LABEL[a.action] || a.action,
    value: a._count._all,
  }));

  const itemsProcessed = byAction.reduce((acc, a) => acc + (a._sum.count || 0), 0);

  return {
    total,
    success,
    itemsProcessed,
    bar: days.map((d) => ({ day: d.day, total: d.total })),
    pie,
    recent,
  };
}

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-2xl font-semibold text-brand-900 dark:text-slate-100">{value}</p>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const isPlatform = session.role === "superadmin";

  // Ambil tenantId dari DB (otoritatif) — token lama mungkin belum punya tenantId.
  let tenantId = Number(session.tenantId);
  if (!isPlatform && !Number.isInteger(tenantId)) {
    const u = await prisma.user.findUnique({
      where: { id: Number(session.sub) },
      select: { tenantId: true },
    });
    tenantId = Number.isInteger(u?.tenantId) ? u.tenantId : null;
  }

  // superadmin: semua tenant ({}). owner/member: tenant sendiri.
  // tenantId null (belum terhubung tenant): scope mustahil → statistik kosong.
  let scope;
  if (isPlatform) scope = {};
  else if (Number.isInteger(tenantId)) scope = { tenantId };
  else scope = { tenantId: -1 };

  const stats = await getStats(scope);
  const showUserCol = isPlatform;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-900 dark:text-slate-100">Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ringkasan statistik penggunaan fitur otomasi {isPlatform ? "(seluruh tenant)" : "tim Anda"}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Activity} label="Total Eksekusi" value={stats.total} tone="bg-brand-50 text-brand-700" />
        <StatCard icon={CheckCircle2} label="Berhasil" value={stats.success} tone="bg-emerald-50 text-emerald-600" />
        <StatCard icon={PlusCircle} label="Item Diproses" value={stats.itemsProcessed} tone="bg-sky-50 text-sky-600" />
        <StatCard
          icon={Store}
          label="Tingkat Sukses"
          value={stats.total ? `${Math.round((stats.success / stats.total) * 100)}%` : "-"}
          tone="bg-indigo-50 text-indigo-600"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Aktivitas 7 Hari Terakhir</h2>
          <UsageBarChart data={stats.bar} />
        </div>
        <div className="card">
          <h2 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Distribusi Fitur</h2>
          {stats.pie.length ? (
            <ActionPieChart data={stats.pie} />
          ) : (
            <p className="py-20 text-center text-sm text-slate-400">Belum ada data.</p>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Aktivitas Terbaru</h2>
        {stats.recent.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-700">
                  <th className="pb-2 font-medium">Waktu</th>
                  {showUserCol ? <th className="pb-2 font-medium">Pengguna</th> : null}
                  <th className="pb-2 font-medium">Aksi</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Item</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800">
                    <td className="py-2.5 text-slate-500 dark:text-slate-400">
                      {new Date(r.createdAt).toLocaleString("id-ID")}
                    </td>
                    {showUserCol ? <td className="py-2.5 text-slate-700 dark:text-slate-300">{r.user?.name || "-"}</td> : null}
                    <td className="py-2.5 font-medium text-brand-800 dark:text-brand-300">
                      {ACTION_LABEL[r.action] || r.action}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          r.status === "success"
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-red-50 text-red-600"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-600">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-slate-400">Belum ada aktivitas.</p>
        )}
      </div>
    </div>
  );
}
