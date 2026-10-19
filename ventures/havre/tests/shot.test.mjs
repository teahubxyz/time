// node --test tests/*.test.mjs: a shot written again (to an instruction, or different), and how often they move
import { test } from "node:test";
import assert from "node:assert/strict";
import * as A from "../abilities.js";

const card = { name: "Odile", tagline: "Keeps the light.", look: { description: "white hair" } };
const said = (msgs) => msgs.at(-1).content;

test("a shot written again keeps the instruction, or asks for a different one", () => {
  assert.doesNotMatch(said(A.shotMessages(card, [], "")), /as it stands|last shot/);
  const changed = said(A.shotMessages(card, [], "", "photo", { current: "Odile on the wall at dawn.", change: "make it funnier" }));
  assert.match(changed, /The shot as it stands:\nOdile on the wall at dawn\./);
  assert.match(changed, /Change it: make it funnier\./);
  const other = said(A.shotMessages(card, [], "", "photo", { current: "Odile on the wall at dawn." }));
  assert.match(other, /clearly different/);
});

test("tempo: never moves unasked, every round always may", () => {
  const h = [{ role: "user", content: "hi" }, { role: "assistant", content: "Hello there." }];
  assert.equal(A.moveLikely(h, { every: 0 }), false);
  assert.equal(A.moveLikely([{ role: "user", content: "send me a photo" }, { role: "assistant", content: "ok" }], { every: 0 }), true);
  assert.equal(A.moveLikely(h, { every: 1 }), true);
});
