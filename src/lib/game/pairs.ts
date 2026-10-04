// The shipped pair pool and how a game picks from it.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Pair } from "./makepair";
import { DAILY_LENGTH, dailyNumber, weekdayOf } from "./rules";
import { BUCKET_IDS, type BucketId } from "../topics/buckets";
import type { Profile } from "../model/profile";

let pool: Pair[] | null = null;
export function pairs(): Pair[] {
  if (pool) return pool;
  const file = path.join(process.cwd(), "data", "pairs.json");
  return (pool = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) as Pair[] : []);
}
export const pairById = (id: string) => pairs().find(p => p.id === id);

// One curated pair for everyone per day. Each weekday has its own pair and
// route length; if a weekday has no pair yet, the closest length stands in.
export function dailyPair(day: string): { pair: Pair; number: number } {
  const weekday = weekdayOf(day);
  const dailies = pairs().filter(p => p.kind === "daily");
  const exact = dailies.find(p => p.weekday === weekday);
  const want = DAILY_LENGTH[weekday];
  const pair = exact ?? [...dailies].sort((a, b) => Math.abs(a.routeLength - want) - Math.abs(b.routeLength - want) || (a.weekday ?? 0) - (b.weekday ?? 0))[0] ?? pairs()[0];
  return { pair, number: dailyNumber(day) };
}

// ★ CORE-RULES-7: Unlimited. New players get the tutorial. After that, your
// interest picks the bucket: stated interest first, revealed interest as it
// grows, and pairs you haven't played (or played longest ago) before repeats.
export function unlimitedPair(profile: Profile, interestWeights: number[]): Pair {
  const all = pairs();
  const tutorial = all.find(p => p.kind === "tutorial");
  if (!profile.tutorialDone && tutorial) return tutorial;
  const candidates = all.filter(p => p.kind === "bucket");
  const lastPlayed = (id: string) => {
    for (let i = profile.history.length - 1; i >= 0; i--) if (profile.history[i].pair === id) return i;
    return -1;
  };
  const scored = candidates.map(p => {
    const k = BUCKET_IDS.indexOf(p.bucket as BucketId);
    const played = lastPlayed(p.id);
    // Unplayed pairs first; then interest; then whatever was played longest ago.
    const freshness = played < 0 ? 2 : -(played + 1) / Math.max(1, profile.history.length);
    return { p, score: freshness + (interestWeights[k] ?? 0) * 3 };
  });
  scored.sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id));
  return scored[0]?.p ?? all[0];
}
