import { createHmac, randomBytes, createHash } from "node:crypto";
import { Pool } from "pg";

const url = process.env.E2E_DATABASE_URL ?? "postgres://postgres@localhost:5432/ithub_e2e";

/** Creates an invite straight in the database and returns its one-time token. */
export async function makeInvite(email: string, name: string, role: "tech" | "admin") {
  const token = randomBytes(24).toString("base64url");
  const pool = new Pool({ connectionString: url });
  await pool.query(
    `insert into invite (token_hash, email, name, role, expires_at) values ($1, $2, $3, $4, now() + interval '7 days')`,
    [createHash("sha256").update(token).digest("hex"), email, name, role],
  );
  await pool.end();
  return token;
}

function base32(s: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** RFC 6238 code, as an authenticator app would show it. */
export function totp(secret: string, at = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", base32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}
