// Web server sederhana untuk Digiflazz fetch-tool.
// Pakai modul http bawaan Node (tanpa framework). Fitur:
//   GET  /                      -> halaman UI
//   GET  /api/status            -> cek sesi + geo + daftar kategori
//   GET  /api/logs              -> SSE stream log realtime
//   POST /api/run               -> jalankan delete/add/seller (body JSON)
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, extname } from "node:path";

import { log, addLogListener } from "./src/logger.js";
import { loadConfig, buildClient } from "./src/bootstrap.js";
import { runDeleteAll, listCategories } from "./modules/delete.js";
import { runAddAll } from "./modules/add.js";
import { runSellerAll } from "./modules/seller.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, "public");
const PORT = process.env.PORT ? Number(process.env.PORT) : 5599;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

let cfg = loadConfig();
let running = false; // cegah 2 job paralel
let stopRequested = false; // sinyal stop untuk job berjalan

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function serveStatic(req, res) {
  let rel = req.url.split("?")[0];
  if (rel === "/") rel = "/index.html";
  const filePath = resolve(PUBLIC_DIR, "." + rel);
  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
    res.writeHead(404).end("Not found");
    return;
  }
  const ext = extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  res.end(readFileSync(filePath));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new Error("Body JSON tidak valid"));
      }
    });
    req.on("error", reject);
  });
}

// SSE: stream log ke browser
function handleLogStream(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`event: ready\ndata: {}\n\n`);
  const unsub = addLogListener((entry) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  });
  const ka = setInterval(() => res.write(`: keep-alive\n\n`), 25000);
  req.on("close", () => {
    clearInterval(ka);
    unsub();
  });
}

// Cek sesi + geo + daftar kategori (untuk dropdown).
async function handleStatus(req, res) {
  try {
    const { client, geo } = await buildClient(cfg);
    const cats = await listCategories(client);
    sendJson(res, 200, {
      ok: true,
      geo,
      mode: cfg.mode,
      speed: cfg.speed,
      categories: cats.map((c) => c.name),
    });
  } catch (e) {
    sendJson(res, 200, { ok: false, error: e.message });
  }
}

// Daftar kategori saja (untuk tombol "Muat Kategori").
async function handleCategories(req, res) {
  try {
    const { client } = await buildClient(cfg);
    const cats = await listCategories(client);
    sendJson(res, 200, { ok: true, categories: cats.map((c) => c.name) });
  } catch (e) {
    sendJson(res, 200, { ok: false, error: e.message });
  }
}

// Jalankan job. Body: { action, dryRun, only, skip, ...params }
async function handleRun(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return sendJson(res, 400, { ok: false, error: e.message });
  }

  if (running) {
    return sendJson(res, 409, { ok: false, error: "Masih ada proses berjalan. Tunggu selesai." });
  }

  const { action } = body;
  if (!["delete", "add", "seller"].includes(action)) {
    return sendJson(res, 400, { ok: false, error: "action tidak dikenal" });
  }

  // Respon segera; pekerjaan jalan di background, progress lewat SSE.
  sendJson(res, 202, { ok: true, started: action });
  running = true;
  stopRequested = false;

  (async () => {
    try {
      const concurrency = body.concurrency != null ? Number(body.concurrency) : undefined;
      const groupDelayMs = body.groupDelayMs != null ? Number(body.groupDelayMs) : undefined;
      const { client } = await buildClient(cfg, { concurrency, groupDelayMs });
      client._stop = () => stopRequested; // tombol Stop
      await client.ping();
      log.info(`Paralel: ${client.concurrency} request (jeda antar-request ~${client._spacing}ms).`);
      log.info(`Jeda antar-grup: ${(client.groupDelayMs / 1000).toFixed(0)} dtk.`);

      const common = {
        only: body.only || [],
        skip: body.skip || [],
        dryRun: !!body.dryRun,
      };

      if (action === "delete") {
        await runDeleteAll(client, common);
      } else if (action === "add") {
        await runAddAll(client, {
          ...common,
          op: body.op || "gte",
          threshold: body.threshold,
          generateSku: true,
        });
      } else if (action === "seller") {
        await runSellerAll(client, {
          ...common,
          multi: body.multi || "",
          rating: body.rating != null && body.rating !== "" ? parseFloat(body.rating) : null,
          cheapest: !!body.cheapest,
          skipExisting: !body.overwrite,
          codePrefix: body.codePrefix || "",
          codeLen: body.codeLen ? parseInt(body.codeLen, 10) : 8,
        });
      }
    } catch (e) {
      log.error(`Job gagal: ${e.message}`);
    } finally {
      running = false;
      log.info("__JOB_DONE__");
    }
  })();
}

const server = createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  try {
    if (url === "/api/logs") return handleLogStream(req, res);
    if (url === "/api/status") return handleStatus(req, res);
    if (url === "/api/categories") return handleCategories(req, res);
    if (url === "/api/run" && req.method === "POST") return handleRun(req, res);
    if (url === "/api/stop" && req.method === "POST") {
      stopRequested = true;
      log.warn("Permintaan STOP diterima. Berhenti setelah item berjalan selesai.");
      return sendJson(res, 200, { ok: true });
    }
    return serveStatic(req, res);
  } catch (e) {
    sendJson(res, 500, { ok: false, error: e.message });
  }
});

server.listen(PORT, () => {
  log.ok(`Web UI siap di http://localhost:${PORT}`);
  log.info("Buka URL itu di browser. Tekan Ctrl+C untuk berhenti.");
});
