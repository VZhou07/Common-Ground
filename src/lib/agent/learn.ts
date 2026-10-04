// After each reveal (§7 step 7): update every learned model, in code.
import { BUCKET_IDS, type BucketId } from "../topics/buckets";
import { TAU } from "../closeness/closeness";
import { eloUpdate } from "../model/elo";
import { addMove, interestWeights } from "../model/interest";
import { featureMatrix, learn } from "../model/predictor";
import { MEMORY_TYPES, type Profile } from "../model/profile";
import { recordOutcome } from "../model/reliability";
import { adjustmentOf, combine } from "../context/memory";
import type { Pending, Verdict } from "../game/state";
import type { Perception } from "./perceive";
import { rawFeatures } from "./planner";

export type MoveFacts = { chosen: number; verdict: Verdict; sensitive: boolean; steppedBack: boolean; readRight: boolean; yourBucket: BucketId | null };

export function learnFromMove(profile: Profile, p: Perception, pending: Pending, stated: BucketId[], f: MoveFacts): { profile: Profile; r: number } {
  // ★ CORE-SAFE-7: sensitive moves teach nothing: no weights, no topics.
  if (f.sensitive || f.chosen < 0) return { profile, r: 1 };
  const interest = interestWeights({ ...profile.interest, stated: stated.length ? stated : profile.interest.stated });
  const phis = featureMatrix(rawFeatures(p, interest, pending.hint));
  // Predict exactly as Venn did: with this turn's memory applied.
  const adj = combine(profile.memory.filter(m => pending.used.includes(m.id)).map(adjustmentOf));
  const extra = p.yourOptions.map((y, i) => {
    const k = BUCKET_IDS.indexOf(y.top[0]);
    return (adj.bucketBonus?.[k] ?? 0) + (adj.convergeShift && p.gains[i] > TAU ? adj.convergeShift[k] ?? 0 : 0);
  });
  const { predictor, r } = learn(profile.predictor, phis, f.chosen, adj.thetaDelta, extra);
  let next: Profile = { ...profile, predictor };

  // ★ CORE-ELO-2: ability counts only turns where converging was possible,
  // in the bucket of the best converging option; neutral moves don't count.
  const best = p.difficulty.best >= 0 ? p.yourOptions[p.difficulty.best] : null;
  if (p.difficulty.convergingExists && best && best.policy === "play" && f.verdict !== "neutral") {
    next = { ...next, ability: eloUpdate(next.ability, BUCKET_IDS.indexOf(best.top[0]), f.verdict === "converged" ? 1 : 0, p.difficulty.b) };
  }
  // ★ CORE-ELO-3: Venn's blind spots: the same Elo, but y = "Venn read you right".
  if (pending.read.bucket) {
    next = { ...next, blind: eloUpdate(next.blind, BUCKET_IDS.indexOf(pending.read.bucket), f.readRight ? 1 : 0, pending.readB) };
  }
  // ★ CORE-INTEREST-3: revealed interest: where you actually go, weighted by
  // how intentional the click looked (1 − r). Stepping back isn't interest.
  if (!f.steppedBack) next = { ...next, interest: addMove(next.interest, f.yourBucket, r) };

  // ★ CORE-CTX-2: every memory Venn cited is scored by whether its read was
  // right; every memory in context is marked as used.
  next = {
    ...next,
    memory: next.memory.map(m => {
      let out = pending.cited.includes(m.id) ? recordOutcome(m, f.readRight) : m;
      if (pending.used.includes(m.id)) out = { ...out, lastUsed: profile.games };
      return out;
    }),
  };
  // Track how much each memory type tends to matter for this player.
  const typeImpact = { ...next.typeImpact };
  for (const t of MEMORY_TYPES) {
    const xs = pending.impacts.filter(i => i.type === t).map(i => i.impact);
    if (!xs.length) continue;
    const cur = typeImpact[t];
    const n = cur.n + xs.length;
    typeImpact[t] = { mean: Math.min(2, (cur.mean * cur.n + xs.reduce((s, x) => s + x, 0)) / n), n };
  }
  return { profile: { ...next, typeImpact }, r };
}
