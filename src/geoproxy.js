// Proxy + GeoIP: pilih proxy yang lokasinya cocok dengan lokasi akun (expectedCountry).
// Tujuan: hindari "lokasi loncat" yang memicu deteksi.
import { ProxyAgent } from "undici";
import { log } from "./logger.js";

// Lookup negara dari sebuah IP/host via endpoint geoip (default ip-api.com).
async function geoLookup(endpoint, query) {
  const url = endpoint.endsWith("/") ? endpoint + query : endpoint + "/" + query;
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return null;
    const j = await res.json();
    // ip-api.com: { status, country, countryCode, query, ... }
    if (j.status && j.status !== "success") return null;
    return {
      countryCode: j.countryCode || j.country_code || null,
      country: j.country || j.country_name || null,
      ip: j.query || j.ip || query,
      city: j.city || null,
    };
  } catch (e) {
    return null;
  }
}

// Ekstrak host dari URL proxy (http://user:pass@host:port).
function proxyHost(proxyUrl) {
  try {
    return new URL(proxyUrl).hostname;
  } catch (e) {
    return null;
  }
}

// Tentukan IP keluar saat ini (tanpa/ dengan proxy) untuk cek lokasi.
async function currentEgressGeo(endpoint, dispatcher) {
  try {
    const res = await fetch(endpoint.replace(/\/$/, "") + "/", {
      method: "GET",
      ...(dispatcher ? { dispatcher } : {}),
    });
    if (!res.ok) return null;
    const j = await res.json();
    if (j.status && j.status !== "success") return null;
    return { countryCode: j.countryCode, country: j.country, ip: j.query, city: j.city };
  } catch (e) {
    return null;
  }
}

/**
 * Pilih dispatcher (proxy) yang cocok dengan expectedCountry.
 * - proxy.enabled=false  -> koneksi langsung; tetap verifikasi geo IP egress.
 * - proxy.enabled=true   -> cek tiap proxy, pakai yang countryCode == expectedCountry.
 * Mengembalikan { dispatcher, geo, proxyUrl } atau melempar bila tidak ada yang cocok.
 */
export async function selectProxy(config) {
  const geoCfg = config.geoip || {};
  const expected = (geoCfg.expectedCountry || "").toUpperCase();
  const endpoint = geoCfg.lookupEndpoint || "http://ip-api.com/json/";
  const proxyCfg = config.proxy || {};

  // Mode langsung
  if (!proxyCfg.enabled || !Array.isArray(proxyCfg.list) || proxyCfg.list.length === 0) {
    if (!geoCfg.enabled) {
      log.info("GeoIP nonaktif, koneksi langsung tanpa cek lokasi.");
      return { dispatcher: undefined, geo: null, proxyUrl: null };
    }
    const geo = await currentEgressGeo(endpoint, undefined);
    if (!geo) {
      log.warn("GeoIP: gagal menentukan lokasi IP langsung. Lanjut tanpa verifikasi.");
      return { dispatcher: undefined, geo: null, proxyUrl: null };
    }
    log.info(`GeoIP IP langsung: ${geo.ip} (${geo.countryCode}/${geo.city || "-"}).`);
    if (expected && geo.countryCode && geo.countryCode.toUpperCase() !== expected) {
      log.warn(
        `Lokasi IP (${geo.countryCode}) != akun (${expected}). ` +
          `Risiko deteksi 'lokasi loncat'. Pertimbangkan proxy ${expected}.`
      );
    } else if (expected) {
      log.ok(`Lokasi IP cocok dengan akun (${expected}).`);
    }
    return { dispatcher: undefined, geo, proxyUrl: null };
  }

  // Mode proxy: cari proxy pertama yang lokasinya cocok expectedCountry.
  log.info(`GeoIP: mengevaluasi ${proxyCfg.list.length} proxy untuk lokasi ${expected || "(apa saja)"}...`);
  for (const proxyUrl of proxyCfg.list) {
    const host = proxyHost(proxyUrl);
    if (!host) {
      log.warn(`Proxy tidak valid, dilewati: ${proxyUrl}`);
      continue;
    }
    const dispatcher = new ProxyAgent(proxyUrl);
    // Cek geo lewat IP egress proxy itu sendiri (lebih akurat daripada lookup host).
    const geo = await currentEgressGeo(endpoint, dispatcher);
    if (!geo) {
      log.warn(`Proxy ${host}: gagal cek lokasi, dilewati.`);
      continue;
    }
    const cc = (geo.countryCode || "").toUpperCase();
    if (!expected || cc === expected) {
      log.ok(`Proxy terpilih ${host} -> ${geo.ip} (${cc}/${geo.city || "-"}).`);
      return { dispatcher, geo, proxyUrl };
    }
    log.info(`Proxy ${host} lokasinya ${cc} != ${expected}, cari berikutnya.`);
  }

  throw new Error(
    `Tidak ada proxy yang cocok dengan lokasi akun (${expected}). ` +
      `Tambahkan proxy ${expected} di config.proxy.list atau matikan proxy.`
  );
}
