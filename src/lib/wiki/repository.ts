// Pinned snapshots first, live Wikipedia second. Pinned pages make the daily
// identical for everyone and keep the first turn free of network calls.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { policyFor } from "./policy";
import { fetchArticle } from "./source";
import type { Article } from "./types";
import type { BucketId } from "../topics/buckets";

export type TopicTag = { description: string; outlink: { bucket: BucketId; score: number }[] };

const read = <T,>(file: string, fallback: T): T => {
  const full = path.join(process.cwd(), "data", file);
  return existsSync(full) ? JSON.parse(readFileSync(full, "utf8")) as T : fallback;
};

let pages: Record<string, Article> | null = null;
let tags: Record<string, TopicTag> | null = null;

export function pinnedPages(): Record<string, Article> {
  if (pages) return pages;
  // Policies are re-applied on load, so tightening the content policy never
  // requires re-fetching the snapshots.
  const raw = read<Record<string, Article>>("pages.json", {});
  pages = Object.fromEntries(Object.entries(raw).map(([title, a]) => [title, { ...a, links: a.links.map(l => ({ ...l, policy: policyFor(l.title, l.description) })) }]));
  return pages;
}

export function topicTags(): Record<string, TopicTag> {
  return tags ??= read<Record<string, TopicTag>>("topics.json", {});
}

export async function getArticle(title: string, revision?: number): Promise<Article> {
  const saved = pinnedPages()[title];
  return saved && (!revision || saved.revision === revision) ? saved : fetchArticle(title, revision);
}

export const resetRepository = () => { pages = null; tags = null; };
