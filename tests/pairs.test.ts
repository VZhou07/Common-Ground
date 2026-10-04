import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkRoute, makePair, type Pair, type PairDeps } from "../src/lib/game/makepair";
import type { Article } from "../src/lib/wiki/types";

const pages = JSON.parse(readFileSync("data/pages.json", "utf8")) as Record<string, Article>;
const pairs = JSON.parse(readFileSync("data/pairs.json", "utf8")) as Pair[];
const deps: PairDeps = {
  async article(title) { const a = pages[title]; if (!a) throw new Error(`not pinned: ${title}`); return a; },
  async views() { return {}; },
};

test("every shipped pair's known route still checks against the pinned snapshots", async () => {
  assert.ok(pairs.length >= 15);
  for (const p of pairs) {
    const c = await checkRoute(p.route, p.routeLength, deps);
    assert.ok(c.ok, `${p.id}: ${c.ok ? "" : c.reason}`);
    assert.equal(p.route.you[0], p.you);
    assert.equal(p.route.venn[0], p.venn);
    assert.equal(p.meet, p.route.you.at(-1));
  }
});

test("the pool has one tutorial, all 12 buckets, and one daily per weekday with the planned length", () => {
  assert.equal(pairs.filter(p => p.kind === "tutorial").length, 1);
  assert.equal(new Set(pairs.filter(p => p.kind === "bucket").map(p => p.bucket)).size, 12);
  const dailies = pairs.filter(p => p.kind === "daily");
  assert.equal(dailies.length, 7);
  for (let day = 0; day < 7; day++) {
    const p = dailies.find(p => p.weekday === day);
    assert.ok(p, `weekday ${day} has a pair`);
    assert.equal(p.routeLength, [3, 2, 2, 3, 3, 4, 4][day]);
  }
});

test("checkRoute rejects broken hops, early meetings, uneven paths and shared starts", async () => {
  const good = pairs.find(p => p.id === "snow-math")!.route;
  assert.ok((await checkRoute(good, 3, deps)).ok);
  const brokenHop = { ...good, you: ["Alpine skiing", "Snowflake", "Snow", "Koch snowflake"] };
  assert.match((await checkRoute(brokenHop, 3, deps) as { reason: string }).reason, /no prose link/);
  const uneven = { ...good, you: good.you.slice(0, 3) };
  assert.match((await checkRoute(uneven, 3, deps) as { reason: string }).reason, /exactly 3 moves/);
  const early = { you: ["Snow", "Snowflake", "Koch snowflake"], venn: ["Snow", "Snowflake", "Koch snowflake"] };
  assert.match((await checkRoute(early, 2, deps) as { reason: string }).reason, /already meet/);
  // Octopus and Cephalopod already share links, so turn 1 could be a free meeting.
  const sharedStart = { you: ["Octopus", "Nautilus", "Logarithmic spiral"], venn: ["Cephalopod", "Golden spiral", "Logarithmic spiral"] };
  assert.match((await checkRoute(sharedStart, 2, deps) as { reason: string }).reason, /already share/);
});

test("makePair feeds the failing hop back to the proposer and keeps the valid route", async () => {
  const p = pairs.find(x => x.id === "snow-math")!;
  const seen: string[][] = [];
  let calls = 0;
  const proposer = {
    id: "test",
    async propose(req: { feedback: string[] }) {
      seen.push([...req.feedback]);
      calls++;
      return calls === 1 ? [{ you: ["Alpine skiing", "Snowflake", "Snow", "Koch snowflake"], venn: p.route.venn }] : [p.route];
    },
  };
  const made = await makePair({ id: "x", kind: "bucket", bucket: "sports", routeLength: 3, you: p.you, venn: p.venn, proposer, deps });
  assert.equal(made?.meet, "Koch snowflake");
  assert.equal(calls, 2);
  assert.match(seen[1][0], /no prose link.*Links on Alpine skiing/);
});
