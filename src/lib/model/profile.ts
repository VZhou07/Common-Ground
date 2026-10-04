// The player's profile lives in their browser (§9). The browser sends it with
// every request; the server validates it, clamps every number, caps its size,
// and never stores it.
import { z } from "zod";
import { BUCKET_IDS, type BucketId } from "../topics/buckets";

export const FEATURES = ["gain", "interest", "prominence", "hint", "shared", "back"] as const;
export type Feature = (typeof FEATURES)[number];
// ★ CORE-PRED-1: the average player, where everyone starts and what the
// learner shrinks back toward: drawn to pages closer to Venn, to shared
// links and to the hint; a little to their interests and the top of the page;
// reluctant to step back.
export const THETA_POP = [1.0, 0.6, 0.5, 0.8, 1.2, -1.5];

export const MEMORY_TYPES = ["episode", "theory", "convention", "topicStat"] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export type EpisodeData = { kind: "episode"; pair: string; turn: number; from: string; to: string; outcome: "converged" | "diverged" | "met"; toBucket: BucketId };
export type TheoryData = { kind: "theory"; feature: Feature; delta: number };
export type ConventionData = { kind: "convention"; bucket: BucketId; count: number };
export type TopicStatData = { kind: "topicStat"; who: "you" | "venn"; bucket: BucketId; ability: number; n: number };
export type MemoryData = EpisodeData | TheoryData | ConventionData | TopicStatData;

export type MemoryItem = {
  id: string;
  key: string; // what it is about; "not me" blocks this key forever
  type: MemoryType;
  buckets: BucketId[];
  situation: number[]; // 24 numbers: your page's buckets ⊕ Venn's page's buckets
  evidence: { confirm: number; contradict: number };
  created: number; // game number
  lastUsed: number; // game number, -1 if never
  scope: string; // a pair id, or "any"
  sensitive: false; // sensitive items are never created; the type forbids it
  data: MemoryData;
};

export type GameRecord = {
  pair: string; bucket: BucketId; mode: "daily" | "unlimited"; difficulty: "easy" | "normal" | "hard";
  moves: number; routeLength: number; met: boolean; label: string; meet: string | null; day: string;
  turns: { bucket: BucketId | null; verdict: "converged" | "diverged" | "neutral" }[];
};

export type Elo = { a: number[]; n: number[]; info: number[] };
export type Profile = {
  v: 2;
  games: number;
  predictor: { theta: number[]; da: number; db: number; bits: number; turns: number; hits: number; baseHits: number };
  ability: Elo; // where you and Venn click or lose each other, per bucket
  blind: Elo; // Venn's blind spots: how well it reads you, per bucket
  interest: { stated: BucketId[]; counts: number[] };
  memory: MemoryItem[];
  blocked: string[];
  typeImpact: Record<MemoryType, { mean: number; n: number }>;
  history: GameRecord[];
  bests: Partial<Record<BucketId, number>>;
  tutorialDone: boolean;
};

const zeros = () => BUCKET_IDS.map(() => 0);
export const freshElo = (): Elo => ({ a: zeros(), n: zeros(), info: zeros() });
export const freshProfile = (): Profile => ({
  v: 2,
  games: 0,
  predictor: { theta: [...THETA_POP], da: 0, db: 0, bits: 0.5, turns: 0, hits: 0, baseHits: 0 },
  ability: freshElo(),
  blind: freshElo(),
  interest: { stated: [], counts: zeros() },
  memory: [],
  blocked: [],
  typeImpact: { episode: { mean: 0, n: 0 }, theory: { mean: 0, n: 0 }, convention: { mean: 0, n: 0 }, topicStat: { mean: 0, n: 0 } },
  history: [],
  bests: {},
  tutorialDone: false,
});

// ★ CORE-SAFE-6: every number from the browser is clamped, every list capped.
const num = (lo: number, hi: number) => z.number().finite().transform(x => Math.min(hi, Math.max(lo, x)));
const int = (lo: number, hi: number) => num(lo, hi).transform(Math.round);
const title = z.string().max(200);
const bucket = z.enum(BUCKET_IDS as [BucketId, ...BucketId[]]);
const vec = (n: number, lo: number, hi: number) => z.array(num(lo, hi)).length(n);
const elo = z.object({ a: vec(12, -4, 4), n: vec(12, 0, 10_000), info: vec(12, 0, 10_000) }).strict();
const verdict = z.enum(["converged", "diverged", "neutral"]);

const memoryData = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("episode"), pair: z.string().max(60), turn: int(0, 200), from: title, to: title, outcome: z.enum(["converged", "diverged", "met"]), toBucket: bucket }).strict(),
  z.object({ kind: z.literal("theory"), feature: z.enum(FEATURES), delta: num(-3, 3) }).strict(),
  z.object({ kind: z.literal("convention"), bucket, count: int(0, 1000) }).strict(),
  z.object({ kind: z.literal("topicStat"), who: z.enum(["you", "venn"]), bucket, ability: num(-4, 4), n: int(0, 10_000) }).strict(),
]);

export const memoryItemSchema = z.object({
  id: z.string().regex(/^m_[a-z0-9]{4,16}$/),
  key: z.string().max(120),
  type: z.enum(MEMORY_TYPES),
  buckets: z.array(bucket).max(3),
  situation: vec(24, 0, 1),
  evidence: z.object({ confirm: int(0, 1000), contradict: int(0, 1000) }).strict(),
  created: int(0, 100_000),
  lastUsed: int(-1, 100_000),
  scope: z.string().max(60),
  sensitive: z.literal(false),
  data: memoryData,
}).strict().refine(m => m.type === m.data.kind, "memory type mismatch");

export const MAX_MEMORY = 60;
export const MAX_HISTORY = 50;
export const MAX_PROFILE_BYTES = 64_000;

export const profileSchema = z.object({
  v: z.literal(2),
  games: int(0, 100_000),
  predictor: z.object({ theta: vec(FEATURES.length, -5, 5), da: num(0, 1000), db: num(0, 1000), bits: num(-5, 5), turns: int(0, 1e6), hits: int(0, 1e6), baseHits: int(0, 1e6) }).strict(),
  ability: elo,
  blind: elo,
  interest: z.object({ stated: z.array(bucket).max(2), counts: vec(12, 0, 10_000) }).strict(),
  memory: z.array(memoryItemSchema).max(MAX_MEMORY),
  blocked: z.array(z.string().max(120)).max(200),
  typeImpact: (() => { const s = z.object({ mean: num(0, 2), n: int(0, 1e6) }).strict(); return z.object({ episode: s, theory: s, convention: s, topicStat: s }).strict(); })(),
  history: z.array(z.object({
    pair: z.string().max(60), bucket, mode: z.enum(["daily", "unlimited"]), difficulty: z.enum(["easy", "normal", "hard"]),
    moves: int(0, 1000), routeLength: int(1, 10), met: z.boolean(), label: z.string().max(40), meet: title.nullable(), day: z.string().max(10),
    turns: z.array(z.object({ bucket: bucket.nullable(), verdict }).strict()).max(200),
  }).strict()).max(MAX_HISTORY),
  bests: z.partialRecord(bucket, num(0, 1000)),
  tutorialDone: z.boolean(),
}).strict();

// Parse untrusted JSON text into a profile, or a fresh one if it's missing.
export function parseProfile(raw: unknown): Profile {
  if (raw === undefined || raw === null) return freshProfile();
  if (JSON.stringify(raw).length > MAX_PROFILE_BYTES) throw new Error("This profile is too large.");
  return profileSchema.parse(raw) as Profile;
}
