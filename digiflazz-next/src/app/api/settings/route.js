import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { resolveTenantId } from "@/lib/tenant";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { parseCookies } from "@/lib/digiflazz/cookies";
import { sha256 } from "@/lib/email";

function guard(e) {
  if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  return null;
}

export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch (e) {
    return guard(e) || NextResponse.json({ error: "Kesalahan." }, { status: 500 });
  }

  const tenantId = await resolveTenantId(session);
  if (!Number.isInteger(tenantId)) return NextResponse.json({ error: "Akun tidak terhubung ke tenant." }, { status: 400 });

  const setting = await prisma.setting.findUnique({
    where: { tenantId },
    select: { cookie: true, speed: true, concurrency: true, groupDelayMs: true, userAgent: true },
  });

  if (!setting) return NextResponse.json({});

  // Return whether a cookie exists, but never echo the raw secret back to the client.
  const { cookie, ...rest } = setting;
  return NextResponse.json({ ...rest, hasCookie: !!decryptSecret(cookie) });
}

export async function PUT(req) {
  let session;
  try {
    session = await requireSession();
  } catch (e) {
    return guard(e) || NextResponse.json({ error: "Kesalahan." }, { status: 500 });
  }

  const tenantId = await resolveTenantId(session);
  if (!Number.isInteger(tenantId)) return NextResponse.json({ error: "Akun tidak terhubung ke tenant." }, { status: 400 });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const speed = body.speed === "turbo" ? "turbo" : "normal";
  const concurrency = Math.max(1, Math.min(10, parseInt(body.concurrency, 10) || 1));
  const groupDelayMs = Math.max(0, parseInt(body.groupDelayMs, 10) || 0);
  const userAgent = typeof body.userAgent === "string" ? body.userAgent.trim() : "";

  const data = { speed, concurrency, groupDelayMs, userAgent };

  // Only overwrite cookie when a non-empty value is supplied. Empty string with
  // explicit clearCookie flag clears it. Stored encrypted at rest.
  if (typeof body.cookie === "string" && body.cookie.trim()) {
    const rawCookie = body.cookie.trim();
    // Sidik jari: hash nilai session Digiflazz agar cookie/akun sama tak dipakai
    // banyak tenant untuk menghindari batas trial.
    const jar = parseCookies(rawCookie);
    const sessionVal = jar["digiflazz_member_panel_session"]?.value || "";
    if (sessionVal) {
      const cookieHash = sha256(sessionVal);
      const used = await prisma.setting.findFirst({
   where: { cookieHash, tenantId: { not: tenantId } },
        select: { tenantId: true },
      });
      if (used) {
        return NextResponse.json(
          { error: "Cookie/akun Digiflazz ini sudah dipakai oleh akun lain." },
     { status: 409 }
  );
}
      data.cookieHash = cookieHash;
    }
  data.cookie = encryptSecret(rawCookie);
  } else if (body.clearCookie === true) {
    data.cookie = "";
    data.cookieHash = null;
  }

  await prisma.setting.upsert({
    where: { tenantId },
    update: data,
    create: {
      tenantId,
      cookie: data.cookie || "",
      cookieHash: data.cookieHash || null,
      speed,
      concurrency,
      groupDelayMs,
      userAgent,
    },
  });

  return NextResponse.json({ ok: true });
}
