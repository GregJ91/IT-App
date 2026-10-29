import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// API keys for UniFi are stored encrypted, with a key derived from the app's secret.
const key = () => createHash("sha256").update(`ithub-net:${process.env.BETTER_AUTH_SECRET ?? ""}`).digest();

export function encryptSecret(plain: string) {
  if (!plain) return "";
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decryptSecret(stored: string) {
  if (!stored) return "";
  const [iv, tag, data] = stored.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

/** "abcd…wxyz" so people can tell which key is saved without seeing it. */
export function hint(plain: string) {
  return plain.length > 8 ? `${plain.slice(0, 4)}…${plain.slice(-4)}` : plain ? "••••" : "";
}
