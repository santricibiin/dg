// Parser cookie format Netscape (kuki.txt) + helper header.
import { readFileSync } from "node:fs";

export function parseNetscapeCookies(filePath) {
  const text = readFileSync(filePath, "utf8");
  const jar = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const p = line.split("\t");
    if (p.length < 7) continue;
    // 0:domain 1:flag 2:path 3:secure 4:expiry 5:name 6:value
    jar[p[5]] = { value: p[6], domain: p[0], expiry: Number(p[4]) || 0 };
  }
  return jar;
}

export function buildCookieHeader(jar) {
  return Object.entries(jar)
    .map(([name, info]) => `${name}=${info.value}`)
    .join("; ");
}

// XSRF-TOKEN harus dikirim balik sebagai header X-XSRF-TOKEN dalam bentuk URL-decoded.
export function getXsrfToken(jar) {
  const t = jar["XSRF-TOKEN"];
  if (!t) return "";
  try {
    return decodeURIComponent(t.value);
  } catch (e) {
    return t.value;
  }
}

// Cek cookie sesi yang penting masih ada & belum kedaluwarsa.
export function inspectSession(jar) {
  const required = ["digiflazz_member_panel_session", "XSRF-TOKEN", "laravel_token"];
  const now = Math.floor(Date.now() / 1000);
  const missing = [];
  const expired = [];
  for (const name of required) {
    const c = jar[name];
    if (!c) {
      missing.push(name);
      continue;
    }
    if (c.expiry && c.expiry < now) expired.push(name);
  }
  return { missing, expired, ok: missing.length === 0 };
}
