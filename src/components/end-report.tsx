"use client";
import { useState } from "react";
import Link from "next/link";
import type { EndReport as Report } from "@/lib/game/engine";
import type { Profile } from "@/lib/model/profile";
import { bucketLabel } from "@/lib/topics/buckets";
import { loadProfile, saveProfile } from "@/lib/client/store";

function Chart({ points }: { points: Report["chart"] }) {
  const w = 520, h = 170, pad = 28;
  const x = (i: number) => pad + (i * (w - 2 * pad)) / Math.max(1, points.length - 1);
  const y = (c: number) => h - pad - c * (h - 2 * pad);
  const color = (v: string | null) => (v === "converged" ? "var(--good)" : v === "diverged" ? "var(--bad)" : "var(--ink-faint)");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Closeness over the turns">
      <line x1={pad} x2={w - pad} y1={y(0.5)} y2={y(0.5)} stroke="var(--rule)" strokeDasharray="4 4" />
      <text x={4} y={y(1) + 4} fontSize="10" fill="var(--ink-faint)">hot</text>
      <text x={4} y={y(0) + 4} fontSize="10" fill="var(--ink-faint)">cold</text>
      <polyline fill="none" stroke="var(--venn)" strokeWidth="2" points={points.map((p, i) => `${x(i)},${y(p.c)}`).join(" ")} />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.c)} r={5} fill={i === 0 ? "var(--ink)" : color(p.verdict)}><title>{`Turn ${p.turn}: ${p.verdict ?? "start"}${p.bucket ? ` (${p.bucket})` : ""}`}</title></circle>
          <text x={x(i)} y={h - 8} fontSize="10" textAnchor="middle" fill="var(--ink-faint)">{i === 0 ? "start" : p.turn}</text>
        </g>
      ))}
    </svg>
  );
}

export function EndReport({ report, onAgain }: { report: Report; onAgain: () => void }) {
  const [decided, setDecided] = useState<Record<string, "kept" | "rejected">>({});
  const [copied, setCopied] = useState(false);
  const svr = report.statedVsRevealed;

  // ✓ adds a confirmation; "not me" contradicts the item and blocks it from
  // ever coming back. Both happen right here, in your browser's copy.
  function decide(id: string, keep: boolean) {
    const p = loadProfile();
    if (!p) return;
    const item = p.memory.find(m => m.id === id);
    if (!item) return;
    const next: Profile = keep
      ? { ...p, memory: p.memory.map(m => (m.id === id ? { ...m, evidence: { ...m.evidence, confirm: m.evidence.confirm + 1 } } : m)) }
      : { ...p, memory: p.memory.filter(m => m.id !== id), blocked: [...new Set([...p.blocked, item.key])].slice(-200) };
    saveProfile(next);
    setDecided({ ...decided, [id]: keep ? "kept" : "rejected" });
  }

  return (
    <section className="end" aria-label="End of game">
      <div className="end-hero">
        <p className="kicker">{report.met ? "You met at" : "This time"}</p>
        <h2>{report.met ? report.meet : "We lost each other"}</h2>
        <p style={{ margin: "0.5rem 0" }}><span className="label-pill">{report.label}</span></p>
        <p className="muted" style={{ margin: 0 }}>{report.scoreLine}</p>
        <p className="faint" style={{ margin: "0.3rem 0 0" }}>
          {report.personalBest.isNew ? `New personal best in ${report.personalBest.bucket}!` : report.personalBest.ratio === null ? `No personal best yet in ${report.personalBest.bucket}.` : `Personal best in ${report.personalBest.bucket}: ${report.personalBest.ratio.toFixed(2)}× the known route`}
        </p>
      </div>

      <div className="grid-2">
        <div className="card">
          <p className="kicker">How close we were</p>
          <Chart points={report.chart} />
          <p className="faint" style={{ margin: 0 }}>Green: you moved toward Venn. Red: away, when a closer link existed. Grey: neither.</p>
        </div>
        <div className="card">
          <p className="kicker">Venn&apos;s known route</p>
          <p style={{ margin: "0.2rem 0" }}><strong>You:</strong> {report.knownRoute.you.join(" → ")}</p>
          <p style={{ margin: "0.2rem 0" }}><strong>Venn:</strong> {report.knownRoute.venn.join(" → ")}</p>
          <p className="faint">Known, not optimal. Beating it counts.</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <p className="kicker">This game&apos;s topics</p>
          {report.topics.length ? (
            <div className="bars">{report.topics.map(t => (
              <div className="bar-row" key={t.bucket}><span>{t.bucket}</span><span className="bar you"><span style={{ width: `${(100 * t.moves) / Math.max(...report.topics.map(x => x.moves))}%` }} /></span><span className="faint">{t.moves}</span></div>
            ))}</div>
          ) : <p className="faint">No topics to show.</p>}
        </div>
        <div className="card">
          <p className="kicker">Stated versus revealed</p>
          <p style={{ margin: "0.2rem 0" }}>You said: {svr.stated.length ? svr.stated.map(bucketLabel).join(", ") : "nothing yet"}</p>
          <p style={{ margin: "0.2rem 0" }}>You went: {svr.revealed.length ? svr.revealed.map(r => `${bucketLabel(r.bucket)} (${Math.round(r.share * 100)}%)`).join(", ") : "not enough moves yet"}</p>
          {svr.stated.length > 0 && svr.revealed.length > 0 && <p className="faint">{svr.moves < 3 ? "Too early to compare: a few more moves first." : svr.agrees ? "Where you go matches what you said." : "Where you go differs from what you said. Interesting."}</p>}
        </div>
      </div>

      <div className="card remember">
        <p className="kicker">What Venn will remember</p>
        {report.remember.length ? (
          <ul>{report.remember.map(m => (
            <li key={m.id}>
              <span>
                <span className="text">{m.phrasing ?? m.text}</span><br />
                {m.phrasing && <><span className="muted">Stored as: {m.text}</span><br /></>}
                <span className="faint">{m.type} · {m.evidence}</span>
              </span>
              {decided[m.id] ? <span className="faint">{decided[m.id] === "kept" ? "Kept ✓" : "Forgotten"}</span> : (
                <span style={{ display: "flex", gap: "0.3rem" }}>
                  <button className="btn secondary" onClick={() => decide(m.id, true)} aria-label={`Keep: ${m.text}`}>✓</button>
                  <button className="btn secondary" onClick={() => decide(m.id, false)} aria-label={`Not me: ${m.text}`}>not me</button>
                </span>
              )}
            </li>
          ))}</ul>
        ) : <p className="faint">Nothing new worth remembering this time.</p>}
      </div>

      <div className="card">
        <p className="kicker">Share (no spoilers)</p>
        <div className="share">{report.share}</div>
        <button className="btn secondary" onClick={async () => { await navigator.clipboard.writeText(report.share).catch(() => {}); setCopied(true); }}>{copied ? "Copied" : "Copy"}</button>
      </div>

      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
        <button className="btn" onClick={onAgain}>Play again</button>
        <Link className="btn secondary" href="/us" style={{ textDecoration: "none" }}>See us</Link>
      </div>
    </section>
  );
}
