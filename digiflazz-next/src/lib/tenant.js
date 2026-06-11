import { prisma } from "@/lib/prisma";

// Statuses that may use operational features (run, etc).
const ACTIVE_STATUSES = new Set(["trial", "active"]);

export function isTenantUsable(tenant) {
  if (!tenant) return false;
  if (!ACTIVE_STATUSES.has(tenant.status)) return false;
  const now = Date.now();
  if (tenant.status === "trial" && tenant.trialEndsAt && new Date(tenant.trialEndsAt).getTime() < now) {
    return false;
  }
  if (tenant.expiresAt && new Date(tenant.expiresAt).getTime() < now) {
    return false;
  }
  return true;
}

export function tenantStatusReason(tenant) {
  if (!tenant) return "Tenant tidak ditemukan.";
  if (tenant.status === "suspended") return "Langganan ditangguhkan. Hubungi administrator.";
  if (tenant.status === "past_due") return "Pembayaran tertunggak. Langganan dibekukan.";
  const now = Date.now();
  if (tenant.status === "trial" && tenant.trialEndsAt && new Date(tenant.trialEndsAt).getTime() < now) {
    return "Masa uji coba telah berakhir.";
  }
  if (tenant.expiresAt && new Date(tenant.expiresAt).getTime() < now) {
    return "Masa langganan telah berakhir.";
  }
  return "Langganan tidak aktif.";
}

export async function getTenant(tenantId) {
  if (!tenantId) return null;
  return prisma.tenant.findUnique({ where: { id: Number(tenantId) } });
}

// Awal bulan berjalan (untuk reset kuota bulanan).
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Hitung jumlah ITEM sukses tenant pada bulan berjalan (SUM kolom count di
 * Activity), bukan jumlah run. Mis. 1 produk berhasil dihapus = 1.
 */
export async function getMonthlyUsage(tenantId) {
  if (!Number.isInteger(tenantId)) return 0;
  const agg = await prisma.activity.aggregate({
    where: { tenantId, createdAt: { gte: startOfMonth() } },
    _sum: { count: true },
  });
  return agg._sum.count || 0;
}

/**
 * Ringkasan kuota tenant: limit, terpakai, sisa. monthlyQuota <= 0 = tak terbatas.
 */
export async function getQuotaInfo(tenant) {
  if (!tenant) return { unlimited: false, limit: 0, used: 0, remaining: 0 };
  const limit = Number(tenant.monthlyQuota) || 0;
  const unlimited = limit <= 0;
  const used = await getMonthlyUsage(tenant.id);
  return {
    unlimited,
    limit,
    used,
    remaining: unlimited ? Infinity : Math.max(0, limit - used),
  };
}

/**
 * Loads a tenant by id and asserts it can run operations.
 * Throws Error("TENANT_INACTIVE:<reason>") otherwise.
 */
export async function requireActiveTenant(tenantId) {
  const tenant = await getTenant(tenantId);
  if (!isTenantUsable(tenant)) {
    throw new Error(`TENANT_INACTIVE:${tenantStatusReason(tenant)}`);
  }
  return tenant;
}

export function slugify(name) {
  return (
    String(name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "tenant"
  );
}

/**
 * Resolve tenantId untuk session. Utamakan dari token (JWT); bila token lama
 * tak punya tenantId, ambil dari DB (otoritatif). Return integer atau null.
 */
export async function resolveTenantId(session) {
  if (!session) return null;
  const fromToken = Number(session.tenantId);
  if (Number.isInteger(fromToken)) return fromToken;
  const u = await prisma.user.findUnique({
    where: { id: Number(session.sub) },
    select: { tenantId: true },
  });
  return Number.isInteger(u?.tenantId) ? u.tenantId : null;
}
