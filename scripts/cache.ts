// Disk cache for offline tooling (scripts/prepare.ts). Never used at runtime.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { policyFor } from "../src/lib/wiki/policy";
import { fetchArticle, fetchOutlinkTopics, fetchViews } from "../src/lib/wiki/source";
import type { Article, Popularity } from "../src/lib/wiki/types";

const DIR = path.join(process.cwd(), ".cache", "wiki");
mkdirSync(DIR, { recursive: true });
const file = (kind: string, title: string) => path.join(DIR, `${kind}-${encodeURIComponent(title).slice(0, 180)}.json`);

export async function cachedArticle(title: string): Promise<Article> {
  const f = file("page", title);
  if (existsSync(f)) {
    const a = JSON.parse(readFileSync(f, "utf8")) as Article;
    return { ...a, links: a.links.map(l => ({ ...l, policy: policyFor(l.title, l.description) })) };
  }
  const a = await fetchArticle(title);
  writeFileSync(f, JSON.stringify(a));
  if (a.title !== title) writeFileSync(file("page", a.title), JSON.stringify(a));
  return a;
}

export async function cachedViews(titles: string[]): Promise<Record<string, Popularity>> {
  const out: Record<string, Popularity> = {};
  const missing: string[] = [];
  for (const t of titles) {
    const f = file("views", t);
    if (existsSync(f)) out[t] = JSON.parse(readFileSync(f, "utf8"));
    else missing.push(t);
  }
  if (missing.length) {
    const fresh = await fetchViews(missing);
    for (const [t, v] of Object.entries(fresh)) { out[t] = v; writeFileSync(file("views", t), JSON.stringify(v)); }
  }
  return out;
}

export async function cachedOutlink(title: string) {
  const f = file("topics", title);
  if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8")) as { topic: string; score: number }[];
  const r = await fetchOutlinkTopics(title, 0.1);
  writeFileSync(f, JSON.stringify(r));
  return r;
}
