export type LinkPolicy = "play" | "no-profile" | "blocked";

export type WikiLink = {
  title: string; // canonical title, redirects resolved
  description: string; // Wikidata short description, may be empty
  section: string; // "Introduction" for the lead
  order: number; // first appearance among the article's prose links, 0 = first
  policy: LinkPolicy;
};

export type Article = {
  title: string;
  description: string;
  revision: number;
  html: string; // sanitized prose; every playable anchor is rebuilt by parse.ts
  links: WikiLink[];
  source: string; // permalink to the exact revision
  fetchedAt: string;
  disambiguation?: boolean;
};

export type Popularity = { views: number | null; asOf: string; estimated?: boolean };
