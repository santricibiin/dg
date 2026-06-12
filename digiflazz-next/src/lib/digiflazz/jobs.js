// In-memory registry untuk mengontrol job yang sedang berjalan (jeda/lanjut/hentikan).
// Job hidup selama proses streaming /api/run berjalan. Kontrol dikirim lewat
// /api/run/control yang memanggil pause()/resume()/stop() pada job terkait.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Simpan di globalThis agar bertahan melintasi hot-reload (dev) dan modul ulang.
const store = globalThis.__df_jobs || (globalThis.__df_jobs = new Map());

class Job {
  constructor(id, tenantId) {
    this.id = id;
    this.tenantId = tenantId;
  this.paused = false;
    this.stopped = false;
    this.createdAt = Date.now();
    this.lastSeen = Date.now();
  }

  pause() {
    this.paused = true;
    this.lastSeen = Date.now();
  }

  resume() {
    this.paused = false;
    this.lastSeen = Date.now();
  }

  stop() {
    this.stopped = true;
    this.paused = false;
    this.lastSeen = Date.now();
  }

  // Dipanggil sebelum tiap request jaringan. Menunggu selama job dijeda,
  // dan melempar AbortError bila job dihentikan.
  async checkpoint() {
    if (this.stopped) {
      const err = new Error("Dihentikan oleh pengguna.");
    err.name = "JobStoppedError";
      throw err;
    }
while (this.paused && !this.stopped) {
   await sleep(250);
    }
    if (this.stopped) {
      const err = new Error("Dihentikan oleh pengguna.");
      err.name = "JobStoppedError";
      throw err;
    }
  }
}

export function createJob(id, tenantId) {
  const job = new Job(id, tenantId);
  store.set(id, job);
  return job;
}

export function getJob(id) {
  return store.get(id) || null;
}

export function removeJob(id) {
  store.delete(id);
}

// Bersihkan job tua (lebih dari 30 menit) untuk menghindari kebocoran memori.
export function sweepJobs(maxAgeMs = 30 * 60 * 1000) {
  const now = Date.now();
  for (const [id, job] of store) {
    if (now - job.lastSeen > maxAgeMs) store.delete(id);
  }
}
