// What the encrypted token carries between requests.
import type { BucketId } from "../topics/buckets";
import type { Hint, Stance } from "../voice/lines";
import type { Difficulty, Mode } from "./rules";

export type Verdict = "converged" | "diverged" | "neutral";

// What Venn considered, shown under the reveal (§8 UI). Built by code.
export type Considered = {
  path: "planner" | "llm" | "fallback";
  gate: string;
  llm: "off" | "skipped" | "used" | "failed";
  failure?: string;
  shortlist: { title: string; roles: string[]; score: number; chosen: boolean }[];
  used: { id: string; text: string; cited: boolean; relevance: number }[];
  recalled: { id: string; text: string }[];
  ignored: { id: string; text: string; reason: string }[];
  reason: string | null; // the model's own ≤160-char reason, display only
};

export type Pending = {
  move: string; nonce: string; commitment: string;
  hint: Hint; stance: Stance; intent: BucketId | null;
  read: { bucket: BucketId | null; confidence: number };
  readB: number; // difficulty of reading you this turn, for Venn's blind-spot Elo
  cited: string[];
  used: string[]; // memory items in context this turn
  impacts: { type: "episode" | "theory" | "convention" | "topicStat"; impact: number }[];
  considered: Considered;
};

export type TurnRecord = {
  turn: number; you: string; venn: string; c: number; dc: number; yourGain: number;
  verdict: Verdict; bucket: BucketId | null; yourBucket: BucketId | null; stance: Stance; path: Considered["path"];
  readBucket: BucketId | null; readRight: boolean; steppedBack: boolean;
  situation: number[]; // bucket-space situation when you moved (for episodes)
};

export type GameState = {
  v: 2; id: string; pair: string; mode: Mode; difficulty: Difficulty; day: string; number: number | null;
  stack: string[]; // your navigation stack; current page = last
  vennTrail: string[]; // Venn's pages; current = last
  turn: number; drift: number; closeness: number[];
  pending: Pending | null;
  turns: TurnRecord[];
  status: "playing" | "met" | "gave_up";
  stated: BucketId[];
};
