// Bootstrap bersama: loadConfig + buildClient (dipakai cli.js & server.js).
import { fileURLToPath } from "node:url";
import { dirname, resolve, isAbsolute } from "node:path";
import { readFileSync } from "node:fs";

import { log } from "./logger.js";
import {
  parseNetscapeCookies,
  buildCookieHeader,
  getXsrfToken,
  inspectSession,
} from "./cookies.js";
import { generateFingerprint } from "./fingerprint.js";
import { selectProxy } from "./geoproxy.js";
import { DigiflazzClient } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

export function loadConfig() {
  const cfgPath = resolve(ROOT, "config.json");
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  cfg.cookieFile = isAbsolute(cfg.cookieFile)
    ? cfg.cookieFile
    : resolve(ROOT, cfg.cookieFile);
  return cfg;
}

/**
 * Bangun client + verifikasi sesi.
 * @param {object} opts { strict } strict=true -> exit proses bila gagal (CLI).
 * @returns {Promise<{client, geo}>}
 */
export async function buildClient(cfg, opts = {}) {
  const fail = (msg) => {
    if (opts.strict) {
      log.error(msg);
      process.exit(1);
    }
    throw new Error(msg);
  };

  const jar = parseNetscapeCookies(cfg.cookieFile);
  const sess = inspectSession(jar);
  if (!sess.ok) {
    fail(`Cookie sesi tidak lengkap (hilang: ${sess.missing.join(", ")}). Perbarui kuki.txt.`);
  }
  if (sess.expired.length) {
    log.warn(`Cookie mungkin kedaluwarsa: ${sess.expired.join(", ")}. Lanjut mencoba...`);
  }

  const fingerprint = generateFingerprint(cfg.userAgent);
  log.info(`UA: ${fingerprint.userAgent}`);

  let dispatcher, geo;
  const sel = await selectProxy(cfg);
  dispatcher = sel.dispatcher;
  geo = sel.geo;

  const client = new DigiflazzClient({
    baseUrl: cfg.baseUrl,
    apiPrefix: cfg.apiPrefix,
    cookieHeader: buildCookieHeader(jar),
    xsrf: getXsrfToken(jar),
    fingerprint,
    dispatcher,
    speed: cfg.speed,
    retry: cfg.retry,
    concurrency: opts.concurrency != null ? opts.concurrency : cfg.concurrency,
    groupDelayMs: opts.groupDelayMs != null ? opts.groupDelayMs : cfg.groupDelayMs,
    rateLimitPerMin: cfg.rateLimitPerMin,
  });
  client._mode = cfg.mode || "buyer";
  return { client, geo };
}
