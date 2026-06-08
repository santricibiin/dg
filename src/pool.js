// Worker pool sederhana: jalankan task[] dengan maksimum N paralel.
// Menjaga urutan pengambilan task (FIFO), mendukung stop, dan tidak
// melempar bila satu task gagal (error ditangani per task).

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Jeda antar-grup untuk menghindari rate-limit.
// Dipanggil setelah sebuah grup selesai; melewati jeda jika ini grup terakhir,
// stop diminta, atau delay <= 0. Menunggu dalam potongan kecil agar Stop responsif.
export async function groupDelay(client, log, isLast) {
  const ms = client.groupDelayMs || 0;
  if (ms <= 0 || isLast) return;
  if (client._stop && client._stop()) return;
  log.info(`  Jeda ${(ms / 1000).toFixed(0)} dtk antar-grup (anti rate-limit)...`);
  let waited = 0;
  while (waited < ms) {
    if (client._stop && client._stop()) return;
    const step = Math.min(250, ms - waited);
    await sleep(step);
    waited += step;
  }
}

/**
 * @param {Array} items   daftar item yang akan diproses
 * @param {number} concurrency  jumlah worker paralel (>=1)
 * @param {(item, index) => Promise<void>} worker  fungsi proses per item
 * @param {() => boolean} [shouldStop]  bila true, berhenti ambil item baru
 */
export async function runPool(items, concurrency, worker, shouldStop) {
  const n = Math.max(1, Math.min(10, Number(concurrency) || 1));
  let cursor = 0;

  async function runner() {
    while (true) {
      if (shouldStop && shouldStop()) return;
      const index = cursor++;
      if (index >= items.length) return;
      try {
        await worker(items[index], index);
      } catch (e) {
        // Error per item sudah/akan ditangani worker; jangan hentikan worker lain.
      }
    }
  }

  const runners = [];
  for (let i = 0; i < Math.min(n, items.length); i++) runners.push(runner());
  await Promise.all(runners);
}
