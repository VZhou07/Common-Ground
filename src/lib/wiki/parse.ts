// Parsoid HTML → sanitized prose + the playable link list. Ported from v1.
// Only prose links count as moves: navboxes, infobox-like sidebars,
// references and "see also"-style end sections are dropped before parsing.
import { load } from "cheerio";
import sanitizeHtml from "sanitize-html";
import { policyFor } from "./policy";
import type { WikiLink } from "./types";

const DROP = ".navbox,.navbox-styles,.sidebar,.infobox,.reflist,.references,.mw-references-wrap,.hatnote,.ambox,.metadata,.mw-editsection,.portalbox,.sistersitebox,.side-box,.authority-control,.refbegin,.noprint,.shortdescription,script,style,iframe,form,figure,sup.reference";
// "See also" stays: v1 kept it, its links are legible, and the spec's fixture
// (Modular design × Fashion design → 3D printing) depends on it.
const END_SECTIONS = /^(references|notes|further reading|external links|bibliography|sources|citations|footnotes|gallery)$/i;
const NAMESPACE = /^(file|image|category|help|wikipedia|template|portal|special|talk|user|draft|module|mediawiki|book|timedtext|wikt|wiktionary|s|q|commons)(?: talk)?:/i;
const JUNK = /^(ISBN|ISSN|PubMed|PubMed Central|Bibcode|JSTOR|OCLC|ArXiv|S2CID|Semantic Scholar|Wayback Machine|Digital object identifier|International Standard Serial Number|Hdl \(identifier\))$|\(identifier\)/i;
// Pages that make poor starts or meeting points: indexes rather than articles.
export const LIST_LIKE = /^(lists? of|index of|outline of|glossary of|timeline of|bibliography of)\b/i;

export function linkTitle(href: string): string | null {
  if (!href.startsWith("./")) return null;
  try {
    const title = decodeURIComponent(href.slice(2).split("#")[0].split("?")[0]).replaceAll("_", " ").trim();
    return !title || NAMESPACE.test(title) || JUNK.test(title) ? null : title;
  } catch { return null; }
}

function cleaned(raw: string) {
  const $ = load(raw);
  $(DROP).remove();
  $("section").each((_, section) => {
    if (END_SECTIONS.test($(section).children("h2").first().text().trim())) $(section).remove();
  });
  return $;
}

export const isDisambiguation = (raw: string) => /mw:PageProp\/disambiguation/.test(raw);

export function extractTitles(raw: string): string[] {
  const $ = cleaned(raw);
  return [...new Set($("a[rel~='mw:WikiLink']").toArray().flatMap(a => {
    const title = linkTitle($(a).attr("href") || "");
    return title ? [title] : [];
  }))];
}

export function parseArticle(raw: string, ownTitle: string, canonical: Record<string, string>, descriptions: Record<string, string>) {
  const $ = cleaned(raw);
  const links = new Map<string, WikiLink>();
  // ★ CORE-SAFE-3: every anchor is rebuilt by us; Wikipedia's hrefs never
  // reach the browser, and the sanitizer accepts no URL schemes at all.
  $("a").each((_, element) => {
    const a = $(element);
    const rawTitle = a.attr("rel")?.split(/\s+/).includes("mw:WikiLink") ? linkTitle(a.attr("href") || "") : null;
    const title = rawTitle ? canonical[rawTitle] : undefined;
    const text = a.text();
    if (!title || title === ownTitle || NAMESPACE.test(title) || JUNK.test(title)) {
      a.replaceWith($("<span>").text(text));
      return;
    }
    const description = descriptions[title] || "";
    const policy = policyFor(title, description);
    const section = a.closest("section").children("h2,h3").first().text().trim() || "Introduction";
    if (!links.has(title)) links.set(title, { title, description, section, order: links.size, policy });
    const replacement = policy === "blocked"
      ? $("<span>").attr("class", "out-of-play").attr("title", "Not in play").text(text)
      : $("<a>").attr("href", `#${encodeURIComponent(title)}`).attr("data-title", title).text(text);
    a.replaceWith(replacement);
  });
  const html = sanitizeHtml($("body").html() || "", {
    allowedTags: ["p", "section", "h2", "h3", "h4", "ul", "ol", "li", "b", "strong", "i", "em", "blockquote", "br", "a", "span", "table", "tbody", "thead", "tr", "th", "td", "caption", "sub", "sup", "dl", "dt", "dd"],
    allowedAttributes: { a: ["href", "data-title"], span: ["class", "title"], th: ["colspan", "rowspan"], td: ["colspan", "rowspan"] },
    allowedClasses: { span: ["out-of-play"] },
    allowedSchemes: [],
    allowProtocolRelative: false,
  });
  return { html, links: [...links.values()] };
}
