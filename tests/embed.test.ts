import test from "node:test";
import assert from "node:assert/strict";
import { dot, localEmbedder, setEmbedder } from "../src/lib/embed/embed";
import { encodeInt8, pageText, vectors } from "../src/lib/embed/store";
import { bucketsFromOutlink } from "../src/lib/topics/buckets";
import { interestBuckets, tagPages } from "../src/lib/topics/classify";

setEmbedder(localEmbedder);

test("local embedder is deterministic, normalized, and puts related pages closer", async () => {
  const [a, b, c, a2] = await localEmbedder.embed([
    pageText("Alpine skiing", "Winter sport of sliding down snow-covered slopes"),
    pageText("Snowboarding", "Winter sport descending a slope covered with snow"),
    pageText("Prime number", "Number divisible only by 1 and itself"),
    pageText("Alpine skiing", "Winter sport of sliding down snow-covered slopes"),
  ]);
  assert.deepEqual([...a], [...a2]);
  assert.ok(Math.abs(dot(a, a) - 1) < 1e-5);
  assert.ok(dot(a, b) > dot(a, c));
});

test("int8 quantization keeps cosine similarity within 1%", async () => {
  const vs = await localEmbedder.embed(["Fractal — self-similar pattern", "Koch snowflake — fractal curve"]);
  const buf = encodeInt8(vs);
  assert.equal(buf.length, 2 * 260);
  const decode = (i: number) => {
    const scale = buf.readFloatLE(i * 260);
    const v = new Float32Array(256);
    for (let k = 0; k < 256; k++) v[k] = buf.readInt8(i * 260 + 4 + k) * scale;
    return v;
  };
  const [x, y] = [decode(0), decode(1)];
  const norm = (v: Float32Array) => Math.sqrt(dot(v, v));
  assert.ok(Math.abs(dot(x, y) / (norm(x) * norm(y)) - dot(vs[0], vs[1])) < 0.01);
});

test("the store caches: the same text gives the same vector object", async () => {
  const [p] = await vectors(["Tetris — puzzle video game"]);
  const [q] = await vectors(["Tetris — puzzle video game"]);
  assert.equal(p, q);
});

test("outlink topics map to buckets above the threshold; identity topics never do", () => {
  assert.deepEqual(bucketsFromOutlink([
    { topic: "Culture.Biography.Women", score: 0.9 },
    { topic: "Culture.Visual_arts.Fashion", score: 0.8 },
    { topic: "STEM.Medicine_&_Health", score: 0.7 },
    { topic: "Culture.Sports", score: 0.32 },
    { topic: "Geography.Regions.Europe.Western_Europe", score: 0.5 },
  ]).map(b => b.bucket), ["art", "places"]);
});

test("pinned pages are tagged from the offline outlink labels", async () => {
  const [ski, pi] = await tagPages([
    { title: "Alpine skiing", description: "Sport of skiing downhill" },
    { title: "Pi", description: "Number, approximately 3.14" },
  ]);
  assert.equal(ski.top[0], "sports");
  assert.equal(pi.top[0], "math");
  assert.ok(Math.abs(ski.probs.reduce((s, p) => s + p, 0) - 1) < 1e-6);
});

test("interest text maps to 1-2 buckets; sensitive or unmappable text maps to none", async () => {
  assert.equal((await interestBuckets("skiing"))[0], "sports");
  assert.equal((await interestBuckets("jazz"))[0], "music");
  assert.equal((await interestBuckets("baking bread"))[0], "food");
  assert.deepEqual(await interestBuckets("my religion"), []);
  assert.deepEqual(await interestBuckets("zzqx vvbn"), []);
  assert.ok((await interestBuckets("anime")).length <= 2);
});
