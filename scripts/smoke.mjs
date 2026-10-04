// Plays one full game through the real API routes of a running server.
//   npm run build && npm start   (in one terminal)
//   npm run smoke                (in another; BASE=http://localhost:3000 by default)
// The player follows the pair's known route when it can, then heads for a
// shared link or whatever the server lets it click.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3000";
const pairs = JSON.parse(readFileSync(new URL("../data/pairs.json", import.meta.url), "utf8"));
const post = async (path, body) => {
  const t0 = Date.now();
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(`${path}: ${data.error || r.status}`);
  return { ...data, ms: Date.now() - t0 };
};
const ok = (cond, msg) => { if (!cond) { console.error(`✗ ${msg}`); process.exit(1); } console.log(`✓ ${msg}`); };

for (const path of ["/", "/play?mode=unlimited&difficulty=normal", "/us"]) {
  const r = await fetch(`${BASE}${path}`);
  ok(r.ok, `GET ${path} → ${r.status}`);
}
const interest = await post("/api/interest", { text: "skiing" });
ok(Array.isArray(interest.buckets), `interest "skiing" → ${interest.buckets.map(b => b.label).join(", ") || "no stated interest"}`);

let profile;
const start = await post("/api/game/start", { mode: "unlimited", difficulty: "easy", stated: interest.buckets.map(b => b.id), profile });
const pair = pairs.find(p => p.you === start.you.title && p.venn === start.venn.title);
ok(!!pair, `started on ${start.you.title} × ${start.venn.title} (${start.ms} ms)`);
let token = start.token;
let you = start.you.title;
const stack = [you];
for (let turn = 1; turn <= 12; turn++) {
  const t = await post("/api/game/think", { token, profile });
  token = t.token;
  console.log(`  turn ${turn}: Venn sealed in ${t.ms} ms; hint: ${t.hint || "(silent)"}`);
  const onRoute = stack.every((x, i) => pair.route.you[i] === x);
  const next = onRoute ? pair.route.you[stack.length] : undefined;
  const move = next ?? "__back__";
  const r = await post("/api/game/move", { token, move, profile });
  const hash = createHash("sha256").update(JSON.stringify([r.reveal.move, r.reveal.nonce])).digest("hex");
  ok(hash === r.reveal.commitment, `turn ${turn}: you → ${r.turn.you}, Venn → ${r.turn.venn}; commitment verified (${r.ms} ms) “${r.line}”`);
  token = r.token;
  profile = r.profile;
  if (move === "__back__") stack.pop(); else stack.push(move);
  if (r.met) {
    ok(true, `met at ${r.end.meet} in ${r.end.moves}: ${r.end.label}`);
    console.log(r.end.share);
    process.exit(0);
  }
}
ok(false, "did not meet within 12 turns");
