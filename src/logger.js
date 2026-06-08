// Logger: cetak ke console + broadcast ke listener (untuk stream ke browser via SSE).
const COLORS = {
  info: "\x1b[36m",
  ok: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
};

function nowTime() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

const listeners = new Set();

// Daftarkan listener: fn({ t, level, msg }). Mengembalikan fungsi unsubscribe.
export function addLogListener(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(level, msg) {
  const entry = { t: nowTime(), level, msg };
  const c = COLORS[level] || "";
  const badge = level.toUpperCase().padEnd(5);
  process.stdout.write(
    `${COLORS.dim}${entry.t}${COLORS.reset} ${c}${badge}${COLORS.reset} ${msg}\n`
  );
  for (const fn of listeners) {
    try {
      fn(entry);
    } catch (e) {
      /* abaikan listener error */
    }
  }
}

export const log = {
  info: (m) => emit("info", m),
  ok: (m) => emit("ok", m),
  warn: (m) => emit("warn", m),
  error: (m) => emit("error", m),
};
