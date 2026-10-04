// The 12 interest buckets (§5). They group Wikimedia's 64-topic taxonomy;
// identity topics map to nothing, so they can never be profiled.

export type BucketId =
  | "science" | "tech" | "math" | "sports" | "music" | "art"
  | "screen" | "food" | "history" | "places" | "language" | "business";

export type Bucket = {
  id: BucketId;
  label: string;
  // Descriptor text: embedded as one member of the bucket's anchor, and the
  // vocabulary of the offline fallback embedder.
  about: string;
};

export const BUCKETS: Bucket[] = [
  { id: "science", label: "Science & nature", about: "science scientist nature biology animal bird insect fish mammal reptile dinosaur plant tree flower garden gardening species ecology evolution chemistry chemical element physics atom molecule energy astronomy planet star moon galaxy space earth geology volcano ocean sea weather climate snow ice mineral crystal fossil" },
  { id: "tech", label: "Technology & engineering", about: "technology engineering engineer machine mechanical computer computing software hardware programming coding code internet electronics electrical robot robotics vehicle car aircraft airplane rocket engine invention device manufacturing material transport railway train bridge telescope camera" },
  { id: "math", label: "Math & logic", about: "mathematics mathematical math geometry algebra arithmetic number theorem proof logic equation function calculus probability statistics topology symmetry fractal pattern infinity prime sequence graph puzzle chess sudoku cryptography algorithm polyhedron tiling" },
  { id: "sports", label: "Sports & outdoors", about: "sport sports athlete team ball football soccer basketball baseball tennis golf olympic championship race racing skiing snowboarding climbing hiking mountaineering surfing outdoor camping cycling swimming running marathon match league fitness" },
  { id: "music", label: "Music & sound", about: "music musical musician song songs album band singer singing composer instrument guitar piano violin drum orchestra jazz rock pop hiphop opera rhythm melody harmony tuning sound acoustics audio radio record concert" },
  { id: "art", label: "Art, design & fashion", about: "art artist painting painter sculpture design designer fashion clothing textile knitting sewing architecture architect style museum gallery photography drawing illustration craft decorative ceramics glass mosaic" },
  { id: "screen", label: "Film, TV & games", about: "film movie cinema director actor television series episode animation cartoon video game gaming console anime manga comics character studio streaming theatre esports minecraft nintendo" },
  { id: "food", label: "Food & drink", about: "food cuisine dish cooking cook recipe ingredient fruit vegetable bread cheese meat pizza pasta sushi dessert cake chocolate sugar spice drink wine beer coffee tea restaurant baking chef" },
  { id: "history", label: "History & society", about: "history historical ancient medieval century empire kingdom dynasty civilization archaeology ruins pharaoh roman greek viking castle society culture tradition revolution monarch education university law museum" },
  { id: "places", label: "Places & travel", about: "city town country capital region island river lake mountain range coast beach village province geography travel tourism landmark continent border map desert forest canal" },
  { id: "language", label: "Language & literature", about: "language linguistics word grammar alphabet writing literature novel poetry poem poet author book reading fiction story detective mystery myth folklore publishing dictionary cipher" },
  { id: "business", label: "Business & money", about: "business company corporation brand market economy economics finance money currency bank trade investment investing stock stocks price industry entrepreneur startup advertising marketing crypto" },
];

export const BUCKET_IDS = BUCKETS.map(b => b.id);
export const bucketIndex = (id: string) => BUCKET_IDS.indexOf(id as BucketId);
export const bucketLabel = (id: string) => BUCKETS.find(b => b.id === id)?.label ?? id;
export const isBucket = (id: unknown): id is BucketId => typeof id === "string" && BUCKET_IDS.includes(id as BucketId);
export const VENN_TASTE: BucketId = "math";

// ★ CORE-SAFE-4: Wikimedia outlink topics → buckets. Identity topics
// (biographies of women, philosophy & religion, medicine & health, society,
// politics, military) deliberately map to null: never a bucket, never profiled.
const OUTLINK: Record<string, BucketId | null> = {
  "Culture.Biography.Biography*": null,
  "Culture.Biography.Women": null,
  "Culture.Food_and_drink": "food",
  "Culture.Internet_culture": "screen",
  "Culture.Linguistics": "language",
  "Culture.Literature": "language",
  "Culture.Media.Books": "language",
  "Culture.Media.Entertainment": "screen",
  "Culture.Media.Films": "screen",
  "Culture.Media.Media*": "screen",
  "Culture.Media.Music": "music",
  "Culture.Media.Radio": "music",
  "Culture.Media.Software": "tech",
  "Culture.Media.Television": "screen",
  "Culture.Media.Video_games": "screen",
  "Culture.Performing_arts": "screen",
  "Culture.Philosophy_and_religion": null,
  "Culture.Sports": "sports",
  "Culture.Visual_arts.Architecture": "art",
  "Culture.Visual_arts.Comics_and_Anime": "screen",
  "Culture.Visual_arts.Fashion": "art",
  "Culture.Visual_arts.Visual_arts*": "art",
  "Geography.Geographical": "places",
  "History_and_Society.Business_and_economics": "business",
  "History_and_Society.Education": "history",
  "History_and_Society.History": "history",
  "History_and_Society.Military_and_warfare": null,
  "History_and_Society.Politics_and_government": null,
  "History_and_Society.Society": null,
  "History_and_Society.Transportation": "tech",
  "STEM.Biology": "science",
  "STEM.Chemistry": "science",
  "STEM.Computing": "tech",
  "STEM.Earth_and_environment": "science",
  "STEM.Engineering": "tech",
  "STEM.Libraries_&_Information": "tech",
  "STEM.Mathematics": "math",
  "STEM.Medicine_&_Health": null,
  "STEM.Physics": "science",
  // A catch-all parent label that fires on nearly every STEM page (it would
  // tag Pi as "science" ahead of "math"), so it carries no bucket.
  "STEM.STEM*": null,
  "STEM.Space": "science",
  "STEM.Technology": "tech",
};

export function bucketForOutlinkTopic(topic: string): BucketId | null {
  if (topic in OUTLINK) return OUTLINK[topic];
  if (topic.startsWith("Geography.Regions.")) return "places";
  return null;
}

// Threshold ~0.4 (§5 known noise: McQueen was tagged Biography.Women at 0.32).
export const OUTLINK_THRESHOLD = 0.4;

// Outlink results → bucket scores (max over mapped topics), strongest first.
export function bucketsFromOutlink(results: { topic: string; score: number }[]): { bucket: BucketId; score: number }[] {
  const best = new Map<BucketId, number>();
  for (const r of results) {
    if (r.score < OUTLINK_THRESHOLD) continue;
    const b = bucketForOutlinkTopic(r.topic);
    if (b) best.set(b, Math.max(best.get(b) ?? 0, r.score));
  }
  return [...best].map(([bucket, score]) => ({ bucket, score })).sort((a, b) => b.score - a.score);
}
