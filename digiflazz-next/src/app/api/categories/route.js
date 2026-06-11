import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { resolveTenantId } from "@/lib/tenant";
import { decryptSecret } from "@/lib/crypto";
import { resolveClient } from "@/lib/digiflazz/session";

export const dynamic = "force-dynamic";

export async function GET(req) {
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

  // mode: "buyer" (existing products: delete/seller) | "add" (catalog: add)
  const mode = new URL(req.url).searchParams.get("mode") || "buyer";

  try {
    const { client } = resolveClient(decryptedSetting);
    let raw;
    if (mode === "add") {
      const r = await client.get(`/product/categories/${client.mode}`);
      raw = r.data?.data || [];
    } else {
      const r = await client.get("/buyer/product/category");
      raw = r.data?.data || [];
    }
    const categories = raw
      .map((c) => ({ id: c.id, name: c.name }))
      .filter((c) => c.name);
    return NextResponse.json({ ok: true, categories });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 200 });
  }
}
