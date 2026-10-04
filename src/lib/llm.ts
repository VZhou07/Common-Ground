// Shared LLM plumbing: the on/off switch, model IDs, a spending guard, and
// the sanitizer for untrusted text. The API key never leaves the server.
import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";

// ★ CORE-SAFE-8: LLM_ENABLED=false (or no key) turns every LLM job off. The
// game is fully playable that way, and it doubles as the outage plan.
export const llmEnabled = () => process.env.LLM_ENABLED === "true" && !!process.env.ANTHROPIC_API_KEY && spendOk();

export const MODELS = {
  think: () => process.env.VENN_THINK_MODEL || "claude-sonnet-5-5",
  voice: () => process.env.VENN_VOICE_MODEL || "claude-haiku-4-5-20251001",
};

let fetchOverride: typeof fetch | undefined;
export const setLlmFetch = (f: typeof fetch | undefined) => { fetchOverride = f; };
export const anthropic = () => createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY, fetch: fetchOverride });

// Best-effort per-instance spending cap (USD per UTC day). Hosting-level
// limits and the provider's own spend limit are still the real backstop.
const PRICE: Record<string, [number, number]> = { sonnet: [2, 10], haiku: [1, 5], opus: [4, 20] };
let spend = { day: "", usd: 0 };
export function spendOk(): boolean {
  const day = new Date().toISOString().slice(0, 10);
  if (spend.day !== day) spend = { day, usd: 0 };
  return spend.usd < Number(process.env.LLM_DAILY_BUDGET_USD || 3);
}
export function recordUsage(model: string, usage: { inputTokens?: number; outputTokens?: number } | undefined) {
  const [i, o] = PRICE[Object.keys(PRICE).find(k => model.includes(k)) ?? "sonnet"];
  spend.usd += ((usage?.inputTokens ?? 0) * i + (usage?.outputTokens ?? 0) * o) / 1e6;
}
export const spentToday = () => spend.usd;

// ★ CORE-SAFE-9: untrusted text (Wikipedia titles and descriptions) is
// length-capped and stripped of control characters and angle brackets, so it
// can't close the <untrusted> block or smuggle in new lines.
export const clean = (text: string, max: number) => text.replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
