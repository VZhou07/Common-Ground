import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { localEmbedder, setEmbedder } from "../src/lib/embed/embed";
import { CALLOUT, move, startGame, think } from "../src/lib/game/engine";
import { pairById } from "../src/lib/game/pairs";
import { decrypt, encrypt } from "../src/lib/game/seal";
import type { GameState } from "../src/lib/game/state";
import { GIVE_UP, STEP_BACK, label } from "../src/lib/game/rules";
import { freshProfile, parseProfile, type Profile } from "../src/lib/model/profile";
import { perceive } from "../src/lib/agent/perceive";
import { sharedLinks } from "../src/lib/closeness/closeness";
import { getArticle } from "../src/lib/wiki/repository";

setEmbedder(localEmbedder);
process.env.LLM_ENABLED = "false";

const verify = (r: { move: string; nonce: string; commitment: string }) =>
  createHash("sha256").update(JSON.stringify([r.move, r.nonce])).digest("hex") === r.commitment;

// A player who follows the known route while they can, then heads for
// whatever is closest to Venn's page.
async function playGame(profile: Profile, opts: { mode?: "daily" | "unlimited"; difficulty?: "easy" | "normal" | "hard"; maxTurns?: number } = {}) {
  const started = await startGame({ mode: opts.mode ?? "unlimited", difficulty: opts.difficulty ?? "normal", profile, stated: ["sports"] });
  let token = started.token;
  const state0 = decrypt<GameState>(token);
  const pair = pairById(state0.pair)!;
  let you = started.you;
  for (let turn = 0; turn < (opts.maxTurns ?? 14); turn++) {
    const t = await think({ token, profile });
    assert.match(t.commitment, /^[a-f0-9]{64}$/);
    token = t.token;
    const state = decrypt<GameState>(token);
    const onRoute = state.stack.every((x, i) => pair.route.you[i] === x);
    let choice = onRoute ? pair.route.you[state.stack.length] : undefined;
    if (!choice) {
      const p = await perceive({ you: state.stack.at(-1)!, venn: state.vennTrail.at(-1)!, back: null, meet: pair.meet });
      choice = p.yourOptions[p.gains.indexOf(Math.max(...p.gains))].title;
    }
    const r = await move({ token, move: choice, profile });
    assert.ok(verify(r.reveal), "the reveal must match the commitment");
    assert.ok(typeof r.line === "string" && r.line.length <= 140);
    profile = r.profile;
    token = r.token;
    if (r.met) return { met: true, r, profile, pair, turns: turn + 1 };
    you = r.next!.you;
    void you;
  }
  return { met: false, r: null, profile, pair, turns: opts.maxTurns ?? 14 };
}

test("a new player gets the tutorial, plays it end to end, and the profile learns", async () => {
  const out = await playGame(freshProfile());
  assert.equal(out.pair.kind, "tutorial");
  assert.ok(out.met, "the route-following player should meet Venn");
  const end = out.r!.end!;
  assert.equal(end.moves, out.turns);
  assert.equal(end.label, label(end.moves, out.pair.routeLength, false));
  assert.equal(end.chart.length, out.turns + 1);
  assert.match(end.share, /Common Ground/);
  assert.doesNotMatch(end.share, /Honey|Hexagon|Pi\b/); // spoiler-free
  assert.equal(out.profile.games, 1);
  assert.equal(out.profile.tutorialDone, true);
  assert.equal(out.profile.history.length, 1);
  assert.ok(out.profile.predictor.turns >= 1);
  assert.ok(out.profile.interest.counts.some(c => c > 0));
});

test("after the tutorial, Unlimited picks a pair in your stated bucket", async () => {
  const profile = { ...freshProfile(), tutorialDone: true };
  const s = await startGame({ mode: "unlimited", difficulty: "normal", profile, stated: ["sports"] });
  assert.equal(pairById(decrypt<GameState>(s.token).pair)!.bucket, "sports");
});

test("the shared-link callout appears exactly when a shared playable link exists", async () => {
  const profile = { ...freshProfile(), tutorialDone: true };
  for (const stated of [["sports"], ["food"], ["music"]] as const) {
    const s = await startGame({ mode: "unlimited", difficulty: "normal", profile, stated: [...stated] });
    const [ya, va] = await Promise.all([getArticle(s.you.title), getArticle(s.venn.title)]);
    const shared = sharedLinks(ya, va).length > 0;
    assert.equal(s.meter.shared, shared);
    assert.equal(s.meter.callout, shared ? CALLOUT : null);
  }
  // On the tutorial's second turn the known route makes a shared link appear.
  const t = await startGame({ mode: "unlimited", difficulty: "easy", profile: freshProfile(), stated: [] });
  const th = await think({ token: t.token, profile: freshProfile() });
  const r = await move({ token: th.token, move: "Honeycomb", profile: freshProfile() });
  if (r.turn && r.next) {
    const [ya, va] = await Promise.all([getArticle(r.next.you.title), getArticle(r.next.venn.title)]);
    assert.equal(r.next.meter.shared, sharedLinks(ya, va).length > 0);
  }
});

test("step back returns to the previous page, costs a move, and isn't available on turn 1", async () => {
  const profile = { ...freshProfile(), tutorialDone: true };
  const s = await startGame({ mode: "unlimited", difficulty: "normal", profile, stated: ["sports"] });
  assert.equal(s.you.canStepBack, false);
  let th = await think({ token: s.token, profile });
  await assert.rejects(move({ token: th.token, move: STEP_BACK, profile }), /nowhere to step back/);
  const r1 = await move({ token: th.token, move: "Snow", profile });
  assert.equal(r1.next!.you.title, "Snow");
  assert.equal(r1.next!.you.canStepBack, true);
  th = await think({ token: r1.token, profile });
  const r2 = await move({ token: th.token, move: STEP_BACK, profile });
  assert.equal(r2.turn!.you, "Alpine skiing");
  assert.equal(decrypt<GameState>(r2.token).turn, 2);
});

test("illegal moves, missing commitments, forged tokens and bad profiles are rejected", async () => {
  const profile = { ...freshProfile(), tutorialDone: true };
  const s = await startGame({ mode: "unlimited", difficulty: "normal", profile, stated: ["sports"] });
  await assert.rejects(move({ token: s.token, move: "Snow", profile }), /still deciding/);
  const th = await think({ token: s.token, profile });
  await assert.rejects(move({ token: th.token, move: "Not A Real Link On This Page", profile }), /isn't playable/);
  const tampered = th.token.slice(0, -4) + (th.token.endsWith("AAAA") ? "BBBB" : "AAAA");
  await assert.rejects(move({ token: tampered, move: "Snow", profile }));
  // Thinking twice returns the same sealed move.
  const again = await think({ token: th.token, profile });
  assert.equal(again.commitment, th.commitment);
  // Profiles: forged fields, wrong shapes and oversized payloads are refused.
  assert.throws(() => parseProfile({ ...freshProfile(), memory: [{ id: "x", evil: true }] }));
  assert.throws(() => parseProfile({ ...freshProfile(), blocked: Array(5000).fill("x".repeat(100)) }));
  const clamped = parseProfile({ ...freshProfile(), predictor: { ...freshProfile().predictor, theta: [99, -99, 0, 0, 0, 0] } });
  assert.deepEqual(clamped.predictor.theta.slice(0, 2), [5, -5]);
  assert.ok(encrypt({ a: 1 }).length > 0);
});

test("giving up ends the game as Lost each other and still reveals Venn's sealed move", async () => {
  const profile = { ...freshProfile(), tutorialDone: true };
  const s = await startGame({ mode: "unlimited", difficulty: "hard", profile, stated: ["music"] });
  const th = await think({ token: s.token, profile });
  assert.equal(th.hint, ""); // Hard: Venn stays silent
  const r = await move({ token: th.token, move: GIVE_UP, profile });
  assert.ok(verify(r.reveal));
  assert.equal(r.end!.label, "Lost each other");
  assert.equal(r.profile.history.at(-1)!.met, false);
});

test("daily mode serves the same numbered pair for the same day", async () => {
  const profile = freshProfile();
  const a = await startGame({ mode: "daily", difficulty: "normal", day: new Date().toISOString().slice(0, 10), profile, stated: [] });
  const b = await startGame({ mode: "daily", difficulty: "easy", day: new Date().toISOString().slice(0, 10), profile, stated: ["food"] });
  assert.equal(a.you.title, b.you.title);
  assert.equal(a.game.number, b.game.number);
  assert.ok((a.game.number ?? 0) >= 1);
});
