// Memory items (§8): typed, structured, and rendered to text by code
// templates. LLM prose is never stored, so it can never be re-fed.
import { randomBytes } from "node:crypto";
import { BUCKET_IDS, bucketLabel } from "../topics/buckets";
import { FEATURES, type Feature, type MemoryItem } from "../model/profile";
import type { Adjustment } from "../agent/planner";
import type { Perception } from "../agent/perceive";

export const newMemoryId = () => `m_${randomBytes(5).toString("hex")}`;

const THEORY_TEXT: Record<Feature, [string, string]> = {
  gain: ["You head straight for my page when you can see a way.", "You wander away from my page before coming back."],
  interest: ["You follow your own interests more than my hints.", "You set your own interests aside to find me."],
  prominence: ["You pick links near the top of the article.", "You dig deep into the article for specific links."],
  hint: ["You take my hints.", "You tend to ignore my hints."],
  shared: ["You spot the links we share.", "You walk past the links we share."],
  back: ["You step back when you feel lost.", "You almost never step back."],
};
const OUTCOME = { converged: "a step toward me", diverged: "a step away from me", met: "and we met there" } as const;

// ★ CORE-CTX-3: the only way memory becomes text: fixed templates over
// structured fields. This is what the LLM sees and what the UI shows.
export function render(m: MemoryItem): string {
  const d = m.data;
  switch (d.kind) {
    case "episode": return `Turn ${d.turn} on ${d.pair}: you went to ${d.to} from ${d.from}, ${OUTCOME[d.outcome]}.`;
    case "theory": return THEORY_TEXT[d.feature][d.delta >= 0 ? 0 : 1];
    case "convention": return `We usually meet through ${bucketLabel(d.bucket)} (${d.count} meetings).`;
    case "topicStat": return `${bucketLabel(d.bucket)}: ${d.ability >= 0 ? "we click" : "we lose each other"} (ability ${d.ability >= 0 ? "+" : ""}${d.ability.toFixed(1)}, n=${d.n}).`;
  }
}

// The situation, in bucket space: your page's buckets ⊕ Venn's page's buckets.
export const situationOf = (p: Pick<Perception, "you" | "venn">) => [...p.you.probs, ...p.venn.probs].map(x => Math.round(x * 100) / 100);

export function cosine(a: number[], b: number[]): number {
  let s = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na > 0 && nb > 0 ? s / Math.sqrt(na * nb) : 0;
}

// ★ CORE-CTX-4: how each type changes the predictor when applied (§8 table).
// Episodes have no direct adjustment; they compete on situation match.
export function adjustmentOf(m: MemoryItem): Adjustment {
  const d = m.data;
  const k = (b: string) => BUCKET_IDS.indexOf(b as (typeof BUCKET_IDS)[number]);
  switch (d.kind) {
    case "theory": { const t = FEATURES.map(() => 0); t[FEATURES.indexOf(d.feature)] = d.delta; return { thetaDelta: t }; }
    case "convention": { const b = BUCKET_IDS.map(() => 0); b[k(d.bucket)] = 0.6; return { bucketBonus: b }; }
    case "topicStat": { const s = BUCKET_IDS.map(() => 0); s[k(d.bucket)] = 0.5 * d.ability; return { convergeShift: s }; }
    case "episode": return {};
  }
}

export function combine(adjs: Adjustment[]): Adjustment {
  const add = (key: keyof Adjustment, n: number) => {
    const out = Array.from({ length: n }, () => 0);
    let any = false;
    for (const a of adjs) a[key]?.forEach((x, i) => { out[i] += x; any = true; });
    return any ? out : undefined;
  };
  return { thetaDelta: add("thetaDelta", FEATURES.length), bucketBonus: add("bucketBonus", 12), convergeShift: add("convergeShift", 12) };
}
