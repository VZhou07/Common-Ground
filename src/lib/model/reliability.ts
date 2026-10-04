// Memory reliability (§6.2): Beta(confirmations + 1, contradictions + 1).
import type { MemoryItem } from "./profile";

// ★ CORE-CTX-1: reliability is the Beta posterior mean. A fresh item is a
// coin flip (0.5); "not me" adds 5 contradictions and blocks the item's key.
export const reliability = (m: Pick<MemoryItem, "evidence">) => (m.evidence.confirm + 1) / (m.evidence.confirm + m.evidence.contradict + 2);

export function recordOutcome(m: MemoryItem, right: boolean): MemoryItem {
  return { ...m, evidence: right ? { ...m.evidence, confirm: m.evidence.confirm + 1 } : { ...m.evidence, contradict: m.evidence.contradict + 1 } };
}
