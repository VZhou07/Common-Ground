"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export type SearchLink = { title: string; description: string; section: string };

// Only rendered in the browser (after a game has loaded), so navigator exists.
export const findKey = () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘F" : "Ctrl+F");

// Ctrl+F (⌘F) over your article: find a link by its title or description,
// then pick it as your move. Title matches come first, in article order.
export function LinkSearch(props: { links: SearchLink[]; disabled: boolean; onClose: () => void; onPick: (title: string) => void }) {
  const { links, disabled, onClose, onPick } = props;
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.focus(); }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const rank = (l: SearchLink) => {
      const t = l.title.toLowerCase();
      return t.startsWith(q) ? 0 : t.includes(q) ? 1 : l.description.toLowerCase().includes(q) ? 2 : 3;
    };
    return links.map(l => ({ l, r: rank(l) })).filter(x => x.r < 3).sort((a, b) => a.r - b.r).map(x => x.l).slice(0, 60);
  }, [links, query]);

  function pick(title: string) {
    if (disabled) return;
    onPick(title);
    onClose();
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key === "Enter") { e.preventDefault(); if (results[active]) pick(results[active].title); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const next = Math.max(0, Math.min(results.length - 1, active + (e.key === "ArrowDown" ? 1 : -1)));
    setActive(next);
    document.getElementById(`link-result-${next}`)?.scrollIntoView({ block: "nearest" });
  }

  const q = query.trim();
  return (
    <>
      <div className="search-backdrop" onClick={onClose} aria-hidden />
      <div className="search-pop" role="dialog" aria-label="Find a link in your article">
        <div className="search-row">
          <input
            ref={input} className="input" type="search" placeholder="Find a link in your article…" value={query} autoComplete="off"
            aria-describedby="link-search-count" onChange={e => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey}
          />
          <button className="btn quiet" onClick={onClose}>Close</button>
        </div>
        <p id="link-search-count" className="faint search-count" aria-live="polite">
          {q ? `${results.length === 60 ? "60+" : results.length} matching link${results.length === 1 ? "" : "s"}` : `${links.length} links in this article`}
          <span className="kbd-help"> · ↑↓ to move, Enter to pick, Esc to close. {findKey()} again opens your browser&apos;s own find.</span>
        </p>
        {q && (results.length ? (
          <ul className="search-results">
            {results.map((l, i) => (
              <li key={l.title}>
                <button id={`link-result-${i}`} className={i === active ? "active" : ""} disabled={disabled} onMouseEnter={() => setActive(i)} onClick={() => pick(l.title)}>
                  <strong>{l.title}</strong>
                  {l.description && <span className="muted">: {l.description}</span>}
                  <span className="faint"> · {l.section}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="faint" style={{ margin: "0.5rem 0 0" }}>No links match “{q}”.</p>)}
      </div>
    </>
  );
}
