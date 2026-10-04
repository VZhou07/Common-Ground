"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Masthead } from "./masthead";
import { api, loadDailyDone, loadInterest, loadProfile, loadSettings, localDay, saveInterest, saveSettings, type Interest, type Settings } from "@/lib/client/store";
import { statedVsRevealed } from "@/lib/model/interest";
import { bucketLabel } from "@/lib/topics/buckets";

type Chip = { id: string; label: string };

export function Setup() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [chips, setChips] = useState<Chip[]>([]);
  const [mapping, setMapping] = useState(false);
  const [settings, setSettings] = useState<Settings>({ difficulty: "normal", mode: "unlimited" });
  const [still, setStill] = useState<string | null>(null);
  const [dailyDone, setDailyDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saved = useRef<Interest | null>(null);
  const mapped = useRef<{ text: string; buckets: Chip[] } | null>(null);
  const latest = useRef("");

  async function mapInterest(v: string): Promise<Chip[]> {
    if (v.trim().length < 2) return [];
    if (mapped.current?.text === v) return mapped.current.buckets;
    const r = await api<{ buckets: Chip[] }>("/api/interest", { text: v });
    mapped.current = { text: v, buckets: r.buckets };
    return r.buckets;
  }

  useEffect(() => {
    const i = loadInterest();
    saved.current = i;
    const s = loadSettings();
    const p = loadProfile();
    const done = loadDailyDone();
    // Reading localStorage after mount keeps server and client markup equal.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(s);
    if (done?.day === localDay()) setDailyDone(done.label);
    if (i) {
      setText(i.text);
      setChips(i.buckets);
      latest.current = i.text;
      // Venn occasionally checks in: every few games, and with a nudge when
      // where you go has drifted from what you said.
      if (p && i.text && p.games - i.setAtGame >= 3) {
        const svr = statedVsRevealed(p.interest);
        const drift = svr.revealed[0] && !i.buckets.some(b => b.id === svr.revealed[0].bucket) ? ` You keep heading for ${bucketLabel(svr.revealed[0].bucket)}.` : "";
        setStill(`Still into ${i.text}?${drift}`);
      }
    }
  }, []);

  function onType(value: string) {
    const v = value.slice(0, 30);
    setText(v);
    latest.current = v;
    setStill(null);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { setChips([]); return; }
    timer.current = setTimeout(async () => {
      setMapping(true);
      try {
        const buckets = await mapInterest(v);
        if (latest.current === v) setChips(buckets);
      } catch { if (latest.current === v) setChips([]); } finally { if (latest.current === v) setMapping(false); }
    }, 350);
  }

  async function start() {
    if (settings.mode === "daily" && dailyDone) { setError("You've played today's daily. Try Unlimited, or come back tomorrow."); return; }
    setStarting(true);
    // Start can be clicked before the chips arrive: wait for this text's mapping.
    const buckets = await mapInterest(text).catch(() => chips);
    const prev = saved.current;
    const changed = !prev || prev.text !== text;
    const p = loadProfile();
    saveInterest({ text, buckets, setAtGame: changed ? p?.games ?? 0 : prev.setAtGame });
    saveSettings(settings);
    router.push(`/play?mode=${settings.mode}&difficulty=${settings.difficulty}`);
  }

  return (
    <main className="shell narrow">
      <Masthead />
      <p className="venn-badge"><span className="venn-dot" aria-hidden /> Venn</p>
      <p className="venn-says">I&apos;m Venn. I like math and anything that smells like it. What about you?</p>
      <div className="card" style={{ marginBottom: "1rem" }}>
        <p className="kicker">How we play</p>
        <p className="muted" style={{ margin: 0 }}>
          We start on two different Wikipedia pages. Each turn we both pick one link in our own article, sealed, then revealed together.
          Land on the same page on the same turn and we&apos;ve met. You&apos;ll see my page and a hint, never my links, so you&apos;ll have to read me.
        </p>
      </div>
      {still && <p className="card" style={{ marginBottom: "1rem" }}>{still}</p>}

      <div className="field">
        <label htmlFor="interest">Something you&apos;re into</label>
        <input id="interest" className="input" maxLength={30} placeholder="skiing, jazz, baking…" value={text} onChange={e => onType(e.target.value)} autoComplete="off" />
        <div className="chips" aria-live="polite">
          {mapping && <span className="faint">Reading that…</span>}
          {!mapping && chips.map(c => <span key={c.id} className="chip venn">{c.label}</span>)}
          {!mapping && text.trim().length >= 2 && !chips.length && <span className="faint">No stated interest. That&apos;s fine; I&apos;ll learn from where you go.</span>}
        </div>
        <p className="hint-line">Stays in this browser. Only the topic labels are used in play.</p>
      </div>

      <fieldset className="field">
        <legend>How much should I hint?</legend>
        <div className="segmented" role="radiogroup">
          {(["easy", "normal", "hard"] as const).map(d => (
            <label key={d}><input type="radio" name="difficulty" checked={settings.difficulty === d} onChange={() => setSettings({ ...settings, difficulty: d })} /><span>{d === "easy" ? "Easy" : d === "normal" ? "Normal" : "Hard"}</span></label>
          ))}
        </div>
        <p className="hint-line">{settings.difficulty === "easy" ? "I'll name the topic I'm heading toward." : settings.difficulty === "normal" ? "I'll hint at what I'm doing." : "I'll stay silent. Read me."}</p>
      </fieldset>

      <fieldset className="field">
        <legend>Which game?</legend>
        <div className="segmented" role="radiogroup">
          {(["daily", "unlimited"] as const).map(m => (
            <label key={m}><input type="radio" name="mode" checked={settings.mode === m} onChange={() => setSettings({ ...settings, mode: m })} /><span>{m === "daily" ? "Daily" : "Unlimited"}</span></label>
          ))}
        </div>
        <p className="hint-line">{settings.mode === "daily" ? (dailyDone ? `Today's daily is done: ${dailyDone}.` : "One pair for everyone today.") : "Your interest picks where you start."}</p>
      </fieldset>

      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" onClick={() => void start()} disabled={starting} style={{ marginTop: "0.5rem" }}>{starting ? "Starting…" : "Start"}</button>
    </main>
  );
}
