// Closeness and divergence (§6.1). Everything here is deterministic.
//   c(a, b)   calibrated cosine: the percentile of cos(a, b) among all pairs
//             of pinned pages, so 0.5 means "as close as a typical pair"
//   shared    exact: a playable link on both pages (a meeting is possible)
import { dot } from "../embed/embed";
import { activeEmbedderId, pageText, vectors } from "../embed/store";
import { pinnedPages } from "../wiki/repository";
import type { Article } from "../wiki/types";

// ★ CORE-CLOSE-1: τ, the smallest change in closeness that counts as moving
// toward or away from each other (5 percentile points).
export const TAU = 0.05;

let calibration: { id: string; quantiles: Promise<number[]> } | null = null;

export function quantilesOf(values: number[], points = 101): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return Array.from({ length: points }, (_, i) => sorted[Math.min(sorted.length - 1, Math.round(i * (sorted.length - 1) / (points - 1)))]);
}

// ★ CORE-CLOSE-2: percentile calibration across every pair of pinned pages.
export function calibrate(): Promise<number[]> {
  const id = activeEmbedderId();
  if (calibration?.id === id) return calibration.quantiles;
  const work = (async () => {
    const pages = Object.values(pinnedPages());
    const vs = await vectors(pages.map(p => pageText(p.title, p.description)));
    const cos: number[] = [];
    for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) cos.push(dot(vs[i], vs[j]));
    return cos.length ? quantilesOf(cos) : quantilesOf([-0.1, 0, 0.1, 0.2, 0.3]);
  })();
  calibration = { id, quantiles: work };
  work.catch(() => { if (calibration?.quantiles === work) calibration = null; });
  return work;
}

// Map a raw cosine to [0, 1] by interpolating within the quantile table.
export function percentile(cos: number, q: number[]): number {
  if (cos <= q[0]) return 0;
  if (cos >= q[q.length - 1]) return 1;
  let lo = 0, hi = q.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (q[mid] <= cos) lo = mid; else hi = mid; }
  const span = q[hi] - q[lo];
  return (lo + (span > 0 ? (cos - q[lo]) / span : 0)) / (q.length - 1);
}

export type Calibrated = (a: Float32Array, b: Float32Array) => number;
export async function closenessFn(): Promise<Calibrated> {
  const q = await calibrate();
  return (a, b) => percentile(dot(a, b), q);
}

export const playableTitles = (a: Article) => a.links.filter(l => l.policy !== "blocked").map(l => l.title);

// ★ CORE-CLOSE-3: the shared-link flag is exact, never estimated. Only this
// can turn on "There's a page you both link to" — meeting is then possible.
export function sharedLinks(you: Article, venn: Article): string[] {
  const theirs = new Set(playableTitles(venn));
  return playableTitles(you).filter(t => theirs.has(t) && t !== you.title && t !== venn.title);
}

export type OptionGain = { title: string; gain: number; order: number };

// ★ CORE-CLOSE-4: gain(y) = c(y, venn) − c(you, venn), judged against Venn's
// current page: the one thing about Venn the player can actually see.
export function optionGains(options: { title: string; vector: Float32Array; order: number }[], youVec: Float32Array, vennVec: Float32Array, c: Calibrated): OptionGain[] {
  const base = c(youVec, vennVec);
  return options.map(o => ({ title: o.title, order: o.order, gain: c(o.vector, vennVec) - base }));
}

// ★ CORE-CLOSE-5: turn difficulty b in [−2, 2]: scarce converging options and
// a best option buried deep in the article both make a turn harder.
export function turnDifficulty(gains: OptionGain[]): { b: number; convergingExists: boolean; best: OptionGain | null } {
  if (!gains.length) return { b: 0, convergingExists: false, best: null };
  const converging = gains.filter(g => g.gain > TAU);
  const best = gains.reduce((m, g) => (g.gain > m.gain ? g : m), gains[0]);
  if (!converging.length) return { b: 2, convergingExists: false, best };
  const scarcity = 1 - Math.min(1, converging.length / gains.length / 0.25); // 25%+ converging = easy
  const maxOrder = Math.max(1, ...gains.map(g => g.order));
  const depth = Math.min(1, best.order / maxOrder);
  return { b: 4 * (0.6 * scarcity + 0.4 * depth) - 2, convergingExists: true, best };
}

export type MoveVerdict = "converged" | "diverged" | "neutral";

// ★ CORE-CLOSE-6: your move is judged by your own contribution (gain toward
// Venn's page), so Venn's move can't make you look bad. "Diverged" requires
// that a converging option existed: no blame on impossible turns.
export function verdict(chosenGain: number, convergingExists: boolean): MoveVerdict {
  if (chosenGain > TAU) return "converged";
  if (chosenGain < -TAU && convergingExists) return "diverged";
  return "neutral";
}

// ★ CORE-CLOSE-7: the drift counter uses the joint change Δc (both moves):
// +1 when we drifted apart, reset when we came together, unchanged otherwise.
export function nextDrift(drift: number, dc: number): number {
  if (dc < -TAU) return drift + 1;
  if (dc > TAU) return 0;
  return drift;
}
