import test from "node:test";
import assert from "node:assert/strict";
import { eloUpdate, expected, readElo } from "../src/lib/model/elo";
import { addMove, interestWeights, statedVsRevealed } from "../src/lib/model/interest";
import { featureMatrix, lapse, learn, predict } from "../src/lib/model/predictor";
import { freshElo, freshProfile, THETA_POP, type MemoryItem } from "../src/lib/model/profile";
import { recordOutcome, reliability } from "../src/lib/model/reliability";
import { BUCKET_IDS } from "../src/lib/topics/buckets";

const k = BUCKET_IDS.indexOf("history");

test("Elo moves up on convergence, down on divergence, and more on harder turns", () => {
  const up = eloUpdate(freshElo(), k, 1, 0);
  const down = eloUpdate(freshElo(), k, 0, 0);
  assert.ok(up.a[k] > 0 && down.a[k] < 0);
  const hardWin = eloUpdate(freshElo(), k, 1, 1.5).a[k];
  const easyWin = eloUpdate(freshElo(), k, 1, -1.5).a[k];
  assert.ok(hardWin > easyWin, "a hard turn you got right should count more");
  assert.equal(readElo(up)[k].status, "still mapping");
  let e = freshElo();
  for (let i = 0; i < 5; i++) e = eloUpdate(e, k, 1, 0);
  assert.equal(readElo(e)[k].status, "mapped");
  assert.ok(readElo(e)[k].uncertainty < readElo(up)[k].uncertainty);
  assert.ok(expected(e, k, 0) > 0.5);
});

test("stated interest is a prior; revealed interest comes from moves alone", () => {
  let i: { stated: (typeof BUCKET_IDS)[number][]; counts: number[] } = { stated: ["sports"], counts: BUCKET_IDS.map(() => 0) };
  const before = interestWeights(i);
  assert.equal(BUCKET_IDS[before.indexOf(Math.max(...before))], "sports");
  for (let n = 0; n < 6; n++) i = addMove(i, "food", 0.1);
  const after = statedVsRevealed(i);
  assert.deepEqual(after.stated, ["sports"]);
  assert.equal(after.revealed[0].bucket, "food");
  assert.equal(after.agrees, false);
  assert.ok(interestWeights(i)[BUCKET_IDS.indexOf("food")] > interestWeights(i)[BUCKET_IDS.indexOf("sports")]);
  assert.deepEqual(addMove(i, null, 0), i, "sensitive moves (no bucket) teach nothing");
});

test("the predictor learns a player who always takes the option closest to Venn", () => {
  let p = freshProfile().predictor;
  for (let t = 0; t < 30; t++) {
    const raw = Array.from({ length: 20 }, (_, i) => ({ gain: Math.sin(i * 7 + t), interest: Math.cos(i * 3 + t), prominence: i / 20, hint: 0 as const, shared: 0 as const, back: 0 as const }));
    const phis = featureMatrix(raw);
    const chosen = raw.map(r => r.gain).indexOf(Math.max(...raw.map(r => r.gain)));
    p = learn(p, phis, chosen).predictor;
  }
  assert.ok(p.theta[0] > THETA_POP[0], "θ_gain should rise above the average player");
  assert.ok(p.bits > 0.5, "trust should grow when predictions are good");
  assert.ok(p.hits > p.baseHits * 0.8);
  const probs = predict(p, featureMatrix([{ gain: 1, interest: 0, prominence: 0, hint: 0, shared: 0, back: 0 }, { gain: -1, interest: 0, prominence: 0, hint: 0, shared: 0, back: 0 }]));
  assert.ok(probs[0] > probs[1]);
});

test("random-looking clicks raise the lapse rate instead of the weights", () => {
  let p = freshProfile().predictor;
  const before = lapse(p);
  for (let t = 0; t < 20; t++) {
    const raw = Array.from({ length: 30 }, (_, i) => ({ gain: i === 0 ? 3 : 0, interest: 0, prominence: 0, hint: 0 as const, shared: 0 as const, back: 0 as const }));
    p = learn(p, featureMatrix(raw), 29 - (t % 5)).predictor; // never the obvious option
  }
  assert.ok(lapse(p) > before);
});

test("memory reliability is a Beta posterior mean", () => {
  const m = { evidence: { confirm: 0, contradict: 0 } };
  assert.equal(reliability(m), 0.5);
  assert.equal(reliability({ evidence: { confirm: 3, contradict: 1 } }), 4 / 6);
  const fake: MemoryItem = { id: "m_aaaa", key: "k", type: "theory", buckets: [], situation: Array(24).fill(0), evidence: { confirm: 0, contradict: 0 }, created: 0, lastUsed: -1, scope: "any", sensitive: false, data: { kind: "theory", feature: "hint", delta: 1 } };
  assert.equal(recordOutcome({ ...fake, evidence: { ...fake.evidence } }, true).evidence.confirm, 1);
  assert.equal(recordOutcome({ ...fake, evidence: { ...fake.evidence } }, false).evidence.contradict, 1);
});

test("self-play: Elo finds a player's strong and weak buckets within about 3 games", () => {
  // A simulated player with fixed abilities: great at music, poor at history.
  const truth: Record<string, number> = { music: 1.5, history: -1.5 };
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  let e = freshElo();
  for (let game = 0; game < 3; game++) {
    for (let turn = 0; turn < 8; turn++) {
      const b = (rand() - 0.5) * 2; // turn difficulty in [−1, 1]
      const bucket = rand() < 0.5 ? "music" : "history";
      const kk = BUCKET_IDS.indexOf(bucket);
      const pWin = 1 / (1 + Math.exp(-(truth[bucket] - b)));
      e = eloUpdate(e, kk, rand() < pWin ? 1 : 0, b);
    }
  }
  assert.ok(e.a[BUCKET_IDS.indexOf("music")] > 0.3, "music should read as a strength");
  assert.ok(e.a[BUCKET_IDS.indexOf("history")] < -0.3, "history should read as a weakness");
});
