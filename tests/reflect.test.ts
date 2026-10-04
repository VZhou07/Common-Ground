import test from "node:test";
import assert from "node:assert/strict";
import { candidates } from "../src/lib/agent/reflect";
import { pairById } from "../src/lib/game/pairs";
import type { GameState } from "../src/lib/game/state";
import { freshProfile, parseProfile, type GameRecord, type Profile } from "../src/lib/model/profile";
import { BUCKET_IDS, type BucketId } from "../src/lib/topics/buckets";

const pair = pairById("tutorial")!;
const state: GameState = {
  v: 2, id: "g1", pair: pair.id, mode: "unlimited", difficulty: "normal", day: "2026-10-04", number: null,
  stack: [pair.you], vennTrail: [pair.venn], turn: 0, drift: 0, closeness: [], pending: null, turns: [], status: "met", stated: [],
};
// Meetings on live pages: none of these titles are pinned, so only the
// recorded meetBucket can say where we met.
const met = (meet: string, meetBucket: BucketId | null): GameRecord => ({
  pair: "x", bucket: "sports", mode: "unlimited", difficulty: "normal", moves: 3, routeLength: 3, met: true,
  label: "In sync", meet, meetBucket, day: "2026-10-04", turns: [],
});
const withHistory = (p: Profile, ...h: GameRecord[]): Profile => ({ ...p, history: [...p.history, ...h], games: p.games + h.length });

test("meetings on live pages become a convention, and only new meetings add evidence", () => {
  let p = withHistory(freshProfile(), met("Live page A", "science"), met("Live page B", "science"), met("Live page C", "science"));
  let r = candidates(p, state, pair);
  const conv = r.profile.memory.find(m => m.key === "convention:meet:science");
  assert.ok(conv, "three meetings in one bucket make a convention");
  assert.ok(r.touched.some(m => m.id === conv.id));

  // A game that met elsewhere is not evidence for the science convention.
  p = withHistory(r.profile, met("Live page D", "math"));
  r = candidates(p, state, pair);
  assert.ok(!r.touched.some(m => m.key === "convention:meet:science"));
  assert.equal(r.profile.memory.find(m => m.key === "convention:meet:science")!.evidence.confirm, 0);

  // Another meeting in science is.
  p = withHistory(r.profile, met("Live page E", "science"));
  r = candidates(p, state, pair);
  const again = r.profile.memory.find(m => m.key === "convention:meet:science")!;
  assert.ok(r.touched.some(m => m.id === again.id));
  assert.equal(again.evidence.confirm, 1);
  assert.equal(again.data.kind === "convention" && again.data.count, 4);
});

test("sensitive meetings never count toward a convention", () => {
  const p = withHistory(freshProfile(), met("A", null), met("B", null), met("C", null));
  assert.equal(candidates(p, state, pair).profile.memory.length, 0);
});

test("a topic stat is shown again only after new turns in its bucket", () => {
  const k = BUCKET_IDS.indexOf("history");
  const ability = { ...freshProfile().ability, a: BUCKET_IDS.map((_, i) => (i === k ? -0.9 : 0)), n: BUCKET_IDS.map((_, i) => (i === k ? 6 : 0)) };
  let p: Profile = { ...withHistory(freshProfile(), met("A", "math")), ability };
  let r = candidates(p, state, pair);
  assert.ok(r.touched.some(m => m.key === "topicStat:you:history"));
  r = candidates(withHistory(r.profile, met("B", "math")), state, pair);
  assert.ok(!r.touched.some(m => m.key === "topicStat:you:history"), "same evidence, nothing new to show");
  p = { ...withHistory(r.profile, met("C", "math")), ability: { ...ability, n: ability.n.map((x, i) => (i === k ? 7 : x)) } };
  assert.ok(candidates(p, state, pair).touched.some(m => m.key === "topicStat:you:history"));
});

test("profiles saved before meetBucket existed still parse", () => {
  const old = { ...met("Hexagonal tiling", "math") } as Partial<GameRecord>;
  delete old.meetBucket;
  const p = parseProfile({ ...freshProfile(), games: 1, history: [old] });
  assert.equal(p.history[0].meetBucket, undefined);
});
