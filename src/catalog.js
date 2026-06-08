// Katalog: peta nama brand & tipe, serta pengelompokan produk
// menjadi grup terurut Kategori > Brand > Tipe.
//
// Tujuan: proses tidak "ngacak". Mis. Pulsa > TELKOMSEL > Umum diselesaikan
// dulu sampai habis, baru lanjut grup berikutnya.

let _brandMap = null;
let _typeMap = null;

export async function loadCatalog(client) {
  if (_brandMap && _typeMap) return { brandMap: _brandMap, typeMap: _typeMap };
  const [brands, types] = await Promise.all([
    client.get("/product/brands"),
    client.get("/product/types"),
  ]);
  _brandMap = Object.fromEntries((brands.data?.data || []).map((b) => [b.id, b.name]));
  _typeMap = Object.fromEntries((types.data?.data || []).map((t) => [t.id, t.name]));
  return { brandMap: _brandMap, typeMap: _typeMap };
}

export function brandName(brandMap, id) {
  return brandMap[id] || id || "(tanpa brand)";
}
export function typeName(typeMap, id) {
  return typeMap[id] || id || "(tanpa tipe)";
}

// Ambil brand/type id dari sebuah produk (mendukung beberapa bentuk).
export function productBrandId(p) {
  return p?.product_details?.brand?.id ?? p?.brand ?? null;
}
export function productTypeId(p) {
  return p?.product_details?.type?.id ?? p?.type ?? null;
}

/**
 * Kelompokkan produk menjadi daftar grup terurut: Brand lalu Tipe.
 * @returns {Array<{ brandId, brandName, typeId, typeName, items: [] }>}
 *   urut berdasarkan nama brand (A-Z) lalu nama tipe (A-Z).
 */
export function groupByBrandType(products, brandMap, typeMap) {
  const map = new Map(); // key "brandId|typeId" -> group
  for (const p of products) {
    const bId = productBrandId(p);
    const tId = productTypeId(p);
    const key = `${bId}|${tId}`;
    if (!map.has(key)) {
      map.set(key, {
        brandId: bId,
        brandName: brandName(brandMap, bId),
        typeId: tId,
        typeName: typeName(typeMap, tId),
        items: [],
      });
    }
    map.get(key).items.push(p);
  }
  const groups = [...map.values()];
  groups.sort((a, b) => {
    const bn = a.brandName.localeCompare(b.brandName, "id");
    if (bn !== 0) return bn;
    return a.typeName.localeCompare(b.typeName, "id");
  });
  return groups;
}

// Reset cache (mis. setelah ganti akun/cookie).
export function resetCatalog() {
  _brandMap = null;
  _typeMap = null;
}
