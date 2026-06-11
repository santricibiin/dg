import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { resolveTenantId } from "@/lib/tenant";
import { decryptSecret } from "@/lib/crypto";
import { resolveClient } from "@/lib/digiflazz/session";

export async function POST() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Tidak terautentikasi." }, { status: 401 });
  }

  const tenantId = await resolveTenantId(session);
  if (!Number.isInteger(tenantId)) {
    return NextResponse.json({ ok: false, error: "Akun tidak terhubung ke tenant." }, { status: 400 });
  }

  const setting = await prisma.setting.findUnique({ where: { tenantId } });
  const decryptedSetting = setting
    ? { ...setting, cookie: decryptSecret(setting.cookie) }
    : setting;

  try {
    const { client } = resolveClient(decryptedSetting);
    const categories = await client.ping();
    return NextResponse.json({ ok: true, categories });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}
