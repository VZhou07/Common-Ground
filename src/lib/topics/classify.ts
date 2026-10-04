// Page → buckets and interest text → buckets (§5).
//   pinned pages: Wikimedia's outlink topic model, run offline (data/topics.json)
//   live pages:   cosine similarity to bucket anchors
// An anchor is the mean embedding of the tagged pages in that bucket plus the
// bucket's own descriptor text.
import { isSensitiveText } from "../wiki/policy";
import { topicTags } from "../wiki/repository";
import { dot, normalize, DIMS } from "../embed/embed";
import { activeEmbedderId, pageText, vectors } from "../embed/store";
import { BUCKETS, BUCKET_IDS, type BucketId } from "./buckets";

let anchorsFor: { id: string; anchors: Promise<Float32Array[]> } | null = null;

export function anchors(): Promise<Float32Array[]> {
  const id = activeEmbedderId();
  if (anchorsFor?.id === id) return anchorsFor.anchors;
  const work = (async () => {
    const tagged = Object.entries(topicTags()).filter(([, t]) => t.outlink.length);
    const pageVecs = await vectors(tagged.map(([title, t]) => pageText(title, t.description)));
    const aboutVecs = await vectors(BUCKETS.map(b => `${b.label} — ${b.about}`));
    return BUCKETS.map((b, k) => {
      const sum = new Float32Array(DIMS);
      let members = 0;
      tagged.forEach(([, t], i) => {
        if (t.outlink[0]?.bucket !== b.id) return;
        members++;
        for (let d = 0; d < DIMS; d++) sum[d] += pageVecs[i][d];
      });
      // The descriptor counts as a quarter of the members (at least one page's worth).
      const w = Math.max(1, members / 4);
      for (let d = 0; d < DIMS; d++) sum[d] += w * aboutVecs[k][d];
      return normalize(sum);
    });
  })();
  anchorsFor = { id, anchors: work };
  work.catch(() => { if (anchorsFor?.anchors === work) anchorsFor = null; });
  return work;
}

// Cosines to the 12 anchors → a probability over buckets. z-scoring makes the
// spread comparable across embedders (local vectors and OpenAI's differ a lot).
export function probsFromCosines(cos: number[], sharpness = 1.6): number[] {
  const mean = cos.reduce((s, x) => s + x, 0) / cos.length;
  const sd = Math.sqrt(cos.reduce((s, x) => s + (x - mean) ** 2, 0) / cos.length) || 1;
  const z = cos.map(x => sharpness * (x - mean) / sd);
  const m = Math.max(...z);
  const e = z.map(x => Math.exp(x - m));
  const total = e.reduce((s, x) => s + x, 0);
  return e.map(x => x / total);
}

export type Tagged = { probs: number[]; top: BucketId[] };

export function tagVector(v: Float32Array, a: Float32Array[], title?: string): Tagged {
  let probs = probsFromCosines(a.map(x => dot(v, x)));
  const pinned = title ? topicTags()[title] : undefined;
  if (pinned?.outlink.length) {
    // Offline labels dominate; the anchor read fills in second choices.
    const total = pinned.outlink.reduce((s, o) => s + o.score, 0);
    probs = probs.map((p, k) => 0.3 * p + 0.7 * (pinned.outlink.find(o => o.bucket === BUCKET_IDS[k])?.score ?? 0) / total);
  }
  const ranked = BUCKET_IDS.map((id, k) => [id, probs[k]] as const).sort((x, y) => y[1] - x[1]);
  // The second tag only when it carries real weight, so a math page isn't
  // shown as "Math & logic, Film, TV & games" on noise.
  const top = ranked.slice(0, 2).filter(([, p], i) => i === 0 || (p >= 0.12 && p >= 0.35 * ranked[0][1])).map(([id]) => id);
  return { probs, top };
}

export async function tagPages(items: { title: string; description: string }[], signal?: AbortSignal) {
  const [a, vs] = await Promise.all([anchors(), vectors(items.map(i => pageText(i.title, i.description)), signal)]);
  return items.map((item, i) => ({ vector: vs[i], ...tagVector(vs[i], a, item.title) }));
}

// ★ CORE-SAFE-5: interest text is embedded and immediately reduced to bucket
// labels. Sensitive or unmappable text becomes "no stated interest" ([]).
export async function interestBuckets(text: string): Promise<BucketId[]> {
  const clean = text.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 30);
  if (clean.length < 2 || isSensitiveText(clean)) return [];
  const [a, [v]] = await Promise.all([anchors(), vectors([clean])]);
  const cos = a.map(x => dot(v, x));
  const order = BUCKET_IDS.map((_, k) => k).sort((x, y) => cos[y] - cos[x]);
  const mean = cos.reduce((s, x) => s + x, 0) / cos.length;
  const sd = Math.sqrt(cos.reduce((s, x) => s + (x - mean) ** 2, 0) / cos.length) || 1;
  const z = (k: number) => (cos[k] - mean) / sd;
  // Unmappable: nothing stands out, or nothing is similar at all.
  const floor = activeEmbedderId().startsWith("local") ? 0.08 : 0.15;
  if (cos[order[0]] < floor || z(order[0]) < 1.8) return [];
  const out: BucketId[] = [BUCKET_IDS[order[0]]];
  if (z(order[1]) >= 1.4 && z(order[0]) - z(order[1]) < 0.8) out.push(BUCKET_IDS[order[1]]);
  return out;
}
