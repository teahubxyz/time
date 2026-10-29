// The Whop client, and the only place in the app that knows Whop's shapes.
//
// Nothing in card #66 touches Whop: no checkout configuration, no variant, no deploy, no secret, no base_url. This
// module is therefore written and tested against an injected `fetch` and never called with a real key. The guard
// below is what keeps it that way — `live: true` has to be passed in deliberately, and without it every call that
// would write to Whop throws instead.
//
// What the operator still has to confirm before this runs for real (docs.whop.com is not reachable from the build
// container, so these are the card's own open questions, not guesses dressed up as facts):
//
//   * `plan.billing_period: 1` for the daily tiers. Whop's membership API mentions daily billing, so it looks
//     supported; `checkout()` refuses a renewal tier until `dailyBilling: "confirmed"` is passed, so a daily tier
//     cannot be created on an assumption.
//   * That a configuration can name an existing plan (`plan_id`) instead of carrying an inline one. That is how a
//     variant is reused: the plan is made once per price and every later deal gets its own configuration on it.
//     If Whop turns out to want the inline plan repeated instead, the `plan_id` line in `checkout()` is the one to
//     change — the per-deal configuration is not negotiable either way, because its metadata routes the payment.
//   * How a plan is kept off the product's public page. The old app's note calls it a hidden inline variant;
//     `HIDDEN` holds the field this sends, in one place, so correcting it is one line.
//   * iOS. Whop's iOS rules may treat a one-off checkout differently from a subscription, which would change what
//     these tiers may be priced at on a phone. `checkout()` passes `platform` through untouched for now.
//
// Confirmed from the API reference: POST /checkout_configurations takes an inline `plan` object (`plan_type` is
// `one_time` or `renewal`, with `initial_price`), plus `affiliate_code`, `metadata` and `redirect_url`.

import { tier, variantKey, CURRENCY, cents } from "./tiers.js";

export const BASE = "https://api.whop.com/api/v1";
export const PRODUCT = "prod_EZ7UkE4pkW04U";
export const APP = "app_M7BBH1Evw8sjL4";

// Unconfirmed: the field that keeps an inline plan off the product's public page.
export const HIDDEN = { visibility: "hidden" };

export class WhopError extends Error {
  constructor(status, body) {
    super(`whop answered ${status}: ${typeof body === "string" ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
}

// store: { get(key), set(key, value) }. It holds one plan id per variant key, which is what variant reuse is:
// matching deals share one inline plan instead of leaving a trail of one-off variants on the product.
export function memoryStore() {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v) };
}

export function whop({ apiKey, fetch: f = globalThis.fetch, base = BASE, product = PRODUCT, store = memoryStore(),
                       live = false, dailyBilling = "unconfirmed" } = {}) {
  const call = async (method, path, body) => {
    if (!apiKey) throw new Error("no Whop API key");
    const res = await f(base + path, {
      method,
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new WhopError(res.status, out);
    return out;
  };

  const writing = (what) => {
    if (!live) throw new Error(`refusing to ${what} on Whop: pass live: true once the operator has approved the previews`);
  };

  return {
    product,
    app: APP,

    // One variant per (tier, price), one configuration per deal.
    //
    // The variant — the inline plan — is what gets reused when a later deal lands on the same number, so matching
    // deals share one plan instead of leaving a trail of one-off variants on the product. The configuration on top
    // of it is this deal's alone, because its metadata is the only thing that maps the payment back to the right
    // member, thread and deal. Handing a second buyer the first buyer's configuration would send their payment to
    // a deal that is already paid: the webhook would answer `already`, their own deal would never close and their
    // thread would never leave haggle mode. The URL is cheap; the routing is not.
    async checkout({ tier: id, price, member, thread, deal, affiliate_code = null, redirect_url = null, platform = null }) {
      const t = tier(id);
      if (t.kind === "renewal" && dailyBilling !== "confirmed") {
        throw new Error(`${t.id} bills every ${t.billing_period} day(s); confirm daily billing with Whop, then pass dailyBilling: "confirmed"`);
      }
      const key = variantKey(t.id, price);
      const metadata = { app: APP, tier: t.id, deal, member, thread, seats: t.seats, price: cents(price), variant: key };

      writing("create a checkout configuration");
      const known = await store.get(key);
      const plan = {
        product_id: product,
        plan_type: t.kind,
        initial_price: cents(price),
        base_currency: CURRENCY,
        ...HIDDEN,
        ...(t.kind === "renewal" ? { billing_period: t.billing_period } : { expiration_days: t.expiration_days }),
      };
      const made = await call("POST", "/checkout_configurations", {
        ...(known?.plan ? { plan_id: known.plan } : { plan }),   // the variant, made once and named thereafter
        metadata,
        ...(affiliate_code ? { affiliate_code } : {}),   // a creator's commission, paid by Whop; no reseller cut here
        ...(redirect_url ? { redirect_url } : {}),
        ...(platform ? { platform } : {}),
      });
      const planId = made.plan?.id ?? made.plan_id ?? known?.plan ?? null;
      if (!known?.plan && planId) await store.set(key, { plan: planId, variant: key });
      return {
        id: made.id ?? null,
        url: made.purchase_url ?? made.url ?? null,
        variant: key,
        plan: planId,
        reused: Boolean(known?.plan),   // the variant was reused; the configuration is this deal's
        metadata,
      };
    },

    async membership(id) {
      return call("GET", `/memberships/${encodeURIComponent(id)}`);
    },

    // Every membership this user holds on Taskmaster's product. The server asks this, never the member.
    async membershipsFor(user) {
      const out = await call("GET", `/memberships?user_id=${encodeURIComponent(user)}&product_id=${encodeURIComponent(product)}`);
      return out.data ?? out.memberships ?? [];
    },

    // Merged, not replaced: the seat list and the swap history live here and a write that replaced the object would
    // drop whatever Whop or another part of the app keeps beside them.
    async mergeMembershipMetadata(id, patch) {
      writing("write membership metadata");
      return call("POST", `/memberships/${encodeURIComponent(id)}`, { metadata: patch });
    },
  };
}
