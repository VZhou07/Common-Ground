"use client";
import { motion, useReducedMotion } from "motion/react";

export function VennCard(props: { title: string; description: string; tags: string[]; hint: string | null; deciding: boolean; difficulty: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      className="venn-card" aria-label="Venn's page"
      key={props.title}
      initial={reduce ? false : { rotateY: -90, opacity: 0 }}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <p className="venn-badge" style={{ margin: 0 }}><span className="venn-dot" aria-hidden /> Venn is on</p>
      <h3>{props.title}</h3>
      {props.description && <p className="muted" style={{ margin: "0 0 0.5rem" }}>{props.description}</p>}
      <div className="chips">{props.tags.map(t => <span key={t} className="chip venn">{t}</span>)}</div>
      {props.hint !== null && (
        props.hint
          ? <p className="venn-hint">“{props.hint}”</p>
          : <p className="venn-hint silent">{props.difficulty === "hard" ? "Venn stays quiet on Hard." : "…"}</p>
      )}
      <p className="status" aria-live="polite">
        <span className={`pulse ${props.deciding ? "" : "done"}`} aria-hidden />
        {props.deciding ? "Venn is still deciding…" : "Venn has sealed its move."}
      </p>
    </motion.section>
  );
}
