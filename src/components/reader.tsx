"use client";
import { useEffect, useRef } from "react";
import { findKey } from "./link-search";

// The article as an editorial reader. Every playable link is clickable and
// nothing is highlighted: finding the common ground is the game. The HTML was
// sanitized and every anchor rebuilt on the server (parse.ts).
export function Reader(props: {
  title: string; description: string; html: string; tags: string[]; source: string;
  selected: string | null; disabled: boolean; onSelect: (title: string) => void; onSearch?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { onSelect, disabled, selected } = props;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a[data-title]") as HTMLAnchorElement | null;
      if (!a) return;
      e.preventDefault();
      if (!disabled) onSelect(a.dataset.title!);
    };
    root.addEventListener("click", click);
    return () => root.removeEventListener("click", click);
  }, [onSelect, disabled]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.querySelectorAll("a.selected").forEach(a => a.classList.remove("selected"));
    if (selected) root.querySelectorAll(`a[data-title="${CSS.escape(selected)}"]`).forEach(a => a.classList.add("selected"));
  }, [selected, props.html]);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [props.title]);

  return (
    <article className="reader" aria-label={`Your article: ${props.title}`}>
      <div className="reader-head">
        <div>
          <p className="kicker">You are on</p>
          <h1 className="reader-title">{props.title}</h1>
          {props.description && <p className="reader-desc">{props.description}</p>}
          <div className="chips">{props.tags.map(t => <span key={t} className="chip">{t}</span>)}</div>
        </div>
        <div className="reader-tools">
          {props.onSearch && <button className="btn secondary small" onClick={props.onSearch}>Find a link <kbd>{findKey()}</kbd></button>}
          <a className="faint" href={props.source} target="_blank" rel="noreferrer noopener">Wikipedia ↗</a>
        </div>
      </div>
      <div ref={ref} className="prose" dangerouslySetInnerHTML={{ __html: props.html }} />
    </article>
  );
}
