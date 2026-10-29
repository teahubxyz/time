// The Whop seam, against an injected fetch. Nothing in card #66 reaches Whop, and the first test is what holds
// that line: without `live: true` every call that would write refuses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { whop, memoryStore, HIDDEN, PRODUCT, APP } from "../src/whop.js";
import { variantKey } from "../src/tiers.js";

function fake(answer = {}) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, method: init.method, auth: init.headers.authorization, body: init.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({ id: "cfg_1", purchase_url: "https://whop.com/checkout/cfg_1", plan: { id: "plan_1" }, ...answer }),
      { status: 200, headers: { "content-type": "application/json" } });
  };
  f.calls = calls;
  return f;
}

test("nothing is created on Whop without live: true", async () => {
  const f = fake();
  const w = whop({ apiKey: "k", fetch: f });
  await assert.rejects(() => w.checkout({ tier: "sprint", price: 80, member: "ann", thread: "t1", deal: "d1" }),
    /refusing to create a checkout configuration/);
  await assert.rejects(() => w.mergeMembershipMetadata("mem_1", { seats: [] }), /refusing to write membership metadata/);
  assert.equal(f.calls.length, 0, "and no request went out");
});

test("a checkout is an inline plan on Taskmaster's product, kept off the public page", async () => {
  const f = fake();
  const w = whop({ apiKey: "k", fetch: f, live: true });
  const out = await w.checkout({ tier: "sprint", price: 80, member: "ann", thread: "t1", deal: "d1" });
  assert.equal(f.calls.length, 1);
  const { url, method, auth, body } = f.calls[0];
  assert.equal(url, "https://api.whop.com/api/v1/checkout_configurations");
  assert.equal(method, "POST");
  assert.equal(auth, "Bearer k");
  assert.equal(body.plan.product_id, PRODUCT);
  assert.equal(body.plan.plan_type, "one_time");
  assert.equal(body.plan.initial_price, 80);
  assert.equal(body.plan.base_currency, "usd");
  assert.equal(body.plan.expiration_days, 14);
  assert.equal(body.plan.visibility, HIDDEN.visibility);
  assert.equal(body.plan.billing_period, undefined, "a sprint does not renew");
  assert.equal(out.url, "https://whop.com/checkout/cfg_1");
  assert.equal(out.reused, false);
});

test("the checkout's metadata maps the payment back to the member, the thread and the deal", async () => {
  const w = whop({ apiKey: "k", fetch: fake(), live: true });
  const out = await w.checkout({ tier: "sprint", price: 80, member: "ann", thread: "t1", deal: "d1" });
  assert.equal(out.metadata.member, "ann");
  assert.equal(out.metadata.thread, "t1");
  assert.equal(out.metadata.deal, "d1");
  assert.equal(out.metadata.tier, "sprint");
  assert.equal(out.metadata.price, 80);
  assert.equal(out.metadata.app, APP);
});

test("matching deals reuse the variant, and each gets its own configuration", async () => {
  const f = fake();
  const w = whop({ apiKey: "k", fetch: f, live: true, store: memoryStore() });
  const a = await w.checkout({ tier: "sprint", price: 80, member: "ann", thread: "t1", deal: "d1" });
  const b = await w.checkout({ tier: "sprint", price: 80, member: "bob", thread: "t2", deal: "d2" });

  // the variant is made once: the second deal landed on the same number, so it names the plan the first one made
  assert.equal(a.variant, variantKey("sprint", 80));
  assert.equal(b.variant, a.variant);
  assert.equal(f.calls[0].body.plan.initial_price, 80, "the first deal carries the inline plan");
  assert.equal(f.calls[0].body.plan_id, undefined);
  assert.equal(f.calls[1].body.plan_id, "plan_1", "the second names it instead of making another");
  assert.equal(f.calls[1].body.plan, undefined);
  assert.equal(b.reused, true);
  assert.equal(b.plan, a.plan);

  // but the configuration is per deal, because its metadata is what routes the payment back to a conversation.
  // Handing bob ann's configuration would send his payment to a deal that is already paid.
  assert.equal(f.calls.length, 2, "one configuration per deal");
  assert.equal(f.calls[0].body.metadata.deal, "d1");
  assert.equal(f.calls[1].body.metadata.deal, "d2");
  assert.equal(f.calls[1].body.metadata.member, "bob");
  assert.equal(f.calls[1].body.metadata.thread, "t2");
  assert.equal(b.metadata.deal, "d2", "and what Whop holds is what the caller was told");

  await w.checkout({ tier: "sprint", price: 92, member: "cy", thread: "t3", deal: "d3" });
  assert.equal(f.calls[2].body.plan.initial_price, 92, "a different price is a different variant");
});

test("a variant the store already knows still buys nothing without live: true", async () => {
  const f = fake();
  const store = memoryStore();
  await store.set(variantKey("sprint", 80), { plan: "plan_1", variant: variantKey("sprint", 80) });
  const w = whop({ apiKey: "k", fetch: f, store });
  await assert.rejects(() => w.checkout({ tier: "sprint", price: 80, member: "ann", thread: "t1", deal: "d1" }),
    /refusing to create a checkout configuration/);
  assert.equal(f.calls.length, 0, "a known variant is not a way round the guard: every deal still writes");
});

test("a daily tier is not created on an assumption about Whop's daily billing", async () => {
  const w = whop({ apiKey: "k", fetch: fake(), live: true });
  await assert.rejects(() => w.checkout({ tier: "daily", price: 10, member: "ann", thread: "t1", deal: "d1" }),
    /confirm daily billing with Whop/);

  const f = fake();
  const ok = whop({ apiKey: "k", fetch: f, live: true, dailyBilling: "confirmed" });
  await ok.checkout({ tier: "daily", price: 10, member: "ann", thread: "t1", deal: "d1" });
  assert.equal(f.calls[0].body.plan.plan_type, "renewal");
  assert.equal(f.calls[0].body.plan.billing_period, 1);
  assert.equal(f.calls[0].body.plan.expiration_days, undefined);
});

test("an affiliate code rides along, so a creator's commission is Whop's to pay and not a cut of ours", async () => {
  const f = fake();
  const w = whop({ apiKey: "k", fetch: f, live: true });
  await w.checkout({ tier: "sprint", price: 80, member: "ann", thread: "t1", deal: "d1", affiliate_code: "friendofmine" });
  assert.equal(f.calls[0].body.affiliate_code, "friendofmine");
  const f2 = fake();
  await whop({ apiKey: "k", fetch: f2, live: true }).checkout({ tier: "lite", price: 40, member: "a", thread: "t", deal: "d" });
  assert.equal("affiliate_code" in f2.calls[0].body, false, "and no empty field when there is no code");
});

test("memberships are read without a key only in the sense that the member is never asked", async () => {
  const f = fake({ data: [{ id: "mem_1", valid: true, product_id: PRODUCT }] });
  const w = whop({ apiKey: "k", fetch: f });
  const held = await w.membershipsFor("user_ann");
  assert.deepEqual(held.map((m) => m.id), ["mem_1"]);
  assert.match(f.calls[0].url, /\/memberships\?user_id=user_ann&product_id=prod_EZ7UkE4pkW04U$/);
  assert.equal(f.calls[0].method, "GET");
  await assert.rejects(() => whop({ fetch: f }).membership("mem_1"), /no Whop API key/);
});

test("a Whop error carries its status instead of being swallowed", async () => {
  const f = async () => new Response(JSON.stringify({ error: "nope" }), { status: 422, headers: { "content-type": "application/json" } });
  await assert.rejects(() => whop({ apiKey: "k", fetch: f }).membership("mem_1"), (e) => e.status === 422 && /whop answered 422/.test(e.message));
});
