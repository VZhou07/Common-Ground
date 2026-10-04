// recall(question): the deliberating model's only tool. Read-only: it
// searches the player's memory items by embedding and returns code-rendered
// text with IDs (which then become citable).
import { dot } from "../embed/embed";
import { vectors } from "../embed/store";
import type { MemoryItem, Profile } from "../model/profile";
import { reliability } from "../model/reliability";
import { render } from "./memory";

export async function recall(question: string, profile: Profile, exclude: Set<string>, k = 3, signal?: AbortSignal): Promise<{ id: string; text: string }[]> {
  const q = question.replace(/[\u0000-\u001f<>]/g, " ").slice(0, 200);
  const items = profile.memory.filter((m: MemoryItem) => !m.sensitive && !profile.blocked.includes(m.key) && reliability(m) >= 0.3 && !exclude.has(m.id));
  if (!q.trim() || !items.length) return [];
  const texts = items.map(render);
  const [qv, ...vs] = await vectors([q, ...texts], signal);
  return items.map((m, i) => ({ id: m.id, text: texts[i], score: dot(qv, vs[i]) }))
    .sort((a, b) => b.score - a.score).slice(0, k).map(({ id, text }) => ({ id, text }));
}
