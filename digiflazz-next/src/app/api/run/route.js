import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { requireActiveTenant, resolveTenantId, getQuotaInfo } from "@/lib/tenant";
import { decryptSecret } from "@/lib/crypto";
import { resolveClient } from "@/lib/digiflazz/session";
import { runDelete, runAdd, runSeller } from "@/lib/digiflazz/operations";
import { createJob, removeJob, sweepJobs } from "@/lib/digiflazz/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ACTIONS = { delete: runDelete, add: runAdd, seller: runSeller };

function summaryCount(action, result) {
  if (action === "delete") return result.deleted || 0;
  if (action === "add") return result.added || 0;
  if (action === "seller") return result.processed || 0;
  return 0;
}

export async function POST(req) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const action = body.action;
  const handler = ACTIONS[action];
  if (!handler) {
    return Response.json({ error: "Aksi tidak dikenal." }, { status: 400 });
  }

  const userId = Number(session.sub);
  const tenantId = await resolveTenantId(session);

  if (!Number.isInteger(tenantId)) {
    return Response.json({ error: "Akun tidak terhubung ke tenant." }, { status: 400 });
  }

  // subscription / status gate
  let tenant;
  try {
    tenant = await requireActiveTenant(tenantId);
  } catch (e) {
    const reason = String(e.message).startsWith("TENANT_INACTIVE:")
   ? e.message.slice("TENANT_INACTIVE:".length)
      : "Langganan tidak aktif.";
    return Response.json({ error: reason }, { status: 402 });
  }

  // kuota operasi bulanan
  const quota = await getQuotaInfo(tenant);
  if (!quota.unlimited && quota.remaining <= 0) {
    return Response.json(
      { error: `Kuota operasi bulan ini habis (${quota.used}/${quota.limit}). Hubungi administrator untuk menambah kuota.` },
      { status: 429 }
    );
  }

  const setting = await prisma.setting.findUnique({ where: { tenantId } });
  const decryptedSetting = setting
    ? { ...setting, cookie: decryptSecret(setting.cookie) }
    : setting;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      // Buat job yang bisa dijeda/dihentikan dari /api/run/control.
      sweepJobs();
      const jobId =
  (body.jobId && String(body.jobId)) ||
        `${tenantId}-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const job = createJob(jobId, tenantId);
 // Kirim jobId lebih dulu agar klien bisa mengontrol proses ini.
      send({ type: "job", jobId });

      let client;
      try {
      const resolved = resolveClient(decryptedSetting, {
          onLog: (entry) => send(entry),
    budget: quota.unlimited ? null : quota.remaining,
        checkpoint: () => job.checkpoint(),
          isStopped: () => job.stopped,
        });
        client = resolved.client;
  if (resolved.expired.length) {
          send({ level: "warn", msg: `Cookie mungkin kedaluwarsa: ${resolved.expired.join(", ")}.` });
        }
      } catch (e) {
     send({ level: "error", msg: e.message });
        removeJob(jobId);
controller.close();
        return;
      }

      const opts = {
        only: Array.isArray(body.only) ? body.only : [],
        skip: Array.isArray(body.skip) ? body.skip : [],
        dryRun: !!body.dryRun,
        op: body.op,
        threshold: body.threshold,
        multi: body.multi || "",
        rating: body.rating ?? null,
        cheapest: !!body.cheapest,
        skipExisting: !body.overwrite,
        codePrefix: body.codePrefix || "",
        codeLen: body.codeLen ? parseInt(body.codeLen, 10) : 8,
      };

      let status = "success";
      let result = {};
      try {
        send({ level: "info", msg: `Memulai aksi "${action}"${opts.dryRun ? " (simulasi)" : ""}...` });
        result = await handler(client, opts);
        send({ level: "ok", msg: "Selesai." });
   send({ type: "summary", data: result });
      } catch (e) {
 if (e.name === "JobStoppedError") {
   status = "stopped";
          send({ level: "warn", msg: "Dihentikan oleh pengguna." });
        } else {
          status = "error";
   send({ level: "error", msg: `Gagal: ${e.message}` });
        }
      } finally {
     removeJob(jobId);
        try {
       await prisma.activity.create({
    data: {
              tenantId,
  userId,
              action,
  status,
              count: opts.dryRun ? 0 : summaryCount(action, result),
              detail: JSON.stringify(result).slice(0, 1000),
    },
   });
        } catch {
     /* activity logging best-effort */
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
