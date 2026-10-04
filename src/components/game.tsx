"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { move as moveFn, startGame, think as thinkFn, EndReport as Report } from "@/lib/game/engine";
import { freshProfile, type Profile } from "@/lib/model/profile";
import { api, loadInterest, loadProfile, localDay, saveDailyDone, saveProfile, verifyCommitment } from "@/lib/client/store";
import { GIVE_UP, STEP_BACK } from "@/lib/game/rules";
import { Masthead } from "./masthead";
import { Reader } from "./reader";
import { VennCard } from "./venn-card";
import { ClosenessMeter } from "./closeness-meter";
import { Reveal, type RevealData } from "./reveal";
import { EndReport } from "./end-report";
import { LinkSearch } from "./link-search";

type Start = Awaited<ReturnType<typeof startGame>>;
type Think = Awaited<ReturnType<typeof thinkFn>>;
type Move = Awaited<ReturnType<typeof moveFn>>;

export function Game() {
  const router = useRouter();
  const params = useSearchParams();
  const mode = params.get("mode") === "daily" ? "daily" : "unlimited";
  const difficulty = (["easy", "normal", "hard"] as const).find(d => d === params.get("difficulty")) ?? "normal";

  const [game, setGame] = useState<Start["game"] | null>(null);
  const [you, setYou] = useState<Start["you"] | null>(null);
  const [venn, setVenn] = useState<Start["venn"] | null>(null);
  const [meter, setMeter] = useState<Start["meter"] | null>(null);
  const [dc, setDc] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [commitment, setCommitment] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<RevealData | null>(null);
  const [end, setEnd] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const token = useRef<string>("");
  const profile = useRef<Profile>(freshProfile());
  const thinking = useRef(0);
  const starting = useRef(0);

  // Venn thinks after each reveal, while you read. The seal button stays
  // disabled until its commitment arrives.
  const think = useCallback(async () => {
    const ticket = ++thinking.current;
    setCommitment(null);
    setError(null);
    try {
      const t = await api<Think>("/api/game/think", { token: token.current, profile: profile.current });
      if (ticket !== thinking.current) return;
      token.current = t.token;
      setHint(t.hint);
      setCommitment(t.commitment);
    } catch (e) {
      if (ticket !== thinking.current) return;
      setError(e instanceof Error ? e.message : "Venn couldn't decide. Try again.");
    }
  }, []);

  const start = useCallback(async () => {
    const ticket = ++starting.current;
    ++thinking.current;
    setCommitment(null);
    setError(null); setEnd(null); setReveal(null); setSelected(null); setHint(null); setDc(null);
    profile.current = loadProfile() ?? freshProfile();
    const interest = loadInterest();
    try {
      const s = await api<Start>("/api/game/start", { mode, difficulty, day: localDay(), stated: (interest?.buckets ?? []).map(b => b.id).slice(0, 2), profile: profile.current });
      if (ticket !== starting.current) return;
      token.current = s.token;
      setGame(s.game); setYou(s.you); setVenn(s.venn); setMeter(s.meter);
      void think();
    } catch (e) {
      if (ticket !== starting.current) return;
      setError(e instanceof Error ? e.message : "Couldn't start a game.");
    }
  }, [mode, difficulty, think]);

  // Starting a game is a request to the server: an external system.
  // Unmounting invalidates any start or think still in flight.
  useEffect(() => {
    const starts = starting, thinks = thinking;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void start();
    return () => { ++starts.current; ++thinks.current; };
  }, [start]);

  // Ctrl+F (⌘F) opens the link search while you're choosing a move. With the
  // search already open the listener is gone, so it reaches the browser's find.
  const playing = !!you && !end;
  useEffect(() => {
    if (!playing || searching) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, searching]);

  function pickFromSearch(title: string) {
    setSelected(title);
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    requestAnimationFrame(() => document.querySelector(`.prose a[data-title="${CSS.escape(title)}"]`)?.scrollIntoView({ block: "center", behavior }));
  }

  async function send(move: string) {
    if (!commitment || busy) return;
    setBusy(true); setError(null);
    try {
      const r = await api<Move>("/api/game/move", { token: token.current, move, profile: profile.current });
      const verified = await verifyCommitment(r.reveal, commitment).catch(() => false);
      if (!verified) throw new Error("Venn's reveal did not match its earlier commitment. Your move was not accepted locally.");
      token.current = r.token;
      profile.current = r.profile;
      saveProfile(r.profile);
      setSelected(null);
      if (r.gaveUp) {
        setReveal({ turn: (reveal?.turn ?? 0) + 1, you: "(gave up)", venn: r.reveal.move, met: false, gaveUp: true, verdict: "neutral", line: r.line, verified, read: null, readRight: false, considered: r.considered });
      } else if (r.turn) {
        setReveal({ turn: (reveal?.turn ?? 0) + 1, you: r.turn.you, venn: r.turn.venn, met: r.met, verdict: r.turn.verdict, dc: r.turn.dc, line: r.line, verified, read: r.turn.read, readRight: r.turn.readRight, considered: r.considered });
        setDc(r.turn.dc);
      }
      if (r.end) {
        setEnd(r.end);
        if (mode === "daily") saveDailyDone({ day: localDay(), label: r.end.label, share: r.end.share });
      } else if (r.next) {
        setYou(r.next.you); setVenn(r.next.venn); setMeter(r.next.meter); setHint(null);
        void think();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That move didn't go through.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !you) return (<main className="shell"><Masthead /><p className="error" role="alert">{error}</p><button className="btn" onClick={() => void start()}>Try again</button></main>);
  if (!you || !venn || !meter || !game) return (<main className="shell"><Masthead /><p className="muted">Setting up two pages…</p></main>);

  return (
    <main className="shell">
      <Masthead />
      <p className="faint" style={{ marginTop: "-0.8rem" }}>
        {game.mode === "daily" ? `Daily #${game.number}` : game.tutorial ? "Your first game: a short one" : "Unlimited"} · {difficulty[0].toUpperCase() + difficulty.slice(1)} · Venn knows a {game.routeLength}-move way
      </p>
      {reveal && <Reveal r={reveal} />}
      {end ? <EndReport report={end} onAgain={() => router.push("/")} /> : (
        <div className="play">
          <div>
            <Reader {...you} selected={selected} disabled={busy} onSelect={setSelected} onSearch={() => setSearching(true)} />
            {searching && playing && <LinkSearch links={you.links} disabled={busy} onClose={() => setSearching(false)} onPick={pickFromSearch} />}
            <div className="movebar">
              <span className="venn-mini">Venn is on <strong>{venn.title}</strong>{commitment ? (hint ? ` · “${hint}”` : "") : " · deciding…"}</span>
              <span className="selected-label">{selected ? <>Your move: <strong>{selected}</strong></> : <span className="muted">{game.tutorial && !reveal ? "Pick a link that might lead toward Venn's page. You both move at once." : "Pick a link in your article."}</span>}</span>
              <span className="actions">
                <button className="btn quiet" disabled={!you.canStepBack || !commitment || busy} onClick={() => void send(STEP_BACK)} title={you.back ? `Back to ${you.back}` : "Nothing to go back to yet"}>Step back</button>
                <button className="btn quiet" disabled={!commitment || busy} onClick={() => { if (confirm("Give up this game?")) void send(GIVE_UP); }}>Give up</button>
                <button className="btn" disabled={!selected || !commitment || busy} onClick={() => selected && void send(selected)}>{busy ? "Revealing…" : !commitment ? "Venn is still deciding…" : "Seal my move"}</button>
              </span>
            </div>
            {error && <div role="alert"><p className="error">{error}</p>{!commitment && <button className="btn secondary" onClick={() => void think()}>Retry Venn&apos;s turn</button>}</div>}
          </div>
          <aside className="side">
            <VennCard {...venn} hint={commitment ? hint : null} deciding={!commitment} difficulty={difficulty} />
            <ClosenessMeter c={meter.c} callout={meter.callout} dc={dc} />
          </aside>
        </div>
      )}
    </main>
  );
}
