// makePair(bucket, routeLength): one pipeline for every pair (§4).
//   1. pick starts that pass the filters
//   2. a proposer (Claude Opus, or a reviewed proposals file) suggests 3 routes
//   3. code checks every hop against the pinned prose links
//   4. keep the best valid route
// There is no graph search here: checking is linear in route length.
import { LIST_LIKE } from "../wiki/parse";
import { policyFor } from "../wiki/policy";
import type { Article, Popularity } from "../wiki/types";
import type { BucketId } from "../topics/buckets";

export type RoutePaths = { you: string[]; venn: string[] }; // both include the start and the meeting page
export type Pair = {
  id: string;
  kind: "tutorial" | "bucket" | "daily";
  bucket: BucketId;
  weekday?: number; // 0 = Sunday, for dailies
  routeLength: number;
  you: string;
  venn: string;
  meet: string;
  route: RoutePaths;
  proposer: string;
};

export type ProposalRequest = {
  bucket: BucketId;
  routeLength: number;
  you: { title: string; description: string; links: string[] };
  venn: { title: string; description: string; links: string[] };
  feedback: string[];
};
export type Proposer = { id: string; propose(req: ProposalRequest): Promise<RoutePaths[]> };

export type PairDeps = {
  article(title: string): Promise<Article>;
  views(titles: string[]): Promise<Record<string, Popularity>>;
  legibility?(route: RoutePaths): Promise<number>; // higher = easier to read; optional
};

export const MIN_START_LINKS = 30;
export const MEGA_HUB_VIEWS = 500_000;

const playable = (a: Article) => a.links.filter(l => l.policy !== "blocked");

// ★ CORE-RULES-2: start filters. Enough playable prose links, a real article
// (not a list or disambiguation), not sensitive, not a mega-hub.
export async function startProblem(title: string, deps: PairDeps): Promise<string | null> {
  if (LIST_LIKE.test(title)) return `${title} is a list-like page`;
  const a = await deps.article(title).catch(() => null);
  if (!a) return `${title} could not be fetched`;
  if (a.title !== title) return `${title} redirects to ${a.title}`;
  if (a.disambiguation) return `${title} is a disambiguation page`;
  if (playable(a).length < MIN_START_LINKS) return `${title} has only ${playable(a).length} playable links`;
  if (policyFor(a.title, a.description) !== "play") return `${title} is sensitive`;
  const v = (await deps.views([title]))[title]?.views;
  if (v !== null && v !== undefined && v >= MEGA_HUB_VIEWS) return `${title} is a mega-hub (${v} views)`;
  return null;
}

export type Check = { ok: true } | { ok: false; reason: string; at?: string };

// ★ CORE-RULES-3: every hop of both paths must be a playable prose link of
// the page before it, both paths must have the same length and end on the
// same page, and the two players must not meet early.
export async function checkRoute(route: RoutePaths, routeLength: number, deps: PairDeps): Promise<Check> {
  const { you, venn } = route;
  if (you.length !== routeLength + 1 || venn.length !== routeLength + 1) return { ok: false, reason: `both paths need exactly ${routeLength} moves` };
  const meet = you[routeLength];
  if (venn[routeLength] !== meet) return { ok: false, reason: "the paths end on different pages" };
  for (let i = 0; i < routeLength; i++) if (you[i] === venn[i]) return { ok: false, reason: `the players already meet on move ${i}`, at: you[i] };
  if (LIST_LIKE.test(meet)) return { ok: false, reason: `${meet} is a list-like page`, at: meet };
  // The starts must not already share a link, or the first turn could be a
  // free meeting and the known route would mean nothing.
  if (routeLength >= 2) {
    const [ya, va] = await Promise.all([deps.article(you[0]).catch(() => null), deps.article(venn[0]).catch(() => null)]);
    if (ya && va) {
      const theirs = new Set(playable(va).map(l => l.title));
      const shared = playable(ya).filter(l => theirs.has(l.title)).map(l => l.title);
      if (shared.length) return { ok: false, reason: `the starts already share ${shared.slice(0, 5).join(", ")}` };
    }
  }
  for (const path of [you, venn]) {
    if (new Set(path).size !== path.length) return { ok: false, reason: "a path visits the same page twice" };
    for (let i = 0; i < routeLength; i++) {
      const from = await deps.article(path[i]).catch(() => null);
      if (!from) return { ok: false, reason: `${path[i]} could not be fetched`, at: path[i] };
      const link = from.links.find(l => l.title === path[i + 1]);
      if (!link) return { ok: false, reason: `${path[i]} has no prose link to ${path[i + 1]}`, at: path[i] };
      if (link.policy !== "play") return { ok: false, reason: `${path[i + 1]} is sensitive`, at: path[i + 1] };
    }
  }
  const end = await deps.article(meet).catch(() => null);
  if (!end) return { ok: false, reason: `${meet} could not be fetched`, at: meet };
  if (end.disambiguation) return { ok: false, reason: `${meet} is a disambiguation page`, at: meet };
  const v = (await deps.views([meet]))[meet]?.views;
  if (v !== null && v !== undefined && v >= MEGA_HUB_VIEWS) return { ok: false, reason: `${meet} is a mega-hub (${v} views)`, at: meet };
  return { ok: true };
}

export async function makePair(opts: {
  id: string; kind: Pair["kind"]; bucket: BucketId; routeLength: number; weekday?: number;
  you: string; venn: string; proposer: Proposer; deps: PairDeps; rounds?: number; log?: (line: string) => void;
}): Promise<Pair | null> {
  const { deps, proposer, routeLength } = opts;
  const log = opts.log ?? (() => {});
  for (const start of [opts.you, opts.venn]) {
    const problem = await startProblem(start, deps);
    if (problem) { log(`start rejected: ${problem}`); return null; }
  }
  const [ya, va] = await Promise.all([deps.article(opts.you), deps.article(opts.venn)]);
  const feedback: string[] = [];
  let best: { route: RoutePaths; score: number } | null = null;
  for (let round = 0; round < (opts.rounds ?? 2) && !best; round++) {
    const proposals = await proposer.propose({
      bucket: opts.bucket, routeLength,
      you: { title: ya.title, description: ya.description, links: playable(ya).map(l => l.title) },
      venn: { title: va.title, description: va.description, links: playable(va).map(l => l.title) },
      feedback,
    }).catch(error => { log(`proposer failed: ${error instanceof Error ? error.message : error}`); return []; });
    for (const route of proposals.slice(0, 3)) {
      if (route.you[0] !== opts.you || route.venn[0] !== opts.venn) { feedback.push("routes must start at the given pages"); continue; }
      const check = await checkRoute(route, routeLength, deps);
      if (!check.ok) {
        // The proposer sees exactly which hop failed and what was available.
        const at = check.at ? await deps.article(check.at).catch(() => null) : null;
        feedback.push(`${route.you.join(" > ")} | ${route.venn.join(" > ")}: ${check.reason}${at ? `. Links on ${at.title}: ${playable(at).slice(0, 150).map(l => l.title).join("; ")}` : ""}`);
        log(`  ✗ ${check.reason}`);
        continue;
      }
      const score = deps.legibility ? await deps.legibility(route) : 0;
      log(`  ✓ ${route.you.join(" > ")} | ${route.venn.join(" > ")} (legibility ${score.toFixed(3)})`);
      if (!best || score > best.score) best = { route, score };
    }
  }
  if (!best) return null;
  return {
    id: opts.id, kind: opts.kind, bucket: opts.bucket, weekday: opts.weekday, routeLength,
    you: opts.you, venn: opts.venn, meet: best.route.you[routeLength], route: best.route, proposer: proposer.id,
  };
}

// Every title a pair needs pinned: both full paths.
export const pairTitles = (p: Pair) => [...new Set([...p.route.you, ...p.route.venn])];
