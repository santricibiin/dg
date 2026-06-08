// UA + header fingerprint generator.
// Untuk mode fetch murni, yang berpengaruh ke deteksi hanyalah header HTTP
// (User-Agent, Accept-Language, sec-ch-ua, dll), bukan canvas/WebGL.
// Di-port ringkas dari fingerprint/generator.ts (konsisten OS Windows).

const CHROME_VERSIONS = ["120", "121", "122", "123", "124", "125", "126"];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Profil Windows agar konsisten dengan akun lokal Indonesia (paling umum).
export function generateFingerprint(seedUA) {
  const major = randomChoice(CHROME_VERSIONS);
  const ua =
    seedUA && seedUA.trim()
      ? seedUA.trim()
      : `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;

  // Ekstrak versi major dari UA (jika user kasih UA sendiri).
  const m = ua.match(/Chrome\/(\d+)/);
  const ver = m ? m[1] : major;

  return {
    userAgent: ua,
    secChUa: `"Chromium";v="${ver}", "Google Chrome";v="${ver}", "Not?A_Brand";v="24"`,
    secChUaMobile: "?0",
    secChUaPlatform: '"Windows"',
    acceptLanguage: "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  };
}

// Header umum yang menyerupai XHR axios dari SPA Digiflazz.
export function browserHeaders(fp, referer) {
  return {
    "User-Agent": fp.userAgent,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": fp.acceptLanguage,
    "X-Requested-With": "XMLHttpRequest",
    "sec-ch-ua": fp.secChUa,
    "sec-ch-ua-mobile": fp.secChUaMobile,
    "sec-ch-ua-platform": fp.secChUaPlatform,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    Origin: "https://member.digiflazz.com",
    Referer: referer || "https://member.digiflazz.com/buyer-area/product",
  };
}
