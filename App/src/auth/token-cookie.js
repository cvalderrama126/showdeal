const crypto = require("crypto");

function getCookieKey() {
  const secret = process.env.JWT_COOKIE_SECRET || process.env.JWT_SECRET;
  if (!secret || typeof secret !== "string") {
    throw new Error("JWT_COOKIE_SECRET or JWT_SECRET is required");
  }
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

function sealToken(token) {
  const key = getCookieKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(token), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function unsealToken(value) {
  const key = getCookieKey();
  const [ivEncoded, tagEncoded, encryptedEncoded] = String(value || "").split(".");
  if (!ivEncoded || !tagEncoded || !encryptedEncoded) return null;

  try {
    const iv = Buffer.from(ivEncoded, "base64url");
    const tag = Buffer.from(tagEncoded, "base64url");
    const encrypted = Buffer.from(encryptedEncoded, "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

function getCookieValue(req, name) {
  const cookieHeader = String(req?.headers?.cookie || "");
  if (!cookieHeader) return null;

  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [rawName, ...rest] = part.split("=");
    if (String(rawName || "").trim() !== name) continue;
    return decodeURIComponent(rest.join("=").trim());
  }
  return null;
}

module.exports = { sealToken, unsealToken, getCookieValue };
