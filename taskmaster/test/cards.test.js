// The quote card the model cannot edit, and the share card that is Poke's loop.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDeal, quote, agree } from "../src/dealdesk.js";
import { quoteCard, shareCard, unseal, takeHome } from "../src/cards.js";

const SECRET = "card-secret";

const agreed = async (tier = "sprint", steps = [[100], [92, "scope", "smaller job"]]) => {
  const d = openDeal({ id: "d1", tier, member: "ann", thread: "t1", now: 0 });
  for (const [price, reason, note] of steps) quote(d, { tier, price, reason, note });
  agree(d, { now: 1000 });
  return d;
};

test("the quote card carries the deal desk's price, what is included and the checkout", async () => {
  const d = await agreed();
  const card = await quoteCard(d, { checkout: "https://whop.com/checkout/abc", secret: SECRET, now: 1000 });
  assert.equal(card.kind, "quote");
  assert.equal(card.price, 92);
  assert.equal(card.tier, "sprint");
  assert.equal(card.label, "1-hour sprint");
  assert.equal(card.access, "14 days to book and run it");
  assert.ok(card.includes.length >= 2);
  assert.equal(card.checkout, "https://whop.com/checkout/abc");
  assert.ok(await unseal(card, SECRET));
});

test("a card the model edited does not verify", async () => {
  const d = await agreed();
  const card = await quoteCard(d, { checkout: "https://whop.com/checkout/abc", secret: SECRET, now: 1000 });
  for (const edit of [{ price: 5 }, { tier: "pack3" }, { checkout: "https://elsewhere.example/pay" },
                      { includes: ["everything, forever"] }, { access: "for life" }, { seats: 50 }]) {
    assert.equal(await unseal({ ...card, ...edit }, SECRET), false, JSON.stringify(edit));
  }
  assert.equal(await unseal({ ...card, seal: "" }, SECRET), false);
  assert.equal(await unseal(card, "another-secret"), false);
  assert.equal(await unseal({ ...card, issued: "2000-01-01T00:00:00.000Z" }, SECRET), true, "only the sealed fields are sealed");
});

test("key order does not break a seal, so a card can come back through a model reordered", async () => {
  const d = await agreed();
  const card = await quoteCard(d, { checkout: "https://whop.com/c/1", secret: SECRET, now: 1000 });
  const shuffled = Object.fromEntries(Object.entries(card).reverse());
  assert.ok(await unseal(shuffled, SECRET));
});

test("a card is only issued for an agreed price", async () => {
  const d = openDeal({ id: "d2", tier: "sprint", now: 0 });
  await assert.rejects(() => quoteCard(d, { secret: SECRET }), /no agreed price/);
});

test("a pack card says how many seats, and the seats view is what the buyer gets", async () => {
  const d = await agreed("seats5", [[500], [450, "commitment", "five up front"]]);
  const card = await quoteCard(d, { checkout: "https://whop.com/c/2", secret: SECRET, now: 1000 });
  assert.equal(card.seats, 5);
  assert.match(card.label, /5 seats/);
  assert.ok(card.includes.some((i) => /never anyone's chats/i.test(i)));
});

test("the share card is the price and the rounds, never the chat", async () => {
  const d = await agreed();
  const s = shareCard(d, { url: "https://taskmaster.whop.site/" });
  assert.match(s.headline, /I got Taskmaster down to \$92/);
  assert.match(s.sub, /Opened at \$100\. 2 rounds\./);
  assert.equal(s.prompt, "Anyone get it lower?");
  assert.deepEqual(Object.keys(s).sort(),
    ["deal", "headline", "kind", "opening", "price", "prompt", "rounds", "sub", "tier", "url"]);
});

test("take-home is the price less the fee", async () => {
  assert.equal(takeHome(await agreed()), 88.48);
  assert.equal(takeHome(openDeal({ tier: "sprint", now: 0 })), null);
});
