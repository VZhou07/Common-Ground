// Game rules that are pure functions (§3). Safe to import from the browser.

export type Difficulty = "easy" | "normal" | "hard";
export type Mode = "daily" | "unlimited";
export const STEP_BACK = "__back__";
export const GIVE_UP = "__giveup__";

export type Label = "In sync" | "Finding each other" | "Drifting" | "Lost each other";

// ★ CORE-RULES-4: score = moves ÷ the pair's known-route length. The known
// route is "known", never "optimal": beating it is celebrated, not impossible.
export function label(moves: number, routeLength: number, gaveUp: boolean): Label {
  if (gaveUp) return "Lost each other";
  const ratio = moves / Math.max(1, routeLength);
  if (ratio <= 1.0) return "In sync";
  if (ratio <= 2.0) return "Finding each other";
  if (ratio <= 3.3) return "Drifting";
  return "Lost each other";
}
export const ratioOf = (moves: number, routeLength: number) => moves / Math.max(1, routeLength);

export function scoreLine(moves: number, routeLength: number, met: boolean): string {
  if (!met) return `Venn knew a ${routeLength}-move way. We lost each other this time.`;
  if (moves < routeLength) return `Venn knew a ${routeLength}-move way; you met in ${moves}. You beat it!`;
  return `Venn knew a ${routeLength}-move way; you met in ${moves}.`;
}

// ★ CORE-RULES-5: step back = pop your navigation stack. It costs a move and
// is unavailable when there is nowhere to go back to (turn 1).
export function stepBackTarget(stack: string[]): string | null {
  return stack.length >= 2 ? stack[stack.length - 2] : null;
}

// ★ CORE-RULES-6: meeting = the same canonical page on the same turn. Every
// title in play is already canonical (redirects resolved when parsed).
export const met = (youNext: string, vennNext: string) => youNext === vennNext;

// Daily numbering: Common Ground #1 was 2026-10-03.
const EPOCH = Date.UTC(2026, 9, 3);
export function dailyNumber(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Math.max(1, Math.floor((Date.UTC(y, m - 1, d) - EPOCH) / 86_400_000) + 1);
}
export const weekdayOf = (day: string) => { const [y, m, d] = day.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
// Known-route length by weekday (Sun..Sat): easiest Monday, hardest Fri/Sat.
export const DAILY_LENGTH = [3, 2, 2, 3, 3, 4, 4];

// Spoiler-free share text: no titles, just the shape of the game.
export function shareText(o: { number?: number; mode: Mode; difficulty: Difficulty; label: Label; moves: number; routeLength: number; verdicts: ("converged" | "diverged" | "neutral")[]; met: boolean }): string {
  const squares = o.verdicts.map(v => (v === "converged" ? "🟩" : v === "diverged" ? "🟥" : "⬜")).join("");
  const head = o.mode === "daily" && o.number ? `Common Ground #${o.number}` : "Common Ground";
  const result = `${o.met ? "met in" : "gave up after"} ${o.moves} (known ${o.routeLength})`;
  return `${head} · ${o.difficulty[0].toUpperCase()}${o.difficulty.slice(1)}\n${o.label} · ${result}\n${squares}${o.met ? "🤝" : ""}`;
}
