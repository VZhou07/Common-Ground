"use client";
import { motion, useReducedMotion } from "motion/react";
import type { Considered } from "@/lib/game/state";
import { ConsideredPanel } from "./considered-panel";

export type RevealData = {
  turn: number; you: string; venn: string; met: boolean; verdict: "converged" | "diverged" | "neutral";
  line: string; verified: boolean | null; read: string | null; readRight: boolean; considered: Considered;
};

const VERDICT = { converged: "You moved toward Venn", diverged: "You moved away from Venn", neutral: "Neither closer nor further" };

export function Reveal({ r }: { r: RevealData }) {
  const reduce = useReducedMotion();
  const flip = (delay: number) => (reduce ? {} : { initial: { rotateY: 90, opacity: 0 }, animate: { rotateY: 0, opacity: 1 }, transition: { duration: 0.5, delay } });
  return (
    <section className="reveal" aria-live="polite" aria-label={`Turn ${r.turn} reveal`}>
      <p className="kicker" style={{ margin: 0 }}>Turn {r.turn} · revealed together</p>
      <div className="reveal-cards" style={{ marginTop: "0.5rem" }}>
        <motion.div className="flip you" {...flip(0)}><div className="who">You went to</div><div className="page">{r.you}</div></motion.div>
        <motion.div className="flip venn" {...flip(0.12)}><div className="who">Venn went to</div><div className="page">{r.venn}</div></motion.div>
      </div>
      <p className="venn-line">“{r.line}”</p>
      <p style={{ margin: 0, display: "flex", gap: "0.8rem", flexWrap: "wrap", alignItems: "baseline" }}>
        {!r.met && <span className={`verdict ${r.verdict}`}>{VERDICT[r.verdict]}</span>}
        {r.read && <span className="faint">Venn read: {r.read} {r.readRight ? "✓" : "✗"}</span>}
        <span className="verified">{r.verified === null ? "" : r.verified ? "✓ Venn's sealed move matches its commitment" : "⚠ Commitment mismatch"}</span>
      </p>
      <ConsideredPanel c={r.considered} />
    </section>
  );
}
