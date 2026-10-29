# taskmaster

Taskmaster is the factory's coaching character on Whop (`app_M7BBH1Evw8sjL4`, product `prod_EZ7UkE4pkW04U`). You
haggle for your price, pay through a real Whop checkout, and only then does it coach you.

The old version never actually took money: the character switched to coaching when the member typed "Paid $X via …",
and the webhook handler only logged invoices. This is the rebuild. Two things carry it:

**The character haggles; the deal desk decides.** The character never sets a price. It calls one tool, `quote(tier,
price, reason)`, and `src/dealdesk.js` answers accept, counter or refuse against that tier's anchor, its floor and
the concession rules. This is OpenPoke's split between the voice and the workers, applied to price.

**The app decides the mode, never the model.** One character sheet, two prompts, and the server picks which to send
from one fact: does Whop say this member has paid? Typing "Paid" changes nothing, and `test/mode.test.js` proves it.

## The haggle

Modelled on Poke's beta "bouncer", which sized you up and then made you negotiate your monthly price — it opened
high, gave ground, and people posted the price they got and asked whether anyone went lower, so the haggle was the
marketing too. Four rules, all in `src/dealdesk.js`:

| Rule | What it means |
| --- | --- |
| Anchor high | The opening is the tier's list price. The desk never quotes above it, and never walks a price back up. |
| Keep a real floor | A quote under the floor is countered at the floor, whatever reason came with it. |
| Earn every step | A step down needs one of four reasons the member gave — `scope`, `urgency`, `commitment`, `pay_now` — each worth a fixed slice of the anchor and each spendable once. No reason, no step. |
| Three rounds | Every answer that puts a number on the table is a round, the opening included. Then the standing price is the price. |

Two more, about honesty rather than money, and neither spends a round:

- **Price on what they tell you, never on who they are.** A reason that reaches for the member's profile,
  following, employer, means or country is refused. This is the one place Taskmaster deviates from Poke's bouncer.
- **No invented scarcity and no fake deadlines.** The haggle is a game with real rules, not pressure.

The agreed price becomes a **quote card** the model cannot edit — sealed with an HMAC over its fields, so a card
that comes back through the model changed is worthless — and after a deal comes a **share card**
("I got Taskmaster down to $X. Anyone get it lower?").

**Every deal is logged**, closed or walked away from: the opening, each counter, the final price, the rounds, the
reasons and the outcome, and never a word the member wrote (`src/deallog.js`). That log is the price discovery;
once there are enough deals, the operator replaces the haggle with fixed tiers, as Poke did.

## Tiers

Starting points from the old prompt, in `src/tiers.js`, which is the only file that knows a price.

| Tier | Opens at | Floor | Shape |
| --- | --- | --- | --- |
| `sprint` — 1-hour sprint | $100 | $80 | one-time, 14 days to use |
| `lite` — 30-minute sprint | $50 | $40 | one-time, 14 days |
| `pack3` — 3 sprints | $300 | $250 | one-time, 90 days (17% off, not the 15% the old prompt claimed) |
| `daily` — ongoing | $10/day | $8/day | renewal, 1-day billing |
| `checkins` — email check-ins | $5/day | $4/day | renewal, 1-day billing |
| `seats5` / `seats10` | $100/seat | $80 / $72 per seat | one-time pack, 90 days |

Only one discount was ever published (the sprint's $100 against its $80 intro, 20% off), so that is the ratio the
other individual floors take. Fees are in there too: a card charge plus orchestration is about $0.30 + 3.5%, which
is 9.5% of a $5 ticket but 3.8% of a $100 one, so every logged deal carries what actually reaches the owner.

## Orgs

A team lead haggles for a seat pack within a per-seat floor, then assigns seats by Whop username. A Whop checkout
has no quantity, so a pack is one membership and the seat list lives in that membership's metadata — no database.
Swaps are allowed but rate-limited. **The buyer sees seats and usage, never anyone's chats**: usage is counted in
days a seat was used, and `assertNoChats` in `src/seats.js` is what keeps a future field from adding them. The
seats routes are the buyer's alone — a membership id is not a password — and a caller says who they are with a
thread, which is the server's own record of the member in it. An org that already runs a whop can install
Taskmaster there and buy the pack as the app's plan instead.

One thing the metadata cannot do is answer "which pack seats this person?". A seat holder holds no membership —
the pack belongs to the lead who bought it — so asking Whop what that user holds answers nothing, and coach mode
for a pack would only ever work for the buyer. `packIndex` in `src/seats.js` remembers which pack a username was
seated on, and that is all it is: the server reads each pack it names straight from Whop before anyone is coached,
so a stale pointer costs one read and grants nothing. It is derived state, rebuildable from the packs themselves.

Whop answers membership queries to a user id and seat lists are written in usernames, so a thread carries both —
`member`, the id, and `username` — and where the host knows only one it stands for both.

If a creator recommends Taskmaster, Whop's affiliate codes pay them: a checkout configuration takes an
`affiliate_code` and Whop pays the commission. There is no reseller cut here.

## Layout

```
src/tiers.js        what is sold, the anchors, the floors, the fees, the variant key
src/dealdesk.js     the rules. The only thing that decides a price
src/cards.js        the sealed quote card and the share card
src/deallog.js      one line per deal, validated so prose cannot get in
src/mode.js         haggle or coach, from Whop's answer; the two prompts
src/seats.js        seat packs in membership metadata, and the buyer's view
src/whop.js         the Whop client: one variant per price, one configuration per deal, memberships, metadata
src/webhook.js      the signed payment webhook, one of the two roads a confirmed payment arrives by
src/experiments.js  the three experiments, bucketed by user
src/voice.js        Venice, the one tool, the rate limit, no asterisk narration
src/server.js       the routes
src/index.js        where app secrets become dependencies

test/dealdesk.test.js  the catalog's prices and fees, the anchor, the floor, earned concessions, the round cap,
                       the two honesty refusals, and a tier switch that is no way round a floor
test/cards.test.js     the seal: a card that came back edited buys nothing. And the share card
test/deallog.test.js   one line per deal, validated; prose cannot get in; the summary the operator reads
test/mode.test.js      "Paid $100" does not buy coaching. Memberships, seat lists, the two prompts
test/seats.test.js     assignment, swap limits, usage in days, the buyer view, the pack index
test/webhook.test.js   signed, tampered, replayed, forged, repeated, and a payment short of the agreed price
test/whop.test.js      the live guard, the inline plan, variant reuse with per-deal metadata, the affiliate code
test/voice.test.js     no uncensored model, no asterisk narration, the rate limit, the bucketed experiments
test/flow.test.js      the whole thing: greet, haggle, quote card, payment (webhook or return), coach mode, seats
```

`npm test` runs it all: no dependencies, no network, no Whop.

## Secrets

Set with `whop apps secrets set`. None has a default that would let the app run half-configured: see the list at
the top of `src/index.js`. The persona — the character sheet and the two prompts — belongs to the operator and
stays out of this repo; what is here is a personality-free skeleton so a fresh install and the tests run.

The voice runs on Venice, as the old app did. The old code defaulted to `venice-uncensored`; there is no uncensored
default here and `model()` refuses one outright. Name the model in `TASKMASTER_MODEL`. The sheet is plain text
rather than a Venice character, so it is portable to another model unchanged.

v1 leaves out the old image and voice modes.

## Not done here

Card #66 touches nothing on Whop: no checkout configuration, no variant, no deploy, no secret, no `base_url`
change, until the operator approves the Whop previews. `src/whop.js` therefore refuses every write unless it is
constructed with `live: true` (`TASKMASTER_WHOP_LIVE=on`), and the tests run against an injected `fetch`.

Five things need confirming against Whop's docs before this runs for real, and each is one line to correct:

- **That a configuration can name an existing plan** (`plan_id`) rather than carrying an inline one. That is how a
  variant is reused: the plan is created once per price, and every later deal gets its own configuration on it,
  because a configuration's metadata is what maps the payment back to a member, a thread and a deal. If Whop wants
  the inline plan repeated instead, that is the line to change; the per-deal configuration stays either way.

- **Daily billing** for the `daily` and `checkins` tiers. Whop's membership API mentions daily billing, so it looks
  supported, but `checkout()` refuses a renewal tier until it is passed `dailyBilling: "confirmed"`.
- **How an inline plan is kept off the product's public page.** The field is in `HIDDEN` in `src/whop.js`.
- **The webhook's header names and signed string.** Both shapes are verified (a timestamp joined to the body, or
  the body alone); the header names are constants at the top of `src/webhook.js`.
- **iOS.** Whop's iOS rules may treat a one-off checkout differently from a subscription, which would change what
  these tiers may be priced at on a phone.

The factory's own deal desk lives at <https://teahub.xyz/teahubxyz/dealdesk> and the card asks for it to be
imported rather than rebuilt. That host is not reachable from the build container, so the rules are implemented in
`src/dealdesk.js` behind the same seam — every caller goes through `openDeal` / `quote` / `agree` / `walkaway`, so
swapping the import is a one-file change.
