// The encrypted game token and Venn's commitment (ported from v1).
// The server is stateless: the whole game lives in an AES-256-GCM token the
// browser can carry but cannot read or forge.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";

let devKey: Buffer | null = null;
function key(): Buffer {
  const secret = process.env.GAME_SECRET;
  if (secret && /^[a-f0-9]{64}$/i.test(secret)) return Buffer.from(secret, "hex");
  if (process.env.NODE_ENV === "production") throw new Error("Set GAME_SECRET to 32 random bytes encoded as 64 hex characters.");
  // Local development only: a per-process key (tokens die with the process).
  return devKey ??= randomBytes(32);
}

// ★ CORE-SEAL-1: commitment = SHA-256 of [move, nonce]. Venn commits before
// you move; at the reveal your browser recomputes the hash and checks it.
export function commitment(move: string, nonce: string) {
  return createHash("sha256").update(JSON.stringify([move, nonce])).digest("hex");
}
export const nonce = () => randomBytes(24).toString("hex");

const AAD = Buffer.from("common-ground-v2-token");
// Compressed, then padded to a 2 KB bucket so the token's length can't hint
// at which titles the sealed state contains.
const BUCKET = 2048;
export function encrypt(state: unknown): string {
  const packed = deflateRawSync(Buffer.from(JSON.stringify(state), "utf8"));
  const plain = Buffer.alloc(Math.ceil((packed.length + 4) / BUCKET) * BUCKET);
  plain.writeUInt32BE(packed.length, 0);
  packed.copy(plain, 4);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(AAD);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

export function decrypt<T>(token: string): T {
  const raw = Buffer.from(token, "base64url");
  if (raw.length < 29 || raw.length > 120_000) throw new Error("Invalid game token.");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAAD(AAD);
  decipher.setAuthTag(raw.subarray(12, 28));
  const plain = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
  const length = plain.readUInt32BE(0);
  if (length > plain.length - 4) throw new Error("Invalid game token.");
  return JSON.parse(inflateRawSync(plain.subarray(4, 4 + length), { maxOutputLength: 2_000_000 }).toString("utf8")) as T;
}
