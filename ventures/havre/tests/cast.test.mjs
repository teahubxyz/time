// node --test tests/*.test.mjs: the harbor's own (cast/), as cards
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import * as C from "../card.js";
import CAST from "../cast/index.js";

const dir = new URL("../cast/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".havre.json")).sort();

test("the harbor's own: three valid cards, each with a hello and examples to answer from without a key", () => {
  assert.deepEqual(files, ["maren.havre.json", "odile.havre.json", "taskmaster.havre.json"]);
  for (const f of files) {
    const raw = JSON.parse(readFileSync(new URL(f, dir), "utf8")), card = C.normalizeCard(raw);
    assert.deepEqual(C.validateCard(card), [], f);
    assert.equal(f, card.id + ".havre.json", "the file is named after the id");
    assert.deepEqual(raw, card, `${f}: written the way normalizeCard leaves it`);
    assert.ok(card.greeting && card.examples.length >= 3, `${f}: a hello and a few examples`);
    assert.ok(!card.engine.venice_character && !card.adult && !card.portrait, `${f}: speaks for itself, for everyone, with no picture yet`);
    assert.ok(card.look.description, `${f}: says how they look, so a portrait can be made`);
    assert.equal(C.nameClash(card), "", `${f}: one name everywhere`);
    assert.equal(C.demoReply(card, 0, card.examples[0].user), C.fill(card.examples[0].character, card, "you"), `${f}: answers without a key`);
  }
});

test("cast/index.js is what tools/cast.mjs makes of the files (run it again after editing one)", () => {
  assert.deepEqual(CAST, files.map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8"))));
});
