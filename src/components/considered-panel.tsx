"use client";
import type { Considered } from "@/lib/game/state";

const PATH: Record<Considered["path"], string> = {
  planner: "The planner decided on its own.",
  llm: "A close call: Venn deliberated with Claude.",
  fallback: "A close call, but the deliberation didn't pass its checks, so the planner's move stood.",
};

// Collapsed by default. Shows the shortlist, the memory Venn used (and
// cited), what it recalled, and what it ignored, with reasons.
export function ConsideredPanel({ c }: { c: Considered }) {
  return (
    <details className="considered">
      <summary>What Venn considered</summary>
      <p style={{ margin: "0.5rem 0 0" }}>{PATH[c.path]} <span className="faint">({c.gate}{c.llm === "off" ? "; LLM off" : c.failure ? `; ${c.failure}` : ""})</span></p>
      {c.reason && <p className="muted" style={{ margin: "0.3rem 0 0" }}>Venn&apos;s reason: {c.reason}</p>}
      <h4>Moves on the shortlist</h4>
      <ul>{c.shortlist.map(s => <li key={s.title}>{s.chosen ? <strong>{s.title}</strong> : s.title} <span className="reason-tag">{s.roles.join(" + ")}</span> <span className="faint">{s.score.toFixed(2)}</span></li>)}</ul>
      <h4>Memory used</h4>
      {c.used.length ? <ul>{c.used.map(u => <li key={u.id}>{u.text}{u.cited && <span className="cited">cited</span>} <span className="faint">relevance {u.relevance.toFixed(2)}</span></li>)}</ul> : <p className="faint">Nothing in memory would change this decision.</p>}
      {c.recalled.length > 0 && (<><h4>Recalled on demand</h4><ul>{c.recalled.map(r => <li key={r.id}>{r.text}</li>)}</ul></>)}
      {c.ignored.length > 0 && (<><h4>Ignored</h4><ul>{c.ignored.map(g => <li key={g.id}>{g.text}<span className="reason-tag">{g.reason}</span></li>)}</ul></>)}
    </details>
  );
}
