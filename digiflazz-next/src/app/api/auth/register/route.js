import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, createToken, setSessionCookie } from "@/lib/auth";
import { slugify } from "@/lib/tenant";
import { normalizeEmail } from "@/lib/email";

const TRIAL_DAYS = 1;
const TRIAL_QUOTA = 20;

// Rate-limit pendaftaran: maks N akun per IP dalam jendela waktu.
const REG_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 jam
const REG_MAX_PER_IP = 3;

function uniqueSlug(base) {
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

function clientIp(req) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const company = String(body.company || "").trim();
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!company || !name || !email.includes("@") || password.length < 8) {
    return NextResponse.json(
      { error: "Nama usaha, nama, email valid, dan kata sandi minimal 8 karakter wajib diisi." },
      { status: 400 }
    );
  }

  // Rate-limit per IP (anti spam pendaftaran)
  const ip = clientIp(req);
  if (ip && ip !== "unknown") {
    const since = new Date(Date.now() - REG_WINDOW_MS);
    const recent = await prisma.registrationLog.count({
      where: { ip, createdAt: { gte: since } },
    });
    if (recent >= REG_MAX_PER_IP) {
      return NextResponse.json(
        { error: "Terlalu banyak pendaftaran dari jaringan ini. Coba lagi nanti." },
{ status: 429 }
      );
    }
  }

  // Cek email + alias-nya (gmail dots/plus)
  const emailNorm = normalizeEmail(email);
  const exists = await prisma.user.findFirst({
    where: { OR: [{ email }, { emailNorm }] },
  });
  if (exists) {
    return NextResponse.json({ error: "Email (atau variasinya) sudah terdaftar." }, { status: 409 });
  }

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const baseSlug = slugify(company);

  // Create tenant + owner in a transaction.
  let result;
try {
    result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
      data: {
      name: company,
          slug: uniqueSlug(baseSlug),
          status: "trial",
          trialEndsAt,
          monthlyQuota: TRIAL_QUOTA,
     settings: { create: {} },
        },
      });

      const user = await tx.user.create({
     data: {
          tenantId: tenant.id,
     name,
          email,
          emailNorm,
        password: await hashPassword(password),
          role: "user",
  },
      });

    return { tenant, user };
});
  } catch (e) {
 return NextResponse.json({ error: "Gagal membuat akun. Coba lagi." }, { status: 500 });
  }

  // Catat pendaftaran untuk rate-limit (best-effort)
  if (ip && ip !== "unknown") {
    try {
      await prisma.registrationLog.create({ data: { ip } });
    } catch {
      /* abaikan */
    }
  }

  const token = await createToken({
    sub: String(result.user.id),
    role: result.user.role,
  name: result.user.name,
    tenantId: result.tenant.id,
  });
await setSessionCookie(token);

  return NextResponse.json({ ok: true });
}
