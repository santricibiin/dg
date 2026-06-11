import crypto from "crypto";

const ALGO = "aes-256-gcm";

function getKey() {
  const secret = process.env.ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("ENCRYPTION_KEY/AUTH_SECRET tidak diatur atau terlalu pendek.");
  }
  // derive a stable 32-byte key from the secret
  return crypto.createHash("sha256").update(String(secret)).digest();
}

/**
 * Encrypt plaintext → "v1:<iv_b64>:<tag_b64>:<data_b64>".
 * Returns "" for empty input.
 */
export function encryptSecret(plain) {
  if (plain == null || plain === "") return "";
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

/**
 * Decrypt value produced by encryptSecret. If the value is not in the
 * expected format (e.g. legacy plaintext cookie), it is returned as-is.
 */
export function decryptSecret(value) {
  if (value == null || value === "") return "";
  const str = String(value);
  if (!str.startsWith("v1:")) return str; // legacy plaintext — return unchanged
  try {
    const [, ivB64, tagB64, dataB64] = str.split(":");
    const key = getKey();
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return "";
  }
}

export function isEncrypted(value) {
  return typeof value === "string" && value.startsWith("v1:");
}
