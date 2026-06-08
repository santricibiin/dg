// MODUL TAMBAH PRODUK (buyer-area/product/add, tab Normal)
// Endpoint:
//   GET  /product/categories/{mode}                 -> kategori utk add [{id,name}]
//   GET  /product/{mode}/{is_pasca}/{categoryId}     -> SEMUA produk addable 1 kategori
//        (is_pasca: 0=prabayar, 1=pascabayar) + field total_produk_seller
//   POST /{mode}/product/store/prabayar  (body=objek produk + generate_sku_code)
//
// SPA memuat seluruh produk satu kategori dalam SATU request lalu memfilter
// brand/tipe/seller di sisi klien. Kita ikuti pola itu (hemat request).
import { log } from "../src/logger.js";
import { loadCatalog, groupByBrandType } from "../src/catalog.js";
import { runPool, groupDelay } from "../src/pool.js";
import { startTimer, fmtDuration } from "../src/timer.js";

export async function listAddCategories(client) {
  // /product/categories/{mode}
  const r = await client.get(`/product/categories/${client._mode || "buyer"}`);
  return r.data?.data || [];
}

// Semua produk addable untuk satu kategori (1 request).
export async function listAddable(client, categoryId, isPasca = 0) {
  const r = await client.get(`/product/${client._mode || "buyer"}/${isPasca}/${categoryId}`);
  return r.data?.data || [];
}

function matchFilter(val, op, target) {
  if (val == null || isNaN(val)) return false;
  if (op === "gte") return val >= target;
  if (op === "lte") return val <= target;
  if (op === "eq") return val === target;
  return val >= target;
}

const opLabel = (op) => (op === "lte" ? "<=" : op === "eq" ? "=" : ">=");

/**
 * Tambah produk yang lolos filter total_produk_seller.
 * @param {object} settings { op, threshold, skip:[catName], only:[catName], dryRun, generateSku }
 */
export async function runAddAll(client, settings = {}) {
  const op = settings.op || "gte";
  const threshold = Number(settings.threshold);
  if (isNaN(threshold)) {
    log.error("Nilai filter total seller aktif belum benar.");
    return;
  }

  const cats = await listAddCategories(client);
  if (!cats.length) {
    log.warn("Tidak ada kategori add terdeteksi.");
    return;
  }
  const { brandMap, typeMap } = await loadCatalog(client);
  const isPasca = settings.pasca ? 1 : 0;

  const onlySet = new Set((settings.only || []).map((s) => s.toLowerCase().trim()));
  const skipSet = new Set((settings.skip || []).map((s) => s.toLowerCase().trim()));

  const willProcess = cats.filter((c) => {
    const n = c.name.toLowerCase().trim();
    if (onlySet.size && !onlySet.has(n)) return false;
    if (skipSet.has(n)) return false;
    return true;
  });

  log.info(
    `Filter: seller aktif ${opLabel(op)} ${threshold}. ` +
      `Kategori diproses: ${willProcess.map((c) => c.name).join(", ") || "(tidak ada)"}`
  );

  let added = 0,
    skipped = 0;
  const totalTimer = startTimer();

  for (let ci = 0; ci < willProcess.length; ci++) {
    const cat = willProcess[ci];
    log.info(`KATEGORI [${ci + 1}/${willProcess.length}]: ${cat.name}`);

    // Satu request mengembalikan semua produk addable kategori ini.
    let candidates = [];
    try {
      candidates = await listAddable(client, cat.id, isPasca);
    } catch (e) {
      log.warn(`${cat.name}: gagal ambil daftar produk (${e.message}).`);
      continue;
    }

    if (!candidates.length) {
      log.info(`${cat.name}: tidak ada produk addable.`);
      continue;
    }

    const passing = candidates.filter((row) =>
      matchFilter(Number(row.total_produk_seller), op, threshold)
    );
    log.info(
      `${cat.name}: ${candidates.length} produk, ${passing.length} lolos filter ${opLabel(op)} ${threshold}.`
    );

    // Proses per grup Brand > Tipe (grup BERURUTAN; item DI DALAM grup paralel).
    const groups = groupByBrandType(passing, brandMap, typeMap);
    const conc = client.concurrency || 1;
    for (let gi = 0; gi < groups.length; gi++) {
      if (client._stop && client._stop()) {
        log.warn("Dihentikan pengguna.");
        log.ok(`=== DIHENTIKAN. Ditambah ${added}, gagal/skip ${skipped}. Total waktu ${fmtDuration(totalTimer)}. ===`);
        return;
      }
      const g = groups[gi];
      const groupTimer = startTimer();
      log.info(
        `  GRUP [${gi + 1}/${groups.length}] ${cat.name} > ${g.brandName} > ${g.typeName} ` +
          `(${g.items.length} produk, paralel ${conc})`
      );
      await runPool(
        g.items,
        conc,
        async (row) => {
          if (settings.dryRun) {
            log.warn(`[DRY-RUN] +Tambah "${row.name}" (seller aktif ${row.total_produk_seller}).`);
            added++;
            return;
          }
          try {
            const payload = {
              id: row.id,
              name: row.name,
              desc: row.desc,
              category: row.category,
              brand: row.brand,
              type: row.type,
              generate_sku_code: settings.generateSku !== false,
            };
            const r = await client.post(
              `/${client._mode || "buyer"}/product/store/prabayar`,
              payload,
              { referer: "https://member.digiflazz.com/buyer-area/product/add" }
            );
            added++;
            log.ok(`+Tambah "${row.name}" (seller aktif ${row.total_produk_seller}). ${r.data?.message || ""}`);
          } catch (e) {
            skipped++;
            log.warn(`Gagal tambah "${row.name}": ${e.message}`);
          }
        },
        () => client._stop && client._stop()
      );
      log.info(`  GRUP [${gi + 1}/${groups.length}] selesai dalam ${fmtDuration(groupTimer)}.`);
      await groupDelay(client, log, gi === groups.length - 1);
    }
  }

  log.ok(
    `=== SELESAI TAMBAH. Ditambah ${added}, gagal/skip ${skipped}. ` +
      `Total waktu ${fmtDuration(totalTimer)}. ===`
  );
}
