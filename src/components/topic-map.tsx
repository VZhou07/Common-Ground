"use client";
import { BUCKETS } from "@/lib/topics/buckets";
import { readElo } from "@/lib/model/elo";
import type { Profile } from "@/lib/model/profile";

// 12 spokes. Each wedge shows where we click (green, outward) or lose each
// other (red), filled in only as evidence comes in; unexplored buckets stay
// grey. The small ring marks Venn's blind spots: where it misreads you.
export function TopicMap({ profile }: { profile: Profile }) {
  const size = 420, c = size / 2, r0 = 46, r1 = 168;
  const ability = readElo(profile.ability);
  const blind = readElo(profile.blind);
  const n = BUCKETS.length;
  const angle = (i: number) => (i / n) * Math.PI * 2 - Math.PI / 2;
  const pt = (i: number, r: number, off = 0) => [c + r * Math.cos(angle(i) + off), c + r * Math.sin(angle(i) + off)] as const;
  const wedge = (i: number, r: number) => {
    const half = Math.PI / n - 0.03;
    const [x1, y1] = pt(i, r0, -half), [x2, y2] = pt(i, r, -half), [x3, y3] = pt(i, r, half), [x4, y4] = pt(i, r0, half);
    return `M${x1},${y1} L${x2},${y2} A${r},${r} 0 0 1 ${x3},${y3} L${x4},${y4} A${r0},${r0} 0 0 0 ${x1},${y1} Z`;
  };
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Where we click and where we lose each other, by topic">
      <circle cx={c} cy={c} r={r1} fill="none" stroke="var(--rule)" />
      <circle cx={c} cy={c} r={(r0 + r1) / 2} fill="none" stroke="var(--rule)" strokeDasharray="3 4" />
      {BUCKETS.map((b, i) => {
        const a = ability[i];
        const strength = Math.min(1, Math.abs(a.rating) / 2);
        const r = a.status === "unexplored" ? r1 : r0 + (r1 - r0) * (0.25 + 0.75 * (a.status === "mapped" ? strength : strength * 0.5));
        const fill = a.status === "unexplored" ? "#efece5" : a.rating >= 0 ? "var(--good)" : "var(--bad)";
        const opacity = a.status === "unexplored" ? 1 : a.status === "still mapping" ? 0.35 : 0.75;
        const [lx, ly] = pt(i, r1 + 22);
        const bl = blind[i];
        const [bx, by] = pt(i, r0 - 14);
        return (
          <g key={b.id}>
            <path d={wedge(i, r)} fill={fill} opacity={opacity} stroke="#fff" strokeWidth={1.5}>
              <title>{`${b.label}: ${a.status === "unexplored" ? "unexplored" : `${a.rating >= 0 ? "we click" : "we lose each other"} (${a.rating >= 0 ? "+" : ""}${a.rating.toFixed(1)} ± ${a.uncertainty.toFixed(1)}, n=${a.n})${a.status === "still mapping" ? ", still mapping" : ""}`}`}</title>
            </path>
            {bl.n > 0 && <circle cx={bx} cy={by} r={4 + Math.min(4, bl.n / 3)} fill={bl.rating >= 0 ? "var(--venn)" : "#e0a35a"} opacity={bl.status === "mapped" ? 0.9 : 0.45}><title>{`Venn ${bl.rating >= 0 ? "reads you well" : "misreads you"} in ${b.label} (n=${bl.n})`}</title></circle>}
            <text x={lx} y={ly} fontSize="10.5" textAnchor="middle" dominantBaseline="middle" fill={a.status === "unexplored" ? "var(--ink-faint)" : "var(--ink)"}>{b.label.split(" ")[0].replace(",", "")}</text>
          </g>
        );
      })}
      <text x={c} y={c - 4} textAnchor="middle" fontSize="13" fontFamily="var(--serif)">us</text>
      <text x={c} y={c + 12} textAnchor="middle" fontSize="9" fill="var(--ink-faint)">{profile.games} game{profile.games === 1 ? "" : "s"}</text>
    </svg>
  );
}
