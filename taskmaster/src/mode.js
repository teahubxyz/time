// Which prompt the server sends. The app decides this; the model never does.
//
// The character sheet is shared by two prompts, haggle and coach, and `modeFor` picks between them from one fact:
// does Whop say this member has paid? A valid membership on Taskmaster's product, or a place on a valid seat
// pack's seat list, is the receipt. Nothing a member types changes it — "Paid $100 via Cash App" is just text, and
// `test/mode.test.js` proves it leaves the thread in haggle mode. That was the hole in the old app: the character
// switched to coaching when the member said it had.
//
// The persona and the two prompts belong to the operator and stay out of this repo. They arrive as app secrets
// (TASKMASTER_SHEET, TASKMASTER_PROMPT_HAGGLE, TASKMASTER_PROMPT_COACH); what is here is a personality-free
// skeleton so a fresh install and the tests run, plus the rules that are the app's to enforce either way.

export const PRODUCT = "prod_EZ7UkE4pkW04U";
export const MODES = ["haggle", "coach"];

const ms = (v) => (v == null ? null : new Date(v).getTime());

// A membership counts when Whop says it is valid, it is on Taskmaster's product, and any end date it carries is
// still in the future. `valid` alone is not trusted to have been refreshed.
export function paidMembership(memberships = [], { product = PRODUCT, now } = {}) {
  const t = now ?? Date.now();
  return memberships.find((m) => {
    if (!m || m.valid !== true) return false;
    if ((m.product_id ?? m.product) !== product) return false;
    const ends = ms(m.expires_at ?? m.renewal_period_end ?? null);
    return ends == null || ends > t;
  }) ?? null;
}

// A seat pack is one membership; the seat list lives in its metadata (see seats.js). A member on a valid pack's
// list is paid for, without a membership of their own.
export function seatOn(packs = [], user, { product = PRODUCT, now } = {}) {
  if (!user) return null;
  const t = now ?? Date.now();
  const who = String(user).toLowerCase();
  return packs.find((p) => {
    if (!p || p.valid !== true) return false;
    if ((p.product_id ?? p.product) !== product) return false;
    const ends = ms(p.expires_at ?? p.renewal_period_end ?? null);
    if (ends != null && ends <= t) return false;
    return (p.metadata?.seats ?? []).some((s) => String(s?.user ?? s).toLowerCase() === who);
  }) ?? null;
}

// The whole decision, and the only one. `said` is deliberately not a parameter: there is nothing a member can say
// that belongs in it.
export function modeFor({ memberships = [], packs = [], user, product = PRODUCT, now } = {}) {
  const own = paidMembership(memberships, { product, now });
  if (own) return { mode: "coach", via: "membership", membership: own.id ?? null, seats: null };
  const pack = seatOn(packs, user, { product, now });
  if (pack) return { mode: "coach", via: "seat", membership: pack.id ?? null, seats: (pack.metadata?.seats ?? []).length };
  return { mode: "haggle", via: "unpaid", membership: null, seats: null };
}

// A personality-free skeleton. The operator's sheet replaces it wholesale; these lines are the app's rules, which
// hold whichever sheet is loaded.
export const SKELETON = [
  "You are Taskmaster, a coaching character on Whop.",
  "Write in short lines. No stage directions, no narration between asterisks.",
  "Say only what is true: no invented deadlines, no scarcity, no discounts you have not been given.",
].join("\n");

const RULES = {
  haggle: [
    "You are haggling over the price of coaching. You do not set prices.",
    "To put a number on the table, call the quote tool with a tier, a price in dollars and one reason tag:",
    "scope, urgency, commitment or pay_now. The deal desk answers accept, counter or refuse; say its number, never your own.",
    "Earn every step down with something the member told you about the work. Price the project and the blocker,",
    "never the person: their profile, following, employer, country or means are not yours to price on.",
    "Open at the desk's anchor. Three rounds at most. Keep every reply to a couple of lines.",
    "When the desk accepts, the quote card carries the price and the checkout button. Do not restate or change it.",
  ].join("\n"),
  coach: [
    "The member has paid; Whop confirmed it. Coach them.",
    "Short commands. Track what they commit to and hold them to it by name.",
    "Call out stalling. Celebrate a win plainly. Tell real rest from avoidance, and say which you think it is.",
    "Do not discuss price, discounts or the deal: that is finished.",
  ].join("\n"),
};

// The server composes the system prompt. `sheet` and `prompts` come from app secrets; anything missing falls back
// to the skeleton, so the app never silently runs with half a prompt.
export function promptFor(mode, { sheet, prompts = {} } = {}) {
  if (!MODES.includes(mode)) throw new Error(`no such mode: ${mode}`);
  const head = (sheet ?? "").trim() || SKELETON;
  const body = (prompts[mode] ?? "").trim() || RULES[mode];
  return `${head}\n\n${body}`;
}
