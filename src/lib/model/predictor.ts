// How Venn predicts your clicks (§6.2). Nothing is trained offline: this is
// a 6-weight conditional logit per player, updated in code after every move,
// with a lapse rate (some clicks are random) and a calibrated trust level.
import { FEATURES, THETA_POP, type Profile } from "./profile";

export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export const dotv = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
export function softmax(xs: number[]): number[] {
  if (!xs.length) return [];
  const m = Math.max(...xs);
  const e = xs.map(x => Math.exp(x - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map(x => x / s);
}

// Raw per-option features, before scaling. The order matches FEATURES.
export type RawFeatures = { gain: number; interest: number; prominence: number; hint: 0 | 1; shared: 0 | 1; back: 0 | 1 };

// Continuous features are z-scored within the options on offer (so a page
// full of good options doesn't inflate them) and clipped; binary ones stay 0/1
// (z-scoring a rare 1 turns it into a 15σ outlier, a v1 lesson).
export function featureMatrix(raw: RawFeatures[]): number[][] {
  const z = (key: "gain" | "interest" | "prominence") => {
    const xs = raw.map(r => r[key]);
    const mean = xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, xs.length));
    return xs.map(x => (sd > 1e-9 ? clamp((x - mean) / sd, -3, 3) : 0));
  };
  const [g, i, p] = [z("gain"), z("interest"), z("prominence")];
  return raw.map((r, k) => [g[k], i[k], p[k], r.hint, r.shared, r.back]);
}

type Predictor = Profile["predictor"];

// ε, the share of clicks that look random: Beta(2, 8) prior, about 20%.
export const lapse = (p: Predictor) => (2 + p.da) / (10 + p.da + p.db);

// ★ CORE-PRED-2: P(you click y) = trust·(ε·uniform + (1−ε)·softmax(θ·φ)) +
// (1−trust)·uniform. Trust is how many bits better than chance Venn has
// actually been, so its confidence stays calibrated when you're hard to read.
export function predict(p: Predictor, phis: number[][], theta = p.theta): number[] {
  if (!phis.length) return [];
  const soft = softmax(phis.map(f => dotv(theta, f)));
  const e = lapse(p), u = 1 / phis.length, trust = clamp(p.bits);
  return soft.map(s => trust * (e * u + (1 - e) * s) + (1 - trust) * u);
}

// ★ CORE-PRED-3: learning rate 0.1 and a 2% pull back toward the average
// player each step. r = P(this click was random): random-looking clicks barely
// teach, and they raise the lapse rate instead.
export const LEARNING_RATE = 0.1;
// thetaOffset/extra: the memory adjustments Venn applied this turn. Learning
// predicts with them but only updates θ, so θ learns what memory doesn't
// already explain (consolidated theories aren't re-learned on top).
export function learn(p: Predictor, phis: number[][], chosen: number, thetaOffset: number[] = [], extra: number[] = []): { predictor: Predictor; r: number } {
  const eff = p.theta.map((w, k) => w + (thetaOffset[k] ?? 0));
  const logits = phis.map((f, i) => dotv(eff, f) + (extra[i] ?? 0));
  const soft = softmax(logits);
  const e = lapse(p), u = 1 / phis.length, trust = clamp(p.bits);
  const issued = soft.map(s => trust * (e * u + (1 - e) * s) + (1 - trust) * u);
  const baseline = predict({ ...p, theta: [...THETA_POP], da: 0, db: 0, bits: 0.5 }, phis);
  const argmax = (xs: number[]) => xs.indexOf(Math.max(...xs));
  const pChosen = e * u + (1 - e) * soft[chosen];
  const r = (e * u) / pChosen;
  const mean = p.theta.map((_, k) => phis.reduce((s, f, i) => s + soft[i] * f[k], 0));
  return {
    r,
    predictor: {
      theta: p.theta.map((w, k) => clamp(w + LEARNING_RATE * (1 - r) * (phis[chosen][k] - mean[k]) - 0.02 * (w - THETA_POP[k]), -5, 5)),
      da: 0.98 * p.da + r,
      db: 0.98 * p.db + (1 - r),
      bits: clamp(0.85 * p.bits + 0.15 * Math.log2(Math.max(1e-6, issued[chosen]) / u), -5, 5),
      turns: p.turns + 1,
      hits: p.hits + Number(argmax(issued) === chosen),
      baseHits: p.baseHits + Number(argmax(baseline) === chosen),
    },
  };
}

export const featureIndex = (f: (typeof FEATURES)[number]) => FEATURES.indexOf(f);
