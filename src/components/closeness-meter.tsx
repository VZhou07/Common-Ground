"use client";
import { motion, useReducedMotion } from "motion/react";

export function ClosenessMeter(props: { c: number; callout: string | null; dc: number | null }) {
  const reduce = useReducedMotion();
  const pct = Math.round(Math.max(0, Math.min(1, props.c)) * 100);
  const trend = props.dc === null ? null : props.dc > 0.05 ? "Warmer" : props.dc < -0.05 ? "Colder" : "About the same";
  return (
    <section className="card meter" aria-label="How close you and Venn are">
      <p className="kicker" style={{ margin: 0 }}>Closeness</p>
      <div className="meter-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Closeness ${pct} out of 100`}>
        <motion.div className="meter-knob" initial={false} animate={{ left: `${pct}%` }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 18 }} />
      </div>
      <div className="meter-scale"><span>Cold</span>{trend && <span aria-live="polite">{trend}</span>}<span>Hot</span></div>
      {props.callout && <p className="callout" role="status">{props.callout}</p>}
    </section>
  );
}
