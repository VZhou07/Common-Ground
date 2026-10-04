// The game engine behind /api/game/{start,think,move}. Code owns state and
// facts; the LLM (when on) only judges inside decide() and voices lines.
import { randomBytes } from "node:crypto";
import { bucketLabel, BUCKET_IDS, type BucketId } from "../topics/buckets";
import { TAU, verdict as judge, nextDrift } from "../closeness/closeness";
import { perceive, type Perception } from "../agent/perceive";
import { decideTurn } from "../agent/think";
import { learnFromMove } from "../agent/learn";
import { consolidate, type EndMemory } from "../agent/reflect";
import { reactionLine } from "../voice/lines";
import { voiceLine } from "../voice/llm";
import { statedVsRevealed, interestWeights } from "../model/interest";
import { MAX_HISTORY, type Profile } from "../model/profile";
import { situationOf } from "../context/memory";
import type { Article } from "../wiki/types";
import { decrypt, encrypt } from "./seal";
import { pairById, dailyPair, unlimitedPair } from "./pairs";
import type { Pair } from "./makepair";
import { GIVE_UP, STEP_BACK, label, met as isMeeting, ratioOf, scoreLine, shareText, stepBackTarget, type Difficulty, type Label, type Mode } from "./rules";
import type { GameState, TurnRecord, Verdict } from "./state";

export const CALLOUT = "There's a page you both link to. Can you find it?";

export type ArticleView = { title: string; description: string; html: string; tags: string[]; source: string; canStepBack: boolean; back: string | null };
export type VennView = { title: string; description: string; tags: string[] };
export type MeterView = { c: number; shared: boolean; callout: string | null };

const tagsOf = (top: BucketId[]) => top.slice(0, 2).map(bucketLabel);

function articleView(a: Article, top: BucketId[], stack: string[]): ArticleView {
  const back = stepBackTarget(stack);
  return { title: a.title, description: a.description, html: a.html, tags: tagsOf(top), source: a.source, canStepBack: back !== null, back };
}
const vennView = (p: Perception): VennView => ({ title: p.venn.article.title, description: p.venn.article.description, tags: tagsOf(p.venn.top) });
// ★ CORE-CLOSE-8: the callout appears only when a shared playable link
// exists, i.e. only when meeting this turn is actually possible.
const meterView = (p: Perception): MeterView => ({ c: p.c, shared: p.shared.size > 0, callout: p.shared.size > 0 ? CALLOUT : null });

const look = (state: GameState, pair: Pair, signal?: AbortSignal) => perceive({ you: state.stack.at(-1)!, venn: state.vennTrail.at(-1)!, back: stepBackTarget(state.stack), meet: pair.meet, signal });

export const today = () => new Date().toISOString().slice(0, 10);
// The browser sends its local date so the daily rolls over at local midnight;
// anything more than a day away from the server's date is ignored.
export function normalizeDay(day: string | undefined): string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return today();
  const diff = Math.abs(Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today()}T12:00:00Z`));
  return diff <= 86_400_000 * 1.5 ? day : today();
}

export async function startGame(o: { mode: Mode; difficulty: Difficulty; day?: string; profile: Profile; stated: BucketId[] }) {
  const day = normalizeDay(o.day);
  const daily = o.mode === "daily" ? dailyPair(day) : null;
  const pair = daily?.pair ?? unlimitedPair(o.profile, interestWeights({ ...o.profile.interest, stated: o.stated }));
  if (!pair) throw new Error("No pairs are available yet.");
  const state: GameState = {
    v: 2, id: randomBytes(6).toString("hex"), pair: pair.id, mode: o.mode, difficulty: o.difficulty, day, number: daily?.number ?? null,
    stack: [pair.you], vennTrail: [pair.venn], turn: 0, drift: 0, closeness: [], pending: null, turns: [], status: "playing", stated: o.stated,
  };
  const p = await look(state, pair);
  state.closeness.push(p.c);
  return {
    token: encrypt(state),
    game: { id: state.id, mode: state.mode, difficulty: state.difficulty, number: state.number, routeLength: pair.routeLength, tutorial: pair.kind === "tutorial", bucket: pair.bucket },
    you: articleView(p.you.article, p.you.top, state.stack),
    venn: vennView(p),
    meter: meterView(p),
  };
}

export async function think(o: { token: string; profile: Profile; deadline?: number }) {
  const state = decrypt<GameState>(o.token);
  if (state.status !== "playing") throw new Error("This game is over.");
  // Idempotent: a refresh gets the same sealed move, never a new one.
  if (!state.pending) {
    const pair = pairById(state.pair);
    if (!pair) throw new Error("Unknown pair.");
    const p = await look(state, pair);
    state.pending = await decideTurn(p, o.profile, state, pair, o.deadline ?? 7000);
  }
  return { token: encrypt(state), commitment: state.pending.commitment, hint: state.pending.hint.text, stance: state.pending.stance };
}

export type EndReport = {
  met: boolean; meet: string | null; moves: number; routeLength: number; label: Label; ratio: number; scoreLine: string;
  personalBest: { bucket: string; ratio: number; isNew: boolean };
  knownRoute: { you: string[]; venn: string[] };
  chart: { turn: number; c: number; verdict: Verdict | null; bucket: string | null }[];
  topics: { bucket: string; moves: number }[];
  statedVsRevealed: ReturnType<typeof statedVsRevealed>;
  remember: EndMemory[];
  share: string;
};

export async function move(o: { token: string; move: string; profile: Profile }) {
  const state = decrypt<GameState>(o.token);
  if (state.status !== "playing") throw new Error("This game is over.");
  const pending = state.pending;
  if (!pending) throw new Error("Venn is still deciding.");
  const pair = pairById(state.pair);
  if (!pair) throw new Error("Unknown pair.");
  const p = await look(state, pair);
  const gaveUp = o.move === GIVE_UP;
  const steppedBack = o.move === STEP_BACK;
  const backTo = stepBackTarget(state.stack);
  if (steppedBack && !backTo) throw new Error("There's nowhere to step back to yet.");
  // ★ CORE-RULES-8: a move must be a playable link in your current article
  // (or step back / give up). Anything else from the browser is rejected.
  const yourNext = gaveUp ? state.stack.at(-1)! : steppedBack ? backTo! : o.move;
  const chosen = gaveUp ? -1 : p.yourOptions.findIndex(y => y.title === yourNext && (!steppedBack || y.back));
  if (!gaveUp && chosen < 0) throw new Error("That link isn't playable from here.");
  const vennNext = pending.move;
  const reveal = { move: vennNext, nonce: pending.nonce, commitment: pending.commitment };
  let profile = o.profile;

  if (gaveUp) {
    state.status = "gave_up";
    const end = await finish(state, pair, profile, null);
    return { token: encrypt({ ...state, pending: null }), reveal, gaveUp: true, met: false, line: reactionLine({ ...quietFacts(state), gaveUp: true }).line, considered: pending.considered, profile: end.profile, end: end.report };
  }

  const y = p.yourOptions[chosen];
  const x = p.vennOptions.find(v => v.title === vennNext)!;
  const c2 = p.cfn(y.vector, x.vector);
  const dc = c2 - p.c;
  const yourGain = p.gains[chosen];
  const v = judge(yourGain, p.difficulty.convergingExists);
  const driftBefore = state.drift;
  state.drift = nextDrift(state.drift, dc);
  const meeting = isMeeting(yourNext, vennNext);
  const sensitive = y.policy !== "play" || x.policy !== "play";
  const yourBucket = sensitive ? null : y.top[0] ?? null;
  const readRight = !!pending.read.bucket && yourBucket === pending.read.bucket;
  const best = p.difficulty.best >= 0 ? p.yourOptions[p.difficulty.best] : null;

  const learned = learnFromMove(profile, p, pending, state.stated, { chosen, verdict: v, sensitive, steppedBack, readRight, yourBucket });
  profile = learned.profile;

  const record: TurnRecord = {
    turn: state.turn + 1, you: yourNext, venn: vennNext, c: c2, dc, yourGain, verdict: v,
    bucket: best && best.policy === "play" && p.difficulty.convergingExists ? best.top[0] : null,
    yourBucket,
    stance: pending.stance, path: pending.considered.path, readBucket: pending.read.bucket, readRight, steppedBack,
    situation: situationOf(p),
  };
  state.turns.push(record);
  state.turn += 1;
  state.closeness.push(c2);
  if (steppedBack) state.stack.pop(); else state.stack.push(yourNext);
  state.vennTrail.push(vennNext);
  state.pending = null;

  const facts = {
    seed: `${state.id}:${state.turn}`, turn: state.turn, met: meeting, gaveUp: false, beatRoute: meeting && state.turn < pair.routeLength,
    you: yourNext, venn: vennNext, sensitive, readRight, readBucket: pending.read.bucket, yourBucket,
    stance: pending.stance, intent: pending.intent, verdict: v, dc,
    rescueStarted: driftBefore < 3 && state.drift >= 3,
    missedShared: !meeting && p.shared.has(yourNext) && p.shared.has(vennNext),
    steppedBack,
  };
  const fallback = reactionLine(facts);
  const line = await voiceLine(facts, fallback.line, p);

  let end: EndReport | null = null;
  if (meeting) {
    state.status = "met";
    const done = await finish(state, pair, profile, yourNext);
    profile = done.profile;
    end = done.report;
  }
  let next: { you: ArticleView; venn: VennView; meter: MeterView } | null = null;
  if (!meeting) {
    const np = await look(state, pair);
    next = { you: articleView(np.you.article, np.you.top, state.stack), venn: vennView(np), meter: meterView(np) };
  }
  return {
    token: encrypt(state), reveal, met: meeting, gaveUp: false,
    turn: { you: yourNext, venn: vennNext, c: c2, dc, verdict: v, stance: pending.stance, read: pending.read.bucket ? bucketLabel(pending.read.bucket) : null, readRight, intent: pending.intent ? bucketLabel(pending.intent) : null },
    line, considered: pending.considered, profile, next, end,
  };
}

const quietFacts = (state: GameState) => ({
  seed: state.id, turn: state.turn, met: false, gaveUp: false, beatRoute: false, you: "", venn: "", sensitive: true,
  readRight: false, readBucket: null, yourBucket: null, stance: "lead" as const, intent: null, verdict: "neutral" as const,
  dc: 0, rescueStarted: false, missedShared: false, steppedBack: false,
});

async function finish(state: GameState, pair: Pair, profile: Profile, meetAt: string | null): Promise<{ profile: Profile; report: EndReport }> {
  const metNow = state.status === "met";
  const moves = state.turn;
  const lab = label(moves, pair.routeLength, !metNow);
  const ratio = ratioOf(moves, pair.routeLength);
  const prevBest = profile.bests[pair.bucket];
  const isNew = metNow && (prevBest === undefined || ratio < prevBest);
  const topicCounts = new Map<string, number>();
  // This game's topics: the buckets of the pages you moved to.
  for (const t of state.turns) if (t.yourBucket && !t.steppedBack) topicCounts.set(t.yourBucket, (topicCounts.get(t.yourBucket) ?? 0) + 1);

  let next: Profile = {
    ...profile,
    games: profile.games + 1,
    tutorialDone: true,
    bests: isNew ? { ...profile.bests, [pair.bucket]: ratio } : profile.bests,
    history: [...profile.history, {
      pair: pair.id, bucket: pair.bucket, mode: state.mode, difficulty: state.difficulty, moves, routeLength: pair.routeLength,
      met: metNow, label: lab, meet: meetAt, day: state.day, turns: state.turns.map(t => ({ bucket: t.bucket, verdict: t.verdict })),
    }].slice(-MAX_HISTORY),
  };
  const memory = await consolidate(next, state, pair);
  next = memory.profile;
  const report: EndReport = {
    met: metNow, meet: meetAt, moves, routeLength: pair.routeLength, label: lab, ratio, scoreLine: scoreLine(moves, pair.routeLength, metNow),
    personalBest: { bucket: bucketLabel(pair.bucket), ratio: isNew ? ratio : prevBest ?? ratio, isNew },
    knownRoute: pair.route,
    chart: state.closeness.map((c, i) => ({ turn: i, c, verdict: i === 0 ? null : state.turns[i - 1].verdict, bucket: i === 0 ? null : state.turns[i - 1].bucket ? bucketLabel(state.turns[i - 1].bucket!) : null })),
    topics: [...topicCounts].map(([b, n]) => ({ bucket: bucketLabel(b), moves: n })).sort((a, b) => b.moves - a.moves),
    statedVsRevealed: statedVsRevealed(next.interest),
    remember: memory.shown,
    share: shareText({ number: state.number ?? undefined, mode: state.mode, difficulty: state.difficulty, label: lab, moves, routeLength: pair.routeLength, verdicts: state.turns.map(t => t.verdict), met: metNow }),
  };
  return { profile: next, report };
}

export const TAU_FOR_UI = TAU;
export const BUCKETS_FOR_UI = BUCKET_IDS;
