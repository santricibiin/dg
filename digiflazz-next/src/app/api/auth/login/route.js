import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createToken, setSessionCookie } from "@/lib/auth";

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !password) {
    return NextResponse.json({ error: "Email dan kata sandi wajib diisi." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user && user.active && (await verifyPassword(password, user.password));

  if (!valid) {
    return NextResponse.json({ error: "Email atau kata sandi salah." }, { status: 401 });
  }

  const token = await createToken({
    sub: String(user.id),
    role: user.role,
    name: user.name,
    tenantId: user.tenantId,
  });
  await setSessionCookie(token);

  return NextResponse.json({ ok: true });
}
