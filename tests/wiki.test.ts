import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractTitles, parseArticle } from "../src/lib/wiki/parse";
import { isSensitiveText, policyFor } from "../src/lib/wiki/policy";

const fixture = (slug: string) => JSON.parse(readFileSync(`tests/fixtures/${slug}.json`, "utf8")) as { title: string; raw: string; canonical: Record<string, string>; descriptions: Record<string, string> };

test("only prose WikiLinks become canonical moves; unsafe content is removed", () => {
  const raw = `<html><body><section><p>Hello <a rel="mw:WikiLink" href="./Alias">alias</a><a rel="mw:WikiLink" href="./Home#x">stay</a><a rel="mw:WikiLink" href="./File:X">file</a><a href="javascript:alert(1)">bad</a><img src=x onerror=alert(1)><script>alert(1)</script></p><div class="navbox"><a rel="mw:WikiLink" href="./Noise">noise</a></div><table class="infobox"><tr><td><a rel="mw:WikiLink" href="./Boxed">boxed</a></td></tr></table></section><section><h2>See also</h2><a rel="mw:WikiLink" href="./Related">related</a></section><section><h2>References</h2><a rel="mw:WikiLink" href="./Citation">citation</a></section></body></html>`;
  assert.deepEqual(extractTitles(raw), ["Alias", "Home", "Related"]);
  const parsed = parseArticle(raw, "Home", { Alias: "Canonical", Home: "Home", Related: "Related" }, {});
  assert.deepEqual(parsed.links.map(l => l.title), ["Canonical", "Related"]);
  assert.equal(parsed.links[0].order, 0);
  assert.match(parsed.html, /data-title="Canonical"/);
  assert.doesNotMatch(parsed.html, /script|onerror|javascript|Noise|Citation|Boxed/);
});

test("v1 fixture: Modular design × Fashion design share exactly 3D printing and Product lifecycle", () => {
  const sets = ["modular-design", "fashion-design"].map(slug => {
    const f = fixture(slug);
    return new Set(parseArticle(f.raw, f.title, f.canonical, f.descriptions).links.filter(l => l.policy !== "blocked").map(l => l.title));
  });
  assert.deepEqual([...sets[0]].filter(t => sets[1].has(t)).sort(), ["3D printing", "Product lifecycle"]);
});

test("links keep their order of first appearance and their section", () => {
  const f = fixture("modular-design");
  const { links } = parseArticle(f.raw, f.title, f.canonical, f.descriptions);
  assert.ok(links.length > 30);
  links.forEach((l, i) => assert.equal(l.order, i));
  assert.equal(links[0].section, "Introduction");
});

test("sensitive moves are blocked or excluded from profiling", () => {
  for (const title of ["Suicide by hanging", "Atomic bombings of Hiroshima and Nagasaki", "Christchurch mosque shootings", "September 11 attacks"]) assert.equal(policyFor(title), "blocked", title);
  for (const title of ["Sexual orientation", "Chernobyl disaster", "Nuclear weapon", "World War II", "COVID-19 pandemic", "Tobacco", "Islam", "Gender identity", "Diabetes", "Race (human categorization)"]) assert.equal(policyFor(title), "no-profile", title);
  assert.equal(policyFor("Ramadan", "Islamic holy month of fasting"), "no-profile");
  // Words that merely contain a sensitive fragment stay playable.
  for (const title of ["3D printing", "Titania (moon)", "Mount Vesuvius", "Warsaw", "Software", "Award", "Jewellery", "Horse racing", "Birthday party", "Embrace", "Commonwealth", "Invasive species", "Nuclear power plant"]) assert.equal(policyFor(title), "play", title);
});

test("interest screening catches identity topics", () => {
  for (const text of ["my religion", "gender", "health", "christianity"]) assert.ok(isSensitiveText(text), text);
  for (const text of ["skiing", "jazz", "pizza", "fractals"]) assert.ok(!isSensitiveText(text), text);
});
