import test from "node:test";
import assert from "node:assert/strict";
import { verdict, yourShare } from "../src/lib/closeness/closeness";

// Pages on a circle; closeness = (1 + cos) / 2.
const at = (deg: number) => Float32Array.from([Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)]);
const c = (a: Float32Array, b: Float32Array) => (1 + a[0] * b[0] + a[1] * b[1]) / 2;

test("your share and Venn's share of Δc add up to Δc exactly", () => {
  const [you, next, vennBefore, vennAfter] = [at(0), at(40), at(150), at(100)];
  const mine = yourShare(c, you, next, vennBefore, vennAfter);
  const venns = yourShare(c, vennBefore, vennAfter, you, next);
  assert.ok(Math.abs(mine + venns - (c(next, vennAfter) - c(you, vennBefore))) < 1e-9);
});

test("stepping toward where Venn went counts, even if it looked away from where Venn was", () => {
  // Venn leaves its page for one right next to yours; you step onto Venn's new
  // side. Against Venn's old page alone you moved away; overall you met it halfway.
  const [you, next, vennBefore, vennAfter] = [at(0), at(-70), at(120), at(-80)];
  assert.ok(c(next, vennBefore) - c(you, vennBefore) < -0.05, "against the old page alone: away");
  assert.equal(verdict(yourShare(c, you, next, vennBefore, vennAfter), true), "converged");
  // And Venn wandering off doesn't make a step toward it look bad.
  assert.equal(verdict(yourShare(c, at(0), at(60), at(120), at(-120)), true), "converged");
});
