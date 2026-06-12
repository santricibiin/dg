import { requireSession } from "@/lib/auth";
import { resolveTenantId } from "@/lib/tenant";
import { getJob } from "@/lib/digiflazz/jobs";

export const dynamic = "force-dynamic";

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

  const { jobId, command } = body || {};
  if (!jobId || !["pause", "resume", "stop"].includes(command)) {
    return Response.json({ error: "Parameter kontrol tidak valid." }, { status: 400 });
  }

  const job = getJob(String(jobId));
  if (!job) {
    // Job sudah selesai atau tidak ada — anggap idempotent.
    return Response.json({ ok: true, state: "gone" });
  }

  // Pastikan job milik tenant yang sama.
  const tenantId = await resolveTenantId(session);
  if (!Number.isInteger(tenantId) || job.tenantId !== tenantId) {
    return Response.json({ error: "Tidak diizinkan." }, { status: 403 });
  }

  if (command === "pause") job.pause();
  else if (command === "resume") job.resume();
  else if (command === "stop") job.stop();

  return Response.json({
    ok: true,
    state: job.stopped ? "stopped" : job.paused ? "paused" : "running",
  });
}
