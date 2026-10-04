// End-of-game reflection (§8 consolidation). Code generates candidate
// memories from what happened; Haiku only picks which (by ID) are worth
// showing and phrases them for display. The phrasing is never stored.
import { generateText, Output } from "ai";
import { z } from "zod";
import { withDeadline } from "../deadline";
import { BUCKET_IDS, bucketLabel, isBucket, type BucketId } from "../topics/buckets";
import { topicTags } from "../wiki/repository";
import { anthropic, llmEnabled, MODELS, recordUsage } from "../llm";
import { FEATURES, MAX_MEMORY, THETA_POP, type MemoryItem, type MemoryType, type Profile } from "../model/profile";
import { reliability } from "../model/reliability";
import { newMemoryId, render } from "../context/memory";
import { checkLine } from "../voice/check";
import type { GameState } from "../game/state";
import type { Pair } from "../game/makepair";

export type EndMemory = { id: string; type: MemoryType; text: string; phrasing: string | null; evidence: string };

const THEORY_MIN = 0.5; // a weight this far from the average player becomes a theory
const CONVENTION_MIN = 3; // meetings in one bucket before "we usually meet through X"

function upsert(memory: MemoryItem[], item: Omit<MemoryItem, "id">, merge: (old: MemoryItem) => MemoryItem): { memory: MemoryItem[]; touched: MemoryItem } {
  const i = memory.findIndex(m => m.key === item.key);
  if (i >= 0) { const next = [...memory]; next[i] = merge(memory[i]); return { memory: next, touched: next[i] }; }
  const touched = { ...item, id: newMemoryId() } as MemoryItem;
  return { memory: [...memory, touched], touched };
}

export function candidates(profile: Profile, state: GameState, pair: Pair): { profile: Profile; touched: MemoryItem[] } {
  const games = profile.games;
  let memory = profile.memory;
  let predictor = profile.predictor;
  const touched: MemoryItem[] = [];
  const blocked = new Set(profile.blocked);
  const base = { evidence: { confirm: 0, contradict: 0 }, created: games, lastUsed: -1, sensitive: false as const };
  const add = (item: Omit<MemoryItem, "id">, merge: (old: MemoryItem) => MemoryItem) => {
    if (blocked.has(item.key)) return;
    const r = upsert(memory, item, merge);
    memory = r.memory;
    touched.push(r.touched);
  };

  // Episodes: the meeting, the best converging move, the worst diverging move.
  const turns = state.turns.filter(t => t.yourBucket);
  const pickEp = [
    turns.find(t => t.you === t.venn),
    [...turns].filter(t => t.verdict === "converged" && t.you !== t.venn).sort((a, b) => b.yourGain - a.yourGain)[0],
    [...turns].filter(t => t.verdict === "diverged").sort((a, b) => a.yourGain - b.yourGain)[0],
  ];
  for (const t of pickEp) {
    if (!t || !t.yourBucket) continue;
    const from = t.turn === 1 ? pair.you : state.turns[t.turn - 2].you;
    const outcome = t.you === t.venn ? "met" : t.verdict === "diverged" ? "diverged" : "converged";
    add({ ...base, key: `episode:${state.id}:${t.turn}`, type: "episode", buckets: [t.yourBucket], situation: t.situation, scope: pair.id,
      data: { kind: "episode", pair: pair.id, turn: t.turn, from, to: t.you, outcome, toBucket: t.yourBucket } }, old => old);
  }

  // ★ CORE-CTX-9: consolidation. Repeated meetings become a convention...
  const meetings = new Map<BucketId, number>();
  for (const h of profile.history) {
    if (!h.met || !h.meet) continue;
    const b = topicTags()[h.meet]?.outlink[0]?.bucket;
    if (b && isBucket(b)) meetings.set(b, (meetings.get(b) ?? 0) + 1);
  }
  for (const [b, count] of meetings) {
    if (count < CONVENTION_MIN) continue;
    add({ ...base, key: `convention:meet:${b}`, type: "convention", buckets: [b], situation: Array(24).fill(0), scope: "any", data: { kind: "convention", bucket: b, count } },
      old => ({ ...old, data: { kind: "convention", bucket: b, count }, evidence: { ...old.evidence, confirm: old.evidence.confirm + 1 } }));
  }

  // ...a predictor weight far from average becomes a theory (and the
  // deviation moves out of the weights into the item)...
  if (predictor.turns >= 8) {
    const theta = [...predictor.theta];
    FEATURES.forEach((feature, k) => {
      const dev = theta[k] - THETA_POP[k];
      if (Math.abs(dev) < THEORY_MIN) return;
      const sign = dev > 0 ? "+" : "-";
      const key = `theory:${feature}:${sign}`;
      if (blocked.has(key)) return;
      const opposite = memory.find(m => m.key === `theory:${feature}:${sign === "+" ? "-" : "+"}`);
      if (opposite) memory = memory.map(m => (m === opposite ? { ...m, evidence: { ...m.evidence, contradict: m.evidence.contradict + 1 } } : m));
      add({ ...base, key, type: "theory", buckets: [], situation: Array(24).fill(0), scope: "any", data: { kind: "theory", feature, delta: dev } },
        old => ({ ...old, data: { kind: "theory", feature, delta: Math.max(-3, Math.min(3, (old.data.kind === "theory" ? old.data.delta : 0) + dev)) }, evidence: { ...old.evidence, confirm: old.evidence.confirm + 1 } }));
      theta[k] = THETA_POP[k];
    });
    predictor = { ...predictor, theta };
  }

  // ...and a topic rating with enough evidence becomes a topic stat.
  BUCKET_IDS.forEach((b, k) => {
    const a = profile.ability.a[k], n = profile.ability.n[k];
    if (n < 5 || Math.abs(a) < 0.4) return;
    add({ ...base, key: `topicStat:you:${b}`, type: "topicStat", buckets: [b], situation: Array(24).fill(0), scope: "any", data: { kind: "topicStat", who: "you", bucket: b, ability: a, n } },
      old => ({ ...old, data: { kind: "topicStat", who: "you", bucket: b, ability: a, n } }));
  });

  // Cap at 60: evict the oldest low-reliability items first.
  if (memory.length > MAX_MEMORY) {
    const keep = new Set(touched.map(t => t.key));
    memory = [...memory].sort((x, y) => Number(keep.has(y.key)) - Number(keep.has(x.key)) || reliability(y) - reliability(x) || Math.max(y.created, y.lastUsed) - Math.max(x.created, x.lastUsed)).slice(0, MAX_MEMORY);
  }
  const ids = new Set(memory.map(m => m.id));
  return { profile: { ...profile, memory, predictor }, touched: touched.filter(t => ids.has(t.id)) };
}

const salience = (m: MemoryItem) => {
  const d = m.data;
  return d.kind === "theory" ? Math.abs(d.delta) : d.kind === "topicStat" ? Math.abs(d.ability) : d.kind === "convention" ? 1 + d.count / 10 : d.outcome === "met" ? 0.9 : 0.6;
};
const evidenceOf = (m: MemoryItem) => {
  const d = m.data;
  return d.kind === "episode" ? `from this game` : d.kind === "convention" ? `${d.count} meetings` : d.kind === "topicStat" ? `${d.n} turns` : `${m.evidence.confirm + 1} game${m.evidence.confirm ? "s" : ""}`;
};

const pickSchema = z.object({ picks: z.array(z.object({ id: z.string().max(24), phrasing: z.string().max(200) })).max(3) });

export async function consolidate(profile: Profile, state: GameState, pair: Pair): Promise<{ profile: Profile; shown: EndMemory[] }> {
  const { profile: next, touched } = candidates(profile, state, pair);
  const fallback = [...touched].sort((a, b) => salience(b) - salience(a)).slice(0, 3);
  let shown: EndMemory[] = fallback.map(m => ({ id: m.id, type: m.type, text: render(m), phrasing: null, evidence: evidenceOf(m) }));
  if (llmEnabled() && touched.length > 1) {
    const model = MODELS.voice();
    try {
      const result = await withDeadline(4000, signal => generateText({
        model: anthropic()(model),
        system: "You are Venn, an AI partner in a cooperative Wikipedia game. Pick up to 3 memories (by id) most worth showing the player after this game, and phrase each warmly in at most 100 characters, about how they play, never who they are. Plain text.",
        prompt: touched.map(m => `${m.id}: ${render(m)}`).join("\n"),
        output: Output.object({ schema: pickSchema }),
        maxOutputTokens: 400,
        maxRetries: 0,
        abortSignal: signal,
        // Haiku 4.5 supports the JSON tool used for these structured picks.
        providerOptions: { anthropic: { structuredOutputMode: "jsonTool" } },
      }));
      recordUsage(model, result.usage);
      // ★ CORE-CHECK-5: chosen by candidate ID only; the phrasing is display
      // only, checked like any line, and never stored or re-fed.
      const byId = new Map(touched.map(m => [m.id, m]));
      const picks = result.output.picks.filter(p => byId.has(p.id));
      if (picks.length) {
        const allowedFor = (m: MemoryItem) => [...m.buckets.map(bucketLabel), ...(m.data.kind === "episode" ? [m.data.from, m.data.to] : [])];
        shown = [...new Map(picks.map(p => [p.id, p])).values()].map(p => {
          const m = byId.get(p.id)!;
          return { id: m.id, type: m.type, text: render(m), phrasing: checkLine(p.phrasing, allowedFor(m), []) , evidence: evidenceOf(m) };
        });
      }
    } catch { /* keep the code's own pick */ }
  }
  return { profile: next, shown };
}
