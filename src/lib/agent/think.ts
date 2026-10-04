// Venn's whole turn, run after each reveal while you read (§7).
// It always returns a sealed move: the LLM path has a deadline and a
// planner fallback for every way it can fail.
import { BUCKET_IDS, type BucketId } from "../topics/buckets";
import type { Profile } from "../model/profile";
import { interestWeights } from "../model/interest";
import { llmEnabled } from "../llm";
import { selectContext } from "../context/select";
import type { Considered, GameState, Pending } from "../game/state";
import type { Pair } from "../game/makepair";
import type { Perception } from "./perceive";
import { bucketDistribution, plan, stanceForMove } from "./planner";
import { routeNextFor, seal } from "./decide";
import { deliberate } from "./deliberate";

export async function decideTurn(p: Perception, profile: Profile, state: GameState, pair: Pair, deadlineMs: number): Promise<Pending> {
  const started = Date.now();
  const interest = interestWeights({ ...profile.interest, stated: state.stated.length ? state.stated : profile.interest.stated });
  const input = { p, profile, interest, difficulty: state.difficulty, drift: state.drift, vennTrail: state.vennTrail, routeNext: routeNextFor(state, pair), seed: `${state.id}:${state.turn}`, scripted: pair.kind === "tutorial" };

  // 1. Score without memory, to know what memory could change.
  const bare = plan(input);
  // 2. ★ CORE-CTX-8: choose memory by decision impact under a 6-item budget.
  const context = selectContext({ p, profile, interest, shortlist: bare.shortlist, base: bare.base, games: profile.games });
  // 3. Re-plan with the selected memory applied: memory changes the decision
  //    even when the LLM is off.
  const pl = plan({ ...input, adjust: context.adjust });
  const buckets = bucketDistribution(p, pl.base);
  const predicted = BUCKET_IDS[buckets.indexOf(Math.max(...buckets))] as BucketId;

  const considered: Omit<Considered, "path" | "llm" | "gate"> = {
    shortlist: [], recalled: [], reason: null,
    used: context.used.map(u => ({ id: u.item.id, text: u.text, cited: false, relevance: Number(u.relevance.toFixed(2)) })),
    ignored: context.ignored.map(g => ({ id: g.item.id, text: g.text, reason: g.reason })),
  };
  const usedIds = context.used.map(u => u.item.id);
  const impacts = context.used.map(u => ({ type: u.item.type, impact: u.impact }));
  const finish = (pending: Pending): Pending => ({ ...pending, used: usedIds, impacts });

  // 4. ★ CORE-GATE-2: the planner decides instantly unless it's a close call
  //    and the LLM is available. Which path was taken is always logged.
  if (!pl.gate.deliberate || !llmEnabled()) {
    return finish(seal(p, pl, pl.best.title, stanceForMove(pl, pl.best.title), null, [], { ...considered, path: "planner", gate: pl.gate.reason, llm: llmEnabled() ? "skipped" : "off" }, state));
  }
  const remaining = Math.max(1000, deadlineMs - (Date.now() - started) - 600);
  const d = await deliberate({ p, profile, shortlist: pl.shortlist, context, stance: pl.stance, drift: state.drift, predictedBucket: predicted, deadlineMs: remaining });
  if (!d.ok) {
    // ★ CORE-DELIB-2: any failure (schema, bad choice, bad citation, timeout)
    // falls back to the planner's move.
    return finish(seal(p, pl, pl.best.title, stanceForMove(pl, pl.best.title), null, [], { ...considered, recalled: d.recalled, path: "fallback", gate: pl.gate.reason, llm: "failed", failure: d.failure }, state));
  }
  const used = considered.used.map(u => ({ ...u, cited: d.cited.includes(u.id) }));
  return finish(seal(p, pl, d.choice.title, d.stance, d.read, d.cited, { ...considered, used, recalled: d.recalled, path: "llm", gate: pl.gate.reason, llm: "used", reason: d.reason }, state));
}
