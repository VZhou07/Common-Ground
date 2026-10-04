import test from "node:test";
import assert from "node:assert/strict";
import { commitment } from "../src/lib/game/seal";
import { verifyCommitment } from "../src/lib/client/store";

test("the browser rejects a replacement move/hash even when the reveal agrees with itself", async () => {
  const original = commitment("Snow", "first");
  assert.equal(await verifyCommitment({ move: "Snow", nonce: "first", commitment: original }, original), true);
  const replacement = commitment("Physics", "second");
  assert.equal(await verifyCommitment({ move: "Physics", nonce: "second", commitment: replacement }, original), false);
});
