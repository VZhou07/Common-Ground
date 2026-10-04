// Topic interest (§6.2): Dirichlet counts over the 12 buckets.
//   prior:    α₀ = 2 on each stated bucket (plus a small floor everywhere)
//   revealed: each intentional move adds (1 − r) to its destination's bucket
// Interest and ability are separate models: liking a topic isn't the same as
// navigating it well.
import { BUCKET_IDS, type BucketId } from "../topics/buckets";
import type { Profile } from "./profile";

export const ALPHA0 = 2;
const FLOOR = 0.25;

export function priorCounts(stated: BucketId[]): number[] {
  return BUCKET_IDS.map(id => FLOOR + (stated.includes(id) ? ALPHA0 : 0));
}

// ★ CORE-INTEREST-1: the posterior mean = prior + revealed counts, normalized.
export function interestWeights(i: Profile["interest"]): number[] {
  const alpha = priorCounts(i.stated).map((a, k) => a + i.counts[k]);
  const total = alpha.reduce((s, x) => s + x, 0);
  return alpha.map(a => a / total);
}

// ★ CORE-INTEREST-2: one intentional move. Random-looking clicks (high r),
// step-backs and sensitive pages teach nothing.
export function addMove(i: Profile["interest"], bucket: BucketId | null, r: number): Profile["interest"] {
  if (!bucket) return i;
  const k = BUCKET_IDS.indexOf(bucket);
  const counts = [...i.counts];
  counts[k] = Math.min(10_000, counts[k] + Math.max(0, 1 - r));
  return { ...i, counts };
}

// Stated versus revealed: the prior alone vs the moves alone.
export function statedVsRevealed(i: Profile["interest"]) {
  const total = i.counts.reduce((s, x) => s + x, 0);
  const revealed = i.counts.map(c => (total > 0 ? c / total : 0));
  const order = BUCKET_IDS.map((_, k) => k).sort((a, b) => revealed[b] - revealed[a]);
  const top = total > 0 ? order.filter(k => revealed[k] > 0).slice(0, 3).map(k => ({ bucket: BUCKET_IDS[k], share: revealed[k] })) : [];
  const agrees = i.stated.length > 0 && top.length > 0 && i.stated.includes(top[0].bucket);
  return { stated: i.stated, revealed: top, moves: total, agrees };
}
