import crypto from "crypto";

/**
 * Normalisasi email untuk mencegah pendaftaran ganda via alias.
 * - lowercase + trim
 * - Gmail/Googlemail: buang titik di local-part, buang segala setelah "+",
 *   samakan domain googlemail.com -> gmail.com
 * - Provider lain: hanya buang segala setelah "+" (plus-addressing umum)
 */
export function normalizeEmail(raw) {
  const email = String(raw || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at === -1) return email;

  let local = email.slice(0, at);
  let domain = email.slice(at + 1);

  // buang plus-addressing: "budi+promo" -> "budi"
  const plus = local.indexOf("+");
  if (plus !== -1) local = local.slice(0, plus);

  const isGmail = domain === "gmail.com" || domain === "googlemail.com";
  if (isGmail) {
 local = local.replace(/\./g, ""); // titik tak bermakna di gmail
    domain = "gmail.com";
  }

  return `${local}@${domain}`;
}

/** Hash stabil untuk dijadikan sidik jari (email/cookie), aman disimpan. */
export function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}
