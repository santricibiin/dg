export function parseNetscapeCookies(text) {
  const jar = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const p = line.split("\t");
    if (p.length < 7) continue;
    jar[p[5]] = { value: p[6], domain: p[0], expiry: Number(p[4]) || 0 };
  }
  return jar;
}

export function parseHeaderCookies(text) {
  const jar = {};
  for (const part of text.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) jar[name] = { value, domain: "", expiry: 0 };
  }
  return jar;
}

export function parseCookies(text) {
  if (!text) return {};
  if (text.includes("\t") || text.startsWith("#")) {
    return parseNetscapeCookies(text);
  }
  return parseHeaderCookies(text);
}

export function buildCookieHeader(jar) {
  return Object.entries(jar)
    .map(([name, info]) => `${name}=${info.value}`)
    .join("; ");
}

export function getXsrfToken(jar) {
  const t = jar["XSRF-TOKEN"];
  if (!t) return "";
  try {
    return decodeURIComponent(t.value);
  } catch {
    return t.value;
  }
}

export function inspectSession(jar) {
  const required = ["digiflazz_member_panel_session", "XSRF-TOKEN"];
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
