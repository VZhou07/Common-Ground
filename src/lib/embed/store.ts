// Embedding store: the pinned int8 file (built offline by scripts/prepare.ts)
// plus a live cache for pages players wander onto. Cosine similarity is a
// dot product because every vector is L2-normalized.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DIMS, embedder, normalize } from "./embed";

export const pageText = (title: string, description = "") => description.trim() ? `${title} — ${description.trim()}` : title;

type PinnedFile = { id: string; index: Map<string, number>; buf: Buffer };
let pinned: PinnedFile | null | undefined;
const DATA = () => path.join(process.cwd(), "data");

function loadPinned(): PinnedFile | null {
  if (pinned !== undefined) return pinned;
  const meta = path.join(DATA(), "embeddings.json"), bin = path.join(DATA(), "embeddings.bin");
  if (!existsSync(meta) || !existsSync(bin)) return (pinned = null);
  const { id, dims, texts } = JSON.parse(readFileSync(meta, "utf8")) as { id: string; dims: number; texts: string[] };
  const buf = readFileSync(bin);
  if (dims !== DIMS || buf.length !== texts.length * (DIMS + 4)) return (pinned = null);
  return (pinned = { id, index: new Map(texts.map((t, i) => [t, i])), buf });
}
export const resetPinned = () => { pinned = undefined; };

// int8 with one float32 scale per vector: 260 bytes instead of 1 KB.
export function encodeInt8(vectors: Float32Array[]): Buffer {
  const buf = Buffer.alloc(vectors.length * (DIMS + 4));
  vectors.forEach((v, i) => {
    const base = i * (DIMS + 4);
    let max = 0;
    for (const x of v) max = Math.max(max, Math.abs(x));
    const scale = max / 127 || 1;
    buf.writeFloatLE(scale, base);
    for (let k = 0; k < DIMS; k++) buf.writeInt8(Math.max(-127, Math.min(127, Math.round(v[k] / scale))), base + 4 + k);
  });
  return buf;
}
function decode(file: PinnedFile, i: number): Float32Array {
  const base = i * (DIMS + 4);
  const scale = file.buf.readFloatLE(base);
  const v = new Float32Array(DIMS);
  for (let k = 0; k < DIMS; k++) v[k] = file.buf.readInt8(base + 4 + k) * scale;
  return normalize(v);
}

const cache = new Map<string, Float32Array>();
const MAX_CACHE = 80_000;
function lookup(id: string, text: string): Float32Array | undefined {
  const key = `${id}\u0000${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const file = loadPinned();
  if (file && file.id === id) {
    const i = file.index.get(text);
    if (i !== undefined) {
      const v = decode(file, i);
      put(id, text, v);
      return v;
    }
  }
  return undefined;
}
function put(id: string, text: string, v: Float32Array) {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(`${id}\u0000${text}`, v);
}

// Vectors for many texts at once: cache and pinned file first, then a single
// batched call for whatever is missing.
export async function vectors(texts: string[], signal?: AbortSignal): Promise<Float32Array[]> {
  const e = embedder();
  const missing = [...new Set(texts.filter(t => !lookup(e.id, t)))];
  if (missing.length) {
    const fresh = await e.embed(missing, signal);
    missing.forEach((t, i) => put(e.id, t, fresh[i]));
  }
  return texts.map(t => lookup(e.id, t)!);
}

export const activeEmbedderId = () => embedder().id;
