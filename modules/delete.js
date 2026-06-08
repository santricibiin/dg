// MODUL HAPUS PRODUK (buyer-area/product)
// Endpoint:
//   GET  /buyer/product/category            -> daftar kategori [{id,name}]
//   GET  /buyer/product/category/{catId}/   -> produk yang sudah ditambahkan di kategori
//   POST /buyer/product/multiple/delete {product_ids:[...]}  -> hapus massal
//   POST /buyer/product/delete/{id}                          -> hapus satuan
import { log } from "../src/logger.js";
import { loadCatalog, groupByBrandType } from "../src/catalog.js";
import { runPool, groupDelay } from "../src/pool.js";
import { startTimer, fmtDuration } from "../src/timer.js";

const BULK_CHUNK = 50; // hapus per-batch agar payload tidak terlalu besar

export async function listCategories(client) {
  const r = await client.get("/buyer/product/category");
  return r.data?.data || [];
}

export async function listProductsInCategory(client, catId) {
  const r = await client.get(`/buyer/product/category/${catId}/`);
  return r.data?.data || [];
}

/**
 * Hapus semua produk pada kategori tertentu, BERURUTAN per grup Brand > Tipe.
 * Satu grup dituntaskan dulu baru lanjut grup berikutnya.
 * @returns {number} jumlah produk yang dihapus
 */
export async function deleteCategory(client, cat, { brandId, dryRun, brandMap, typeMap } = {}) {
  const products = await listProductsInCategory(client, cat.id);
  let targets = products;
  if (brandId) {
    targets = products.filter((p) => p?.product_details?.brand?.id === brandId);
  }
  if (!targets.length) {
    log.info(`${cat.name}: tidak ada produk. Lewati.`);
    return 0;
  }

  const groups = groupByBrandType(targets, brandMap, typeMap);
  let deleted = 0;

  for (let gi = 0; gi < groups.length; gi++) {
    if (client._stop && client._stop()) {
      log.warn("Dihentikan pengguna.");
      return deleted;
    }
    const g = groups[gi];
    const groupTimer = startTimer();
    const ids = g.items.map((p) => p.id).filter(Boolean);
    log.info(
      `  GRUP [${gi + 1}/${groups.length}] ${cat.name} > ${g.brandName} > ${g.typeName} ` +
        `(${ids.length} produk)`
    );

    if (dryRun) {
      log.warn(`  [DRY-RUN] Lewati hapus ${ids.length} produk di grup ini.`);
      continue;
    }

    // Pecah jadi batch lalu hapus batch-batch itu paralel (sesuai concurrency).
    const chunks = [];
    for (let i = 0; i < ids.length; i += BULK_CHUNK) chunks.push(ids.slice(i, i + BULK_CHUNK));
    const conc = client.concurrency || 1;
    await runPool(
      chunks,
      conc,
      async (chunk) => {
        const r = await client.post("/buyer/product/multiple/delete", { product_ids: chunk });
        deleted += chunk.length;
        const msg = r.data?.message || "ok";
        log.ok(`    batch ${chunk.length} dihapus (${msg}).`);
      },
      () => client._stop && client._stop()
    );
    log.info(`  GRUP [${gi + 1}/${groups.length}] selesai dalam ${fmtDuration(groupTimer)}.`);
    await groupDelay(client, log, gi === groups.length - 1);
  }
  return deleted;
}

/**
 * Hapus semua produk di seluruh kategori (atau subset).
 * @param {object} opts { only:[catName], skip:[catName], dryRun }
 */
export async function runDeleteAll(client, opts = {}) {
  const cats = await listCategories(client);
  if (!cats.length) {
    log.warn("Tidak ada kategori terdeteksi.");
    return;
  }
  const { brandMap, typeMap } = await loadCatalog(client);
  const onlySet = new Set((opts.only || []).map((s) => s.toLowerCase().trim()));
  const skipSet = new Set((opts.skip || []).map((s) => s.toLowerCase().trim()));

  const willProcess = cats.filter((c) => {
    const n = c.name.toLowerCase().trim();
    if (onlySet.size && !onlySet.has(n)) return false;
    if (skipSet.has(n)) return false;
    return true;
  });

  log.info(
    `${cats.length} kategori total. Diproses: ${
      willProcess.map((c) => c.name).join(", ") || "(tidak ada)"
    }`
  );

  let total = 0;
  const totalTimer = startTimer();
  for (let i = 0; i < willProcess.length; i++) {
    if (client._stop && client._stop()) {
      log.warn("Dihentikan pengguna.");
      log.ok(`=== DIHENTIKAN. Total dihapus: ${total} produk. Total waktu ${fmtDuration(totalTimer)}. ===`);
      return;
    }
    const cat = willProcess[i];
    log.info(`KATEGORI [${i + 1}/${willProcess.length}]: ${cat.name}`);
    try {
      total += await deleteCategory(client, cat, {
        brandId: opts.brandId,
        dryRun: opts.dryRun,
        brandMap,
        typeMap,
      });
    } catch (e) {
      log.error(`${cat.name}: gagal (${e.message}). Lanjut kategori berikutnya.`);
    }
  }
  log.ok(`=== SELESAI HAPUS. Total dihapus: ${total} produk. Total waktu ${fmtDuration(totalTimer)}. ===`);
}
