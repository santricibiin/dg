export function brandName(brandMap, id) {
  return brandMap[id] || id || "(tanpa brand)";
}

export function typeName(typeMap, id) {
  return typeMap[id] || id || "(tanpa tipe)";
}

export function productBrandId(p) {
  return p?.product_details?.brand?.id ?? p?.brand ?? null;
}

export function productTypeId(p) {
  return p?.product_details?.type?.id ?? p?.type ?? null;
}

export async function loadCatalog(client) {
  const [brands, types] = await Promise.all([
    client.get("/product/brands"),
    client.get("/product/types"),
  ]);
  const brandMap = Object.fromEntries(
    (brands.data?.data || []).map((b) => [b.id, b.name])
  );
  const typeMap = Object.fromEntries(
    (types.data?.data || []).map((t) => [t.id, t.name])
  );
  return { brandMap, typeMap };
}

export function groupByBrandType(products, brandMap, typeMap) {
  const map = new Map();
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
