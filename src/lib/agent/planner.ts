// Venn's planner (§7 steps 2-4). Pure code: it scores every legal move,
// builds a shortlist of moves with distinct roles, and decides whether the
// call is close enough to be worth asking the LLM.
import { BUCKET_IDS, VENN_TASTE, type BucketId } from "../topics/buckets";
import { TAU } from "../closeness/closeness";
import { clamp, dotv, featureMatrix, lapse, type RawFeatures } from "../model/predictor";
import type { Profile } from "../model/profile";
import { hintFor, type Hint, type Stance } from "../voice/lines";
import type { Difficulty } from "../game/rules";
import type { Perception } from "./perceive";

// Memory items adjust the prediction in typed ways (§8 table).
export type Adjustment = {
  thetaDelta?: number[]; // theory: a feature-weight delta
  bucketBonus?: number[]; // convention: a logit bonus for options in a bucket
  convergeShift?: number[]; // topicStat: a logit shift for converging options in a bucket
};

const MATH = BUCKET_IDS.indexOf(VENN_TASTE);
export const K_TOP = 12;
export const M_MEET = 1;
export const LAMBDA0 = 0.25;
const PLAN_W = 0.15, ROUTE_W = 0.2, SCRIPT_W = 0.4, LEGIBLE_W = 0.12, RESCUE_W = 0.5, REVISIT = 0.25, SENSITIVE = 0.5;
export const GATE_MARGIN = 0.15;
export const GATE_ENTROPY = 0.85;

// Does option y do what the hint suggested? (the follows_hint feature)
export function followsHint(hint: Hint | null, p: Perception, i: number): 0 | 1 {
  if (!hint || hint.difficulty === "hard" || !hint.text) return 0;
  const y = p.yourOptions[i];
  if (hint.difficulty === "easy" || hint.stance === "lead") return hint.bucket && y.top.includes(hint.bucket) ? 1 : 0;
  if (hint.stance === "hold") return p.gains[i] > TAU ? 1 : 0;
  return p.you.top.includes(y.top[0]) ? 1 : 0; // follow: "I'm coming your way" → stay on your side
}

export function rawFeatures(p: Perception, interest: number[], hint: Hint | null): RawFeatures[] {
  const maxOrder = Math.max(1, ...p.yourOptions.map(o => o.order));
  return p.yourOptions.map((y, i) => ({
    gain: p.gains[i],
    interest: y.probs.reduce((s, q, k) => s + q * interest[k], 0),
    prominence: 1 - y.order / maxOrder + (y.section === "Introduction" ? 0.2 : 0),
    hint: followsHint(hint, p, i),
    shared: p.shared.has(y.title) ? 1 : 0,
    back: y.back ? 1 : 0,
  }));
}

// ★ CORE-PRED-4: your predicted click distribution, with memory applied as
// typed adjustments to the logits (theory → θ, convention → bucket bonus,
// topicStat → converging-in-bucket shift), then lapse and trust mixing.
export function yourDistribution(p: Perception, profile: Profile, interest: number[], hint: Hint | null, adjust: Adjustment = {}): number[] {
  const n = p.yourOptions.length;
  if (!n) return [];
  const phis = featureMatrix(rawFeatures(p, interest, hint));
  const theta = profile.predictor.theta.map((w, k) => w + (adjust.thetaDelta?.[k] ?? 0));
  const logits = phis.map((f, i) => {
    const y = p.yourOptions[i];
    const k = BUCKET_IDS.indexOf(y.top[0]);
    let l = dotv(theta, f);
    if (adjust.bucketBonus) l += adjust.bucketBonus[k] ?? 0;
    if (adjust.convergeShift && p.gains[i] > TAU) l += adjust.convergeShift[k] ?? 0;
    return l;
  });
  const m = Math.max(...logits);
  const e = logits.map(x => Math.exp(x - m));
  const s = e.reduce((a, b) => a + b, 0);
  const eps = lapse(profile.predictor), u = 1 / n, trust = clamp(profile.predictor.bits);
  return e.map(x => trust * (eps * u + (1 - eps) * (x / s)) + (1 - trust) * u);
}

// The predicted bucket of your move: Σ P(y)·buckets(y).
export function bucketDistribution(p: Perception, dist: number[]): number[] {
  const out = BUCKET_IDS.map(() => 0);
  p.yourOptions.forEach((y, i) => y.probs.forEach((q, k) => { out[k] += dist[i] * q; }));
  return out;
}
export const entropyNorm = (d: number[]) => -d.reduce((s, x) => s + (x > 0 ? x * Math.log(x) : 0), 0) / Math.log(d.length);

export type Scored = {
  title: string; index: number; V: number;
  parts: { meet: number; follow: number; taste: number; plan: number; rescue: number; penalty: number };
  hint: Hint;
};
export type Role = "best" | "follow" | "lead" | "meet" | "rescue";
export type Candidate = Scored & { roles: Role[] };

export type PlanInput = {
  p: Perception; profile: Profile; interest: number[]; difficulty: Difficulty; drift: number;
  vennTrail: string[]; routeNext: string | null; seed: string; adjust?: Adjustment;
  scripted?: boolean; // the tutorial: Venn keeps to its known route so a first game lands
};
export type Plan = {
  stance: Stance; rescue: boolean; scored: Scored[]; best: Scored; shortlist: Candidate[];
  base: number[]; // your predicted distribution with no hint (for stance)
  gate: { margin: number; entropy: number; deliberate: boolean; reason: string };
  lambda: number;
};

// ★ CORE-PLAN-2: stance from the prediction. Hold if you're predicted to come
// toward Venn; follow if your direction is confident and following converges;
// otherwise lead. Three diverging turns in a row force lead (rescue).
export function stanceOf(p: Perception, base: number[], drift: number): { stance: Stance; confidence: number; expGain: number } {
  const buckets = bucketDistribution(p, base);
  const confidence = Math.max(...buckets);
  const expGain = base.reduce((s, q, i) => s + q * p.gains[i], 0);
  if (drift >= 3) return { stance: "lead", confidence, expGain };
  if (expGain > TAU && confidence >= 0.3) return { stance: "hold", confidence, expGain };
  if (confidence >= 0.35) return { stance: "follow", confidence, expGain };
  return { stance: "lead", confidence, expGain };
}

const topK = (dist: number[], k: number) => dist.map((q, i) => [q, i] as const).sort((a, b) => b[0] - a[0]).slice(0, k);

export function plan(input: PlanInput): Plan {
  const { p, profile, interest, difficulty, drift, vennTrail, routeNext, seed, adjust } = input;
  const base = yourDistribution(p, profile, interest, null, adjust);
  const { stance } = stanceOf(p, base, drift);
  const rescue = drift >= 3;
  // ★ CORE-PLAN-3: λ_t = λ₀·exp(−drift/2): Venn's own taste fades as you drift.
  const lambda = LAMBDA0 * Math.exp(-drift / 2);

  // Each candidate's hint changes how you'll likely move, so P(you) is
  // computed per distinct hint (at most one per bucket).
  const byHint = new Map<string, { hint: Hint; dist: number[]; top: (readonly [number, number])[] }>();
  const forHint = (bucket: BucketId) => {
    const hint = hintFor(difficulty, stance, bucket, rescue, seed);
    const key = `${hint.text}|${hint.bucket}`;
    let entry = byHint.get(key);
    if (!entry) {
      const dist = yourDistribution(p, profile, interest, hint, adjust);
      const top = topK(dist, K_TOP);
      const mass = top.reduce((s, [q]) => s + q, 0) || 1;
      entry = { hint, dist, top: top.map(([q, i]) => [q / mass, i] as const) };
      byHint.set(key, entry);
    }
    return entry;
  };

  const yourIndex = new Map(p.yourOptions.map((y, i) => [y.title, i]));
  const maxOrder = Math.max(1, ...p.vennOptions.map(o => o.order));
  // ★ CORE-PLAN-4: the value of each move x, exactly as in §7:
  //   V(x) = P(you pick x)·M·[x shared] + Σ_topK P(y)·c(x, y)
  //        + λ_t·taste_math(x) + plan(x) + rescue(x) − penalties
  // plan(x) = heading toward the meeting page Venn knows, a bonus for the
  // next page of its known route, and legibility: links near the top of
  // Venn's article are broader pages a person can actually find.
  const scored: Scored[] = p.vennOptions.map((x, index) => {
    const h = forHint(x.top[0]);
    const yi = yourIndex.get(x.title);
    const meet = p.shared.has(x.title) && yi !== undefined ? h.dist[yi] * M_MEET : 0;
    const follow = h.top.reduce((s, [q, i]) => s + q * p.cfn(x.vector, p.yourOptions[i].vector), 0);
    const taste = lambda * x.probs[MATH];
    const toMeet = p.cfn(x.vector, p.meet.vector);
    const legible = LEGIBLE_W * (1 - x.order / maxOrder + (x.section === "Introduction" ? 0.3 : 0));
    const planPart = PLAN_W * toMeet + (x.title === routeNext ? ROUTE_W + (input.scripted ? SCRIPT_W : 0) : 0) + legible;
    const rescuePart = rescue ? RESCUE_W * (x.title === routeNext || x.title === p.meet.title ? 1 : toMeet) : 0;
    const penalty = (vennTrail.includes(x.title) ? REVISIT : 0) + (x.policy === "no-profile" ? SENSITIVE : 0);
    return { title: x.title, index, V: meet + follow + taste + planPart + rescuePart - penalty, parts: { meet, follow, taste, plan: planPart, rescue: rescuePart, penalty }, hint: h.hint };
  });
  scored.sort((a, b) => b.V - a.V);
  const best = scored[0];

  // ★ CORE-PLAN-5: the shortlist: up to 5 moves with distinct roles.
  const roles: [Role, Scored | undefined][] = [
    ["best", best],
    ["follow", [...scored].sort((a, b) => b.parts.follow - a.parts.follow)[0]],
    ["lead", [...scored].sort((a, b) => (b.parts.taste + b.parts.plan) - (a.parts.taste + a.parts.plan))[0]],
    ["meet", scored.filter(s => s.parts.meet > 0).sort((a, b) => b.parts.meet - a.parts.meet)[0]],
    ["rescue", rescue ? [...scored].sort((a, b) => b.parts.rescue - a.parts.rescue)[0] : undefined],
  ];
  const shortlist: Candidate[] = [];
  for (const [role, s] of roles) {
    if (!s) continue;
    const existing = shortlist.find(c => c.title === s.title);
    if (existing) existing.roles.push(role); else shortlist.push({ ...s, roles: [role] });
  }

  // ★ CORE-GATE-1: deliberate only on close calls: the best move within 15%
  // of the best move that plays a different role (a different strategy), or
  // no idea which bucket you're heading for. Near-identical options within
  // one strategy don't need judgment.
  const v1 = best?.V ?? 0;
  const rival = shortlist.find(c => c.title !== best?.title);
  const v2 = rival?.V ?? -Infinity;
  const margin = rival ? (v1 - v2) / Math.max(1e-9, Math.abs(v1)) : 1;
  const entropy = entropyNorm(bucketDistribution(p, base));
  const deliberate = shortlist.length > 1 && (margin < GATE_MARGIN || entropy > GATE_ENTROPY);
  const reason = shortlist.length <= 1 ? "only one sensible move" : margin < GATE_MARGIN ? `close call (margin ${margin.toFixed(2)})` : entropy > GATE_ENTROPY ? `can't read your direction (entropy ${entropy.toFixed(2)})` : `clear choice (margin ${margin.toFixed(2)})`;

  return { stance, rescue, scored, best, shortlist, base, gate: { margin, entropy, deliberate, reason }, lambda };
}

// The stance a chosen move actually expresses, from its shortlist roles, so
// the hint and the reaction line can't contradict the move.
export function stanceForMove(pl: Plan, title: string): Stance {
  const roles = pl.shortlist.find(c => c.title === title)?.roles ?? [];
  if (roles.includes("rescue") || (pl.rescue && roles.includes("lead"))) return "lead";
  if (roles.includes("follow")) return "follow";
  if (roles.includes("lead")) return "lead";
  if (roles.includes("meet")) return "hold";
  return pl.stance;
}
