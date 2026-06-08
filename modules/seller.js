// MODUL UBAH SELLER (buyer-area/product)
// Alur SPA yang direplikasi:
//   GET  /buyer/product/category/{catId}/   -> produk yang sudah ditambahkan
//   GET  /buyer/product/seller/{productId}  -> daftar seller utk produk itu
//        seller fields: { id, id_int, seller, price, reviewAvg, multi, connectionType,
//                         seller_sku_code, deskripsi, stock, unlimited_stock, ... }
//   (selectSeller) -> set field seller pada objek produk:
//        seller, seller_sku_id=id, seller_sku_id_int=id_int,
//        seller_connection_type=connectionType, seller_sku_code, seller_sku_desc=deskripsi,
//        price, stock, unlimited_stock
//   POST /buyer/product  (body = objek produk yang sudah diubah)  -> simpan (editProduct)
import { log } from "../src/logger.js";
import { listCategories, listProductsInCategory } from "./delete.js";
import { loadCatalog, groupByBrandType } from "../src/catalog.js";
import { runPool, groupDelay } from "../src/pool.js";
import { startTimer, fmtDuration } from "../src/timer.js";

function makeRandomCode(prefix, len) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return (prefix ? String(prefix) : "") + s;
}

// Apakah produk sudah punya seller valid?
function hasSeller(p) {
  const s = (p.seller || "").trim();
  if (!s || s === "-") return false;
  if (/invalid seller/i.test(s)) return false;
  return true;
}

// Parse rating_qty "40+" -> 40 (minimal). Tidak dipakai utk filter, hanya info.
// reviewAvg adalah angka rating rata-rata yang dipakai utk filter "rating minimal".
function passSellerFilter(seller, settings) {
  // Multi: "Ya"/"Tidak"/"" (abaikan)
  if (settings.multi) {
    const want = settings.multi.toLowerCase() === "ya";
    if (Boolean(seller.multi) !== want) return false;
  }
  // Rating minimal
  if (settings.rating != null) {
    const avg = Number(seller.reviewAvg);
    if (isNaN(avg) || avg < settings.rating) return false;
  }
  return true;
}

async function fetchSellers(client, productId) {
  const r = await client.get(`/buyer/product/seller/${productId}`);
  return r.data?.data || [];
}

// Terapkan filter + pilih seller. cheapest=true -> harga termurah.
function chooseSeller(sellers, settings) {
  let pool = sellers.filter((s) => passSellerFilter(s, settings));
  if (!pool.length) return null;
  if (settings.cheapest) {
    pool = pool.slice().sort((a, b) => Number(a.price) - Number(b.price));
  }
  return pool[0];
}

// Bangun objek produk yang siap di-POST (replikasi selectSeller + status ON + kode).
function buildUpdatedProduct(product, seller, settings) {
  // Setia ke perilaku ekstensi asli: setiap baris diberi kode acak BARU.
  // (kecuali settings.keepExistingCode = true dan produk sudah punya kode.)
  const code =
    settings.keepExistingCode && product.code
      ? product.code
      : makeRandomCode(settings.codePrefix, settings.codeLen || 8);

  return {
    ...product,
    code,
    seller: seller.seller,
    seller_sku_id: seller.id,
    seller_sku_id_int: seller.id_int,
    seller_connection_type: seller.connectionType,
    seller_sku_code: seller.seller_sku_code,
    seller_sku_desc: seller.deskripsi,
    price: seller.price,
    stock: seller.stock,
    unlimited_stock: seller.unlimited_stock,
    multi: seller.multi,
    multi_counter: seller.multi_counter,
    status: true, // aktifkan
    change: true,
  };
}

async function processProduct(client, product, settings) {
  const pname = product.product || product.id;

  if (settings.skipExisting && hasSeller(product)) {
    log.info(`"${pname}" sudah ada seller, dilewati (skip).`);
    return "skip";
  }

  const sellers = await fetchSellers(client, product.id);
  if (!sellers.length) {
    log.warn(`"${pname}": tidak ada seller.`);
    return "no_seller";
  }
  const chosen = chooseSeller(sellers, settings);
  if (!chosen) {
    log.warn(`"${pname}": tidak ada seller yang cocok dengan filter.`);
    return "no_seller";
  }

  const payload = buildUpdatedProduct(product, chosen, settings);

  if (settings.dryRun) {
    log.warn(
      `[DRY-RUN] "${pname}" -> seller ${chosen.seller} (Rp${chosen.price}, ` +
        `rating ${chosen.reviewAvg}, multi ${chosen.multi}), kode ${payload.code}.`
    );
    return "done";
  }

  const r = await client.post("/buyer/product", payload);
  log.ok(
    `"${pname}" -> ${chosen.seller} (Rp${chosen.price}, rating ${chosen.reviewAvg}). ` +
      `${r.data?.message || "tersimpan"}`
  );
  return "done";
}

/**
 * Ubah seller untuk semua produk di seluruh kategori (atau subset).
 * @param {object} settings
 *   { multi, rating, cheapest, skipExisting, codePrefix, codeLen, alwaysNewCode,
 *     skip:[catName], only:[catName], dryRun }
 */
export async function runSellerAll(client, settings = {}) {
  const cats = await listCategories(client);
  if (!cats.length) {
    log.warn("Tidak ada kategori terdeteksi.");
    return;
  }
  const { brandMap, typeMap } = await loadCatalog(client);
  const onlySet = new Set((settings.only || []).map((s) => s.toLowerCase().trim()));
  const skipSet = new Set((settings.skip || []).map((s) => s.toLowerCase().trim()));

  const willProcess = cats.filter((c) => {
    const n = c.name.toLowerCase().trim();
    if (onlySet.size && !onlySet.has(n)) return false;
    if (skipSet.has(n)) return false;
    return true;
  });

  log.info(
    `Ubah seller: Multi=${settings.multi || "abaikan"}, ` +
      `Rating>=${settings.rating == null ? "-" : settings.rating}, ` +
      `Termurah=${settings.cheapest ? "Ya" : "Tidak"}, ` +
      `Mode=${settings.skipExisting ? "Skip" : "Timpa"}.`
  );
  log.info(`Kategori diproses: ${willProcess.map((c) => c.name).join(", ") || "(tidak ada)"}`);

  let processed = 0,
    skipped = 0,
    failed = 0;
  const totalTimer = startTimer();

  for (let ci = 0; ci < willProcess.length; ci++) {
    const cat = willProcess[ci];
    log.info(`KATEGORI [${ci + 1}/${willProcess.length}]: ${cat.name}`);
    let products;
    try {
      products = await listProductsInCategory(client, cat.id);
    } catch (e) {
      log.error(`${cat.name}: gagal ambil produk (${e.message}).`);
      continue;
    }
    if (!products.length) {
      log.info(`${cat.name}: tidak ada produk.`);
      continue;
    }

    // Proses per grup Brand > Tipe (grup BERURUTAN; item DI DALAM grup paralel).
    const groups = groupByBrandType(products, brandMap, typeMap);
    const conc = client.concurrency || 1;
    for (let gi = 0; gi < groups.length; gi++) {
      if (client._stop && client._stop()) {
        log.warn("Dihentikan pengguna.");
        log.ok(`=== DIHENTIKAN. Diproses ${processed}, dilewati ${skipped}, gagal ${failed}. Total waktu ${fmtDuration(totalTimer)}. ===`);
        return;
      }
      const g = groups[gi];
      const groupTimer = startTimer();
      log.info(
        `  GRUP [${gi + 1}/${groups.length}] ${cat.name} > ${g.brandName} > ${g.typeName} ` +
          `(${g.items.length} produk, paralel ${conc})`
      );
      // Tuntaskan grup ini (semua item) sebelum lanjut grup berikutnya.
      await runPool(
        g.items,
        conc,
        async (product) => {
          try {
            const r = await processProduct(client, product, settings);
            if (r === "done") processed++;
            else if (r === "skip" || r === "no_seller") skipped++;
            else failed++;
          } catch (e) {
            failed++;
            log.warn(`"${product.product || product.id}": gagal (${e.message}).`);
          }
        },
        () => client._stop && client._stop()
      );
      log.info(`  GRUP [${gi + 1}/${groups.length}] selesai dalam ${fmtDuration(groupTimer)}.`);
      await groupDelay(client, log, gi === groups.length - 1);
    }
  }

  log.ok(
    `=== SELESAI UBAH SELLER. Diproses ${processed}, dilewati ${skipped}, gagal ${failed}. ` +
      `Total waktu ${fmtDuration(totalTimer)}. ===`
  );
}
