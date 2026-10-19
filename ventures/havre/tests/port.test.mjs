// node --test tests/*.test.mjs: Venice characters remember, take the 18+ rule, and can be ported
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../card.js";

const sable = C.normalizeCard({ name: "Sable", engine: { venice_character: "sable-penrose" }, creator: "someone", portrait: "https://outerface.venice.ai/sable.png",
  lineage: [{ relation: "ported-from", name: "Sable", creator: "someone", ref: "venice:sable-penrose" }] });

test("a Venice character brings its own prompt; what they remember and the 18+ rule go beside it", () => {
  assert.deepEqual(C.chatMessages(sable, [{ role: "user", content: "hi" }]), [{ role: "user", content: "hi" }], "nothing to add, nothing added");
  const m = C.chatMessages(sable, [{ role: "user", content: "hi" }], { memory: ["They're called Princess."] });
  assert.equal(m[0].role, "system");
  assert.match(m[0].content, /What you remember[^\n]*\n- They're called Princess\./);
  assert.ok(!m[0].content.includes("You are Sable"), "never their prompt: Venice has it");
  assert.equal(m.at(-1).content, "hi", "no reminder: their name is Venice's to keep");
  const grown = C.chatMessages({ ...sable, adult: true }, [{ role: "user", content: "hi" }]);
  assert.equal(grown[0].content, C.ADULT_RULE);
});

test("a port keeps the same character, their face and their credit, in a card of your own", () => {
  assert.equal(C.PORT_INTERVIEW.length, 6);
  const [sys, user] = C.portMessages("Sable", "Q: Hi!\nA: Oh. Hello.");
  assert.equal(sys.content, C.PORT_SYSTEM);
  assert.match(user.content, /The character: Sable[\s\S]*Q: Hi!/);
  const card = C.cardFromPort({ tagline: "Night-shift baker", greeting: "Oh. Hello.", persona: "You are Sable, who bakes at night.", voice: "quiet, dry",
    look: "Thirties, flour on her sleeves.", examples: [{ user: "hi", character: "Oh. Hi." }], tags: ["cozy"] }, { from: sable, model: "m", interviewed: "2026-10-19" });
  assert.deepEqual(C.validateCard(card), []);
  assert.equal(card.name, "Sable");
  assert.deepEqual(card.engine, {}, "a card of your own: Havre's prompt, not Venice's");
  assert.equal(card.portrait, sable.portrait);
  assert.equal(card.license, "all-rights-reserved");
  assert.equal(card.creator, "someone");
  assert.ok(card.lineage.some((l) => l.relation === "ported-from" && l.ref === "venice:sable-penrose"));
  assert.equal(card.look.description, "Thirties, flour on her sleeves.");
  assert.equal(card.voice.notes, "quiet, dry");
  assert.equal(C.cardFromPort({ persona: "You are Sable." }, { from: { ...sable, adult: true }, model: "m" }).adult, true, "an adult one stays adult");
});
