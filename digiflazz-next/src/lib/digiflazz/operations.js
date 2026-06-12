import { loadCatalog, groupByBrandType } from "./catalog.js";
import { runPool, groupDelay } from "./pool.js";

const BULK_CHUNK = 50;

// Hentikan loop bila kuota habis atau job dihentikan pengguna.
function shouldStop(client) {
  return client.isQuotaExhausted() || client.isStopped();
}

function filterCategories(cats, only, skip) {
  const onlySet = new Set((only || []).map((s) => s.toLowerCase().trim()));
  const skipSet = new Set((skip || []).map((s) => s.toLowerCase().trim()));
  return cats.filter((c) => {
    const n = c.name.toLowerCase().trim();
    if (onlySet.size && !onlySet.has(n)) return false;
    if (skipSet.has(n)) return false;
    return true;
  });
}

export async function listCategories(client) {
  const r = await client.get("/buyer/product/category");
  return r.data?.data || [];
}

async function listProductsInCategory(client, catId) {
  const r = await client.get(`/buyer/product/category/${catId}/`);
  return r.data?.data || [];
}

export async function runDelete(client, opts = {}) {
  const cats = await listCategories(client);
  const { brandMap, typeMap } = await loadCatalog(client);
  const willProcess = filterCategories(cats, opts.only, opts.skip);
  let deleted = 0;

  for (let ci = 0; ci < willProcess.length; ci++) {
    if (shouldStop(client)) {
      client.log("warn", client.isStopped() ? "Dihentikan. Proses berhenti." : "Kuota habis. Menghentikan proses.");
    break;
    }
    const cat = willProcess[ci];
    client.log("info", `Kategori [${ci + 1}/${willProcess.length}]: ${cat.name}`);
    const products = await listProductsInCategory(client, cat.id);
    if (!products.length) {
      client.log("info", `${cat.name}: tidak ada produk.`);
      continue;
    }
    const groups = groupByBrandType(products, brandMap, typeMap);
    for (let gi = 0; gi < groups.length; gi++) {
      if (shouldStop(client)) {
        client.log("warn", client.isStopped() ? "Dihentikan. Proses berhenti." : "Kuota habis. Menghentikan proses.");
        break;
      }
      const g = groups[gi];
      let ids = g.items.map((p) => p.id).filter(Boolean);
      // Potong ids agar tak melebihi sisa kuota (kalau ada limit)
      if (client.budget !== null && client.budget > 0 && ids.length > client.budget) {
        client.log("warn", `  Potong ${ids.length} → ${client.budget} (sisa kuota).`);
        ids = ids.slice(0, client.budget);
      } else if (client.budget !== null && client.budget <= 0) {
        client.log("warn", "  Kuota habis, lewati grup.");
        continue;
      }
      client.log("info", `  ${cat.name} > ${g.brandName} > ${g.typeName} (${ids.length})`);
      if (opts.dryRun) {
        client.log("warn", `  [DRY-RUN] lewati ${ids.length} produk.`);
        continue;
      }
      const chunks = [];
    for (let i = 0; i < ids.length; i += BULK_CHUNK) chunks.push(ids.slice(i, i + BULK_CHUNK));
      await runPool(chunks, client.concurrency, async (chunk) => {
        // Konsumsi sesuai size chunk (sudah dipotong di atas)
        if (!client.tryConsume(chunk.length)) {
          // Sisa kuota < chunk.length → kirim sebanyak sisa saja
     const left = client.budget !== null && client.budget > 0 ? client.budget : 0;
        if (left <= 0) {
         client.log("warn", `    Kuota habis, hentikan.`);
   return;
  }
          chunk = chunk.slice(0, left);
          client.tryConsume(chunk.length);
        }
        await client.post("/buyer/product/multiple/delete", { product_ids: chunk });
   deleted += chunk.length;
   client.log("ok", ` ${chunk.length} dihapus.`);
      });
      await groupDelay(client, gi === groups.length - 1);
    }
  }
  return { deleted };
}

function matchFilter(val, op, target) {
  if (val == null || isNaN(val)) return false;
  if (op === "lte") return val <= target;
  if (op === "eq") return val === target;
  return val >= target;
}

async function listAddCategories(client) {
  const r = await client.get(`/product/categories/${client.mode}`);
  return r.data?.data || [];
}

async function listAddable(client, categoryId, isPasca = 0) {
  const r = await client.get(`/product/${client.mode}/${isPasca}/${categoryId}`);
  return r.data?.data || [];
}

export async function runAdd(client, opts = {}) {
  const op = opts.op || "gte";
  const threshold = Number(opts.threshold);
  if (isNaN(threshold)) throw new Error("Nilai filter total seller tidak valid.");

  const cats = await listAddCategories(client);
  const { brandMap, typeMap } = await loadCatalog(client);
  const isPasca = opts.pasca ? 1 : 0;
  const willProcess = filterCategories(cats, opts.only, opts.skip);
  let added = 0;
  let skipped = 0;

  for (let ci = 0; ci < willProcess.length; ci++) {
    if (shouldStop(client)) {
      client.log("warn", client.isStopped() ? "Dihentikan. Proses berhenti." : "Kuota habis. Menghentikan proses.");
      break;
    }
    const cat = willProcess[ci];
    client.log("info", `Kategori [${ci + 1}/${willProcess.length}]: ${cat.name}`);
    let candidates = [];
    try {
      candidates = await listAddable(client, cat.id, isPasca);
    } catch (e) {
      client.log("warn", `${cat.name}: gagal ambil produk (${e.message}).`);
      continue;
    }
    const passing = candidates.filter((row) =>
      matchFilter(Number(row.total_produk_seller), op, threshold)
    );
    client.log("info", `${cat.name}: ${candidates.length} produk, ${passing.length} lolos filter.`);

    const groups = groupByBrandType(passing, brandMap, typeMap);
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      client.log("info", `  ${cat.name} > ${g.brandName} > ${g.typeName} (${g.items.length})`);
      await runPool(g.items, client.concurrency, async (row) => {
        if (shouldStop(client)) return;
        if (opts.dryRun) {
    client.log("warn", `  [DRY-RUN] +${row.name}`);
          added++;
   return;
 }
        if (!client.tryConsume(1)) {
          client.log("warn", `  Kuota hampir habis, hentikan.`);
          return;
        }
        try {
    await client.post(
 `/${client.mode}/product/store/prabayar`,
            {
  id: row.id,
              name: row.name,
   desc: row.desc,
       category: row.category,
  brand: row.brand,
              type: row.type,
          generate_sku_code: true,
            },
            { referer: "https://member.digiflazz.com/buyer-area/product/add" }
    );
        added++;
          client.log("ok", `+${row.name}`);
   } catch (e) {
          if (e.name === "JobStoppedError") return;
          skipped++;
       client.log("warn", `Gagal tambah "${row.name}": ${e.message}`);
 }
      });
      await groupDelay(client, gi === groups.length - 1);
    }
  }
  return { added, skipped };
}

function makeRandomCode(prefix, len) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return (prefix ? String(prefix) : "") + s;
}

function hasSeller(p) {
  const s = (p.seller || "").trim();
  if (!s || s === "-") return false;
  if (/invalid seller/i.test(s)) return false;
  return true;
}

function passSellerFilter(seller, settings) {
  if (settings.multi) {
    const want = settings.multi.toLowerCase() === "ya";
    if (Boolean(seller.multi) !== want) return false;
  }
  if (settings.rating != null) {
    const avg = Number(seller.reviewAvg);
    if (isNaN(avg) || avg < settings.rating) return false;
  }
  return true;
}

function chooseSeller(sellers, settings) {
  let pool = sellers.filter((s) => passSellerFilter(s, settings));
  if (!pool.length) return null;
  if (settings.cheapest) {
    pool = pool.slice().sort((a, b) => Number(a.price) - Number(b.price));
  }
  return pool[0];
}

function buildUpdatedProduct(product, seller, settings) {
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
    status: true,
    change: true,
  };
}

export async function runSeller(client, opts = {}) {
  const cats = await listCategories(client);
  const { brandMap, typeMap } = await loadCatalog(client);
  const willProcess = filterCategories(cats, opts.only, opts.skip);
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (let ci = 0; ci < willProcess.length; ci++) {
    if (shouldStop(client)) {
      client.log("warn", client.isStopped() ? "Dihentikan. Proses berhenti." : "Kuota habis. Menghentikan proses.");
      break;
    }
    const cat = willProcess[ci];
 client.log("info", `Kategori [${ci + 1}/${willProcess.length}]: ${cat.name}`);
    let products;
    try {
      products = await listProductsInCategory(client, cat.id);
    } catch (e) {
      client.log("error", `${cat.name}: gagal ambil produk (${e.message}).`);
    continue;
    }
    if (!products.length) continue;

    const groups = groupByBrandType(products, brandMap, typeMap);
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      client.log("info", `  ${cat.name} > ${g.brandName} > ${g.typeName} (${g.items.length})`);
      await runPool(g.items, client.concurrency, async (product) => {
   if (shouldStop(client)) return;
     const pname = product.product || product.id;
        try {
          if (opts.skipExisting && hasSeller(product)) {
            skipped++;
            return;
          }
      const r = await client.get(`/buyer/product/seller/${product.id}`);
          const sellers = r.data?.data || [];
          const chosen = chooseSeller(sellers, opts);
     if (!chosen) {
 skipped++;
   client.log("warn", `"${pname}": tidak ada seller cocok.`);
  return;
  }
          if (opts.dryRun) {
   processed++;
            client.log("warn", `[DRY-RUN] "${pname}" -> ${chosen.seller} (Rp${chosen.price})`);
            return;
          }
          if (!client.tryConsume(1)) {
  client.log("warn", `  Kuota hampir habis, hentikan.`);
            return;
   }
          const payload = buildUpdatedProduct(product, chosen, opts);
          await client.post("/buyer/product", payload);
        processed++;
       client.log("ok", `"${pname}" -> ${chosen.seller} (Rp${chosen.price})`);
     } catch (e) {
    if (e.name === "JobStoppedError") return;
          failed++;
          client.log("warn", `"${pname}": gagal (${e.message}).`);
        }
      });
      await groupDelay(client, gi === groups.length - 1);
    }
  }
  return { processed, skipped, failed };
}
