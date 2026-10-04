// Venn's handwritten voice. Hints are always templates (§6.3); reactions
// are templates unless the LLM writes a line that passes checkLine().
import { bucketLabel, type BucketId } from "../topics/buckets";
import type { Difficulty } from "../game/rules";
import { checkLine } from "./check";

export type Stance = "lead" | "follow" | "hold";
export type Hint = { difficulty: Difficulty; stance: Stance; bucket: BucketId | null; rescue: boolean; text: string };

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// Seeded by game and turn: varied between games, reproducible within one.
export const pick = (lines: string[], seed: string) => lines[hash(seed) % lines.length];
const fill = (line: string, slots: Record<string, string>) => line.replace(/\{(\w+)\}/g, (_, k: string) => slots[k] ?? "");

// A vague adjective per bucket, for Normal: a nudge, not a name.
export const FLAVOR: Record<BucketId, string> = {
  science: "natural", tech: "mechanical", math: "mathematical", sports: "athletic", music: "musical", art: "artistic",
  screen: "cinematic", food: "delicious", history: "historical", places: "far away", language: "literary", business: "commercial",
};

const EASY: Record<Stance, string[]> = {
  lead: ["I'm heading into {Bucket}. Follow me.", "Next stop for me: somewhere in {Bucket}."],
  follow: ["I'm coming toward you, through {Bucket}.", "I'll meet you halfway, somewhere in {Bucket}."],
  hold: ["I'm staying in {Bucket}. Come find me.", "I'll wait around {Bucket}. Your move."],
};
const NORMAL: Record<Stance, string[]> = {
  lead: ["Follow my lead: think {flavor}.", "I'm off somewhere {flavor}."],
  follow: ["I'm coming your way.", "I'll follow you this time."],
  hold: ["I'll stay close to where I am.", "I'm not going far. Come to me."],
};

// ★ CORE-PLAN-1: hint strength is the difficulty. Easy names the bucket
// Venn is heading into; Normal gives the stance and a vague flavor; Hard
// says nothing. Rescue mode says "let's regroup" first.
export function hintFor(difficulty: Difficulty, stance: Stance, bucket: BucketId | null, rescue: boolean, seed: string): Hint {
  if (difficulty === "hard") return { difficulty, stance, bucket: null, rescue, text: "" };
  const b = bucket ?? "math";
  const pool = difficulty === "easy" ? EASY[stance] : NORMAL[stance];
  const text = fill(pick(pool, seed), { Bucket: bucketLabel(b), flavor: FLAVOR[b] });
  return { difficulty, stance, bucket: difficulty === "easy" || stance === "lead" ? b : null, rescue, text: rescue ? `Let's regroup. ${text}` : text };
}

export const OPENING = "I'm Venn. I like math and anything that smells like it. What about you?";

// ----- reactions -----

export type ReactionFacts = {
  seed: string; turn: number; met: boolean; gaveUp: boolean; beatRoute: boolean;
  you: string; venn: string; sensitive: boolean;
  readRight: boolean; readBucket: BucketId | null; yourBucket: BucketId | null;
  stance: Stance; intent: BucketId | null; verdict: "converged" | "diverged" | "neutral";
  dc: number; rescueStarted: boolean; missedShared: boolean; steppedBack: boolean;
};

const READ_RIGHT = ["Called it: {you}.", "I had a feeling about {you}.", "{you}. I knew it."];
const READ_WRONG = ["{you}? Didn't see that coming. Noted.", "Huh, {you}. You're harder to read than I thought.", "I figured {readB}. You went {you}."];
const INTENT: Record<Stance, string[]> = {
  follow: ["I went to {venn} to meet you halfway.", "I followed you to {venn}."],
  hold: ["I stayed close, at {venn}.", "I held my ground at {venn}."],
  lead: ["I pulled us toward {intentB} with {venn}.", "I led with {venn}."],
};
const MET = ["There you are. {you} it is.", "Found you at {you}.", "We met at {you}. That felt good."];
const MET_FAST = ["{you} already? We think alike.", "That was quick. {you}, of course."];
const QUIET = ["Noted. Let's keep looking.", "Different paths this turn. Let's keep going."];

// The deterministic line for an event. Code decides what happened; the
// template only says it.
export function reactionLine(f: ReactionFacts): { event: string; line: string } {
  const slots = { you: f.you, venn: f.venn, readB: f.readBucket ? bucketLabel(f.readBucket) : "something else", intentB: f.intent ? bucketLabel(f.intent) : "my side" };
  const say = (event: string, line: string) => ({ event, line: checkLine(fill(line, slots), [f.you, f.venn, slots.readB, slots.intentB]) ?? "Let's keep going." });
  if (f.gaveUp) return say("gaveUp", "We lost each other this time. I'll remember how.");
  if (f.met && f.sensitive) return say("metQuiet", "There you are. We found each other.");
  if (f.met) return say(f.beatRoute ? "metFast" : "met", pick(f.beatRoute ? MET_FAST : MET, f.seed));
  if (f.sensitive) return say("quiet", pick(QUIET, f.seed));
  if (f.rescueStarted) return say("rescue", "We keep drifting. I'll lead us somewhere we both know.");
  if (f.steppedBack) return say("back", `Back to ${f.you}. ${pick(INTENT[f.stance], f.seed + "i")}`);
  if (f.missedShared) return say("missed", "We both had a way to meet there. Next time.");
  const read = pick(f.readRight ? READ_RIGHT : READ_WRONG, f.seed);
  const intent = pick(INTENT[f.stance], f.seed + "i");
  const both = fill(`${read} ${intent}`, slots);
  return say(f.readRight ? "readRight" : "readWrong", both.length <= 140 ? both : read);
}
