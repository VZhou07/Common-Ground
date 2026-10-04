// Perceive (§7 step 1): everything code knows about this turn. Deterministic
// for a given pair of pages, so /think and /move compute the same facts.
import { anchors, tagVector } from "../topics/classify";
import type { BucketId } from "../topics/buckets";
import { pageText, vectors } from "../embed/store";
import { closenessFn, optionGains, sharedLinks, turnDifficulty, type Calibrated } from "../closeness/closeness";
import { getArticle } from "../wiki/repository";
import type { Article, LinkPolicy } from "../wiki/types";

export type Option = {
  title: string; description: string; order: number; section: string; policy: LinkPolicy;
  vector: Float32Array; probs: number[]; top: BucketId[]; back: boolean;
};
export type Side = { article: Article; vector: Float32Array; probs: number[]; top: BucketId[] };
export type Perception = {
  you: Side; venn: Side;
  c: number; // calibrated closeness now
  shared: Set<string>;
  yourOptions: Option[]; // your playable links, plus "step back" when available
  vennOptions: Option[]; // Venn's playable links
  gains: number[]; // aligned with yourOptions
  difficulty: { b: number; convergingExists: boolean; best: number }; // best = index into yourOptions
  cfn: Calibrated;
  meet: { title: string; vector: Float32Array };
};

export async function perceive(o: { you: string; venn: string; back: string | null; meet: string; signal?: AbortSignal }): Promise<Perception> {
  const [ya, va, ba, ma] = await Promise.all([getArticle(o.you), getArticle(o.venn), o.back ? getArticle(o.back) : null, getArticle(o.meet).catch(() => null)]);
  const yourLinks = ya.links.filter(l => l.policy !== "blocked");
  const vennLinks = va.links.filter(l => l.policy !== "blocked");
  const texts = [
    pageText(ya.title, ya.description), pageText(va.title, va.description), pageText(o.meet, ma?.description ?? ""),
    ...yourLinks.map(l => pageText(l.title, l.description)),
    ...vennLinks.map(l => pageText(l.title, l.description)),
    ...(ba ? [pageText(ba.title, ba.description)] : []),
  ];
  const [a, vs, cfn] = await Promise.all([anchors(), vectors(texts, o.signal), closenessFn()]);
  const side = (article: Article, v: Float32Array): Side => ({ article, vector: v, ...tagVector(v, a, article.title) });
  const opt = (l: { title: string; description: string; order: number; section: string; policy: LinkPolicy }, v: Float32Array, back = false): Option => ({ ...l, vector: v, ...tagVector(v, a, l.title), back });
  const you = side(ya, vs[0]), venn = side(va, vs[1]);
  const yourOptions = yourLinks.map((l, i) => opt(l, vs[3 + i]));
  const vennOptions = vennLinks.map((l, i) => opt(l, vs[3 + yourLinks.length + i]));
  if (ba && !yourOptions.some(x => x.title === ba.title)) {
    yourOptions.push(opt({ title: ba.title, description: ba.description, order: yourLinks.length, section: "Step back", policy: "play" }, vs[vs.length - 1], true));
  } else if (ba) {
    // The previous page is also a link here: clicking it and stepping back are the same move.
    yourOptions.forEach(x => { if (x.title === ba.title) x.back = true; });
  }
  const gains = optionGains(yourOptions.map(x => ({ title: x.title, vector: x.vector, order: x.order })), you.vector, venn.vector, cfn).map(g => g.gain);
  const d = turnDifficulty(yourOptions.map((x, i) => ({ title: x.title, order: x.order, gain: gains[i] })));
  return {
    you, venn,
    c: cfn(you.vector, venn.vector),
    shared: new Set(sharedLinks(ya, va)),
    yourOptions, vennOptions, gains,
    difficulty: { b: d.b, convergingExists: d.convergingExists, best: d.best ? yourOptions.findIndex(x => x.title === d.best!.title) : -1 },
    cfn,
    meet: { title: o.meet, vector: vs[2] },
  };
}
