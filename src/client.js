// API client Digiflazz: fetch + cookie + XSRF + rate-limit + retry + proxy.
import { log } from "./logger.js";
import { browserHeaders } from "./fingerprint.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class DigiflazzClient {
  /**
   * @param {object} opts
   *  - baseUrl, apiPrefix
   *  - cookieHeader, xsrf
   *  - fingerprint (dari generateFingerprint)
   *  - dispatcher (undici ProxyAgent | undefined)
   *  - speed: "normal" | "turbo"
   *  - retry: { maxAttempts, backoffMs }
   */
  constructor(opts) {
    this.baseUrl = opts.baseUrl;
    this.apiPrefix = opts.apiPrefix;
    this.cookieHeader = opts.cookieHeader;
    this.xsrf = opts.xsrf;
    this.fp = opts.fingerprint;
    this.dispatcher = opts.dispatcher;
    this.retry = opts.retry || { maxAttempts: 4, backoffMs: 1500 };

    // Jeda antar-request yang menembak server (anti "too many attempts"),
    // mengikuti logika content.js: normal ~700ms, turbo ~450ms.
    this.actionFloor = opts.speed === "turbo" ? 450 : 700;

    // BATAS RATE-LIMIT SERVER (Laravel throttle): GenflowAi 120 request/menit.
    // = 1 request / 500ms. Kita pakai margin aman 1.15x -> ~575ms per request,
    // sehingga aggregate rate tetap di bawah 120/menit walau paralel.
    this.rateLimitPerMin = Number(opts.rateLimitPerMin) || 120;
    this._minGlobalSpacing = Math.ceil((60000 / this.rateLimitPerMin) * 1.15);

    // Concurrency: berapa request boleh BERJALAN paralel (1-10) untuk menutup
    // latency. TAPI laju MULAI request tetap dibatasi _minGlobalSpacing supaya
    // tidak menembus batas server. Concurrency tinggi tidak akan mempercepat
    // melewati 120/menit (itu memang plafon server).
    this.concurrency = Math.max(1, Math.min(10, Number(opts.concurrency) || 1));
    this._spacing = Math.max(
      this._minGlobalSpacing,
      Math.round(this.actionFloor / this.concurrency)
    );
    this._nextSlot = 0; // timestamp kapan request berikut boleh mulai
    this._pauseUntil = 0; // jeda paksa saat sisa kuota menipis / kena 429

    // Jeda antar-grup (Kategori/Brand/Sub-brand) untuk menghindari rate-limit.
    // GenflowAi 3000ms. 0 = tanpa jeda.
    this.groupDelayMs = opts.groupDelayMs != null ? Math.max(0, Number(opts.groupDelayMs)) : 3000;
  }

  apiUrl(path) {
    const clean = path.startsWith("/") ? path : "/" + path;
    return this.baseUrl + this.apiPrefix + clean;
  }

  // Gate berbasis slot: aman untuk paralel. Tiap request "memesan" slot waktu
  // berikutnya (_nextSlot += spacing) lalu menunggu sampai slot itu tiba.
  // Juga menghormati _pauseUntil (jeda paksa saat kuota menipis / kena 429).
  async _throttle() {
    const now = Date.now();
    const base = Math.max(now, this._nextSlot, this._pauseUntil);
    this._nextSlot = base + this._spacing;
    const wait = base - now;
    if (wait > 0) await sleep(wait);
  }

  // Baca header rate-limit dari respons; bila sisa kuota menipis, rem sebentar.
  _absorbRateHeaders(res) {
    const remain = Number(res.headers.get("x-ratelimit-remaining"));
    if (!Number.isNaN(remain) && remain <= 3) {
      // Sisa kuota hampir habis -> tahan ~6 detik agar window menit me-reset.
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
    if (this.dispatcher) init.dispatcher = this.dispatcher;

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
        const wait = this.retry.backoffMs * attempt;
        log.warn(`Koneksi gagal (${e.message}). Coba lagi dalam ${wait}ms...`);
        await sleep(wait);
        continue;
      }

      // Serap info kuota dari header (rem sebelum kena 429).
      this._absorbRateHeaders(res);

      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        data = { _raw: text };
      }

      // 429 / rate-limit / too many attempts -> hormati Retry-After lalu retry.
      const msg = (data && (data.message || data.status)) || "";
      const rateLimited =
        res.status === 429 || /too many|rate limit|terlalu banyak/i.test(String(msg));
      if (rateLimited && attempt < this.retry.maxAttempts) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = !Number.isNaN(retryAfter) && retryAfter > 0
          ? retryAfter * 1000 + 500
          : this.retry.backoffMs * attempt * 2;
        // Pause GLOBAL: semua worker paralel ikut menunggu, bukan cuma yang ini.
        this._pauseUntil = Math.max(this._pauseUntil, Date.now() + wait);
        log.warn(`Rate-limit (HTTP ${res.status}). Tahan semua ${(wait / 1000).toFixed(1)} dtk lalu ulangi...`);
        await sleep(wait);
        continue;
      }

      // 401/419 -> sesi/CSRF kedaluwarsa.
      if (res.status === 401 || res.status === 419) {
        throw new Error(
          `Sesi tidak valid (HTTP ${res.status}). Cookie/XSRF mungkin kedaluwarsa. ` +
            `Perbarui kuki.txt.`
        );
      }

      if (!res.ok) {
        const detail = msg || (data && data._raw ? data._raw.slice(0, 200) : "");
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

  // Cek sesi dengan endpoint ringan.
  async ping() {
    const r = await this.get("/buyer/product/category");
    return Array.isArray(r.data?.data) ? r.data.data.length : 0;
  }
}
