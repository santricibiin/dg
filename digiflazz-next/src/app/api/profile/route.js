import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, verifyPassword, hashPassword } from "@/lib/auth";

function guard(e) {
  if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  return null;
}

export async function PUT(req) {
  let session;
  try {
    session = await requireSession();
  } catch (e) {
    return guard(e) || NextResponse.json({ error: "Kesalahan." }, { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const userId = Number(session.sub);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Pengguna tidak ditemukan." }, { status: 404 });

  const data = {};

  // Ubah nama
  if (typeof body.name === "string" && body.name.trim()) {
    data.name = body.name.trim();
  }

  // Ubah password (wajib verifikasi password lama)
  if (body.newPassword) {
    const newPassword = String(body.newPassword);
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "Kata sandi baru minimal 8 karakter." }, { status: 400 });
    }
    const ok = await verifyPassword(String(body.currentPassword || ""), user.password);
    if (!ok) {
      return NextResponse.json({ error: "Kata sandi saat ini salah." }, { status: 400 });
    }
    data.password = await hashPassword(newPassword);
  }

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "Tidak ada perubahan." }, { status: 400 });
  }

  await prisma.user.update({ where: { id: userId }, data });
  return NextResponse.json({ ok: true });
}
