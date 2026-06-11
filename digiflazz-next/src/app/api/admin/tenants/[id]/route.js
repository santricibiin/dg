import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/auth";

function guard(e) {
  if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  if (e.message === "FORBIDDEN") return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  return null;
}

const STATUSES = new Set(["trial", "active", "past_due", "suspended"]);

export async function PATCH(req, { params }) {
  try {
    await requireSuperadmin();
  } catch (e) {
    return guard(e) || NextResponse.json({ error: "Kesalahan." }, { status: 500 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "ID tidak valid." }, { status: 400 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const data = {};
  if (typeof body.status === "string" && STATUSES.has(body.status)) {
    data.status = body.status;
  }
  if (typeof body.plan === "string" && body.plan.trim()) {
    data.plan = body.plan.trim();
  }
  // Kuota operasi per bulan. 0 / negatif = tak terbatas.
  if (body.monthlyQuota !== undefined && body.monthlyQuota !== null) {
    const q = parseInt(body.monthlyQuota, 10);
    if (!isNaN(q)) data.monthlyQuota = Math.max(0, q);
  }
  // Set masa trial: trialDays hari dari sekarang (+ status trial).
  if (typeof body.trialDays === "number" && body.trialDays > 0) {
    data.trialEndsAt = new Date(Date.now() + body.trialDays * 24 * 60 * 60 * 1000);
    data.status = "trial";
  } else if (body.trialEndsAt === null) {
    data.trialEndsAt = null;
  }
  // expiresAt: ISO string, or null to clear, or number of days from now.
  if (body.expiresAt === null) {
    data.expiresAt = null;
  } else if (typeof body.extendDays === "number" && body.extendDays > 0) {
    data.expiresAt = new Date(Date.now() + body.extendDays * 24 * 60 * 60 * 1000);
  } else if (typeof body.expiresAt === "string") {
    const d = new Date(body.expiresAt);
    if (!isNaN(d.getTime())) data.expiresAt = d;
  }

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "Tidak ada perubahan." }, { status: 400 });
  }

  const tenant = await prisma.tenant.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      plan: true,
      monthlyQuota: true,
      trialEndsAt: true,
      expiresAt: true,
    },
  });
  return NextResponse.json(tenant);
}

export async function DELETE(req, { params }) {
  try {
    await requireSuperadmin();
  } catch (e) {
    return guard(e) || NextResponse.json({ error: "Kesalahan." }, { status: 500 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "ID tidak valid." }, { status: 400 });
  }

  // Cascade removes users, settings, activities for this tenant.
  await prisma.tenant.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
