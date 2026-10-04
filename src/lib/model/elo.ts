// Topic ability and Venn's blind spots (§6.2): one Elo/IRT rating per bucket.
//   a_k += η·(y − σ(a_k − b))
// y = 1 if the turn went right, b = how hard the turn was.
import type { Elo } from "./profile";

export const ETA = 0.3;
export const SHOW_AFTER = 5; // "still mapping" below this many turns
const sigma = (x: number) => 1 / (1 + Math.exp(-x));

// ★ CORE-ELO-1: the update. A hard turn you got right (b high) moves your
// rating a lot; an easy turn you got right barely moves it.
export function eloUpdate(elo: Elo, k: number, y: 0 | 1, b: number): Elo {
  const p = sigma(elo.a[k] - b);
  const a = [...elo.a], n = [...elo.n], info = [...elo.info];
  a[k] = Math.max(-4, Math.min(4, a[k] + ETA * (y - p)));
  n[k] += 1;
  info[k] += p * (1 - p); // Fisher information, for the uncertainty band
  return { a, n, info };
}

export const expected = (elo: Elo, k: number, b: number) => sigma(elo.a[k] - b);

// ±1 standard error, shrinking as evidence comes in; wide until then.
export const uncertainty = (elo: Elo, k: number) => (elo.info[k] > 0 ? Math.min(2, 1 / Math.sqrt(elo.info[k])) : 2);

export type EloRead = { bucket: number; rating: number; n: number; uncertainty: number; status: "mapped" | "still mapping" | "unexplored" };
export function readElo(elo: Elo): EloRead[] {
  return elo.a.map((rating, bucket) => ({
    bucket, rating, n: elo.n[bucket], uncertainty: uncertainty(elo, bucket),
    status: elo.n[bucket] === 0 ? "unexplored" : elo.n[bucket] < SHOW_AFTER ? "still mapping" : "mapped",
  }));
}
