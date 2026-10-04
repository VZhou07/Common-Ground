// Every line Venn says passes here, LLM-written or not (§6.3, §11).
// One plain-text line, ≤140 characters, no links or markup, no names of pages
// that aren't in play, nothing about who you are.

const BANNED = /\b(suicid\w*|kill\w*|murder\w*|death|dead|dies?|died|sex\w*|rape\w*|nazi\w*|hate\w*|drugs?|religio\w*|politic\w*|gender|ethnic\w*|racis\w*|disease\w*|stupid|idiot|dumb|ugly|fuck\w*|shit\w*|bitch\w*)\b/i;
// ★ CORE-CHECK-1: Venn talks about how you play, never who you are.
const PERSONAL = /\b(you are|you're|youre) (a|an|so|such|clearly|obviously|probably)\b|\byour (age|gender|religion|faith|health|race|ethnicity|politics|sexuality)\b/i;

function containsWord(hay: string, needle: string) {
  for (let from = 0; ;) {
    const i = hay.indexOf(needle, from);
    if (i < 0) return false;
    const before = hay[i - 1] || " ", after = hay[i + needle.length] || " ";
    if (!/[a-z0-9]/i.test(before) && !/[a-z0-9]/i.test(after)) return true;
    from = i + 1;
  }
}

// ★ CORE-CHECK-2: `allowed` = the titles and bucket labels in play this turn;
// `known` = every other title Venn might be tempted to name (both articles'
// links). A line that names a known-but-not-allowed title is rejected.
export function checkLine(line: unknown, allowed: string[] = [], known: string[] = []): string | null {
  if (typeof line !== "string") return null;
  const text = line.replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "").trim();
  if (!text || text.length > 140 || /[\r\n\t]/.test(text)) return null;
  if (/https?:|www\.|\.(com|org|net|io|ai|ly)\b|[<>*_`#[\]{}|\\@~^$]/i.test(text)) return null;
  if (BANNED.test(text) || PERSONAL.test(text)) return null;
  const allow = new Set(allowed.map(t => t.toLowerCase()));
  for (const title of known) {
    if (title.length < 4 || allow.has(title.toLowerCase())) continue;
    if ([...allow].some(a => a.includes(title.toLowerCase()))) continue; // part of an allowed title
    const multi = /\s/.test(title);
    if (multi ? containsWord(text.toLowerCase(), title.toLowerCase()) : containsWord(text, title)) return null;
  }
  return text;
}
