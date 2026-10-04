"use client";
import { useEffect, useState } from "react";
import { Masthead } from "./masthead";
import { TopicMap } from "./topic-map";
import { forgetMe, loadInterest, loadProfile } from "@/lib/client/store";
import type { Profile } from "@/lib/model/profile";
import { statedVsRevealed, interestWeights } from "@/lib/model/interest";
import { reliability } from "@/lib/model/reliability";
import { BUCKETS, bucketLabel } from "@/lib/topics/buckets";
import { readElo } from "@/lib/model/elo";

// Code-template rendering, mirrored client-side (no LLM text is ever stored).
function describe(m: Profile["memory"][number]): string {
  const d = m.data;
  if (d.kind === "convention") return `We usually meet through ${bucketLabel(d.bucket)} (${d.count} meetings).`;
  if (d.kind === "topicStat") return `${bucketLabel(d.bucket)}: ${d.ability >= 0 ? "we click" : "we lose each other"} (ability ${d.ability >= 0 ? "+" : ""}${d.ability.toFixed(1)}, n=${d.n}).`;
  if (d.kind === "episode") return `Turn ${d.turn}: you went to ${d.to} from ${d.from}.`;
  const text: Record<string, [string, string]> = {
    gain: ["You head straight for my page when you can see a way.", "You wander away from my page before coming back."],
    interest: ["You follow your own interests more than my hints.", "You set your own interests aside to find me."],
    prominence: ["You pick links near the top of the article.", "You dig deep into the article for specific links."],
    hint: ["You take my hints.", "You tend to ignore my hints."],
    shared: ["You spot the links we share.", "You walk past the links we share."],
    back: ["You step back when you feel lost.", "You almost never step back."],
  };
  return text[d.feature][d.delta >= 0 ? 0 : 1];
}

export function Us() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [interestText, setInterestText] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    // localStorage is only readable after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(loadProfile()); setInterestText(loadInterest()?.text ?? null); setLoaded(true);
  }, []);

  if (!loaded) return <main className="shell"><Masthead /></main>;
  if (!profile || profile.games === 0) return (
    <main className="shell narrow"><Masthead /><p className="venn-says">We haven&apos;t played yet. After a game, this is where you&apos;ll see what I learn about how we play together.</p></main>
  );

  const svr = statedVsRevealed(profile.interest);
  const prior = interestWeights({ stated: profile.interest.stated, counts: profile.interest.counts.map(() => 0) });
  const total = profile.interest.counts.reduce((s, x) => s + x, 0);
  const lessons = profile.memory.filter(m => m.type === "convention" || m.type === "theory");
  const stats = profile.memory.filter(m => m.type === "topicStat");
  const curve = profile.history.map(h => (h.met ? h.moves / h.routeLength : null));
  const blind = readElo(profile.blind).filter(b => b.status === "mapped" && b.rating < 0).map(b => BUCKETS[b.bucket].label);

  return (
    <main className="shell">
      <Masthead />
      <div className="us-grid">
        <section className="card map">
          <p className="kicker">Where we click, where we lose each other</p>
          <TopicMap profile={profile} />
          <div className="legend">
            <span><i style={{ background: "var(--good)" }} />we click</span>
            <span><i style={{ background: "var(--bad)" }} />we lose each other</span>
            <span><i style={{ background: "#efece5" }} />unexplored</span>
            <span><i style={{ background: "var(--good)", opacity: 0.35 }} />still mapping (under 5 turns)</span>
            <span><i style={{ background: "#e0a35a", borderRadius: "50%" }} />Venn&apos;s blind spot</span>
          </div>
          {blind.length > 0 && <p className="faint">Venn misreads you most in {blind.join(", ")}.</p>}
        </section>

        <div style={{ display: "grid", gap: "1rem" }}>
          <section className="card">
            <p className="kicker">What Venn has learned about how we play</p>
            {lessons.length || stats.length ? (
              <ul className="memory-list">
                {[...lessons, ...stats].map(m => (
                  <li key={m.id}>{describe(m)}<br /><span className="evidence">{m.type} · confirmed {m.evidence.confirm}, contradicted {m.evidence.contradict} · reliability {Math.round(reliability(m) * 100)}%</span></li>
                ))}
              </ul>
            ) : <p className="faint">Still mapping. Conventions and theories appear after a few games.</p>}
          </section>

          <section className="card">
            <p className="kicker">Interests: stated versus revealed</p>
            <p className="faint" style={{ marginTop: 0 }}>You said {interestText ? `“${interestText}”` : "nothing"}{svr.stated.length ? ` (${svr.stated.map(bucketLabel).join(", ")})` : ""}. Bars: what you said (light) and where you went (dark).</p>
            <div className="bars">
              {BUCKETS.map((b, k) => {
                const went = total ? profile.interest.counts[k] / total : 0;
                if (prior[k] < 0.05 && went === 0) return null;
                return (
                  <div className="bar-row" key={b.id}>
                    <span>{b.label}</span>
                    <span style={{ display: "grid", gap: 2 }}>
                      <span className="bar"><span style={{ width: `${Math.round(prior[k] * 100)}%`, opacity: 0.35 }} /></span>
                      <span className="bar you"><span style={{ width: `${Math.round(went * 100)}%` }} /></span>
                    </span>
                    <span className="faint">{Math.round(went * 100)}%</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card">
            <p className="kicker">Learning curve: moves per game ÷ known route</p>
            <svg viewBox="0 0 300 90" role="img" aria-label="Moves per game over time">
              <line x1="10" x2="290" y1="70" y2="70" stroke="var(--rule)" />
              <line x1="10" x2="290" y1={70 - 20} y2={70 - 20} stroke="var(--rule)" strokeDasharray="3 3" />
              <text x="292" y={53} fontSize="8" fill="var(--ink-faint)">1×</text>
              {curve.map((v, i) => {
                const x = 10 + (i * 280) / Math.max(1, curve.length - 1);
                return v === null
                  ? <text key={i} x={x} y={20} fontSize="9" textAnchor="middle" fill="var(--bad)">×</text>
                  : <circle key={i} cx={x} cy={70 - Math.min(60, v * 20)} r={3.5} fill="var(--venn)"><title>{`Game ${i + 1}: ${v.toFixed(2)}×`}</title></circle>;
              })}
            </svg>
            <p className="faint" style={{ margin: 0 }}>Lower is better. × = lost each other.</p>
          </section>

          <section className="card">
            <p className="kicker">Forget me</p>
            <p className="faint" style={{ marginTop: 0 }}>Everything Venn knows about you is stored only in this browser. This wipes all of it.</p>
            <button className="btn secondary" onClick={() => { if (confirm("Wipe everything Venn knows about you?")) { forgetMe(); setProfile(null); } }}>Forget me</button>
          </section>
        </div>
      </div>
    </main>
  );
}
