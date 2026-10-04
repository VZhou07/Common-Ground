// Offline batch for the pair pool (§4). Usage:
//   npm run prepare:pairs                 build from the reviewed proposals file
//   npm run prepare:pairs -- --opus       ask Claude Opus for routes instead
//   npm run prepare:pairs -- --check      only check data/proposals.json
//   npm run prepare:pairs -- --only=id    one pair (with --check or --opus)
//   npm run prepare:pairs -- --embed      (re)build data/embeddings.* only
// Every route, whoever proposed it, goes through the same checkRoute().
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { cachedArticle, cachedOutlink, cachedViews } from "./cache";
import { checkRoute, makePair, pairTitles, type Pair, type Proposer, type RoutePaths } from "../src/lib/game/makepair";
import { BUCKET_SEEDS, MATH_SEEDS } from "../src/lib/game/seeds";
import { BUCKETS, bucketsFromOutlink, type BucketId } from "../src/lib/topics/buckets";
import { bucketWords } from "../src/lib/topics/classify";
import { dot, embedder } from "../src/lib/embed/embed";
import { encodeInt8, pageText, vectors } from "../src/lib/embed/store";
import type { Article } from "../src/lib/wiki/types";

type Spec = { id: string; kind: Pair["kind"]; bucket: BucketId; routeLength: number; weekday?: number; you: string; venn: string; routes?: RoutePaths[] };
const args = new Set(process.argv.slice(2));
const only = process.argv.find(a => a.startsWith("--only="))?.slice(7);
const safe = (s: string) => s.replace(/[^\x20-\x7E\n]/g, ch => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
const log = (line: string) => process.stdout.write(safe(line) + "\n");

// Legibility: how similar each step is to the one before (mean cosine along
// both paths). Smoother routes are easier for a person to guess.
async function legibility(route: RoutePaths): Promise<number> {
  const steps: [string, string][] = [];
  for (const path of [route.you, route.venn]) for (let i = 1; i < path.length; i++) steps.push([path[i - 1], path[i]]);
  const texts = await Promise.all(steps.flat().map(async t => { const a = await cachedArticle(t); return pageText(a.title, a.description); }));
  const vs = await vectors(texts);
  let sum = 0;
  for (let i = 0; i < vs.length; i += 2) sum += dot(vs[i], vs[i + 1]);
  return sum / steps.length;
}

const deps = { article: cachedArticle, views: cachedViews, legibility };
const specs: Spec[] = (JSON.parse(readFileSync("data/proposals.json", "utf8")) as { pairs: Spec[] }).pairs.filter(s => !only || s.id === only);

if (args.has("--check")) {
  let bad = 0;
  for (const s of specs) {
    for (const r of s.routes ?? []) {
      const c = await checkRoute(r, s.routeLength, deps);
      log(`${c.ok ? "OK  " : "FAIL"} ${s.id}: ${r.you.join(" > ")} | ${r.venn.join(" > ")}${c.ok ? "" : `  -- ${c.reason}`}`);
      if (!c.ok) bad++;
    }
  }
  process.exit(bad ? 1 : 0);
}

async function buildEmbeddings(pages: Record<string, Article>) {
  const e = embedder();
  if (e.id.startsWith("local")) { log("embeddings: local fallback active (no OPENAI_API_KEY); vectors are computed at runtime instead"); return; }
  const texts = new Set<string>();
  for (const a of Object.values(pages)) {
    texts.add(pageText(a.title, a.description));
    for (const l of a.links) texts.add(pageText(l.title, l.description));
  }
  const topics = existsSync("data/topics.json") ? JSON.parse(readFileSync("data/topics.json", "utf8")) as Record<string, { description: string }> : {};
  for (const [t, v] of Object.entries(topics)) texts.add(pageText(t, v.description));
  for (const b of BUCKETS) texts.add(`${b.label} — ${b.about}`);
  for (const w of bucketWords()) texts.add(w.word);
  const list = [...texts];
  log(`embeddings: ${list.length} texts with ${e.id}`);
  const prepared = await vectors(list);
  writeFileSync("data/embeddings.bin", encodeInt8(prepared));
  writeFileSync("data/embeddings.json", JSON.stringify({ id: e.id, dims: prepared[0].length, texts: list }));
}

if (args.has("--embed")) {
  await buildEmbeddings(JSON.parse(readFileSync("data/pages.json", "utf8")));
  process.exit(0);
}

let proposer: Proposer;
if (args.has("--opus")) {
  const { opusProposer } = await import("../src/lib/agent/propose");
  proposer = opusProposer();
} else {
  // A reviewed proposals file: same interface, same checks.
  proposer = {
    id: "reviewed-file",
    async propose(req) { return specs.find(s => s.you === req.you.title && s.venn === req.venn.title && s.routeLength === req.routeLength)?.routes ?? []; },
  };
}

const existing: Pair[] = existsSync("data/pairs.json") ? JSON.parse(readFileSync("data/pairs.json", "utf8")) : [];
const pairs = new Map(existing.map(p => [p.id, p]));
for (const s of specs) {
  log(`\n${s.id} (${s.bucket}, ${s.routeLength} moves): ${s.you} × ${s.venn}`);
  const pair = await makePair({ ...s, proposer, deps, log });
  if (pair) pairs.set(pair.id, pair); else log(`  no valid route for ${s.id}`);
}
const pool = [...pairs.values()];
writeFileSync("data/pairs.json", JSON.stringify(pool, null, 2) + "\n");

// Pin every page on every route at the revision we just checked.
const titles = [...new Set(pool.flatMap(pairTitles))].sort();
const pages: Record<string, Article> = {};
for (const t of titles) pages[t] = await cachedArticle(t);
writeFileSync("data/pages.json", JSON.stringify(pages));
log(`\npinned ${titles.length} pages for ${pool.length} pairs`);

// Topic tags (Wikimedia outlink model) for pinned pages and every seed; the
// seeds widen the bucket anchors used to tag live pages.
const tagTitles = [...new Set([...titles, ...MATH_SEEDS, ...Object.values(BUCKET_SEEDS).flat()])];
const topics: Record<string, { description: string; outlink: { bucket: BucketId; score: number }[] }> = {};
for (const t of tagTitles) {
  try {
    const a = pages[t] ?? await cachedArticle(t);
    topics[t] = { description: a.description, outlink: bucketsFromOutlink(await cachedOutlink(t)) };
  } catch (error) { log(`  topics failed for ${t}: ${error instanceof Error ? error.message : error}`); }
}
writeFileSync("data/topics.json", JSON.stringify(topics, null, 1) + "\n");
log(`tagged ${Object.keys(topics).length} pages`);
await buildEmbeddings(pages);
