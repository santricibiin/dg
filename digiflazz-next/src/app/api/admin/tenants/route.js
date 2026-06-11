import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/auth";

function guard(e) {
  if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  if (e.message === "FORBIDDEN") return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  return null;
}

export async function GET() {
  try {
    await requireSuperadmin();
  } catch (e) {
    return guard(e) || NextResponse.json({ error: "Kesalahan." }, { status: 500 });
  }

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      plan: true,
      trialEndsAt: true,
      expiresAt: true,
      createdAt: true,
      _count: { select: { users: true, activities: true } },
    },
  });
  return NextResponse.json(tenants);
}
