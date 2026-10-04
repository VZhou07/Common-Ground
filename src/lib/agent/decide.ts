// Sealing Venn's move (§7 step 6).
import { BUCKET_IDS, type BucketId } from "../topics/buckets";
import { commitment, nonce } from "../game/seal";
import type { Considered, GameState, Pending } from "../game/state";
import type { Pair } from "../game/makepair";
import { hintFor } from "../voice/lines";
import type { Perception } from "./perceive";
import { bucketDistribution, entropyNorm, type Plan } from "./planner";

// Venn knows its own half of the known route; it's "on route" while every
// page it has visited matches that route.
export const routeNextFor = (state: GameState, pair: Pair): string | null => {
  const route = pair.route.venn;
  const onRoute = state.vennTrail.every((t, i) => route[i] === t);
  return onRoute ? route[state.vennTrail.length] ?? null : null;
};

// ★ CORE-SEAL-2: the move is fixed here, before the player moves. The hint
// is derived from the final move and stance, so it can't contradict them.
export function seal(
  p: Perception, pl: Plan, move: string, stance: Pending["stance"], read: { bucket: BucketId; confidence: number } | null,
  cited: string[], considered: Omit<Considered, "shortlist"> & Partial<Pick<Considered, "shortlist">>, state: GameState,
): Pending {
  const x = p.vennOptions.find(o => o.title === move) ?? p.vennOptions[pl.best.index];
  const intent = x.top[0] ?? null;
  const hint = hintFor(state.difficulty, stance, intent, pl.rescue, `${state.id}:${state.turn}`);
  const buckets = bucketDistribution(p, pl.base);
  const top = BUCKET_IDS.map((id, k) => [id, buckets[k]] as const).sort((a, b) => b[1] - a[1])[0];
  const n = nonce();
  return {
    move: x.title, nonce: n, commitment: commitment(x.title, n),
    hint, stance, intent,
    read: read ?? { bucket: top?.[0] ?? null, confidence: top?.[1] ?? 0 },
    readB: 4 * entropyNorm(buckets) - 2,
    cited, used: [], impacts: [],
    considered: {
      ...considered,
      shortlist: pl.shortlist.map(c => ({ title: c.title, roles: c.roles, score: Number(c.V.toFixed(3)), chosen: c.title === x.title })),
    },
  };
}
