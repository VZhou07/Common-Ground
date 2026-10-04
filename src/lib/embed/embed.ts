// Embedders. Production: OpenAI text-embedding-3-small at 256 dimensions on
// "Title — description". Fallback: a deterministic hashed word vector with a
// small topic vocabulary, so tests, CI and an OpenAI outage never block play.
// Vectors from different embedders are never mixed: every cache key and the
// pinned file carry the embedder id.
import { createOpenAI } from "@ai-sdk/openai";
import { embedMany } from "ai";
import { BUCKETS } from "../topics/buckets";

export const DIMS = 256;

export interface Embedder {
  id: string;
  embed(texts: string[], signal?: AbortSignal): Promise<Float32Array[]>;
}

export function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n);
  if (n > 0) for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

export const dot = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

// ---------- local fallback ----------

const STOP = new Set("the and for with from that this into its are was were has have also which who their about after over used use known type list form kind commonly called such other one two may can its his her they them than then there these those been being any all most more some only very when where while what each between within under upon form part".split(" "));

export function stem(word: string) {
  let w = word;
  for (let i = 0; i < 2 && w.length > 4; i++) w = w.replace(/(ings|ing|ers|er|ed|ies|es)$/, "").replace(/([^s])s$/, "$1");
  return w;
}
const words = (text: string) => (text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]{3,}/g) || []).filter(w => !STOP.has(w)).map(stem);

function fnv(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Each stemmed vocabulary word points at the buckets that list it, so
// "Slalom — alpine skiing discipline" and "Mountain" share a "sports" axis.
const CONCEPTS = new Map<string, string[]>();
for (const b of BUCKETS) for (const w of words(b.about)) CONCEPTS.set(w, [...(CONCEPTS.get(w) ?? []), b.id]);

function localVector(text: string): Float32Array {
  const v = new Float32Array(DIMS);
  const add = (feature: string, weight: number) => {
    const h = fnv(feature);
    v[h % DIMS] += (h & 0x80000000 ? -1 : 1) * weight;
  };
  const [title, ...rest] = text.split(" — ");
  const parts: [string[], number][] = [[words(title), 1.5], [words(rest.join(" ")), 1]];
  for (const [tokens, weight] of parts) {
    tokens.forEach((t, i) => {
      add(`w:${t}`, weight);
      if (i > 0) add(`b:${tokens[i - 1]}_${t}`, weight * 0.5);
      for (const c of CONCEPTS.get(t) ?? []) add(`c:${c}`, weight * 1.2);
    });
  }
  return normalize(v);
}

export const localEmbedder: Embedder = {
  id: `local-hash-v1-${DIMS}`,
  async embed(texts) { return texts.map(localVector); },
};

// ---------- OpenAI ----------

export function openAIEmbedder(apiKey: string, model = process.env.EMBED_MODEL || "text-embedding-3-small", fetcher?: typeof fetch): Embedder {
  const openai = createOpenAI({ apiKey, fetch: fetcher });
  return {
    id: `${model}-${DIMS}`,
    async embed(texts, signal) {
      const out: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += 512) {
        const { embeddings } = await embedMany({
          model: openai.embedding(model),
          values: texts.slice(i, i + 512),
          providerOptions: { openai: { dimensions: DIMS } },
          maxRetries: 1,
          abortSignal: signal,
        });
        for (const e of embeddings) {
          if (e.length !== DIMS) throw new Error(`Embedding has ${e.length} dimensions, expected ${DIMS}.`);
          out.push(normalize(Float32Array.from(e)));
        }
      }
      return out;
    },
  };
}

let active: Embedder | null = null;
// Auto: OpenAI when a key is configured, otherwise the local fallback.
export function embedder(): Embedder {
  if (active) return active;
  const provider = process.env.EMBED_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "local");
  active = provider === "openai" && process.env.OPENAI_API_KEY ? openAIEmbedder(process.env.OPENAI_API_KEY) : localEmbedder;
  return active;
}
export const setEmbedder = (e: Embedder | null) => { active = e; };
