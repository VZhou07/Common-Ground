import test from "node:test";
import assert from "node:assert/strict";
import { localEmbedder, setEmbedder } from "../src/lib/embed/embed";
import { perceive, type Perception } from "../src/lib/agent/perceive";
import { GATE_ENTROPY, GATE_MARGIN, plan, yourDistribution, type PlanInput } from "../src/lib/agent/planner";
import { selectContext, BUDGET } from "../src/lib/context/select";
import { render, situationOf } from "../src/lib/context/memory";
import { freshProfile, type MemoryItem, type Profile } from "../src/lib/model/profile";
import { interestWeights } from "../src/lib/model/interest";
import { hintFor } from "../src/lib/voice/lines";
import { getArticle } from "../src/lib/wiki/repository";

setEmbedder(localEmbedder);
let p: Perception;
const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  p, profile: freshProfile(), interest: interestWeights({ stated: ["sports"], counts: Array(12).fill(0) }),
  difficulty: "normal", drift: 0, vennTrail: ["Chaos theory"], routeNext: "Mandelbrot set", seed: "t", ...over,
});

test.before(async () => {
  p = await perceive({ you: "Alpine skiing", venn: "Chaos theory", back: null, meet: "Koch snowflake" });
});

test("the planner only ever scores Venn's own playable links", async () => {
  const pl = plan(input());
  const venn = await getArticle("Chaos theory");
  const legal = new Set(venn.links.filter(l => l.policy !== "blocked").map(l => l.title));
  assert.equal(pl.scored.length, legal.size);
  for (const s of pl.scored) assert.ok(legal.has(s.title), s.title);
  for (const c of pl.shortlist) assert.ok(legal.has(c.title));
  assert.ok(pl.shortlist.length >= 1 && pl.shortlist.length <= 5);
  assert.ok(new Set(pl.shortlist.map(c => c.title)).size === pl.shortlist.length, "shortlist moves are distinct");
});

test("Venn's taste fades as you drift apart (λ_t = λ₀·e^(−drift/2))", () => {
  const [a, b] = [0, 2].map(drift => plan(input({ drift })));
  assert.ok(a.lambda > b.lambda);
  const far = plan(input({ drift: 4 }));
  assert.ok(far.lambda < b.lambda);
  const tasteOf = (pl: ReturnType<typeof plan>) => Math.max(...pl.scored.map(s => s.parts.taste));
  assert.ok(tasteOf(a) > tasteOf(far));
});

test("rescue switches on at drift 3: lead stance, a rescue role, and rescue value", () => {
  const calm = plan(input({ drift: 2 }));
  assert.equal(calm.rescue, false);
  assert.ok(calm.scored.every(s => s.parts.rescue === 0));
  const lost = plan(input({ drift: 3 }));
  assert.equal(lost.rescue, true);
  assert.equal(lost.stance, "lead");
  assert.ok(lost.scored.some(s => s.parts.rescue > 0));
  assert.ok(lost.shortlist.some(c => c.roles.includes("rescue")));
  assert.match(hintFor("normal", "lead", "math", true, "x").text, /^Let's regroup/);
});

test("the close-call gate deliberates exactly when the margin or entropy says so", () => {
  for (const drift of [0, 1, 3]) {
    const pl = plan(input({ drift }));
    const expected = pl.shortlist.length > 1 && (pl.gate.margin < GATE_MARGIN || pl.gate.entropy > GATE_ENTROPY);
    assert.equal(pl.gate.deliberate, expected);
    assert.ok(pl.gate.reason.length > 0);
  }
});

test("hints get weaker with difficulty: Easy names the bucket, Normal hints, Hard is silent", () => {
  assert.match(hintFor("easy", "lead", "music", false, "s").text, /Music & sound/);
  const normal = hintFor("normal", "follow", "music", false, "s").text;
  assert.ok(normal.length > 0 && !/Music & sound/.test(normal));
  assert.equal(hintFor("hard", "lead", "music", false, "s").text, "");
});

const item = (over: Partial<MemoryItem> & Pick<MemoryItem, "data" | "type">): MemoryItem => ({
  id: `m_${Math.random().toString(36).slice(2, 10)}`, key: `${over.type}:${Math.random()}`, buckets: [], situation: situationOf(p),
  evidence: { confirm: 2, contradict: 0 }, created: 14, lastUsed: -1, scope: "any", sensitive: false, ...over,
});

test("the context engine excludes with reasons and never exceeds its budget", () => {
  const base: Profile = { ...freshProfile(), games: 20 };
  const pl = plan(input({ profile: base }));
  const blockedKey = "theory:hint:+";
  const items: MemoryItem[] = [
    item({ type: "theory", key: blockedKey, data: { kind: "theory", feature: "hint", delta: 1.5 } }),
    item({ type: "theory", data: { kind: "theory", feature: "gain", delta: 1.2 }, evidence: { confirm: 0, contradict: 9 } }),
    item({ type: "episode", created: 0, data: { kind: "episode", pair: "x", turn: 1, from: "A", to: "B", outcome: "converged", toBucket: "sports" } }),
    item({ type: "episode", situation: Array(24).fill(0).map((_, i) => (i === 23 ? 1 : 0)), data: { kind: "episode", pair: "x", turn: 2, from: "A", to: "C", outcome: "diverged", toBucket: "music" } }),
    ...["science", "sports", "math", "music", "art", "food", "places", "tech"].map(b => item({ type: "convention", buckets: [b as "science"], data: { kind: "convention", bucket: b as "science", count: 3 } })),
  ];
  const profile: Profile = { ...base, memory: items, blocked: [blockedKey] };
  const sel = selectContext({ p, profile, interest: input().interest, shortlist: pl.shortlist, base: pl.base, games: profile.games });
  assert.ok(sel.used.length <= BUDGET);
  const reasonOf = (i: number) => sel.ignored.find(g => g.item.id === items[i].id)?.reason;
  assert.equal(reasonOf(0), "contradicted"); // "not me"
  assert.equal(reasonOf(1), "contradicted"); // unreliable
  assert.equal(reasonOf(2), "stale");
  assert.equal(reasonOf(3), "zero impact"); // an episode from a different situation
  assert.equal(sel.used.length + sel.ignored.length, items.length);
  for (const u of sel.used) assert.ok(u.impact > 0 || u.item.type === "episode");
  for (const g of sel.ignored) assert.ok(["zero impact", "contradicted", "stale", "redundant", "sensitive", "outranked"].includes(g.reason));
  // Applying the selected memory really changes the predicted distribution.
  if (sel.used.length) {
    const without = yourDistribution(p, profile, input().interest, null);
    const withIt = yourDistribution(p, profile, input().interest, null, sel.adjust);
    assert.ok(without.some((q, i) => Math.abs(q - withIt[i]) > 1e-6));
  }
  assert.match(render(items[4]), /We usually meet through/);
});
