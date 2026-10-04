// The context engine (§8). A memory is relevant only if applying it would
// change the decision; similarity alone isn't enough.
import type { MemoryItem, Profile } from "../model/profile";
import { reliability } from "../model/reliability";
import type { Perception } from "../agent/perceive";
import { yourDistribution, K_TOP, M_MEET, type Adjustment, type Candidate } from "../agent/planner";
import { adjustmentOf, combine, cosine, render, situationOf } from "./memory";

export const BUDGET = 6;
export const W = { impact: 0.4, situation: 0.25, reliability: 0.25, novelty: 0.1 };

export type Scored = { item: MemoryItem; impact: number; situation: number; reliability: number; tv: number; flips: boolean };
export type Selection = {
  used: (Scored & { relevance: number; text: string })[];
  ignored: { item: MemoryItem; text: string; reason: "zero impact" | "contradicted" | "stale" | "redundant" | "sensitive" | "outranked" }[];
  adjust: Adjustment;
};

// Re-rank the shortlist under a predicted distribution: only the meet-now
// and expected-closeness terms depend on your predicted clicks.
function rerank(p: Perception, shortlist: Candidate[], dist: number[]): string {
  const idx = new Map(p.yourOptions.map((y, i) => [y.title, i]));
  const top = dist.map((q, i) => [q, i] as const).sort((a, b) => b[0] - a[0]).slice(0, K_TOP);
  const mass = top.reduce((s, [q]) => s + q, 0) || 1;
  let best = shortlist[0]?.title ?? "", bestV = -Infinity;
  for (const c of shortlist) {
    const x = p.vennOptions[c.index];
    const yi = idx.get(x.title);
    const meet = p.shared.has(x.title) && yi !== undefined ? dist[yi] * M_MEET : 0;
    const follow = top.reduce((s, [q, i]) => s + (q / mass) * p.cfn(x.vector, p.yourOptions[i].vector), 0);
    const v = meet + follow + c.parts.taste + c.parts.plan + c.parts.rescue - c.parts.penalty;
    if (v > bestV) { bestV = v; best = c.title; }
  }
  return best;
}

// ★ CORE-CTX-5: impact(i) = TV distance between P(you) with and without the
// item applied, + 0.5 if applying it changes Venn's top shortlist move.
export function impactOf(item: MemoryItem, p: Perception, profile: Profile, interest: number[], shortlist: Candidate[], base: number[], baseTop: string): { impact: number; tv: number; flips: boolean } {
  const adj = adjustmentOf(item);
  if (!adj.thetaDelta && !adj.bucketBonus && !adj.convergeShift) return { impact: 0, tv: 0, flips: false };
  const withIt = yourDistribution(p, profile, interest, null, adj);
  const tv = 0.5 * withIt.reduce((s, q, i) => s + Math.abs(q - base[i]), 0);
  const flips = shortlist.length > 1 && rerank(p, shortlist, withIt) !== baseTop;
  return { impact: tv + (flips ? 0.5 : 0), tv, flips };
}

const similar = (a: MemoryItem, b: MemoryItem) => {
  if (a.key === b.key) return 1;
  if (a.type !== b.type) return 0;
  const shared = a.buckets.some(x => b.buckets.includes(x));
  return a.type === "theory" ? (a.data.kind === "theory" && b.data.kind === "theory" && a.data.feature === b.data.feature ? 1 : 0.3) : shared ? 0.8 : 0.3;
};

export function selectContext(o: { p: Perception; profile: Profile; interest: number[]; shortlist: Candidate[]; base: number[]; games: number }): Selection {
  const { p, profile, interest, shortlist, base, games } = o;
  const situation = situationOf(p);
  const baseTop = shortlist.length ? rerank(p, shortlist, base) : "";
  const ignored: Selection["ignored"] = [];
  const pool: Scored[] = [];
  // ★ CORE-CTX-6: exclusions come first, each with a reason the UI shows.
  for (const item of profile.memory) {
    const text = render(item);
    if (item.sensitive) { ignored.push({ item, text, reason: "sensitive" }); continue; }
    const r = reliability(item);
    if (profile.blocked.includes(item.key) || r < 0.3) { ignored.push({ item, text, reason: "contradicted" }); continue; }
    const age = games - Math.max(item.created, item.lastUsed);
    if ((item.type === "episode" && age > 8) || age > 15) { ignored.push({ item, text, reason: "stale" }); continue; }
    const sit = cosine(item.situation, situation);
    const { impact, tv, flips } = impactOf(item, p, profile, interest, shortlist, base, baseTop);
    const zero = item.type === "episode" ? sit < 0.5 : impact < 0.005;
    if (zero) { ignored.push({ item, text, reason: "zero impact" }); continue; }
    pool.push({ item, impact, situation: sit, reliability: r, tv, flips });
  }
  // ★ CORE-CTX-7: greedy fill of a 6-item budget by relevance, with novelty
  // from maximal marginal relevance so near-duplicates don't crowd it out:
  //   relevance = 0.40·impact + 0.25·situation + 0.25·reliability + 0.10·novelty
  const used: Selection["used"] = [];
  const remaining = [...pool];
  while (remaining.length && used.length < BUDGET) {
    let bestI = -1, bestRel = -Infinity, bestNovelty = 1;
    remaining.forEach((s, i) => {
      const novelty = 1 - Math.max(0, ...used.map(u => similar(u.item, s.item)));
      const rel = W.impact * s.impact + W.situation * s.situation + W.reliability * s.reliability + W.novelty * novelty;
      if (rel > bestRel) { bestRel = rel; bestI = i; bestNovelty = novelty; }
    });
    const [s] = remaining.splice(bestI, 1);
    if (bestNovelty < 0.3) { ignored.push({ item: s.item, text: render(s.item), reason: "redundant" }); continue; }
    used.push({ ...s, relevance: bestRel, text: render(s.item) });
  }
  for (const s of remaining) ignored.push({ item: s.item, text: render(s.item), reason: "outranked" });
  return { used, ignored, adjust: combine(used.map(u => adjustmentOf(u.item))) };
}
