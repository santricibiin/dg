import { buildClient } from "./client.js";
import { parseCookies, buildCookieHeader, getXsrfToken, inspectSession } from "./cookies.js";
import { generateFingerprint } from "./fingerprint.js";

export function resolveClient(setting, overrides = {}) {
  if (!setting || !setting.cookie || !setting.cookie.trim()) {
    throw new Error("Cookie belum diatur. Buka halaman Pengaturan.");
  }
  const jar = parseCookies(setting.cookie);
  const sess = inspectSession(jar);
  if (!sess.ok) {
    throw new Error(`Cookie tidak lengkap (hilang: ${sess.missing.join(", ")}).`);
  }
  const fingerprint = generateFingerprint(setting.userAgent);
  const client = buildClient(setting, {
    jar,
    cookieHeader: buildCookieHeader(jar),
    xsrf: getXsrfToken(jar),
    fingerprint,
    onLog: overrides.onLog,
    budget: overrides.budget,
  });
  return { client, expired: sess.expired };
}
