// Live Wikipedia access. Requests are serialized with a small gap and retried
// politely; every request carries an Api-User-Agent as Wikimedia asks.
import { extractTitles, isDisambiguation, parseArticle } from "./parse";
import type { Article, Popularity } from "./types";

const UA = "CommonGround/2.0 (cooperative Wikipedia game; https://github.com/VZhou07/Common-Ground)";
const HEADERS = { "User-Agent": UA, "Api-User-Agent": UA };
let queue: Promise<unknown> = Promise.resolve();
const pending = new Map<string, Promise<Article>>();
const articles = new Map<string, Article>();
const GAP_MS = Number(process.env.WIKI_GAP_MS || 100);

async function request(url: string, init: RequestInit = {}): Promise<Response> {
  const task = queue.then(async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetch(url, { ...init, headers: { ...HEADERS, ...init.headers }, signal: AbortSignal.timeout(20_000) });
      if (response.ok) return response;
      if (response.status !== 429 && response.status < 500) throw new Error(`Wikipedia returned ${response.status}.`);
      await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1500));
    }
    throw new Error("Wikipedia is busy. Please try again shortly.");
  });
  queue = task.catch(() => undefined).then(() => new Promise(resolve => setTimeout(resolve, GAP_MS)));
  return task;
}

type QueryPage = { title: string; missing?: boolean; invalid?: boolean; description?: string; revisions?: { revid: number }[]; pageviews?: Record<string, number | null>; pageprops?: Record<string, string> };
type QueryResult = { query?: { normalized?: { from: string; to: string }[]; redirects?: { from: string; to: string }[]; pages?: QueryPage[] }; continue?: Record<string, string>; error?: { info: string } };
export async function query(params: Record<string, string>): Promise<QueryResult> {
  const response = await request(`https://en.wikipedia.org/w/api.php?${new URLSearchParams({ action: "query", format: "json", formatversion: "2", ...params })}`);
  const data = await response.json() as QueryResult;
  if (data.error) throw new Error("Wikipedia could not process this request.");
  return data;
}

const follow = (redirects: Map<string, string>, title: string) => {
  let current = title;
  const seen = new Set<string>();
  while (redirects.has(current) && !seen.has(current)) { seen.add(current); current = redirects.get(current)!; }
  return current;
};

// ★ CORE-RULES-1: redirects are resolved here, in batches of 50, so "Alpine
// ski" and "Alpine skiing" are the same page for meeting and for every link.
export async function resolveTitles(titles: string[]) {
  const canonical: Record<string, string> = {};
  const descriptions: Record<string, string> = {};
  for (let offset = 0; offset < titles.length; offset += 50) {
    const batch = titles.slice(offset, offset + 50);
    const { query: result } = await query({ titles: batch.join("|"), redirects: "1", prop: "description" });
    const redirects = new Map([...(result?.normalized || []), ...(result?.redirects || [])].map(x => [x.from, x.to]));
    const valid = new Set((result?.pages || []).filter(p => !p.missing && !p.invalid).map(p => p.title));
    for (const title of batch) {
      const current = follow(redirects, title);
      if (valid.has(current)) canonical[title] = current;
    }
    for (const page of result?.pages || []) descriptions[page.title] = page.description || "";
  }
  return { canonical, descriptions };
}

export async function fetchArticle(title: string, revision?: number): Promise<Article> {
  if (!title || title.length > 200 || /[|#<>[\]{}\x00-\x1f]/.test(title)) throw new Error("Invalid article title.");
  const key = `${title}:${revision || "latest"}`;
  if (articles.has(key)) return articles.get(key)!;
  if (pending.has(key)) return pending.get(key)!;
  const work = (async () => {
    const { query: metadata } = await query({ titles: title, redirects: "1", prop: "description|revisions|pageprops", rvprop: "ids", ppprop: "disambiguation" });
    const page = metadata?.pages?.[0];
    if (!page || page.missing || page.invalid) throw new Error("That Wikipedia article is unavailable.");
    const revid = revision || page.revisions?.[0]?.revid;
    if (!revid) throw new Error("Could not identify the article revision.");
    const raw = await (await request(`https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(page.title)}/${revid}`)).text();
    const { canonical, descriptions } = await resolveTitles(extractTitles(raw));
    const parsed = parseArticle(raw, page.title, canonical, descriptions);
    const result: Article = {
      ...parsed,
      title: page.title,
      description: page.description || "",
      revision: revid,
      source: `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(page.title)}&oldid=${revid}`,
      fetchedAt: new Date().toISOString(),
      disambiguation: page.pageprops?.disambiguation !== undefined || isDisambiguation(raw),
    };
    if (articles.size >= 60) articles.delete(articles.keys().next().value!);
    articles.set(key, result);
    return result;
  })();
  pending.set(key, work);
  try { return await work; } finally { pending.delete(key); }
}

// Short descriptions for titles we only know by name (memory items, routes).
export async function fetchDescriptions(titles: string[]): Promise<Record<string, string>> {
  const { canonical, descriptions } = await resolveTitles(titles);
  return Object.fromEntries(titles.flatMap(t => canonical[t] ? [[t, descriptions[canonical[t]] || ""]] : []));
}

// 30-day views, merged across continuation chunks. Used only offline, to keep
// mega-hubs out of the meeting pages (§4).
export async function fetchViews(titles: string[]): Promise<Record<string, Popularity>> {
  const asOf = new Date().toISOString().slice(0, 10);
  const out: Record<string, Popularity> = {};
  for (let offset = 0; offset < titles.length; offset += 50) {
    const batch = titles.slice(offset, offset + 50);
    const days = new Map<string, Record<string, number | null>>();
    const redirects = new Map<string, string>();
    let next: Record<string, string> | undefined = {};
    for (let page = 0; next && page < 10; page++) {
      const data = await query({ titles: batch.join("|"), redirects: "1", prop: "pageviews", pvipdays: "30", ...next });
      for (const r of [...(data.query?.normalized ?? []), ...(data.query?.redirects ?? [])]) redirects.set(r.from, r.to);
      for (const p of data.query?.pages ?? []) days.set(p.title, { ...days.get(p.title), ...p.pageviews });
      next = data.continue?.pvipcontinue ? { pvipcontinue: data.continue.pvipcontinue, continue: data.continue.continue || "" } : undefined;
    }
    for (const title of batch) {
      const reported = Object.values(days.get(follow(redirects, title)) ?? {}).filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0);
      const views = reported.length >= 20 ? Math.round(reported.reduce((s, n) => s + n, 0) * 30 / reported.length) : null;
      out[title] = { views, asOf, estimated: views !== null && reported.length !== 30 };
    }
  }
  return out;
}

// Wikimedia's outlink topic model (Lift Wing), run offline for pinned pages.
export async function fetchOutlinkTopics(title: string, threshold = 0.1): Promise<{ topic: string; score: number }[]> {
  const response = await request("https://api.wikimedia.org/service/lw/inference/v1/models/outlink-topic-model:predict", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ page_title: title, lang: "en", threshold }),
  });
  const data = await response.json() as { prediction?: { results?: { topic: string; score: number }[] } };
  return (data.prediction?.results ?? []).filter(r => typeof r.topic === "string" && Number.isFinite(r.score));
}
