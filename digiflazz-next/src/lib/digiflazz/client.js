import { browserHeaders } from "./fingerprint.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class DigiflazzClient {
  constructor(opts) {
    this.baseUrl = opts.baseUrl;
    this.apiPrefix = opts.apiPrefix;
    this.cookieHeader = opts.cookieHeader;
    this.xsrf = opts.xsrf;
    this.fp = opts.fingerprint;
    this.retry = opts.retry || { maxAttempts: 4, backoffMs: 1500 };
    this.mode = opts.mode || "buyer";
    this.onLog = typeof opts.onLog === "function" ? opts.onLog : () => {};

    this.actionFloor = opts.speed === "turbo" ? 450 : 700;
    this.rateLimitPerMin = Number(opts.rateLimitPerMin) || 120;
    this._minGlobalSpacing = Math.ceil((60000 / this.rateLimitPerMin) * 1.15);
    this.concurrency = Math.max(1, Math.min(10, Number(opts.concurrency) || 1));
    this._spacing = Math.max(
      this._minGlobalSpacing,
      Math.round(this.actionFloor / this.concurrency)
    );
    this._nextSlot = 0;
    this._pauseUntil = 0;
    this.groupDelayMs =
      opts.groupDelayMs != null ? Math.max(0, Number(opts.groupDelayMs)) : 3000;
    this.budget =
      opts.budget == null || opts.budget <= 0 ? null : Number(opts.budget);
  }

  isQuotaExhausted() {
    return this.budget !== null && this.budget <= 0;
  }

  tryConsume(n = 1) {
    if (this.budget === null) return true;
    if (this.budget < n) return false;
    this.budget -= n;
    return true;
  }

  log(level, msg) {
    this.onLog({ level, msg, t: Date.now() });
  }

  apiUrl(path) {
    const clean = path.startsWith("/") ? path : "/" + path;
    return this.baseUrl + this.apiPrefix + clean;
  }

  async _throttle() {
    const now = Date.now();
    const base = Math.max(now, this._nextSlot, this._pauseUntil);
    this._nextSlot = base + this._spacing;
    const wait = base - now;
    if (wait > 0) await sleep(wait);
  }

  _absorbRateHeaders(res) {
    const remain = Number(res.headers.get("x-ratelimit-remaining"));
    if (!Number.isNaN(remain) && remain <= 3) {
      this._pauseUntil = Math.max(this._pauseUntil, Date.now() + 6000);
    }
  }

  async request(method, path, { body, query, referer } = {}) {
    let url = this.apiUrl(path);
    if (query && Object.keys(query).length) {
      const qs = new URLSearchParams(query).toString();
      url += (url.includes("?") ? "&" : "?") + qs;
    }

    const headers = {
      ...browserHeaders(this.fp, referer),
      Cookie: this.cookieHeader,
      "X-XSRF-TOKEN": this.xsrf,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const init = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);

    let attempt = 0;
    while (true) {
      attempt++;
      await this._throttle();
      let res, text;
      try {
        res = await fetch(url, init);
        text = await res.text();
      } catch (e) {
        if (attempt >= this.retry.maxAttempts) {
          throw new Error(`Network error ${method} ${path}: ${e.message}`);
        }
        await sleep(this.retry.backoffMs * attempt);
        continue;
      }

      this._absorbRateHeaders(res);

      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { _raw: text };
      }

      const msg = (data && (data.message || data.status)) || "";
      const rateLimited =
        res.status === 429 ||
        /too many|rate limit|terlalu banyak/i.test(String(msg));
      if (rateLimited && attempt < this.retry.maxAttempts) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait =
          !Number.isNaN(retryAfter) && retryAfter > 0
            ? retryAfter * 1000 + 500
            : this.retry.backoffMs * attempt * 2;
        this._pauseUntil = Math.max(this._pauseUntil, Date.now() + wait);
        this.log("warn", `Rate-limit (HTTP ${res.status}). Menunggu ${(wait / 1000).toFixed(1)} dtk.`);
        await sleep(wait);
        continue;
      }

      if (res.status === 401 || res.status === 419) {
        throw new Error(
          `Sesi tidak valid (HTTP ${res.status}). Perbarui cookie di Pengaturan.`
        );
      }

      if (!res.ok) {
        const detail = msg || (data && data._raw ? String(data._raw).slice(0, 200) : "");
        throw new Error(`HTTP ${res.status} ${method} ${path}: ${detail}`);
      }

      return { status: res.status, data };
    }
  }

  get(path, opts) {
    return this.request("GET", path, opts);
  }

  post(path, body, opts = {}) {
    return this.request("POST", path, { ...opts, body: body ?? {} });
  }

  async ping() {
    const r = await this.get("/buyer/product/category");
    return Array.isArray(r.data?.data) ? r.data.data.length : 0;
  }
}

export function buildClient(setting, overrides = {}) {
  const jar = overrides.jar;
  const budget = overrides.budget;
  return new DigiflazzClient({
    baseUrl: process.env.DIGIFLAZZ_BASE_URL || "https://member.digiflazz.com",
    apiPrefix: process.env.DIGIFLAZZ_API_PREFIX || "/api/v1",
    cookieHeader: overrides.cookieHeader,
    xsrf: overrides.xsrf,
    fingerprint: overrides.fingerprint,
    speed: setting?.speed || "normal",
    concurrency: setting?.concurrency || 1,
    groupDelayMs: setting?.groupDelayMs ?? 3000,
    rateLimitPerMin: 120,
    retry: { maxAttempts: 6, backoffMs: 1500 },
    onLog: overrides.onLog,
    budget,
  });
}
