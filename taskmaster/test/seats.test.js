// Seat packs in membership metadata: assign, swap within the limit, and a buyer view with no chats in it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assign, buyerView, useSeat, size, assertNoChats, SWAP_LIMIT } from "../src/seats.js";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const day = (n) => new Date(NOW + n * 86400000).toISOString();
const packOf = (seats = [], swaps = [], tier = "seats5") => ({ id: "mem_pack", valid: true, metadata: { tier, seats, seat_swaps: swaps } });

test("a pack's size comes from its tier, not from metadata a member could write", () => {
  assert.equal(size(packOf()), 5);
  assert.equal(size(packOf([], [], "seats10")), 10);
  assert.equal(size(packOf([], [], "sprint")), 0, "an individual membership is not a pack");
  assert.equal(size({ metadata: { tier: "seats5000", seat_count: 5000 } }), 0);
  assert.equal(size({ metadata: {} }), 0);
});

test("seats are assigned by Whop username, up to the pack's size", () => {
  const patch = assign(packOf(), { add: ["bob", "@Cy", " dee "], now: NOW });
  assert.deepEqual(patch.seats.map((s) => s.user), ["bob", "cy", "dee"]);
  assert.equal(patch.seats[0].used, 0);
  assert.equal(patch.seats[0].assigned, new Date(NOW).toISOString());
  assert.throws(() => assign(packOf(), { add: ["a", "b", "c", "d", "e", "f"], now: NOW }), /has 5 seats/);
  assert.throws(() => assign(packOf([{ user: "bob" }]), { add: ["bob"], now: NOW }), /already holds a seat/);
  assert.throws(() => assign(packOf(), { add: ["not a username!"], now: NOW }), /not a Whop username/);
  assert.throws(() => assign({ metadata: { tier: "sprint" } }, { add: ["bob"], now: NOW }), /not a seat pack/);
});

test("swaps are allowed but rate-limited", () => {
  const held = [{ user: "bob" }, { user: "cy" }];
  const one = assign(packOf(held), { add: ["dee"], remove: ["bob"], now: NOW });
  assert.deepEqual(one.seats.map((s) => s.user), ["cy", "dee"]);
  assert.equal(one.seat_swaps.length, 1);

  const spent = Array.from({ length: SWAP_LIMIT }, () => day(-1));
  assert.throws(() => assign(packOf(held, spent), { add: ["dee"], remove: ["bob"], now: NOW }),
    new RegExp(`${SWAP_LIMIT} seat swaps`));
  // the window rolls: swaps older than it are forgotten rather than held against the buyer for ever
  const old = Array.from({ length: SWAP_LIMIT }, () => day(-60));
  const after = assign(packOf(held, old), { add: ["dee"], remove: ["bob"], now: NOW });
  assert.equal(after.seat_swaps.length, 1, "the old swaps are dropped, not carried");
  assert.throws(() => assign(packOf(held), { remove: ["nobody"], now: NOW }), /does not hold a seat/);
});

test("usage is days used, not messages sent, and one write a day", () => {
  const pack = packOf([{ user: "bob", used: 0 }]);
  const first = useSeat(pack, "bob", { now: NOW });
  assert.equal(first.seats[0].used, 1);
  const same = useSeat({ ...pack, metadata: { ...pack.metadata, seats: first.seats } }, "bob", { now: NOW + 3600000 });
  assert.equal(same, null, "a second turn the same day writes nothing");
  const next = useSeat({ ...pack, metadata: { ...pack.metadata, seats: first.seats } }, "bob", { now: NOW + 86400000 });
  assert.equal(next.seats[0].used, 2);
  assert.throws(() => useSeat(pack, "dee", { now: NOW }), /does not hold a seat/);
});

test("the buyer sees seats and usage, never anyone's chats", () => {
  const pack = packOf([{ user: "bob", assigned: day(-5), used: 3, last: day(-1) }, { user: "cy", assigned: day(-2), used: 0 }], [day(-3)]);
  const view = buyerView(pack, { now: NOW });
  assert.equal(view.seats, 5);
  assert.equal(view.assigned, 2);
  assert.equal(view.open, 3);
  assert.equal(view.used, 3);
  assert.equal(view.swaps_used, 1);
  assert.equal(view.swaps_left, SWAP_LIMIT - 1);
  assert.deepEqual(view.holders.map((h) => h.user), ["bob", "cy"]);
  assert.deepEqual(Object.keys(view.holders[0]).sort(), ["assigned", "last", "used", "user"]);

  // whatever else is on the membership, the view carries none of it
  const nosy = { ...pack, metadata: { ...pack.metadata, seats: [{ user: "bob", used: 1, transcript: ["I keep missing my own deadlines"] }] } };
  assert.ok(!JSON.stringify(buyerView(nosy, { now: NOW })).includes("deadlines"));
  assert.throws(() => assertNoChats({ holders: [{ user: "bob", messages: 4 }] }), /must not carry holders.0.messages/);
  assert.throws(() => assertNoChats({ chat: [] }), /must not carry chat/);
});
