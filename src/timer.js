// Helper penghitung durasi proses.
export function startTimer() {
  return process.hrtime.bigint();
}

// Selisih detik (1 desimal) dari timer yang dibuat startTimer().
export function elapsedSec(start) {
  const ns = process.hrtime.bigint() - start;
  return Number(ns / 1000000n) / 1000; // ms -> detik
}

// Format ramah: "8.4 dtk" atau "1 mnt 12 dtk".
export function fmtDuration(start) {
  const sec = elapsedSec(start);
  if (sec < 60) return `${sec.toFixed(1)} dtk`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m} mnt ${s} dtk`;
}
