// app.js: Havre. Everything runs in this page. The only address it talks to is api.venice.ai, with the visitor's own
// key, and the page's security policy enforces that.
import * as C from "./card.js";
import * as A from "./abilities.js";
import * as M from "./media.js";
import * as T from "./threads.js";
import { Venice, VeniceError } from "./venice.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);
/** an id for a message, so two tabs can tell which messages they both have */
const mid = () => M.newId().replace(/-/g, "").slice(0, 16);
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = () => matchMedia("(max-width: 1040px)").matches;
const motion = () => (still ? "auto" : "smooth");

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
/** items with " / " between them, the way the page writes its links */
const slashed = (items) => items.filter(Boolean).flatMap((it, i) => (i ? [" / ", it] : [it]));
const linkish = (text, onclick, attrs = {}) => h("button", { type: "button", class: "linkish", text, onclick, ...attrs });

// ---------- storage that never throws (private windows, blocked storage, previews) ----------
function box(kind) {
  const s = () => { try { return window[kind]; } catch { return null; } };
  return {
    get(k, d) { try { const v = s() && s().getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { s().setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k) { try { s().removeItem(k); } catch { /* nothing to forget */ } },
  };
}
const local = box("localStorage"), session = box("sessionStorage");
const K = { cards: "havre.cards.v1", sel: "havre.selected", key: "havre.key", model: "havre.model",
  sort: "havre.vsort", seeded: "havre.seeded.v1", adult: "havre.adult", adult18: "havre.adult.18", plainModel: "havre.plain.model",
  own: "havre.venice.models", ab: "havre.abilities", voiceOn: "havre.voicenotes", jobs: "havre.clips.pending", refOk: "havre.refs.ok",
  spent: "havre.spent", jobsDone: "havre.clips.done",
  // the pages of Venice's characters this tab saw lately (in sessionStorage, so they last as long as the tab)
  pages: "havre.venice.pages",
  // your chats: the list of threads, each thread's messages under its own key, the threads deleted (so another tab
  // doesn't bring them back), the one open, the left column's tab, and when each one's character last texted first
  threads: "havre.threads.v1", msgs: "havre.msgs.", gone: "havre.threads.gone", open: "havre.open", left: "havre.left",
  tried: "havre.textfirst", came: "havre.textfirst.others",
  // the first way conversations were kept, one per character, and which thread each one became
  chats: "havre.chats.v1", fromV1: "havre.threads.from-v1", cleared: "havre.chats.cleared", backs: "havre.comebacks" };
const msgKey = (id) => K.msgs + id;
const PAGE = 24;
const PLAIN = T.PLAIN;               // a plain chat with a model: no character, no card
const SORTS = ["featured", "imports", "highestRating", "mostRecent"];
// what a character hears when they speak first; it stays out of the conversation on screen
const OPENER = "[Start the conversation: someone new just came to talk to you. Say hello in character, in a line or two.]";

const S = {
  cards: [], sel: "", key: "", keyRemembered: false, model: C.DEFAULT_MODEL, models: null, modelsError: "",
  // your chats: every thread with its messages, the one open (null: a new chat with the character in sel, not
  // started yet), the one the conversation on screen was drawn for, the replies on their way (by thread), what each
  // character is doing meanwhile ("is typing…"), and a count that goes up whenever the conversation is drawn again
  threads: {}, open: null, shown: null, busy: new Map(), doing: new Map(), gen: 0, left: "chars",
  demo: {}, rx: null, plain: null, own: {},
  v: { list: [], offset: 0, more: false, query: "", sort: "featured", tag: "", adult: false, loading: false, asked: 0 },
  // abilities: Venice's other models by type, what was picked, who sends voice notes, clips on their way, the photo
  // or clip being asked for, and a voice note being recorded
  lists: { inpaint: null, image: null, tts: null, asr: null, video: null }, listErr: {},
  ab: { photo: "", clip: {}, hear: false, hearModel: "", see: false, seeModel: "", own: true, allowance: 0.25 }, voiceOn: {}, jobs: [], ask: null,
  rec: null, moving: new Set(), inflight: 0,
};
// what characters do on their own (photos, voice notes) comes out of a daily allowance, counted here by local day
const ALLOWANCES = [0.1, 0.25, 1, 5];
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const spentToday = () => A.spentToday(local.get(K.spent, null), localDay());
const canAfford = (usd) => A.canSpend(local.get(K.spent, null), localDay(), S.ab.allowance, usd);
function charge(usd) { local.set(K.spent, A.spend(local.get(K.spent, null), localDay(), usd)); if ($("#abilitydlg").open) renderAbilities(); renderTools(); }
/**
 * Set aside money from today's allowance before something is made on their own, so nothing else can spend it
 * meanwhile; false if it doesn't fit (or the price isn't known). What isn't spent goes back with refund().
 */
function reserve(usd) {
  if (!S.ab.own || !canAfford(usd)) return false;
  charge(usd);
  return true;
}
function refund(usd) { if (usd > 0) charge(-usd); }
const card = () => (S.sel === PLAIN ? S.plain : S.cards.find((c) => c.id === S.sel) || S.cards[0] || null);
/** the chat on screen; null for a new chat with card() that nobody has said anything in yet */
const thread = () => (S.open && S.threads[S.open]) || null;
/** whose chat it is: their card, the plain chat's, or null if they've left the harbor */
const cardOf = (t) => (!t ? null : t.card === PLAIN ? S.plain : S.cards.find((c) => c.id === t.card) || null);
/** whether this chat is the one on screen */
const here = (t) => !!t && S.open === t.id;
const threadsOf = (id) => Object.values(S.threads).filter((t) => t.card === id);
const latestOf = (id) => T.latestOf(Object.values(S.threads), id);
/** whether you can see the page (a tab in the background can't be read) */
const seen = () => document.visibilityState !== "hidden";

// ---------- boot ----------
function boot() {
  S.cards = (local.get(K.cards, []) || []).map((c) => { try { return C.normalizeCard(c); } catch { return null; } }).filter(Boolean);
  S.sel = local.get(K.sel, "") || "";
  retireFirstCast();
  if (S.sel !== PLAIN && !S.cards.some((c) => c.id === S.sel)) S.sel = S.cards[0] ? S.cards[0].id : "";
  const kept = local.get(K.key, "");
  S.key = kept || session.get(K.key, "") || "";
  S.keyRemembered = !!kept;
  S.model = local.get(K.model, C.DEFAULT_MODEL) || C.DEFAULT_MODEL;
  S.plain = { ...C.normalizeCard({ name: "no character", voice: { short_form: false } }), id: PLAIN, plain: true,
    model: local.get(K.plainModel, C.DEFAULT_MODEL) || C.DEFAULT_MODEL };
  loadThreads();
  const open = S.threads[local.get(K.open, "")], c0 = card();
  S.open = open && c0 && open.card === c0.id ? open.id : c0 ? (latestOf(c0.id) || {}).id || null : null;
  const left = local.get(K.left, "");
  S.left = left === "chats" || left === "chars" ? left : Object.keys(S.threads).length ? "chats" : "chars";
  const sort = local.get(K.sort, "featured");
  S.v.sort = SORTS.includes(sort) ? sort : "featured";
  S.v.adult = local.get(K.adult, false) === true && local.get(K.adult18, false) === true;
  S.own = local.get(K.own, {}) || {};
  S.ab = { ...S.ab, ...(local.get(K.ab, {}) || {}) };
  S.ab.clip = S.ab.clip && typeof S.ab.clip === "object" ? S.ab.clip : {};
  if (!ALLOWANCES.includes(S.ab.allowance)) S.ab.allowance = 0.25;
  S.voiceOn = local.get(K.voiceOn, {}) || {};
  S.jobs = (local.get(K.jobs, []) || []).filter((j) => j && j.queueId && j.model && Date.now() - (j.started || 0) < 23 * 3600e3);
  pruneEmpty();
  bind();
  renderAll();
  markRead(thread());
  loadModels();
  if (S.key) { loadVenice(0); loadBalance(); resumeJobs(); comingBack(); }
  const t0 = thread();
  if (S.key && t0 && t0.msgs.length && !T.anyShown(t0.msgs)) speakFirst();   // a hello cut off when its tab closed
  setTimeout(sweepMedia, 4000);
}

// The first version of Havre arrived with three characters of its own. This one has none, so they leave, unless
// someone has changed them since; and their drawings went with that version. (Their chats go when the threads load.)
function retireFirstCast() {
  if (!local.get(K.seeded, false)) return;
  S.cards = S.cards.filter((c) => !(["maren", "taskmaster", "odile"].includes(c.id) && c.updated === c.created));
  for (const c of S.cards) if (/^art\//.test(c.portrait)) c.portrait = "";
  local.del(K.seeded);
  if (!S.cards.some((c) => c.id === S.sel)) S.sel = S.cards[0] ? S.cards[0].id : "";
  persistCards(true);
}

// ---------- persistence ----------
let saveTimer = 0;
function persistCards(now = false) {
  clearTimeout(saveTimer);
  const go = () => {
    if (!local.set(K.cards, S.cards)) toast("This browser won't hold more. Export your characters to keep them.");
    local.set(K.sel, S.sel);
  };
  if (now) go(); else saveTimer = setTimeout(go, 250);
}
// ---------- your chats, kept ----------
/** messages this tab took back (a hello that didn't happen): not brought back from another tab's copy */
const takenBack = new Set();
/** a character the cards here know (or the plain chat's) */
const known = (id) => id === PLAIN || S.cards.some((c) => c.id === id);
/** a thread's messages as kept, with whose they are: { card, msgs }; null if there are none */
function readMsgs(id) {
  const v = local.get(msgKey(id), null);
  return v && typeof v === "object" && typeof v.card === "string" && Array.isArray(v.msgs) ? { card: v.card, msgs: v.msgs.filter(Boolean) } : null;
}
/** the ids of every thread whose messages this browser keeps */
function storedThreadIds() {
  const ids = [];
  try {
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(K.msgs)) ids.push(k.slice(K.msgs.length)); }
  } catch { /* storage closed off */ }
  return ids;
}
/**
 * The threads this browser keeps. The list is read, less the threads deleted and the ones whose character has left
 * (the cards here are the latest at load); a thread whose messages are kept but the list lost (two tabs saving the
 * list at the same moment) comes back; conversations kept the first way become threads.
 */
function loadThreads() {
  const was = local.get(K.gone, {}) || {}, gone = T.pruneGone(was);
  if (Object.keys(gone).length !== Object.keys(was).length) local.set(K.gone, gone);
  S.threads = {};
  let changed = false;
  for (const [id, t] of Object.entries(local.get(K.threads, {}) || {})) {
    if (!t || t.id !== id || gone[id] || !known(t.card)) { local.del(msgKey(id)); changed = true; continue; }
    const kept = readMsgs(id);
    S.threads[id] = { ...T.meta(t), msgs: kept ? kept.msgs : [] };
  }
  for (const id of storedThreadIds()) {
    if (S.threads[id]) continue;
    const kept = readMsgs(id);
    if (gone[id] || !kept || !known(kept.card) || !T.anyShown(kept.msgs)) { local.del(msgKey(id)); continue; }
    S.threads[id] = { ...T.fromMessages(id, kept.card, kept.msgs), msgs: kept.msgs };
    changed = true;
  }
  if (fromV1()) changed = true;
  local.del(K.cleared);
  local.del(K.backs);
  if (changed) saveIndex();
}
/**
 * Conversations kept the first way, one per character, become threads: the list first, then each one's messages, and
 * a conversation leaves the first store only once its thread is safely kept (one that doesn't fit yet stays there for
 * the next visit). A tab still on the old page may write them again: they join the threads they became before.
 */
function fromV1() {
  const old = local.get(K.chats, null);
  if (!old || typeof old !== "object") return false;
  const gone = local.get(K.gone, {}) || {};
  const ours = Object.fromEntries(Object.entries(old).filter(([id]) => known(id)));
  const { threads, messages, into } = T.migrate(ours, { newId: mid, into: local.get(K.fromV1, {}) || {} });
  local.set(K.fromV1, into);
  const landing = threads.filter((t) => !gone[t.id]);        // one deleted since stays deleted
  for (const t of landing) {
    const mine = S.threads[t.id];
    if (mine) { T.mergeMessages(mine.msgs, messages[t.id], takenBack); mine.at = Math.max(mine.at || 0, t.at); }
    else S.threads[t.id] = { ...t, msgs: messages[t.id] };
  }
  saveIndex();
  const left = {};
  for (const t of landing) if (!saveMsgs(S.threads[t.id])) left[t.card] = old[t.card];
  if (Object.keys(left).length) local.set(K.chats, left); else local.del(K.chats);
  return true;
}
/** a thread's messages, with what another tab added meanwhile: the last T.KEEP of them. false if they didn't fit */
function saveMsgs(t) {
  const kept = readMsgs(t.id);
  if (kept) T.mergeMessages(t.msgs, kept.msgs, takenBack);
  if (t.msgs.length > T.KEEP) t.msgs.splice(0, t.msgs.length - T.KEEP);       // in place: a reply on its way holds it
  if (local.set(msgKey(t.id), { card: t.card, msgs: t.msgs })) return true;
  full();
  return false;
}
/**
 * The list of threads another tab saved, merged into this one: new threads come with their messages, deleted ones
 * go. A thread whose character this tab doesn't know yet (another tab just met them) is kept, just not shown.
 */
function syncIndex() {
  const { added, changed, removed } = T.mergeIndex(S.threads, local.get(K.threads, {}) || {}, local.get(K.gone, {}) || {});
  for (const id of added) { const kept = readMsgs(id); S.threads[id].msgs = kept ? kept.msgs : []; }
  for (const id of removed) stopThread(id);
  return added.length + changed.length + removed.length > 0;
}
function saveIndex() {
  syncIndex();
  const out = {};
  for (const [id, t] of Object.entries(S.threads)) out[id] = T.meta(t);
  if (!local.set(K.threads, out)) full();
}
/** a thread kept: its messages, and its place in the list (not one deleted meanwhile, here or in another tab) */
function saveThread(t) {
  syncIndex();
  if (!S.threads[t.id]) return;
  saveMsgs(t);
  saveIndex();
  sweepSoon();
}
/** chats nothing was ever said in (a hello that never came, a clip that never arrived) go, after a while */
function pruneEmpty() {
  const now = Date.now();
  for (const t of Object.values(S.threads)) {
    if (now - (t.created || 0) > 10 * 60000 && !T.anyShown(t.msgs) && !S.jobs.some((j) => j.thread === t.id)) dropThread(t.id);
  }
}
let fullSaid = 0;
function full() {
  if (Date.now() - fullSaid < 60000) return;
  fullSaid = Date.now();
  toast("This browser won't hold more. Delete an old chat, or remove a character's pictures, to make room.");
}
// photos, voice notes and clips that no chat points at any more leave this browser too
let sweepTimer = 0;
function sweepSoon() { clearTimeout(sweepTimer); sweepTimer = setTimeout(sweepMedia, 2000); }
function sweepMedia() {
  // what this tab holds, and what another tab may have saved since: both stay
  const keep = A.mediaIds(Object.fromEntries(Object.values(S.threads).map((t) => [t.id, t.msgs])));
  for (const id of storedThreadIds()) for (const m of A.mediaIds({ [id]: (readMsgs(id) || {}).msgs })) keep.add(m);
  for (const m of A.mediaIds(local.get(K.chats, {}) || {})) keep.add(m);
  M.keepOnly(keep).catch(() => {});
}
function uniqueId(base) {
  let id = base, n = 2;
  while (S.cards.some((c) => c.id === id)) id = `${base}-${n++}`;
  return id;
}
function addCard(raw, { select = true } = {}) {
  const c = C.normalizeCard(raw);
  c.id = uniqueId(c.id);
  S.cards.push(c);
  persistCards(true);
  if (select) selectCard(c.id);
  return c;
}
function replaceCard(next) {
  const i = S.cards.findIndex((c) => c.id === next.id);
  if (i >= 0) S.cards[i] = C.touch(next);
  persistCards();
}

// ---------- faces ----------
// Venice keeps character photos (outerface.venice.ai) behind its own sign-in; its image service hands them out
const OUTERFACE = /^https:\/\/outerface\.venice\.ai\//;
function veniceImg(url, w = 384) {
  return OUTERFACE.test(url || "") ? `https://venice.ai/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=75` : url || "";
}
/** a picture on a card, as this page shows it */
function pictureSrc(p = "") {
  if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml)[;,]/i.test(p)) return p;
  if (OUTERFACE.test(p)) return veniceImg(p);
  if (p.startsWith(C.SITE)) return p.slice(C.SITE.length);
  if (p && !/^[a-z][a-z0-9+.-]*:/i.test(p) && !p.startsWith("//")) return p;
  return "";
}
const portraitSrc = (c) => pictureSrc((c && c.portrait) || "");
/**
 * A picture on a card, as Venice can take it for a photo or a clip. Only pictures this page shows you are used: one
 * kept in the card itself (a data: URI), or a Venice character's own photo. A link to anywhere else stays an empty
 * frame, and nothing is made from it.
 */
function apiPicture(p = "") {
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(p)) return p;
  if (OUTERFACE.test(p)) return p;                          // Venice fetches its own photos by their own address
  return "";
}
/** what a photo or a clip of them is made from: their portrait, then the pictures on their card */
const refsOf = (c) => (c ? [c.portrait, ...c.look.references].map(apiPicture).filter(Boolean) : []);
/** a photo in a frame; no photo is an empty frame with an X through it */
function paintFace(el, src) {
  el.textContent = "";
  el.classList.remove("noface");
  if (!src) { el.classList.add("noface"); return; }
  const img = h("img", { src, alt: "", decoding: "async", loading: "lazy" });
  img.addEventListener("error", () => { img.remove(); el.classList.add("noface"); });
  el.append(img);
}

// ---------- render ----------
function renderAll() { renderLeft(); renderGrid(); renderThreads(); renderRoster(); renderChat(); renderCard(); updateKeyUI(); }

// ---------- your chats ----------
/** the left column: your chats, or the characters to start one with */
function setLeft(which, { focus = false } = {}) {
  S.left = which;
  local.set(K.left, which);
  renderLeft();
  if (focus) $(which === "chats" ? "#lt-chats" : "#lt-chars").focus();
}
function renderLeft() {
  for (const [w, tab, panel] of [["chats", "#lt-chats", "#lp-chats"], ["chars", "#lt-chars", "#lp-chars"]]) {
    $(tab).setAttribute("aria-selected", S.left === w ? "true" : "false");
    $(tab).tabIndex = S.left === w ? 0 : -1;
    $(panel).hidden = S.left !== w;
  }
}
const faces = new Map();         // each chat's face in the list, kept between drawings so the photos don't flicker
function threadFace(t, src) {
  const f = faces.get(t.id);
  if (f && f.src === src) return f.el;
  const el = h("span", { class: "face small", "aria-hidden": "true" });
  paintFace(el, src);
  faces.set(t.id, { src, el });
  return el;
}
/** your chats, the latest first: who, how long ago, its name or the first thing you said, the last line, what's new */
function renderThreads() {
  const ul = $("#threads"), now = Date.now();
  const list = T.byLatest(Object.values(S.threads).filter((t) => cardOf(t)));
  let fresh = 0;
  ul.textContent = "";
  for (const t of list) {
    const c = cardOf(t), open = here(t), n = open && seen() ? 0 : T.unread(t, t.msgs);
    const name = c.plain ? "no character" : c.name, title = T.titleOf(t, t.msgs), busy = S.doing.get(t.id);
    fresh += n;
    ul.append(h("li", { "aria-current": open ? "true" : null, "data-thread": t.id },
      h("button", { type: "button", class: "trow" + (n ? " unread" : ""), onclick: () => openThread(t.id, { scroll: narrow() }),
        "aria-label": `${name}${title ? ": " + title : ""}${n ? `, ${n} new` : ""}` },
      threadFace(t, c.plain ? "" : portraitSrc(c)),
      h("span", { class: "ttx" },
        h("span", { class: "tline" }, h("span", { class: "tname", text: name }), h("span", { class: "tago", text: T.ago(t.at, now) })),
        title ? h("span", { class: "ttitle", text: title }) : null,
        h("span", { class: "tsnip" + (busy ? " doing" : ""), text: busy || T.snippet(t.msgs) || "a new chat" })),
      n ? h("span", { class: "tnew", "aria-hidden": "true", text: String(n) }) : null)));
  }
  for (const id of faces.keys()) if (!S.threads[id]) faces.delete(id);
  $("#threads-empty").hidden = list.length > 0;
  const badge = $("#chats-new");
  badge.textContent = fresh ? String(fresh) : "";
  badge.hidden = !fresh;
  $("#lt-chats").setAttribute("aria-label", fresh ? `Chats, ${fresh} new` : "Chats");
  document.title = fresh ? `(${fresh}) Havre` : "Havre";
  renderChatsBar();
}
/** above your chats: starting a new one */
function renderChatsBar() {
  const p = $("#chats-bar"), c = card();
  p.textContent = "";
  p.append("start a new chat: ", ...slashed([
    c && !c.plain ? linkish(`with ${c.name}`, () => selectCard(c.id, { talk: true, open: null, scroll: narrow() })) : null,
    linkish("without a character", () => selectCard(PLAIN, { talk: true, open: null, scroll: narrow() })),
    linkish("with someone else", () => setLeft("chars", { focus: true })),
  ]));
}

// Venice's characters, a page at a time; without a key, empty frames where they will be
function ghosts(n = 8) {
  return Array.from({ length: n }, () => h("li", { class: "ghost", "aria-hidden": "true" },
    h("span", { class: "tile" }, h("span", { class: "ph noface" }), h("span", { class: "tx" }))));
}
function renderGrid() {
  const ul = $("#vgrid");
  const cur = card(), now = cur && cur.engine.venice_character;
  const showing = !!S.key && S.v.list.length > 0;
  ul.replaceChildren(...(showing ? S.v.list.map((v) => tileFor(v, now)) : ghosts()));
  if (showing) markTiles();
  $("#vpager").hidden = !showing || (S.v.offset === 0 && !S.v.more);
  $("#vprev").disabled = S.v.offset === 0 || S.v.loading;
  $("#vnext").disabled = !S.v.more || S.v.loading;
  $("#vrange").textContent = showing ? `${S.v.offset + 1}–${S.v.offset + S.v.list.length}` : "";
  if (!S.key) vStatus("paste your venice key above and venice's characters show up here.");
  renderTags();
}
/** the tags on this page, most common first; one picked narrows the search to it */
function renderTags() {
  const p = $("#vtags");
  p.textContent = "";
  const counts = new Map();
  for (const v of S.v.list) for (const t of v.tags || []) { const k = String(t).toLowerCase().trim(); if (k) counts.set(k, (counts.get(k) || 0) + 1); }
  const top = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 14).map(([t]) => t);
  if (S.v.tag && !top.includes(S.v.tag)) top.unshift(S.v.tag);
  p.hidden = !S.key || !top.length;
  if (p.hidden) return;
  p.append("tags: ", ...slashed(top.map((t) => (t === S.v.tag
    ? h("b", {}, "#" + t + " ", linkish("×", () => setTag(""), { "aria-label": `Show every tag, not just ${t}` }))
    : linkish("#" + t, () => setTag(t), { "aria-label": `Only characters tagged ${t}` })))));
}
function setTag(t) { S.v.tag = t; loadVenice(0); }
/**
 * Each character's tile, kept between drawings (the last few pages' worth), so a new search, a tag or another page
 * doesn't make their photos blink. A tile is drawn again only when what it shows changes.
 */
const tiles = new Map();
function tileFor(v, now) {
  const looks = JSON.stringify([v.name, v.description, v.photo, v.adult]), kept = tiles.get(v.slug);
  tiles.delete(v.slug);                                    // the latest drawn go last, so the oldest go first
  const li = kept && kept.looks === looks ? kept.li : tile(v, now);
  tiles.set(v.slug, { looks, li });
  if (tiles.size > 4 * PAGE) tiles.delete(tiles.keys().next().value);
  return li;
}
function tile(v, now) {
  const here = S.cards.some((c) => c.engine.venice_character === v.slug), on = now === v.slug;
  const ph = h("span", { class: "ph" });
  paintFace(ph, veniceImg(v.photo));
  // talking to them uses what Venice says about them now (their model, say), not what it said when the tile was drawn
  const talk = () => talkTo(S.v.list.find((x) => x.slug === v.slug) || v);
  return h("li", {}, h("button", { type: "button", class: "tile", "aria-pressed": on ? "true" : "false", "data-slug": v.slug,
    "aria-label": `Talk to ${v.name}`, title: v.description ? v.description.slice(0, 300) : null, onclick: talk },
  ph, h("span", { class: "tx" }, h("span", { class: "nm", text: v.name }),
    v.description ? h("span", { class: "ds", text: v.description }) : null,
    h("span", { class: "go", text: on ? "talking now" : here ? "talk again" : "talk" }),
    v.adult ? h("span", { class: "x18", text: "18+" }) : null)));
}
/** who is talking now, and who is in your harbor already, without redrawing the photos */
function markTiles() {
  const cur = card(), now = cur && cur.engine.venice_character;
  for (const b of $$("#vgrid .tile[data-slug]")) {
    const slug = b.dataset.slug, on = slug === now, here = S.cards.some((c) => c.engine.venice_character === slug);
    b.setAttribute("aria-pressed", on ? "true" : "false");
    $(".go", b).textContent = on ? "talking now" : here ? "talk again" : "talk";
  }
}
function vStatus(text, bad = false) { const s = $("#venstatus"); s.textContent = text; s.classList.toggle("bad", bad); }

// The pages of Venice's characters this tab saw in the last 10 minutes come back at once, without asking Venice
// again: another page and back, a tag and off again, a reload. Searching again for the same thing asks afresh.
const PAGES_FOR = 10 * 60000;
const pageKey = (offset) => JSON.stringify([S.v.query, S.v.sort, S.v.tag, S.v.adult, offset]);
function keptPage(key) {
  const p = (session.get(K.pages, {}) || {})[key];
  return p && Array.isArray(p.list) && Date.now() - p.at < PAGES_FOR ? p : null;
}
function keepPage(key, list, more) {
  const now = Date.now(), all = { ...(session.get(K.pages, {}) || {}), [key]: { list, more, at: now } };
  const recent = Object.entries(all).filter(([, p]) => p && now - p.at < PAGES_FOR).sort((a, b) => b[1].at - a[1].at).slice(0, 30);
  if (!session.set(K.pages, Object.fromEntries(recent))) session.del(K.pages);
}
async function loadVenice(offset = 0, { paging = false, fresh = false } = {}) {
  if (!S.key) { renderGrid(); return; }
  const asked = ++S.v.asked, key = pageKey(offset), kept = !fresh && keptPage(key);
  if (kept) { showPage(kept, offset, paging); return; }
  S.v.loading = true;
  vStatus("asking venice for characters…");
  renderGrid();
  try {
    const { list, more } = await new Venice(S.key).characterPage({ search: S.v.query, sort: S.v.sort, tags: S.v.tag,
      adult: S.v.adult, limit: PAGE, offset });
    keepPage(key, list, more);
    if (asked !== S.v.asked) return;                      // a newer search is on its way
    showPage({ list, more }, offset, paging);
  } catch (e) {
    if (asked !== S.v.asked) return;
    S.v.loading = false;
    vStatus(e.message, true);
    renderGrid();
  }
}
function showPage({ list, more }, offset, paging) {
  Object.assign(S.v, { list, more, offset, loading: false });
  vStatus(list.length ? "" : S.v.query || S.v.tag ? `nothing matched${S.v.query ? " “" + S.v.query + "”" : ""}${S.v.tag ? " in #" + S.v.tag : ""}.`
    : "venice sent back no characters.");
  renderGrid();
  if (paging) $("#chars").scrollIntoView({ behavior: motion(), block: "start" });
}

function talkTo(v) {
  if (!S.key) return needKey("paste your venice key first.");
  if (v.model && S.own[v.slug] !== v.model) { S.own[v.slug] = v.model; local.set(K.own, S.own); }   // the model they use on Venice
  let c = S.cards.find((x) => x.engine.venice_character === v.slug);
  if (!c) {
    c = addCard({
      name: v.name, tagline: v.description, engine: { venice_character: v.slug }, portrait: v.photo, creator: v.creator,
      model: v.model || S.model, license: "all-rights-reserved", tags: v.tags, voice: { short_form: true },
      lineage: [{ relation: "ported-from", name: v.name, creator: v.creator, ref: "venice:" + v.slug, at: today(), note: "a link: speaks through Venice with its own prompt" }],
    }, { select: false });
  }
  selectCard(c.id, { talk: true });
}

// your harbor: every character you have, as a table
function renderRoster() {
  const tb = $("#roster");
  tb.textContent = "";
  $("#harbor-empty").hidden = S.cards.length > 0;
  $("#harbor .tablewrap").hidden = !S.cards.length;
  const cur = card();
  for (const c of S.cards) {
    const on = cur && c.id === cur.id;
    const from = c.engine.venice_character ? "venice, as a link with credit" : c.lineage[0] ? C.creditLine(c.lineage[0]) : "written here";
    const go = (tab) => () => { selectCard(c.id); openCard(tab); };
    tb.append(h("tr", { "aria-current": on ? "true" : null },
      h("th", { scope: "row" }, c.name, on ? h("span", { class: "now", text: "talking" }) : null),
      h("td", { text: from }),
      h("td", { text: C.LICENSES[c.license] }),
      h("td", { class: "files" }, slashed([
        linkish("talk", () => selectCard(c.id, { talk: true, scroll: true }), { "aria-label": `Talk to ${c.name}` }),
        linkish("card", go("edit"), { "aria-label": `${c.name}'s card` }),
        linkish("remix", go("remix"), { "aria-label": `Remix ${c.name}` }),
        linkish("export", go("export"), { "aria-label": `Export ${c.name}` }),
      ]))));
  }
}

/**
 * Talk to someone: their chat you looked at last, or a new one if you have none with them (`open`: a given thread, or
 * null for a new chat). Replies on their way in other chats carry on. talk: go to the chat, where they may speak first.
 */
function selectCard(id, { talk = false, scroll = false, open } = {}) {
  if (S.ask && !S.ask.busy && S.ask.card !== id) S.ask = null;
  if (S.rec) stopRecording(true);
  const was = S.sel;
  S.sel = id;
  local.set(K.sel, id);
  const t = open !== undefined ? open : latestOf(id);
  S.open = t ? t.id : null;
  local.set(K.open, S.open);
  markRead(t);
  markTiles(); renderRoster(); renderThreads(); renderChat();
  if (was !== id) renderCard();
  if (!talk) return;
  if (scroll || narrow()) (narrow() ? $("#chat") : $("#studio")).scrollIntoView({ behavior: motion(), block: "start" });
  if (!narrow()) $("#say").focus({ preventScroll: true });
  speakFirst();
}
/** open one of your chats */
function openThread(id, opts = {}) {
  const t = S.threads[id];
  if (t && cardOf(t)) selectCard(t.card, { talk: true, ...opts, open: t });
}
/** a new chat with whoever is on screen; the one there stays in your chats */
function newChat() {
  const c = card();
  if (c && thread()) selectCard(c.id, { talk: true, open: null });
}
function renameThread() {
  const t = thread();
  if (!t) return;
  const name = prompt("Name this chat:", T.titleOf(t, t.msgs));
  if (name == null) return;
  t.title = name.replace(/\s+/g, " ").trim().slice(0, 80);
  t.titled = Date.now();
  saveIndex();
  renderThreads();
}
function deleteThread() {
  const t = thread(), c = card();
  if (!t || !confirm(`Delete this chat${c && !c.plain ? " with " + c.name : ""}? It can't be brought back.`)) return;
  dropThread(t.id);
  renderThreads(); renderChat(); markTiles(); renderRoster();
}
/** a thread's keeping undone: here, and, through the list of deleted threads, in every other tab */
function forgetThread(id) {
  local.set(K.gone, T.pruneGone({ ...(local.get(K.gone, {}) || {}), [id]: Date.now() }));
  delete S.threads[id];
  local.del(msgKey(id));
  saveIndex();
  sweepSoon();
}
/** delete a thread: its reply stops, a clip on its way goes to their latest chat, and if it was open, another opens */
function dropThread(id) {
  if (!S.threads[id]) return;
  forgetThread(id);
  stopThread(id);
  if (S.jobs.some((j) => j.thread === id)) { for (const j of S.jobs) if (j.thread === id) j.thread = ""; saveJobs(); }
  if (S.ask && S.ask.thread === id) S.ask.thread = null;
}
/** a thread that's gone, deleted here or in another tab: its reply stops, and if it was open, another one opens */
function stopThread(id) {
  const ctrl = S.busy.get(id);
  if (ctrl) ctrl.abort();
  S.busy.delete(id);
  S.doing.delete(id);
  if (S.open === id) {
    const next = latestOf(S.sel);
    S.open = next ? next.id : null;
    local.set(K.open, S.open);
    S.gen++;
  }
}
/** a thread starts with the first thing said in it: yours, or a character's hello */
function startThread(c) {
  const now = Date.now();
  const t = { id: mid(), card: c.id, title: "", titled: 0, created: now, at: now, read: now, msgs: [] };
  S.threads[t.id] = t;
  if (S.sel === c.id && !S.open) {                          // the new chat on screen is this thread now
    S.open = t.id;
    local.set(K.open, t.id);
    if (!S.shown) S.shown = t.id;
  }
  saveIndex();
  return t;
}
/** you've seen a thread, up to now (only while the page can be seen) */
function markRead(t) {
  if (!t || !seen() || !S.threads[t.id]) return;
  t.read = Math.max(t.read || 0, Date.now());
  saveIndex();
}

// a Venice character, or one of yours with no greeting written, says hello first in a new chat
async function speakFirst() {
  const c = card(), t = thread();
  if (!c || c.plain || !S.key || (t && S.busy.has(t.id))) return;
  if (t && T.anyShown(t.msgs)) { comeBack(t); return; }
  if (t && t.msgs.length) {                                   // nothing said in it yet, but a hello was asked for
    if (await replying(t) || thread() !== t || T.anyShown(t.msgs) || S.busy.has(t.id)) return;    // on its way somewhere
    for (const m of t.msgs.splice(0)) takenBack.add(m.id);   // cut off (its tab closed): asked again
    saveThread(t);
  }
  if (c.engine.venice_character || (!c.greeting && c.persona)) send(OPENER, { hidden: true });
}
/** whether a reply is on its way in this chat, in this tab or another (each holds a lock while it waits) */
async function replying(t) {
  if (S.busy.has(t.id)) return true;
  try { return (await navigator.locks.query()).held.some((l) => l.name === "havre-reply-" + t.id); }
  catch { return Date.now() - (t.at || 0) < 60000; }
}
/**
 * After a while, a character texts you first (when characters act on their own): in the chat you open, or in one you
 * aren't in. Once a quiet spell, in whichever tab gets there first: an attempt is written down before it's made. It's
 * paid for out of the day's allowance, like everything they do on their own.
 */
function comeBack(t) {
  const c = cardOf(t);
  if (!t || !c || c.plain || !S.key || !S.ab.own || S.busy.has(t.id)) return Promise.resolve();
  if (T.byLatest(threadsOf(c.id))[0] !== t) return Promise.resolve();      // only in their latest chat with you
  const go = () => {
    const tried = local.get(K.tried, {}) || {};
    if (!S.threads[t.id] || S.busy.has(t.id) || !T.readyToTextFirst(t.msgs, { now: Date.now(), after: A.BACK_AFTER, tried: tried[t.id] })) return;
    const kept = Object.fromEntries(Object.entries(tried).filter(([id]) => S.threads[id]));
    if (!local.set(K.tried, { ...kept, [t.id]: Date.now() })) return;      // can't write it down: don't risk asking twice
    return send(A.comeBack(A.since(t.msgs, Date.now()), here(t)), { hidden: true, to: t, own: true });
  };
  if (navigator.locks && navigator.locks.request) return navigator.locks.request("havre-comeback", go).catch(() => {});
  return Promise.resolve(go());
}
/**
 * Coming back to Havre after a while: the chat on screen may text first, and so may a few of the other characters you
 * talk to: at most 3, once every few hours, whichever tab you come back to. Only while the page can be seen.
 */
async function comingBack() {
  if (!S.key || !S.ab.own || !seen()) return;
  comeBack(thread());
  if (Date.now() - (Number(local.get(K.came, 0)) || 0) < A.BACK_AFTER) return;
  const others = T.textFirst(Object.values(S.threads).filter((t) => t.card !== S.sel && cardOf(t)), (t) => t.msgs,
    { now: Date.now(), after: A.BACK_AFTER, tried: local.get(K.tried, {}) || {}, max: 3 });
  if (!others.length || !local.set(K.came, Date.now())) return;
  for (const t of others) {
    await sleep(1500 + Math.random() * 2500);
    if (!S.key || !S.ab.own) return;
    await comeBack(t);
  }
}

// ---------- the conversation ----------
/** characters from Venice, and the plain chat, need a key to say anything */
const needsKey = (c) => !!(c && (c.plain || c.engine.venice_character));
function renderChat() {
  const c = card();
  $("#who-name").textContent = c ? c.name : "chat";
  renderChatMeta();
  const locked = !c || (needsKey(c) && !S.key);
  $("#say").disabled = locked;
  syncSend();
  $("#say").placeholder = c && !c.plain ? `say something to ${c.name}` : "say something";
  const kn = $("#keynote");
  kn.hidden = !c || !!S.key;
  kn.textContent = c && c.plain ? "paste your venice key above to chat."
    : needsKey(c) ? `paste your venice key above to talk to ${c.name}.`
    : "no key yet: replies come from the card's own examples. paste your venice key above to really talk.";
  renderLog();
  renderTools();
  renderAsk();
}
function renderChatMeta() {
  const c = card(), t = thread(), meta = $("#who-meta");
  meta.textContent = "";
  if (!c) return;
  meta.append(...slashed([
    c.plain ? "just the model, no character" : c.engine.venice_character ? "via venice, with their own prompt" : c.tagline,
    h("span", {}, "model: ", linkish(modelName(c.model), () => openModels("chat"), { id: "model-btn", "aria-label": `Model: ${modelName(c.model)}. Change it` })),
    c.plain ? null : linkish("card", () => openCard("edit")),
    t ? linkish("new chat", newChat, { id: "new-chat", title: `A new chat${c.plain ? "" : " with " + c.name}; this one stays in your chats` }) : null,
    t ? linkish("rename", renameThread, { title: "Name this chat" }) : null,
    t ? linkish("delete", deleteThread, { title: "Delete this chat" }) : null,
    narrow() ? linkish("all chats", () => { setLeft("chats"); $("#chars").scrollIntoView({ behavior: motion(), block: "start" }); }) : null,
  ]));
}
/** a word under the text box: what failed, what is on its way */
function err(text) { put(line(text, "havre", "err")); scrollLog(); }

/** one line of the script: who says it, then what they say. kind: note, err, typing or suggest */
function line(text, who, kind = "") {
  const c = card();
  const name = who === "me" ? "you" : who === "havre" ? "havre" : !c ? "" : c.plain ? modelName(c.model) : c.name;
  const said = h("div", { class: "said" });
  if (kind) said.textContent = text;
  else {
    const parts = String(text).split(/```(?:[a-z0-9+#-]*\n)?/i);           // code stays whole, in a box
    parts.forEach((part, i) => {
      if (i % 2) said.append(h("pre", {}, h("code", { text: part.replace(/\n$/, "") })));
      else if (part.trim()) said.append(document.createTextNode(i ? part.replace(/^\n/, "") : part));
    });
  }
  return h("li", { class: `line ${who}${kind ? " " + kind : ""}`, "data-who": who, "data-kind": kind || null },
    h("span", { class: "who", text: name }), said);
}
/** add a line; a run of texts from the same person shows their name once */
function put(el) {
  const log = $("#log"), last = log.lastElementChild;
  if (last && !last.dataset.kind && !el.dataset.kind && last.dataset.who === el.dataset.who) el.classList.add("cont");
  log.append(el);
  return el;
}
function scrollLog() { const l = $("#log"); l.scrollTop = l.scrollHeight; }

function renderLog() {
  S.gen++;                                                    // a reply being played out stops: it's all drawn here now
  S.shown = S.open;
  const log = $("#log"), c = card(), t = thread();
  log.textContent = "";
  if (!c) {
    put(line(S.key ? "pick one of venice's characters, or write your own. they talk here."
      : "paste your venice key above, then pick one of venice's characters. or write a character of your own, or import a card: those work without a key.", "havre", "note"));
    return;
  }
  const hist = t ? t.msgs : [];
  if (c.plain) {
    if (!hist.length) put(line(S.key ? "a plain chat: no character, just the model you pick above. say anything."
      : "paste your venice key above to chat with a model.", "havre", "note"));
  } else if (c.engine.venice_character) {
    if (!hist.length) put(line(`${c.name} speaks through venice, with their own prompt.${S.key ? " say hello." : ""}`, "havre", "note"));
  } else if (c.greeting) for (const b of C.splitBubbles(C.fill(c.greeting, c, "you"))) put(line(b, "them"));
  for (const m of hist) {
    if (m.media) put(mediaLine(c, m));
    else if (m.role === "user" && !m.hidden) put(line(m.content, "me"));
    else if (m.role === "assistant") {
      if (m.voice) put(voiceLine(c, m));
      let last = null;
      for (const b of bubblesOf(c, m.content)) { last = put(line(b, "them")); if (m.id) last.dataset.msg = m.id; }
      if (last) offerVoice(last, c, m, t);
    }
  }
  const ideas = hist.some((m) => m.role === "user" && !m.hidden) ? [] : C.suggestions(c);
  if (ideas.length) {
    const row = line("", "havre", "suggest");
    row.querySelector(".who").textContent = "try";
    row.querySelector(".said").append(...ideas.map((x) => linkish(x, () => send(x))));
    put(row);
  }
  if (t && S.doing.has(t.id)) put(typingLine(t, S.doing.get(t.id)));
  renderJobs();
  scrollLog();
}

/** a character texts in short bubbles; a plain chat answers in one piece */
const bubblesOf = (c, text) => (c.plain ? [C.stripThinking(text)].filter(Boolean) : C.splitBubbles(text));
/** what the model reads: the conversation, with photos and voice notes as words (see abilities.js) */
function messagesFor(c, hist) {
  const api = A.apiHistory(hist);
  return c.plain ? api.slice(-40).map(({ role, content }) => ({ role, content })) : C.chatMessages(c, api);
}
/** the send button: off while the chat on screen waits for its reply (replies in other chats don't hold it up) */
function syncSend() {
  const c = card(), t = thread(), waiting = !!t && S.busy.has(t.id);
  $("#sendbtn").disabled = waiting || !c || (needsKey(c) && !S.key);
  $("#composer").setAttribute("aria-busy", waiting ? "true" : "false");
}
/** "… is typing": a line in the chat, if it's on screen */
function typingLine(t, text = "is typing…") {
  const l = line(text, "them", "typing");
  l.dataset.typing = t.id;
  return l;
}
/** a character is at something in a chat ("is typing…"): it shows there, and in your chats */
function doing(t, text) {
  S.doing.set(t.id, text);
  if (here(t)) {
    for (const el of $$(`#log [data-typing="${t.id}"]`)) el.remove();
    put(typingLine(t, text));
    scrollLog();
  }
  renderThreads();
}
function done(t) {
  for (const el of $$(`#log [data-typing="${t.id}"]`)) el.remove();
  if (S.doing.delete(t.id)) renderThreads();
}
/** set aside before, settled after: what wasn't spent goes back, and what it cost beyond comes off */
function settle(held, cost) { if (cost < held) refund(held - cost); else if (cost > held) charge(cost - held); }

/**
 * Say something in a chat (the one on screen, unless `to`) and play the reply; the first thing said in a new chat
 * starts it. media: a voice note or photo of yours that goes with it ({ kind, id, … }); picture: that photo as a data:
 * URI, for a model that can see it. own: they're texting first, on their own, so the call is paid for out of the
 * day's allowance. Going to another chat meanwhile doesn't stop the reply: it lands in its own chat.
 */
async function send(text, { hidden = false, media = null, picture = "", to = null, own = false } = {}) {
  let t = to || thread();
  const c = t ? cardOf(t) : card();
  text = text.trim();
  if ((!text && !media) || !c || (t && S.busy.has(t.id))) return;
  const demo = !S.key;
  if (demo && (hidden || media)) return;
  const model = (S.models || []).find((m) => m.id === (c.model || S.model)) || null;
  let held = 0;
  if (own) {                                                  // set aside the most this call can cost
    held = A.callEstimate(messagesFor(c, [...(t ? t.msgs : []), { role: "user", content: text }]), c.plain ? 2000 : 700, model);
    if (!reserve(held)) return;
  }
  if (!t) { t = startThread(c); if (here(t)) renderChatMeta(); }
  const hist = t.msgs;
  const said = { id: mid(), role: "user", content: text, at: Date.now(), ...(demo ? { demo: true } : {}), ...(hidden ? { hidden: true } : {}), ...(media ? { media } : {}) };
  hist.push(said);
  t.at = said.at;
  if (here(t)) markRead(t);
  saveThread(t);
  if (here(t)) {
    for (const el of $$("#log .suggest, #log .note")) el.remove();
    if (!hidden) put(media ? mediaLine(c, said) : line(text, "me"));
  }
  const ctrl = new AbortController();
  S.busy.set(t.id, ctrl);
  syncSend();
  doing(t, "is typing…");
  // every tab can tell a reply is on its way here: a lock, held until it's done
  let finished = false, release = null;
  try { navigator.locks.request("havre-reply-" + t.id, () => (finished ? null : new Promise((r) => { release = r; }))).catch(() => {}); } catch { /* no locks here */ }
  try {
    let reply;
    if (demo) {
      if (c.plain) throw new Error("Paste your Venice key above to chat.");
      if (c.engine.venice_character) throw new Error(`${c.name} lives on Venice, so they need your Venice key to talk.`);
      await sleep(still ? 250 : 750);
      const n = S.demo[t.id] || 0;
      S.demo[t.id] = n + 1;
      reply = C.demoReply(c, n, text);
    } else {
      const r = await new Venice(S.key).chat({ model: c.model || S.model, characterSlug: c.engine.venice_character || "",
        veniceSystemPrompt: !!c.plain, maxTokens: c.plain ? 2000 : 700,
        messages: A.withPicture(messagesFor(c, hist), picture), signal: ctrl.signal });
      if (own) { settle(held, A.callCost(r.usage, model)); held = 0; }
      reply = C.stripThinking(r.text);
      if (!reply) throw new Error("Venice sent back an empty reply. Try again, or pick another model on the card.");
    }
    if (ctrl.signal.aborted || !S.threads[t.id]) return;
    const msg = { id: mid(), role: "assistant", content: reply, at: Date.now(), ...(demo ? { demo: true } : {}) };
    hist.push(msg);
    const drawn = S.gen;                                      // drawn again from here on, the chat has it all already
    t.at = msg.at;
    if (here(t)) markRead(t);
    saveThread(t);
    done(t);
    if (!demo) balanceSoon();
    // a voice note with the reply: every reply when they're set to, and, on their own, one back to yours (priced
    // first, and set aside from today's allowance)
    let mirror = 0;
    if (!demo && !c.plain && !S.voiceOn[c.id] && S.ab.own && media && media.kind === "voice-in") {
      await loadList("tts");
      const vm = voiceModel(c), price = vm ? A.voicePrice(vm, A.speakable(reply).length) : null;
      if (price != null && reserve(price)) mirror = price;
    }
    if (!demo && !c.plain && (S.voiceOn[c.id] || mirror)) {
      // a voice note first, then the words under it
      doing(t, "is recording a voice note…");
      voicing.add(msg);
      try {
        msg.voice = await makeVoice(c, reply, ctrl.signal);
        if (mirror) msg.voice.own = true;
        saveThread(t);
      } catch (e) {
        refund(mirror);
        if (e && e.name === "AbortError") return;
        msg.voiceError = e.message;
      } finally { done(t); voicing.delete(msg); }
      if (ctrl.signal.aborted) return;
      if (here(t)) {
        if (!msg.voice) err(`the voice note didn't come: ${msg.voiceError}`);
        else if (!placeVoice(t, msg)) put(voiceLine(c, msg));
      }
      delete msg.voiceError;
    }
    arrived(t, msg);
    await play(t, bubblesOf(c, reply), ctrl.signal, c, msg, drawn);
    if (!ctrl.signal.aborted && !demo && !c.plain && !hidden && !msg.voice) onTheirOwn(t);
  } catch (e) {
    if (e && e.name === "AbortError") return;
    done(t);
    const why = e && e.message || "Something went wrong.";
    if (here(t)) put(line(why, "havre", "err"));
    else if (!hidden) toast(`${c.plain ? "The plain chat" : c.name}: the reply didn't come. ${why}`);
  } finally {
    finished = true;
    if (release) release();
    refund(held);
    done(t);
    const last = hist[hist.length - 1];
    if (hidden && last && last.hidden) {                      // the hello (or the nudge) didn't happen
      takenBack.add(last.id);
      hist.pop();
      if (hist.length) saveThread(t);
      else {                                                  // nothing else in it: the chat goes, and its error stays on screen
        const was = here(t);
        forgetThread(t.id);
        if (S.ask && S.ask.thread === t.id) S.ask.thread = null;
        if (was) { S.open = S.shown = null; local.set(K.open, null); renderChatMeta(); }
      }
    }
    if (S.busy.get(t.id) === ctrl) S.busy.delete(t.id);
    syncSend();
    renderThreads();
    if (here(t)) scrollLog();
  }
}
/** something from them landed in a chat: unless it's the chat on screen, it's new, and a word says so */
function arrived(t, msg) {
  renderThreads();
  if (here(t)) return;                                        // (in a tab out of sight, the tab's title says so)
  const c = cardOf(t);
  if (c) toast(`${c.plain ? modelName(c.model) : c.name}: ${T.snippet([msg]) || "a message"}`);
}

/**
 * A reply played out a text at a time, while its chat is on screen and hasn't been drawn again since `drawn` (then
 * it's all there already).
 */
async function play(t, bubbles, signal, c, msg, drawn = S.gen) {
  const live = () => here(t) && S.gen === drawn && !signal.aborted;
  let last = null;
  for (let i = 0; i < bubbles.length; i++) {
    if (!live()) return;
    if (i > 0) {
      const tl = put(typingLine(t));
      scrollLog();
      await sleep(C.typingDelay(bubbles[i]) * (still ? 0.25 : 1));
      tl.remove();
      if (!live()) return;
    }
    last = put(line(bubbles[i], "them"));
    if (msg && msg.id) last.dataset.msg = msg.id;
    scrollLog();
  }
  if (last && c && msg) offerVoice(last, c, msg, t);
}

// ---------- photos, clips, voice notes, and yours, in the conversation ----------
const clock = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const EXT = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg", "video/mp4": "mp4", "video/webm": "webm", "audio/mpeg": "mp3",
  "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/aac": "aac", "audio/flac": "flac", "audio/opus": "opus", "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a" };
/** a link that saves the file, once this browser has it */
function saveLink(id, base) {
  const a = h("a", { text: "save", download: base });
  M.get(id).then((b) => { if (!b) { a.remove(); return; } a.download = `${base}.${EXT[(b.type || "").split(";")[0]] || "bin"}`; return M.url(id).then((u) => { a.href = u; }); });
  return a;
}
const gone = (what) => h("span", { class: "gone", text: `(this ${what} isn't kept in this browser any more)` });
/** a photo, video or sound from this browser's store; what was cleared shows as gone */
function mediaEl(tag, id, attrs, what) {
  const el = h(tag, attrs);
  // a picture that arrives after the conversation scrolled to its end keeps it at the end
  const log = $("#log"), atEnd = () => log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  let was = true;
  M.url(id).then((u) => { if (!u) { el.replaceWith(gone(what)); return; } was = atEnd(); el.src = u; });
  el.addEventListener(tag === "img" ? "load" : "loadedmetadata", () => { if (was) scrollLog(); }, { once: true });
  return el;
}
const audioEl = (id) => mediaEl("audio", id, { controls: true, preload: "metadata" }, "voice note");
function mediaLine(c, m) {
  const me = m.role === "user", md = m.media || {};
  const said = h("div", { class: "said" });
  const base = `${C.slugify(c.name)}-${md.kind || "file"}`;
  const cost = (bits) => h("span", { class: "cap" }, bits.filter(Boolean).join(" · ") + " · ", saveLink(md.id, base));
  if (md.kind === "photo" || md.kind === "photo-in") {
    const alt = md.kind === "photo" ? `A photo from ${c.name}${md.shot ? ": " + md.shot : ""}` : "Your photo";
    said.append(h("figure", { class: "pic" }, mediaEl("img", md.id, { alt, title: md.shot || null, decoding: "async" }, "photo")));
    if (md.kind === "photo") said.append(cost(["photo", md.model, md.price != null && A.usd(md.price), md.own && "on their own", md.blurred && "blurred by venice's safe mode"]));
    else if (md.saw) said.append(h("span", { class: "cap", text: `${md.seer || "a model"} told them: ${md.saw}` }));
  } else if (md.kind === "clip" && !md.id) {
    // a clip this browser couldn't download: it plays from Venice's link until the link lapses
    const live = md.url && Date.now() < (md.until || 0) && /^https:\/\/private-share\.venice\.ai\//.test(md.url);
    if (!live) said.append(gone("clip"));
    else said.append(h("video", { controls: true, playsinline: true, preload: "metadata", src: md.url, title: md.shot || null }),
      h("span", { class: "cap" }, ["clip", md.model, md.price != null && A.usd(md.price), "venice keeps it for a day"].filter(Boolean).join(" · ") + " · ",
        h("a", { href: md.url, target: "_blank", rel: "noopener noreferrer", text: "open it to save it" })));
  } else if (md.kind === "clip") {
    said.append(mediaEl("video", md.id, { controls: true, playsinline: true, preload: "metadata", title: md.shot || null }, "clip"));
    said.append(cost(["clip", md.model, md.price != null && A.usd(md.price)]));
  } else if (md.kind === "voice-in") {
    said.append(audioEl(md.id));
  }
  if (m.content) said.append(h("div", { class: "words", text: m.content }));
  return h("li", { class: `line ${me ? "me" : "them"} media`, "data-who": me ? "me" : "them" },
    h("span", { class: "who", text: me ? "you" : c.plain ? modelName(c.model) : c.name }), said);
}
/** a reply's voice note, above its words */
function voiceLine(c, m) {
  const v = m.voice;
  return h("li", { class: "line them media", "data-who": "them" }, h("span", { class: "who", text: c.name }),
    h("div", { class: "said" }, audioEl(v.id), h("span", { class: "cap" }, ["voice note", v.voice, v.price != null && A.usd(v.price), v.own && "on their own"].filter(Boolean).join(" · ") + " · ", saveLink(v.id, `${C.slugify(c.name)}-voice-note`))));
}
/** "hear it" after a reply that came as text: its voice note, made when asked for (once, however often it's clicked) */
const voicing = new WeakSet();
function offerVoice(el, c, m, t) {
  if (m.voice || m.demo || c.plain || !S.key || !t) return;
  const b = linkish(voicing.has(m) ? "recording…" : "hear it", async () => {
    if (b.disabled || voicing.has(m) || m.voice) return;
    voicing.add(m);
    b.disabled = true;
    b.textContent = "recording…";
    try {
      m.voice = await makeVoice(c, m.content);
      saveThread(t);
      if (b.isConnected) b.replaceWith(audioEl(m.voice.id));
      else placeVoice(t, m);
      balanceSoon();
    } catch (e) { b.disabled = false; b.textContent = "hear it"; toast(e.message); } finally { voicing.delete(m); }
  }, { class: "linkish hear", "aria-label": `Hear this as a voice note from ${c.name}`, disabled: voicing.has(m) || null });
  $(".said", el).append(" ", b);
}
/** a voice note of these words, in the character's voice and mood */
async function makeVoice(c, text, signal) {
  S.inflight++;
  try {
    await loadList("tts");
    const vm = voiceModel(c);
    if (!vm) throw new Error(S.listErr.tts || "Venice has no voice models right now.");
    const voice = voiceOf(c, vm), words = A.speakable(text);
    if (!words) throw new Error("There are no words to say.");
    const blob = await new Venice(S.key).speak({ model: vm.id, voice, input: words, mood: c.speech.mood, speed: c.speech.speed, signal });
    return { id: await M.put(blob), model: vm.name, voice, price: A.voicePrice(vm, words.length) };
  } finally { S.inflight--; }
}
const voiceOf = (c, vm) => (vm.voices.includes(c.speech.voice) ? c.speech.voice : vm.voices.includes(A.DEFAULT_VOICE) ? A.DEFAULT_VOICE : vm.voices[0] || c.speech.voice || "");
/** a photo or clip from a character lands in its chat, wherever you are now; false if the chat or they are gone */
function deliver(t, msg) {
  const c = cardOf(t);
  if (!t || !S.threads[t.id] || !c) return false;
  msg.at = msg.at || Date.now();
  msg.id = msg.id || mid();
  t.msgs.push(msg);
  t.at = msg.at;
  if (here(t)) markRead(t);
  saveThread(t);
  if (here(t)) {
    for (const el of $$("#log .suggest, #log .note")) el.remove();
    put(mediaLine(c, msg));
    renderJobs();
    scrollLog();
  }
  arrived(t, msg);
  return true;
}
/**
 * The chat a photo or clip that was asked for goes to: the one of theirs on screen; else the one it was asked in (their
 * latest, if that one's gone); and one asked for in a new chat starts it.
 */
function askThread(a) {
  const c = S.cards.find((x) => x.id === a.card), t = thread();
  if (!c) return null;
  if (t && t.card === c.id) return t;
  if (a.thread) return S.threads[a.thread] || latestOf(c.id) || startThread(c);
  const fresh = startThread(c);
  if (here(fresh)) renderChatMeta();
  return fresh;
}

// ---------- the card ----------
function renderCard() {
  const c = card(), real = !!c && !c.plain;
  const empty = $("#card-empty");
  empty.hidden = real;
  empty.textContent = c && c.plain ? "a plain chat has no card. pick a character to see theirs."
    : "no character yet. the card shows up here once someone is in your harbor.";
  $("#card-body").hidden = !real;
  $("#card-h").textContent = real ? "CARD: " + c.name.toUpperCase() : "CARD";
  if (!real) return;
  renderSheet();
  resetRemix();
}
function openCard(tab = "edit") {
  setTab(tab);
  $("#card").scrollIntoView({ behavior: motion(), block: "start" });
}

function fillModels(sel, current) {
  sel.textContent = "";
  const live = S.models ? new Map(S.models.map((m) => [m.id, m])) : null;
  const rec = h("optgroup", { label: "Recommended" });
  for (const [id, label] of C.RECOMMENDED_MODELS) if (!live || live.has(id)) rec.append(h("option", { value: id, text: label }));
  sel.append(rec);
  if (live) {
    const all = h("optgroup", { label: "All Venice text models" });
    for (const m of [...live.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      if (C.RECOMMENDED_MODELS.some(([id]) => id === m.id)) continue;
      const price = m.input != null ? ` · $${m.input}/$${m.output} per M` : "";
      all.append(h("option", { value: m.id, text: m.id + price }));
    }
    sel.append(all);
  }
  if (current && ![...sel.options].some((o) => o.value === current)) sel.prepend(h("option", { value: current, text: current }));
  sel.value = current || C.DEFAULT_MODEL;
}
let modelsAsked = null;
function loadModels() {
  if (S.models) return Promise.resolve();
  if (!modelsAsked) {
    modelsAsked = new Venice("").models().then((ms) => {
      S.models = ms;
      S.modelsError = "";
      const c = card();
      if (c && !c.plain) fillModels($("#model-select"), c.model);
      renderChatMeta();
      if ($("#modeldlg").open) renderModels();
    }).catch((e) => { S.modelsError = e.message; modelsAsked = null; if ($("#modeldlg").open) renderModels(); });
  }
  return modelsAsked;
}
const modelName = (id) => { const m = S.models && S.models.find((x) => x.id === id); return m ? m.name : id || "?"; };

// ---------- Venice's other models: photos, clips, voices, hearing ----------
const listAsked = {};
/** a list of Venice's models of one type, asked for once (no key needed) */
function loadList(type) {
  if (type === "text") return loadModels();
  if (S.lists[type]) return Promise.resolve(S.lists[type]);
  if (!listAsked[type]) {
    listAsked[type] = new Venice("").mediaModels(type).then((ms) => { S.lists[type] = ms; S.listErr[type] = ""; listsChanged(); return ms; })
      .catch((e) => { S.listErr[type] = e.message; listAsked[type] = null; listsChanged(); return null; });
  }
  return listAsked[type];
}
function listsChanged() {
  if ($("#modeldlg").open) renderModels();
  if ($("#abilitydlg").open) renderAbilities();
  renderSpeech();
  renderMakers();
  const a = S.ask;
  if (a && !a.busy) {
    renderAsk();
    if (a.kind === "clip" && a.shot && a.quote == null && !a.quoting) requote();
  }
}
const photoModel = () => A.chosen(S.lists.inpaint, S.ab.photo, "photo");
const portraitModel = () => A.chosen(S.lists.image, "", "portrait");
const clipModels = () => (S.lists.video ? S.lists.video.filter(A.isClipModel) : null);
const clipModel = () => A.chosen(clipModels(), S.ab.clip.model, "clip");
const voiceModel = (c) => A.chosen(S.lists.tts, c && c.speech ? c.speech.model : "", "voice");
const hearModel = () => A.chosen(S.lists.asr, S.ab.hearModel, "hearing");
const seeModel = () => A.seer(S.models, S.ab.seeModel);
function saveAb() { local.set(K.ab, S.ab); }

// ---------- the model picker, for every kind of model ----------
/** the model a Venice character uses on Venice itself, as Havre last saw it */
const ownModel = (c) => (c && c.engine.venice_character && S.own[c.engine.venice_character]) || "";
const TEXT_NOTE = "private: what you send is used for the answer and not kept. anonymized: venice passes it to the model's maker without saying who you are, and they can read it.";
const KINDS = {
  chat: { title: "MODEL", type: "text", head: ["MODEL", "PRIVACY", "CAN", "$ IN / OUT", "CONTEXT"], search: "search models: a name, private, uncensored…",
    note: TEXT_NOTE + " prices are per million tokens." },
  seeing: { title: "SEEING MODEL", type: "text", head: ["MODEL", "PRIVACY", "CAN", "$ IN / OUT", "CONTEXT"], search: "search models that can see…",
    note: "describes your photo for a character whose own model can't see. only models that can see are here. " + TEXT_NOTE },
  photo: { title: "PHOTO MODEL", type: "inpaint", head: ["MODEL", "PRIVACY", "PICTURES", "$ A PHOTO"], search: "search photo models…",
    note: "a photo is an edit of the character's own pictures, with venice's safe mode on. " + TEXT_NOTE },
  clip: { title: "CLIP MODEL", type: "video", head: ["MODEL", "PRIVACY", "LENGTHS", "SIZES", "SOUND"], search: "search clip models…",
    note: "reference-to-video models: they keep the character the way their pictures show them. venice prices each clip before it's made. " + TEXT_NOTE },
  voice: { title: "VOICE MODEL", type: "tts", head: ["MODEL", "PRIVACY", "VOICES", "$ A MILLION CHARACTERS"], search: "search voice models…",
    note: "a reply of 200 characters costs 200 millionths of the price. qwen 3 voices take the mood; the others ignore it. " + TEXT_NOTE },
  hearing: { title: "HEARING MODEL", type: "asr", head: ["MODEL", "PRIVACY", "$ A MINUTE"], search: "search hearing models…",
    note: "turns your voice note into words for the character. " + TEXT_NOTE },
};
let pickKind = "chat";
/** the models a kind picks from, or null while Venice is still being asked */
function kindList(kind) {
  if (kind === "chat") return S.models;
  if (kind === "seeing") return S.models && S.models.filter((m) => m.vision);
  if (kind === "clip") return clipModels();
  return S.lists[KINDS[kind].type];
}
/** the model of this kind in use now */
function kindModel(kind) {
  const c = card(), m = { photo: photoModel, clip: clipModel, hearing: hearModel, seeing: seeModel }[kind];
  if (m) return m();
  if (kind === "voice") return voiceModel(c);
  return c ? { id: c.model } : null;
}
function openModels(kind = "chat") {
  const c = card();
  if (!KINDS[kind] || ((kind === "chat" || kind === "voice") && (!c || (kind === "voice" && c.plain)))) return;
  pickKind = kind;
  const k = KINDS[kind];
  const own = ownModel(c);
  $("#model-h").textContent = k.title;
  $("#msearch").placeholder = k.search;
  $("#mnote").textContent = k.note;
  $("#model-for").textContent = kind === "chat" ? (c.plain ? "for the plain chat." : `for ${c.name}.` + (own ? ` their own on venice: ${modelName(own)}.` : ""))
    : kind === "voice" ? `for ${c.name}'s voice notes.` : kind === "photo" ? "for photos from every character."
    : kind === "clip" ? "for clips from every character." : kind === "hearing" ? "for hearing your voice notes."
    : "for describing your photos to a character whose model can't see.";
  $("#msearch").value = "";
  const head = $("#mhead");
  head.textContent = "";
  head.append(h("tr", {}, k.head.map((t) => h("th", { scope: "col", text: t }))));
  if (!$("#modeldlg").open) $("#modeldlg").showModal();
  renderModels();
  loadList(k.type);
}
function renderModels() {
  const kind = pickKind, k = KINDS[kind], c = card(), tb = $("#mlist"), q = $("#msearch").value.trim().toLowerCase();
  tb.textContent = "";
  const cols = String(k.head.length), list0 = kindList(kind);
  if (!list0) {
    tb.append(h("tr", {}, h("td", { colspan: cols, text: (k.type === "text" ? S.modelsError : S.listErr[k.type]) || "asking venice for its models…" })));
    return;
  }
  const cur = (kindModel(kind) || {}).id, own = kind === "chat" ? ownModel(c) : "";
  const rank = (m) => (m.id === cur ? 2 : 0) + (m.id === own ? 1 : 0);
  const list = list0.filter((m) => !q || `${m.id} ${m.name} ${(m.traits || []).join(" ")} ${m.privacy} ${m.uncensored ? "uncensored" : ""}`.toLowerCase().includes(q))
    .sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name));
  const num = (text) => h("td", { class: "num", text });
  for (const m of list) {
    const notes = [m.id, m.id === own && "their own", (m.traits || []).includes("default") && "venice's default", m.retiring && "retiring " + m.retiring].filter(Boolean);
    let cells;
    if (k.type === "text") {
      const can = [m.vision && "sees", m.tools && "tools", m.reasoning && "reasons", m.web && "web", m.uncensored && "uncensored"].filter(Boolean);
      cells = [h("td", { text: can.join(" · ") || "text" }), num(`${A.usd(m.input)} / ${A.usd(m.output)}`), num(m.ctx ? Math.round(m.ctx / 1000) + "k" : "")];
    } else if (kind === "photo") {
      cells = [h("td", { text: m.maxIn > 1 ? `up to ${m.maxIn}` : "1" }),
        num(A.usd(m.price) + (m.extra ? ` + ${A.usd(m.extra)} a picture past ${m.included}` : ""))];
    } else if (kind === "clip") {
      const secs = m.durations.map((d) => parseInt(d, 10)).filter((n) => n > 0);
      cells = [h("td", { text: secs.length ? `${Math.min(...secs)}–${Math.max(...secs)}s` : "?" }), h("td", { text: m.resolutions.join(", ") || "one size" }),
        h("td", { text: m.audio ? "yes" : "no" })];
    } else if (kind === "voice") cells = [num(String(m.voices.length)), num(A.usd(m.perMChars))];
    else cells = [num(A.usd(A.hearingPerMinute(m)))];
    tb.append(h("tr", { "aria-current": m.id === cur ? "true" : null },
      h("th", { scope: "row" }, linkish(m.name, () => chooseModel(m.id), { "aria-label": `Use ${m.name}` }), h("span", { class: "mid", text: notes.join(" · ") })),
      h("td", { text: (m.privacy || "?") + (k.type !== "text" && m.uncensored ? " · uncensored" : "") }), ...cells));
  }
  if (!list.length) tb.append(h("tr", {}, h("td", { colspan: cols, text: q ? `no model matches “${$("#msearch").value.trim()}”.` : "venice lists none right now." })));
}
function chooseModel(id) {
  const kind = pickKind, c = card(), list = kindList(kind) || [], m = list.find((x) => x.id === id), name = m ? m.name : id;
  if (kind === "chat") {
    if (!c) return;
    if (c.plain) { S.plain.model = id; local.set(K.plainModel, id); }
    else { replaceCard({ ...c, model: id }); fillModels($("#model-select"), id); }
    toast(`${c.plain ? "The plain chat" : c.name} now talks through ${modelName(id)}.`);
  } else if (kind === "voice") {
    if (!c || c.plain || !m) return;
    replaceCard({ ...c, speech: { ...c.speech, model: id, voice: voiceOf(c, m) } });
    toast(`${c.name} now sounds like ${name}.`);
  } else {
    if (kind === "photo") S.ab.photo = id;
    else if (kind === "clip") S.ab.clip = { ...S.ab.clip, model: id };
    else if (kind === "hearing") S.ab.hearModel = id;
    else if (kind === "seeing") S.ab.seeModel = id;
    saveAb();
    toast(`${KINDS[kind].title.charAt(0) + KINDS[kind].title.slice(1).toLowerCase()}: ${name}.`);
  }
  $("#modeldlg").close();
  renderChatMeta();
  renderSpeech();
  if ($("#abilitydlg").open) renderAbilities();
  if (S.ask && S.ask.kind === kind) {
    if (kind === "clip") { S.ask.opts = A.clipOptions(clipModel(), S.ab.clip); requote(); }
    renderAsk();
  }
}

// ---------- what is left on the key ----------
let balanceTimer = 0;
function balanceSoon() { clearTimeout(balanceTimer); balanceTimer = setTimeout(loadBalance, 1500); }
async function loadBalance() {
  const el = $("#balance");
  if (!S.key) { el.hidden = true; return; }
  try {
    const { amount, currency } = await new Venice(S.key).balance();
    if (amount == null || !S.key) { el.hidden = true; return; }
    el.textContent = "balance " + (currency === "USD" ? "$" + amount.toFixed(2)
      : currency === "DIEM" ? amount.toFixed(2) + " diem" : amount.toFixed(2) + " credits");
    el.hidden = false;
  } catch { el.hidden = true; }
}

// ---------- abilities: the tools under the text box ----------
function renderTools() {
  const p = $("#tools"), c = card();
  p.textContent = "";
  p.hidden = !c || !S.key;
  if (p.hidden) return;
  if (S.rec) {
    p.append(h("span", { class: "rec", text: `● recording ${clock(S.rec.ms)}` }), " / ", linkish("stop and send", () => stopRecording()),
      " / ", linkish("cancel", () => stopRecording(true)));
    return;
  }
  const items = [];
  if (!c.plain) {
    items.push(linkish("ask for a photo", () => askFor("photo")), linkish("ask for a clip", () => askFor("clip")));
    const on = !!S.voiceOn[c.id];
    items.push(linkish(`voice notes: ${on ? "on" : "off"}`, () => setVoiceNotes(c, !on),
      { "aria-pressed": on ? "true" : "false", title: on ? `${c.name} replies with voice notes` : `${c.name} replies in text; "hear it" reads one out` }));
    const left = Math.max(0, S.ab.allowance - spentToday());
    items.push(linkish(`on their own: ${S.ab.own ? "on" : "off"}`, () => setOwn(!S.ab.own), { "aria-pressed": S.ab.own ? "true" : "false",
      title: S.ab.own ? `Characters text first and send photos and voice notes when they like: ${A.usd(left)} of today's ${A.usd(S.ab.allowance)} left` : "Characters only do what you ask" }));
  }
  if (S.ab.hear) items.push(linkish("record a voice note", startRecording));
  if (S.ab.see) items.push(linkish("send a photo", () => $("#photo-in").click()));
  items.push(linkish("abilities", openAbilities));
  p.append(...slashed(items));
}

// ---------- abilities: the settings ----------
function openAbilities() {
  if (!$("#abilitydlg").open) $("#abilitydlg").showModal();
  renderAbilities();
  for (const t of ["inpaint", "video", "tts", "asr"]) loadList(t);
  loadModels();
}
function renderAbilities() {
  const tb = $("#ablist"), c = card(), real = !!c && !c.plain;
  tb.textContent = "";
  const pm = photoModel(), cm = clipModel(), hm = hearModel(), sm = seeModel(), vm = real ? voiceModel(c) : null;
  const change = (kind, m) => linkish(m ? m.name : "…", () => openModels(kind), { "aria-label": `Change the ${KINDS[kind].title.toLowerCase()}` });
  const tick = (label, on, set) => {
    const i = h("input", { type: "checkbox" });
    i.checked = on;
    i.addEventListener("change", () => set(i.checked, i));
    return h("label", { class: "check" }, i, " " + label);
  };
  const row = (name, what, how) => h("tr", {}, h("th", { scope: "row", text: name }), h("td", {}, what), h("td", { class: "how" }, how));
  const allowance = h("select", { "aria-label": "Daily allowance" }, ALLOWANCES.map((v) => h("option", { value: String(v), text: A.usd(v) })));
  allowance.value = String(S.ab.allowance);
  allowance.addEventListener("change", () => { S.ab.allowance = Number(allowance.value); saveAb(); renderAbilities(); renderTools(); });
  tb.append(
    row("ON THEIR OWN", tick("characters text first when you come back, and send photos and voice notes when they like", S.ab.own, (on) => setOwn(on)),
      ["up to ", allowance, ` a day · ${A.usd(spentToday())} spent today · clips are offered with venice's price, and made only if you say yes`]),
    row("PHOTOS", real ? `${c.name} sends a photo, made from their pictures (card → look).` : "a character sends a photo, made from their pictures.",
      ["model: ", change("photo", pm), pm && pm.price != null ? ` · ${A.usd(A.photoPrice(pm, 1))} a photo` : ""]),
    row("CLIPS", "a few seconds of video, made from the same pictures.", ["model: ", change("clip", cm), " · venice prices each clip before it's made"]),
    row("VOICE NOTES", real ? tick(`${c.name} replies with voice notes`, !!S.voiceOn[c.id], (on) => setVoiceNotes(c, on))
      : "pick a character: their voice and mood are on their card.",
    real ? ["voice: ", change("voice", vm), ` (${vm ? voiceOf(c, vm) : c.speech.voice || A.DEFAULT_VOICE})`, vm && vm.perMChars != null ? ` · about ${A.usd(A.voicePrice(vm, 200))} a reply` : ""] : ""),
    row("HEARING", tick("let them hear my voice notes", S.ab.hear, (on, i) => {
      if (on && !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== "undefined")) {
        i.checked = false;
        toast("This browser can't record voice notes here.");
        return;
      }
      S.ab.hear = on;
      saveAb();
      renderTools();
    }), ["model: ", change("hearing", hm), hm && hm.perSecond != null ? ` · ${A.usd(A.hearingPerMinute(hm))} a minute` : ""]),
    row("SEEING", tick("let them see my photos", S.ab.see, (on) => { S.ab.see = on; saveAb(); renderTools(); }),
      ["if their model can't see, ", change("seeing", sm), " describes the photo to them"]),
  );
}

// ---------- abilities: a photo or a clip, asked for ----------
function askFor(kind) {
  const c = card();
  if (!c || c.plain) return;
  if (!S.key) return needKey(`${kind === "clip" ? "clips" : "photos"} need your venice key.`);
  if (S.ask && S.ask.busy) { toast("One thing at a time: the last one is still on its way."); return; }
  const hint = $("#say").value.trim();
  if (hint) { $("#say").value = ""; growSay(); }
  S.ask = { kind, card: c.id, thread: S.open, hint, shot: "", busy: false, status: "", bad: false, quote: null, quoting: false, opts: null, asked: 0 };
  loadList(kind === "clip" ? "video" : "inpaint");
  if (!refsOf(c).length) loadList("image");
  renderAsk();
  if (refsOf(c).length) writeShot();
  if (narrow()) $("#ask").scrollIntoView({ behavior: motion(), block: "nearest" });
  else $("#studio").scrollIntoView({ behavior: motion(), block: "start" });
  scrollLog();
}
function closeAsk() { if (S.ask && S.ask.busy) return; S.ask = null; renderAsk(); }
function renderAsk() {
  const box = $("#ask"), a = S.ask, cur = card(), act = document.activeElement;
  const was = act && act.id === "ask-shot" ? [act.selectionStart, act.selectionEnd] : null;
  const focusId = act && box.contains(act) && act.id ? act.id : "";
  box.textContent = "";
  const c = a && S.cards.find((x) => x.id === a.card);
  box.hidden = !a || !c || !cur || cur.id !== a.card;
  if (a && !c) S.ask = null;
  $("#chat").classList.toggle("asking", !box.hidden);
  if (box.hidden) return;
  const clipping = a.kind === "clip", what = clipping ? "clip" : "photo";
  box.append(h("div", { class: "askhead" }, h("b", { text: `${clipping ? "A CLIP" : "A PHOTO"} FROM ${c.name.toUpperCase()}` }),
    h("button", { type: "button", class: "x", "aria-label": "Close", text: "×", disabled: a.busy || null, onclick: closeAsk })));
  const refs = refsOf(c);
  if (!refs.length) {
    const pm = portraitModel();
    box.append(h("p", { class: "mono", text: (c.portrait || c.look.references.length
      ? `${c.name}'s pictures can't be used for ${what}s: a drawing kept as an SVG, or a link to another site. add a png, jpeg or webp picture on their card (card → look), or make a first portrait from how they look.`
      : `${c.name} has no picture yet, and ${what}s are made from their pictures. add one on their card (card → look), or make a first portrait from how they look.`) }));
    box.append(h("div", { class: "acts" },
      h("button", { type: "button", class: "btn solid small", id: "ask-portrait", disabled: a.busy || !pm || pm.price == null || null, onclick: firstPortrait,
        text: `MAKE A FIRST PORTRAIT${pm && pm.price != null ? " · " + A.usd(pm.price) : ""}` }),
      h("button", { type: "button", class: "btn small", text: "OPEN THEIR CARD", onclick: () => { openCard("edit"); $("#look-group").open = true; } })));
  } else {
    const ta = h("textarea", { id: "ask-shot", rows: 3, maxlength: 900, placeholder: "what the camera sees", disabled: a.busy || null });
    ta.value = a.shot;
    ta.addEventListener("input", () => { a.shot = ta.value; syncAsk(); });
    box.append(h("label", {}, h("span", {}, "THE SHOT ", h("span", { class: "hint", text: "written from your conversation; change anything" })), ta));
    box.append(h("p", { class: "mono" }, linkish("write it again", writeShot, { disabled: a.busy || null }), a.hint ? ` (you asked for: ${a.hint})` : ""));
    if (!clipping) {
      const pm = photoModel(), n = pm ? Math.min(refs.length, pm.maxIn) : refs.length, price = A.photoPrice(pm, n);
      box.append(h("p", { class: "mono" }, `from ${n} picture${n === 1 ? "" : "s"} of ${c.name} · model: `,
        linkish(pm ? pm.name : "…", () => openModels("photo"), { "aria-label": "Change the photo model" }), price != null ? ` · ${A.usd(price)}` : ""));
      box.append(h("div", { class: "acts" },
        h("button", { type: "button", class: "btn solid small", id: "ask-go", onclick: takePhoto, text: `TAKE THE PHOTO${price != null ? " · " + A.usd(price) : ""}` }),
        h("button", { type: "button", class: "btn small", text: "CANCEL", onclick: closeAsk, disabled: a.busy || null })));
    } else {
      const cm = clipModel();
      if (cm && !a.opts) a.opts = A.clipOptions(cm, S.ab.clip);
      const opts = h("div", { class: "opts" });
      if (cm) {
        const choice = (label, key, values, show = (v) => v) => {
          if (!values || values.length < 2) return null;
          const s = h("select", { id: "ask-" + key, disabled: a.busy || null }, values.map((v) => h("option", { value: v, text: show(v) })));
          s.value = a.opts[key];
          s.addEventListener("change", () => { a.opts[key] = s.value; S.ab.clip = { ...S.ab.clip, [key]: s.value, model: cm.id }; saveAb(); requote(); });
          return h("label", {}, label + " ", s);
        };
        opts.append(...[choice("length", "duration", cm.durations), choice("size", "resolution", cm.resolutions),
          choice("shape", "aspect", cm.aspects, (v) => ({ "9:16": "9:16 tall", "16:9": "16:9 wide", "1:1": "1:1 square" }[v] || v))].filter(Boolean));
        if (cm.audioConfigurable) {
          const i = h("input", { type: "checkbox", id: "ask-audio", disabled: a.busy || null });
          i.checked = a.opts.audio !== false;
          i.addEventListener("change", () => { a.opts.audio = i.checked; S.ab.clip = { ...S.ab.clip, audio: i.checked, model: cm.id }; saveAb(); requote(); });
          opts.append(h("label", { class: "check" }, i, " sound"));
        }
      }
      box.append(opts);
      box.append(h("p", { class: "mono" }, `from ${Math.min(refs.length, 4)} picture${refs.length === 1 ? "" : "s"} of ${c.name} · model: `,
        linkish(cm ? cm.name : S.listErr.video ? "unavailable" : "…", () => openModels("clip"), { "aria-label": "Change the clip model" }),
        " · ", a.quoting ? "asking venice for the price…" : a.quote != null ? `venice's price: ${A.usd(a.quote)}` : "no price yet"));
      box.append(h("div", { class: "acts" },
        h("button", { type: "button", class: "btn solid small", id: "ask-go", onclick: makeClip, text: `MAKE THE CLIP${a.quote != null ? " · " + A.usd(a.quote) : ""}` }),
        h("button", { type: "button", class: "btn small", text: "CANCEL", onclick: closeAsk, disabled: a.busy || null })));
    }
  }
  box.append(h("p", { class: "hint", text: `safe for work, and never a real person. a ${what} runs on your venice key.` }));
  if (a.status) box.append(h("p", { class: "status" + (a.bad ? " bad" : ""), role: "status", text: a.status }));
  syncAsk();
  if (was) { const t = $("#ask-shot"); if (t && !t.disabled) { t.focus({ preventScroll: true }); t.setSelectionRange(was[0], was[1]); } }
  else if (focusId) { const el = document.getElementById(focusId); if (el && !el.disabled) el.focus({ preventScroll: true }); }
}
/** the button that spends money is live only when there's a shot and a price for exactly what would be made */
function syncAsk() {
  const a = S.ask, go = $("#ask-go");
  if (!a || !go) return;
  go.disabled = a.busy || !a.shot.trim() || (a.kind === "clip" ? !quoteFits(a) : photoPriceNow(a) == null);
}
/** a photo's price, from the photo model and the pictures it would use; null when Venice gives none */
function photoPriceNow(a) {
  const c = S.cards.find((x) => x.id === a.card), pm = photoModel();
  return c && pm ? A.photoPrice(pm, Math.min(refsOf(c).length, Math.max(1, pm.maxIn))) : null;
}
/** what a clip quote was for: the model and every option */
const quoteKey = (cm, opts) => (cm && opts ? JSON.stringify([cm.id, opts.duration, opts.resolution, opts.aspect, opts.audio]) : "");
/** the quote on screen is for the clip as it stands now */
const quoteFits = (a) => a.quote != null && !a.quoting && !!a.quoteFor && a.quoteFor === quoteKey(clipModel(), a.opts);
async function writeShot() {
  const a = S.ask;
  if (!a || a.busy) return;
  const c = S.cards.find((x) => x.id === a.card);
  if (!c) return;
  a.busy = true;
  Object.assign(a, { status: "writing the shot…", bad: false });
  renderAsk();
  try {
    const t = thread() && thread().card === c.id ? thread() : (a.thread && S.threads[a.thread]) || null;
    const r = await new Venice(S.key).chat({ model: c.model || S.model, messages: A.shotMessages(c, A.apiHistory(t ? t.msgs : []), a.hint, a.kind),
      maxTokens: 260, temperature: 0.8 });
    a.shot = A.cleanText(r.text);
    Object.assign(a, a.shot ? { status: "", bad: false } : { status: "The model sent back no shot. Write one yourself, or try again.", bad: true });
  } catch (e) { Object.assign(a, { status: e.message, bad: true }); }
  a.busy = false;
  if (S.ask !== a) return;
  renderAsk();
  balanceSoon();
  if (a.kind === "clip") requote();
}
let quoteTimer = 0;
/** Venice's price for the clip as it stands; asked again whenever the length, size, shape or model changes */
function requote() {
  const a = S.ask;
  if (!a || a.kind !== "clip") return;
  // the old price goes at once, and any answer still on its way for the old options is ignored
  const asked = ++a.asked;
  Object.assign(a, { quoting: true, quote: null, quoteFor: "" });
  if (!a.busy) renderAsk(); else syncAsk();
  clearTimeout(quoteTimer);
  quoteTimer = setTimeout(async () => {
    const cm = clipModel();
    if (S.ask !== a || asked !== a.asked) return;
    if (!cm || !a.opts) { a.quoting = false; if (!a.busy) renderAsk(); return; }
    const key = quoteKey(cm, a.opts);
    let quote = null, status = "", bad = false;
    try { quote = await new Venice(S.key).quoteVideo({ model: cm.id, ...a.opts }); if (quote == null) { status = "Venice gave no price for that clip."; bad = true; } }
    catch (e) { status = e.message; bad = true; }
    if (asked !== a.asked || S.ask !== a) return;
    Object.assign(a, { quoting: false, quote, quoteFor: quote == null ? "" : key }, a.busy ? {} : { status, bad });
    if (!a.busy) renderAsk(); else syncAsk();
  }, 200);
}
function trouble(e, c) {
  return e.status === 400 && c.engine.venice_character && !c.look.references.length
    ? `Venice couldn't use ${c.name}'s photo (${e.message}). Add a picture of them on their card (card → look) and try again.` : e.message;
}
async function takePhoto() {
  const a = S.ask, pm = photoModel();
  if (!a || a.busy || !a.shot.trim() || !pm) return;
  const c = S.cards.find((x) => x.id === a.card);
  if (!c) return;
  const refs = refsOf(c).slice(0, Math.max(1, pm.maxIn)), price = A.photoPrice(pm, refs.length);
  if (price == null || !refs.length) return;                   // never without the price on the button
  a.busy = true;
  Object.assign(a, { status: `taking the photo with ${pm.name}…`, bad: false });
  renderAsk();
  try {
    const { blob, blurred } = await new Venice(S.key).editImage({ model: pm.id, prompt: A.photoPrompt(c, a.shot, refs.length, pm.promptLimit), images: refs });
    const id = await M.put(blob);
    if (S.ask === a) S.ask = null;
    renderAsk();
    deliver(askThread(a), { role: "assistant", content: "", media: { kind: "photo", id, shot: a.shot.trim(), model: pm.name, price, ...(blurred ? { blurred: true } : {}) } });
  } catch (e) {
    a.busy = false;
    Object.assign(a, { status: trouble(e, c), bad: true });
    renderAsk();
  }
  balanceSoon();
}
/** a character with no picture at all: how they look, in words (if their card doesn't say), then a portrait from that */
async function firstPortrait() {
  const a = S.ask, pm = portraitModel();
  if (!a || a.busy || !pm || pm.price == null) return;
  const c = S.cards.find((x) => x.id === a.card);
  if (!c) return;
  if (refsOf(c).length) { renderAsk(); writeShot(); return; }   // they've had a picture since: no portrait to pay for
  a.busy = true;
  Object.assign(a, { status: c.look.description ? `drawing ${c.name} with ${pm.name}…` : "imagining how they look…", bad: false });
  renderAsk();
  try {
    const v = new Venice(S.key), look = await lookOf(c, v);
    a.status = `drawing ${c.name} with ${pm.name}…`;
    renderAsk();
    const portrait = await drawPicture(c, look, pm, v);
    const now = S.cards.find((x) => x.id === c.id);
    if (now && !refsOf(now).length) keepPicture(now, portrait, look);
    a.busy = false;
    Object.assign(a, { status: "", bad: false });
    toast(`${c.name} has a picture now, on their card.`);
    renderAsk();
    writeShot();
  } catch (e) {
    a.busy = false;
    Object.assign(a, { status: e.message, bad: true });
    renderAsk();
  }
  balanceSoon();
}

// ---------- pictures for a character's card, made with AI ----------
const BLURRED = "Venice's safe mode blurred that picture, so it wasn't kept. Change how they look on their card (look), then try again.";
/** how they look, in words: what their card says, else a description their model writes now */
async function lookOf(c, v) {
  if (c.look.description) return c.look.description;
  return A.cleanText((await v.chat({ model: c.model || S.model, messages: A.lookMessages(c), maxTokens: 200, temperature: 0.9 })).text, 1500);
}
/** a picture of them drawn from how they look, by an image model, as a data: URI (one safe mode blurred isn't kept) */
async function drawPicture(c, look, pm, v) {
  const { blob, blurred } = await v.generateImage({ model: pm.id, prompt: A.portraitPrompt({ ...c, look: { ...c.look, description: look } }, pm.promptLimit),
    aspect: pm.aspects.includes("1:1") ? "1:1" : "" });
  if (blurred) throw new Error(BLURRED);
  return shrinkImage(blob, 512, "image/webp", { svg: false });
}
/**
 * A picture made for a character, kept on their card: as their portrait (asked for, or when they have none), else as
 * the first of their other pictures. How they look goes on their card too, if it was written just now.
 */
function keepPicture(c, pic, look, as = "") {
  const looks = { ...c.look, description: c.look.description || look || "" };
  replaceCard(as === "portrait" || !c.portrait ? { ...c, portrait: pic, look: looks }
    : { ...c, look: { ...looks, references: [pic, ...c.look.references].slice(0, C.MAX_REFERENCES) } });
  renderRoster();
  renderThreads();
  if ((card() || {}).id === c.id) renderSheet();
  picturesChanged();
}
let drawing = false;
function lookStatus(sel, text, bad = false) { const s = $(sel); s.textContent = text; s.classList.toggle("bad", bad); }
/**
 * What a picture made for their card would be: a portrait is drawn from how they look; another picture is made from
 * the pictures they have (so it's still them), or drawn too when they have none. { model, pictures, price, list }.
 */
function makerPlan(c, as) {
  const refs = as === "portrait" ? [] : refsOf(c);
  if (!refs.length) { const m = portraitModel(); return { model: m, pictures: [], price: m ? m.price : null, list: "image" }; }
  const m = photoModel(), pictures = refs.slice(0, Math.max(1, m ? m.maxIn : 1));
  return { model: m, pictures, price: m ? A.photoPrice(m, pictures.length) : null, list: "inpaint" };
}
/** the two links that make a picture for their card, with what the next one costs */
function renderMakers() {
  const c = card();
  if (!c || c.plain) return;
  for (const [sel, as] of [["#portrait-make", "portrait"], ["#ref-make", ""]]) {
    const { price } = makerPlan(c, as), b = $(sel);
    b.textContent = "make one with ai" + (price != null ? " · " + A.usd(price) : "");
    b.disabled = drawing || (as !== "portrait" && !!c.portrait && c.look.references.length >= C.MAX_REFERENCES);
  }
}
/** a picture for their card, made with AI on your key: a new portrait ("portrait"), or one more picture of them */
async function makePicture(as = "") {
  const c = card(), st = as === "portrait" ? "#portrait-status" : "#look-status";
  if (!c || c.plain || drawing) return;
  if (!S.key) return needKey("pictures need your venice key.");
  if (as !== "portrait" && c.portrait && c.look.references.length >= C.MAX_REFERENCES) return;
  await loadList(makerPlan(c, as).list);
  const { model: pm, pictures, price, list } = makerPlan(c, as);
  if (!pm || price == null) { lookStatus(st, S.listErr[list] || "Venice has no model for that right now.", true); return; }
  if (as === "portrait" && c.portrait && !confirm(`Replace ${c.name}'s portrait with a new one, drawn from how they look? It costs ${A.usd(price)} on your Venice key.`)) return;
  drawing = true;
  S.inflight++;
  renderMakers();
  try {
    const v = new Venice(S.key);
    let look = "", pic;
    if (pictures.length) {
      lookStatus(st, `making a picture of ${c.name} with ${pm.name}…`);
      const { blob, blurred } = await v.editImage({ model: pm.id, prompt: A.photoPrompt(c, A.sheetView(c.look.references.length), pictures.length, pm.promptLimit), images: pictures });
      if (blurred) throw new Error(BLURRED);
      pic = await shrinkImage(blob, 768, "image/webp", { svg: false });
    } else {
      if (!c.look.description) lookStatus(st, "imagining how they look…");
      look = await lookOf(c, v);
      lookStatus(st, `drawing ${c.name} with ${pm.name}…`);
      pic = await drawPicture(c, look, pm, v);
    }
    const now = S.cards.find((x) => x.id === c.id);
    if (now) keepPicture(now, pic, look, as);
    lookStatus(st, "");
    toast(as === "portrait" || !c.portrait ? `${c.name} has a new portrait.` : `A new picture of ${c.name} is on their card.`);
  } catch (e) {
    lookStatus(st, e.message, true);
  } finally {
    drawing = false;
    S.inflight--;
    renderMakers();
    balanceSoon();
  }
}

// ---------- abilities: clips on their way ----------
/** the clips on their way, as this tab and the others know them: a union, less the ones that are home */
function saveJobs() {
  syncJobs();
  local.set(K.jobs, S.jobs.map(({ polling, tries, ...j }) => j));
}
async function makeClip() {
  const a = S.ask, cm = clipModel();
  if (!a || a.busy || !a.shot.trim() || !cm || !quoteFits(a)) return;   // only at the price on the button
  const c = S.cards.find((x) => x.id === a.card);
  if (!c || !refsOf(c).length) return;
  a.busy = true;
  Object.assign(a, { status: "asking venice to start the clip…", bad: false });
  renderAsk();
  try {
    await startClip(c, cm, a.shot.trim(), { ...a.opts }, a.quote, () => askThread(a));
    if (S.ask === a) S.ask = null;
    renderAsk();
  } catch (e) {
    a.busy = false;
    Object.assign(a, { status: trouble(e, c), bad: true });
    renderAsk();
  }
  balanceSoon();
}
/** queue a clip at Venice and follow it until it's home, in the chat `where()` gives once it's on its way */
async function startClip(c, cm, shot, opts, price, where) {
  const { queueId, downloadUrl } = await new Venice(S.key).queueVideo({ model: cm.id, prompt: A.clipPrompt(c, shot, cm.promptLimit), images: refsOf(c), ...opts });
  const t = where();
  const job = { id: M.newId(), card: c.id, thread: t ? t.id : "", model: cm.id, name: cm.name, queueId, downloadUrl, shot, price, started: Date.now(), elapsed: 0, expected: 0 };
  S.jobs.push(job);
  saveJobs();
  renderJobs();
  scrollLog();
  pollJob(job);
  return job;
}

// ---------- abilities: on their own ----------
/**
 * After a reply, when a move is likely (they were asked to show something, or the reply is about something worth
 * showing, or now and then), the character's model decides: a photo or a voice note, sent out of the day's
 * allowance, or a clip, offered with Venice's price for you to take or leave.
 */
async function onTheirOwn(t) {
  const c = cardOf(t);
  if (!c || c.plain || !S.key || !S.ab.own || S.moving.has(t.id) || !A.moveLikely(t.msgs)) return;
  // the call that decides is paid for too: set aside its most, from what's left today, and settle after
  const model = (S.models || []).find((m) => m.id === (c.model || S.model)) || null;
  const messages = A.moveMessages(c, A.apiHistory(t.msgs)), most = A.callEstimate(messages, 300, model);
  if (!reserve(most)) return;
  S.moving.add(t.id);                                         // one move at a time in a chat
  let held = most;
  try {
    const r = await new Venice(S.key).chat({ model: c.model || S.model, messages, schema: A.MOVE_SCHEMA, maxTokens: 300, temperature: 0.7 });
    settle(held, A.callCost(r.usage, model));
    held = 0;
    if (!S.threads[t.id] || !cardOf(t)) return;               // the chat, or they, went meanwhile
    const { move, shot } = A.normalizeMove(C.parseJsonLoose(r.text));
    const lately = A.sentLately(t.msgs);                          // never two photos in a row
    if (move === "photo" && !lately) await ownPhoto(t, shot);
    else if (move === "voice") await ownVoice(t);
    else if (move === "clip" && !lately) await offerClip(t, shot);
  } catch { /* then they just text */ } finally { refund(held); S.moving.delete(t.id); }
}
async function ownPhoto(t, shot) {
  const c = cardOf(t);
  await loadList("inpaint");
  const pm = photoModel(), refs = refsOf(c);
  if (!c || !pm || !refs.length) return;                        // no picture of them yet: nothing to send
  const pics = refs.slice(0, Math.max(1, pm.maxIn)), price = A.photoPrice(pm, pics.length);
  if (!reserve(price)) return;                                  // set aside first: nothing else can spend it meanwhile
  doing(t, "is taking a photo…");
  try {
    const { blob, blurred } = await new Venice(S.key).editImage({ model: pm.id, prompt: A.photoPrompt(c, shot, pics.length, pm.promptLimit), images: pics });
    const id = await M.put(blob);
    done(t);
    deliver(t, { role: "assistant", content: "", media: { kind: "photo", id, shot, model: pm.name, price, own: true, ...(blurred ? { blurred: true } : {}) } });
    balanceSoon();
  } catch (e) { refund(price); throw e; } finally { done(t); }
}
async function ownVoice(t) {
  const c = cardOf(t), msg = [...t.msgs].reverse().find((m) => m.role === "assistant" && !m.media && !m.demo);
  if (!c || !msg || msg.voice || voicing.has(msg)) return;
  await loadList("tts");
  const vm = voiceModel(c), price = vm ? A.voicePrice(vm, A.speakable(msg.content).length) : null;
  if (msg.voice || voicing.has(msg) || !reserve(price)) return;
  voicing.add(msg);
  doing(t, "is recording a voice note…");
  try {
    const v = { ...(await makeVoice(c, msg.content)), own: true };
    if (msg.voice) { refund(price); return; }                   // "hear it" got there first
    msg.voice = v;
    saveThread(t);
    done(t);
    placeVoice(t, msg);
    balanceSoon();
  } catch (e) { refund(price); throw e; } finally { done(t); voicing.delete(msg); }
}
/** a voice note that came after its words were shown: it goes above them, where it would have been */
function placeVoice(t, m) {
  if (!here(t) || !m.id) return false;
  const first = $(`#log .line[data-msg="${m.id}"]`);
  if (!first) return false;                                    // not drawn yet, or drawn again: it shows with them
  first.before(voiceLine(cardOf(t), m));
  for (const b of $$(`#log .line[data-msg="${m.id}"] .hear`)) b.remove();
  return true;
}
/** a clip they'd like to send: Venice's price first, and it's made only if you say yes */
async function offerClip(t, shot) {
  const c = cardOf(t);
  await loadList("video");
  const cm = clipModel();
  if (!c || !cm || !refsOf(c).length || S.jobs.some((j) => j.card === c.id)) return;
  const opts = A.clipOptions(cm, S.ab.clip);
  const quote = await new Venice(S.key).quoteVideo({ model: cm.id, ...opts });
  if (quote == null || !here(t)) return;
  const li = line("", "them", "offer"), said = $(".said", li);
  const yes = h("button", { type: "button", class: "btn solid small", text: `SEND IT · ${A.usd(quote)}`, onclick: async () => {
    yes.disabled = no.disabled = true;
    S.inflight++;
    try { await startClip(c, cm, shot, opts, quote, () => (S.threads[t.id] ? t : latestOf(c.id))); li.remove(); balanceSoon(); }
    catch (e) { li.remove(); err(trouble(e, c)); } finally { S.inflight--; }
  } });
  const no = h("button", { type: "button", class: "btn small", text: "NOT NOW", onclick: () => li.remove() });
  said.append(h("span", { text: `wants to send you a ${opts.duration} clip: ${shot}` }), h("span", { class: "cap", text: `${cm.name} · venice's price: ${A.usd(quote)}` }),
    h("span", { class: "acts" }, yes, no));
  put(li);
  scrollLog();
}
function resumeJobs() { for (const j of S.jobs) pollJob(j); }
function dropJob(job) {
  local.set(K.jobsDone, [...(local.get(K.jobsDone, []) || []).filter((q) => q !== job.queueId), job.queueId].slice(-100));
  S.jobs = S.jobs.filter((j) => j !== job && j.queueId !== job.queueId);
  saveJobs();
}
/**
 * Follow a clip until it's home. With more than one tab open, one tab follows it (the others take over if that
 * tab closes), so it's fetched once.
 */
async function pollJob(job) {
  if (job.polling) return;
  job.polling = true;
  try {
    if (!(navigator.locks && navigator.locks.request)) { await followJob(job); return; }
    while (S.jobs.includes(job) && S.key) {
      let ran = false;
      await navigator.locks.request("havre-clip-" + job.queueId, { ifAvailable: true }, async (lock) => { if (lock) { ran = true; await followJob(job); } });
      if (ran) return;
      await sleep(15000);
      syncJobs();                                         // home already, in the tab that was following it?
    }
  } finally { job.polling = false; }                     // no key now: picked up again when there is one
}
/** ask Venice how a clip is coming along every few seconds, and bring it home when it's done */
async function followJob(job) {
  let fails = 0;
  while (S.jobs.includes(job) && S.key) {
    const v = new Venice(S.key);
    try {
      const r = await v.retrieveVideo({ model: job.model, queueId: job.queueId });
      fails = 0;
      if (!r.done) {
        Object.assign(job, { elapsed: r.elapsed || Date.now() - job.started, expected: r.expected || job.expected || 0 });
        renderJobs();
        if (job.elapsed > Math.max(20 * 60000, 4 * job.expected)) throw new VeniceError("it's taking far longer than it should, so Havre stopped asking.", -3);
        await sleep(5000);
        continue;
      }
      let blob = r.blob, link = "";
      if (!blob && job.downloadUrl) {
        // a private model's clip waits at its own link; if this browser can't fetch it, it plays from there for a day
        try { blob = await v.downloadVideo(job.downloadUrl); } catch (e) { if (e && e.status === 0) link = job.downloadUrl; else throw e; }
      }
      if (!blob && !link) throw new VeniceError("Venice finished the clip but sent nothing back.", -1);
      const id = blob ? await M.put(blob) : "";
      dropJob(job);
      const c = S.cards.find((x) => x.id === job.card);
      if (c) deliver((job.thread && S.threads[job.thread]) || latestOf(c.id) || startThread(c), { role: "assistant", content: "",
        media: { kind: "clip", id, shot: job.shot, model: job.name, price: job.price, ...(link ? { url: link, until: job.started + 24 * 3600e3 } : {}) } });
      if (blob) {                                          // home safe: Venice can let go of its copy and its link
        v.completeVideo({ model: job.model, queueId: job.queueId });
        if (job.downloadUrl) v.revokeDownload(job.downloadUrl);
      }
      balanceSoon();
      return;
    } catch (e) {
      // a dropped connection, a rate limit or a hiccup at Venice: ask again, a little later each time, and while
      // offline, once back online. Venice keeps a clip for a day, so it's given up only after that.
      if (e && (e.status === 0 || e.status === 429 || e.status >= 500) && Date.now() - job.started < 24 * 3600e3) {
        fails++;
        if (navigator.onLine === false) await new Promise((r) => addEventListener("online", r, { once: true }));
        else await sleep(Math.min(60000, 5000 * 2 ** Math.min(fails, 4)));
        continue;
      }
      dropJob(job);
      const c = S.cards.find((x) => x.id === job.card);
      const why = `the clip from ${c ? c.name : "a character"} didn't come: ${e.status === 404 ? "Venice no longer has it (a clip waits there for a day)." : e.message}`;
      if (c && (card() || {}).id === c.id) err(why); else toast(why);
      return;
    }
  }
}
/** the clips on their way to the chat on screen (one whose chat was deleted goes to their latest chat instead) */
function jobsHere() {
  const t = thread();
  if (!t) return [];
  return S.jobs.filter((j) => (j.thread && S.threads[j.thread] ? j.thread === t.id : j.card === t.card && (latestOf(t.card) || {}).id === t.id));
}
/** a line in the chat for each clip still being made */
function renderJobs() {
  const log = $("#log"), mine = jobsHere();
  for (const el of $$("#log [data-job]")) if (!mine.some((j) => j.id === el.dataset.job)) el.remove();
  for (const j of mine) {
    let el = $(`#log [data-job="${j.id}"]`);
    if (!el) { el = line("", "them", "typing"); el.dataset.job = j.id; log.append(el); }
    $(".said", el).textContent = `is making a clip with ${j.name}: ${clock(j.elapsed)}${j.expected ? " of about " + clock(j.expected) : ""}`;
  }
}

// ---------- abilities: your voice notes ----------
let recStarting = false;
async function startRecording() {
  const c = card();
  if (!c || S.rec || recStarting || !S.ab.hear) return;
  if (!S.key) return needKey("voice notes need your venice key.");
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) || typeof MediaRecorder === "undefined") { toast("This browser can't record voice notes here."); return; }
  recStarting = true;                                     // a second click while the browser asks about the microphone does nothing
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { recStarting = false; toast("The browser didn't let Havre use the microphone."); return; }
  recStarting = false;
  if (S.rec || (card() || {}).id !== c.id) { stream.getTracks().forEach((t) => t.stop()); return; }
  const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || "";
  let rec;
  try { rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined); } catch { stream.getTracks().forEach((t) => t.stop()); toast("This browser can't record voice notes here."); return; }
  const r = { rec, stream, chunks: [], t0: Date.now(), ms: 0, timer: 0, cancel: false, done: false, to: { card: c.id, thread: S.open, at: Date.now() } };
  rec.ondataavailable = (e) => { if (e.data && e.data.size) r.chunks.push(e.data); };
  rec.onstop = () => {
    if (r.done) return;                                   // once, however it stopped
    r.done = true;
    clearInterval(r.timer);
    r.stream.getTracks().forEach((t) => t.stop());
    if (S.rec === r) S.rec = null;
    renderTools();
    if (!r.cancel) sendVoice(new Blob(r.chunks, { type: rec.mimeType || type || "audio/webm" }), r.to);
  };
  S.rec = r;
  rec.start(250);
  // the clock moves on its own; the buttons beside it stay put
  r.timer = setInterval(() => {
    r.ms = Date.now() - r.t0;
    if (r.ms >= 120000) stopRecording();
    else { const el = $("#tools .rec"); if (el) el.textContent = `● recording ${clock(r.ms)}`; }
  }, 500);
  renderTools();
}
function stopRecording(cancel = false) {
  const r = S.rec;
  if (!r || r.stopping) return;
  r.stopping = true;
  r.cancel = cancel;
  try { if (r.rec.state !== "inactive") r.rec.stop(); else r.rec.onstop(); } catch { r.rec.onstop(); }
}
/**
 * Something of yours is ready to send (to: { card, thread, at }), but you've gone to another chat meanwhile: it isn't
 * sent. From a new chat (no thread yet), the chat it became since then is the same chat.
 */
function stillWith(to, what) {
  const t = thread();
  if (S.sel === to.card && (S.open === to.thread || (!to.thread && (!t || t.created >= to.at)))) return true;
  const c = S.cards.find((x) => x.id === to.card) || (to.card === PLAIN ? S.plain : null);
  toast(`You went to another chat, so your ${what} for ${!c ? "them" : c.plain ? "the plain chat" : c.name} wasn't sent.`);
  return false;
}
async function sendVoice(blob, to) {
  S.inflight++;
  try { await hearVoice(blob, to); } finally { S.inflight--; }
}
async function hearVoice(blob, to) {
  const c = card();
  if (!c || !S.key || c.id !== to.card) return;
  if (blob.size < 600) { toast("That voice note was too short to hear."); return; }
  const id = await M.put(blob);
  const note = put(line("hearing your voice note…", "havre", "typing"));
  scrollLog();
  try {
    await loadList("asr");
    const hm = hearModel(), ext = /mp4/.test(blob.type) ? "m4a" : /ogg/.test(blob.type) ? "ogg" : "webm";
    const { text } = await new Venice(S.key).transcribe({ file: blob, name: "voice-note." + ext, model: hm ? hm.id : "" });
    note.remove();
    if (!text) throw new Error("Venice heard no words in that voice note.");
    balanceSoon();
    await idle();
    if (stillWith(to, "voice note")) await send(text, { media: { kind: "voice-in", id } });
  } catch (e) { note.remove(); err(e.message); }
}

// ---------- abilities: your photos ----------
async function sendPhoto(file) {
  S.inflight++;
  try { await showPhoto(file); } finally { S.inflight--; }
}
async function showPhoto(file) {
  const c = card(), to = { card: S.sel, thread: S.open, at: Date.now() };
  if (!c || !S.key || !S.ab.see) return;
  let pic;
  try { pic = await shrinkImage(file, 1024, "image/jpeg", { svg: false }); } catch { toast("That picture didn't load."); return; }
  const id = await M.put(dataBlob(pic));
  const caption = $("#say").value.trim();
  $("#say").value = "";
  growSay();
  await loadModels();
  const model = c.plain ? S.plain.model : c.model;
  if ((S.models || []).some((m) => m.id === model && m.vision)) {
    await idle();
    if (stillWith(to, "photo")) await send(caption, { media: { kind: "photo-in", id }, picture: pic });
    return;
  }
  const sm = seeModel();
  if (!sm) { err("No Venice model can see photos right now."); return; }
  const note = put(line(`${sm.name} is looking at your photo…`, "havre", "typing"));
  scrollLog();
  try {
    const r = await new Venice(S.key).chat({ model: sm.id, maxTokens: 220, temperature: 0.2,
      messages: [{ role: "user", content: [{ type: "text", text: A.SEE_PROMPT }, { type: "image_url", image_url: { url: pic } }] }] });
    const saw = A.cleanText(r.text, 600);
    note.remove();
    if (!saw) throw new Error(`${sm.name} couldn't describe the photo.`);
    await idle();
    if (stillWith(to, "photo")) await send(caption, { media: { kind: "photo-in", id, saw, seer: sm.name } });
  } catch (e) { note.remove(); err(e.message); }
}

function renderSheet() {
  const c = card(), f = $("#sheet");
  for (const el of f.elements) el.disabled = !c;
  if (!c) return;
  f.name.value = c.name;
  f.tagline.value = c.tagline;
  f.greeting.value = c.greeting;
  f.persona.value = c.persona;
  f.short_form.checked = c.voice.short_form;
  f.voice_notes.value = c.voice.notes;
  f.tags.value = c.tags.join(", ");
  f.creator.value = c.creator;
  fillModels($("#model-select"), c.model);
  const lic = $("#license-select");
  lic.textContent = "";
  for (const [k, label] of Object.entries(C.LICENSES)) lic.append(h("option", { value: k, text: label }));
  lic.value = c.license;
  paintFace($("#sheet-face"), portraitSrc(c));
  const ln = $("#linked-note");
  ln.hidden = !c.engine.venice_character;
  if (c.engine.venice_character) {
    ln.textContent = "";
    ln.append(`${c.name} speaks through the Venice character `,
      h("a", { href: C.refUrl("venice:" + c.engine.venice_character), target: "_blank", rel: "noopener", text: c.engine.venice_character }),
      ", with a prompt Havre never sees. To make a character of your own from them, use Remix.");
  }
  f.persona.disabled = f.greeting.disabled = !!c.engine.venice_character;
  f.look_description.value = c.look.description;
  f.speech_mood.value = c.speech.mood;
  const sp = $("#speech-speed");
  if (![...sp.options].some((o) => Number(o.value) === c.speech.speed)) sp.append(h("option", { value: String(c.speech.speed), text: `${c.speech.speed}×` }));
  sp.value = [...sp.options].find((o) => Number(o.value) === c.speech.speed).value;
  $("#speech-status").textContent = "";
  if (!drawing) for (const s of ["#portrait-status", "#look-status"]) lookStatus(s, "");
  loadList("image");
  if (refsOf(c).length) loadList("inpaint");
  renderRefs(c);
  renderSpeech();
  renderFlow(c);
  renderExamples(c);
  renderLineage(c);
}

/** the pictures photos and clips are made from: the portrait, then up to three more */
function renderRefs(c) {
  const box = $("#refs");
  box.textContent = "";
  const frame = (src, label, remove) => {
    const f = h("span", { class: "face small", "aria-hidden": "true" });
    paintFace(f, src);
    return h("figure", { class: "ref" }, f, h("figcaption", {}, label, remove ? [" ", linkish("remove", remove, { "aria-label": `Remove ${label}` })] : []));
  };
  box.append(frame(portraitSrc(c), "portrait"));
  c.look.references.forEach((r, i) => box.append(frame(pictureSrc(r), `picture ${i + 2}`, () => {
    const now = card();
    replaceCard({ ...now, look: { ...now.look, references: now.look.references.filter((_, j) => j !== i) } });
    renderRefs(card());
    picturesChanged();
  })));
  $("#ref-add").disabled = c.look.references.length >= C.MAX_REFERENCES;
  renderMakers();
}
async function addReference(file) {
  const c = card();
  if (!c || c.plain) return;
  try {
    const pic = await shrinkImage(file, 768);
    const now = card();
    replaceCard({ ...now, look: { ...now.look, references: [...now.look.references, pic].slice(0, C.MAX_REFERENCES) } });
    renderRefs(card());
    picturesChanged();
  } catch { toast("That picture didn't load."); }
}
/** a photo or clip being asked for is made from the pictures as they are now: its panel catches up */
function picturesChanged() {
  const a = S.ask;
  if (!a || a.busy) return;
  const c = S.cards.find((x) => x.id === a.card);
  renderAsk();
  if (c && refsOf(c).length && !a.shot) writeShot();
}

/** how they sound: the voice model (from the picker), the voice, the mood, the speed */
function renderSpeech() {
  const c = card();
  if (!c || c.plain) return;
  const vm = voiceModel(c), p = $("#speech-model");
  p.textContent = "";
  p.append("voice model: ", linkish(vm ? vm.name : S.listErr.tts ? "unavailable" : "…", () => openModels("voice"), { "aria-label": "Change the voice model" }),
    vm && vm.perMChars != null ? ` · ${A.usd(vm.perMChars)} a million characters, about ${A.usd(A.voicePrice(vm, 200))} a reply` : "");
  const sel = $("#speech-voice"), voices = vm ? vm.voices : [], cur = vm ? voiceOf(c, vm) : c.speech.voice;
  sel.textContent = "";
  for (const v of voices.length ? voices : [cur || A.DEFAULT_VOICE]) sel.append(h("option", { value: v, text: v }));
  sel.value = cur || sel.options[0].value;
  $("#speech-on").checked = !!S.voiceOn[c.id];
}
function setOwn(on) {
  S.ab.own = !!on;
  saveAb();
  renderTools();
  if ($("#abilitydlg").open) renderAbilities();
  toast(on ? `Characters act on their own now, within ${A.usd(S.ab.allowance)} a day.` : "Characters only do what you ask now.");
}
function setVoiceNotes(c, on) {
  if (on) S.voiceOn[c.id] = true; else delete S.voiceOn[c.id];
  local.set(K.voiceOn, S.voiceOn);
  renderTools();
  if ($("#speech-on")) $("#speech-on").checked = !!S.voiceOn[(card() || {}).id];
  if ($("#abilitydlg").open) renderAbilities();
  loadList("tts");
}
async function hearSample() {
  const c = card();
  if (!c || c.plain) return;
  if (!S.key) return needKey("voice notes need your venice key.");
  const st = $("#speech-status"), btn = $("#speech-sample");
  st.textContent = "recording a sample…";
  st.classList.remove("bad");
  btn.disabled = true;
  try {
    const hello = c.greeting ? C.splitBubbles(C.fill(c.greeting, c, "you")).join(" ") : `Hi, I'm ${c.name}.${c.tagline ? " " + c.tagline : ""}`;
    const v = await makeVoice(c, hello);
    const a = audioEl(v.id);
    st.textContent = "";
    st.append(a, ` ${v.voice}${v.price != null ? " · " + A.usd(v.price) : ""}`);
    a.addEventListener("loadeddata", () => { a.play().catch(() => {}); }, { once: true });
    balanceSoon();
  } catch (e) { st.textContent = e.message; st.classList.add("bad"); } finally { btn.disabled = false; }
}

function itemRow(fields, values) {
  const li = h("li");
  for (const [k, label, multi] of fields) {
    const input = multi ? h("textarea", { rows: 2, "data-k": k }) : h("input", { "data-k": k });
    input.value = values[k] || "";
    li.append(h("label", {}, label, input));
  }
  li.append(h("button", { type: "button", class: "btn small rm", text: "REMOVE", onclick: () => { li.remove(); saveSheet(); } }));
  return li;
}
const FLOW_FIELDS = [["stage", "STAGE"], ["goal", "GOAL", true], ["next", "MOVE ON WHEN"]];
const EX_FIELDS = [["user", "THEY SAY"], ["character", "CHARACTER REPLIES", true]];
function renderFlow(c) { const ol = $("#flow"); ol.textContent = ""; for (const s of c.flow) ol.append(itemRow(FLOW_FIELDS, s)); }
function renderExamples(c) { const ol = $("#examples"); ol.textContent = ""; for (const e of c.examples) ol.append(itemRow(EX_FIELDS, e)); }
function renderLineage(c) {
  const ul = $("#lineage");
  ul.textContent = "";
  for (const l of c.lineage) {
    const url = C.refUrl(l.ref);
    const li = h("li", {}, url ? h("a", { href: url, target: "_blank", rel: "noopener", text: C.creditLine(l) }) : C.creditLine(l));
    if (l.at || l.note) li.append(h("span", { class: "why", text: ` (${[l.at, l.note].filter(Boolean).join(", ")})` }));
    ul.append(li);
  }
}

function readSheet() {
  const c = card(), f = $("#sheet");
  const rows = (sel, keys) => $$(sel + " > li").map((li) => Object.fromEntries(keys.map((k) => [k, $(`[data-k="${k}"]`, li).value])));
  return C.normalizeCard({
    ...c, id: c.id, name: f.name.value, tagline: f.tagline.value, greeting: f.greeting.value, persona: f.persona.value,
    voice: { short_form: f.short_form.checked, notes: f.voice_notes.value }, tags: f.tags.value.split(","),
    model: f.model.value, license: f.license.value, creator: f.creator.value,
    flow: rows("#flow", ["stage", "goal", "next"]), examples: rows("#examples", ["user", "character"]),
    look: { description: f.look_description.value, references: c.look.references },
    speech: { model: c.speech.model, voice: f.speech_voice.value || c.speech.voice, mood: f.speech_mood.value, speed: Number(f.speech_speed.value) || c.speech.speed },
  });
}
let sheetTimer = 0;
function saveSheet() {
  const c = card();
  if (!c) return;
  replaceCard(readSheet());
  clearTimeout(sheetTimer);
  sheetTimer = setTimeout(() => {
    const now = card();
    if (!now) return;
    renderRoster();
    renderThreads();
    $("#who-name").textContent = now.name;
    renderChatMeta();
    $("#card-h").textContent = "CARD: " + now.name.toUpperCase();
    $("#rx-from").textContent = now.name;
  }, 120);
}

/** a picture as a data: URI, no bigger than size on its long side (an SVG portrait stays an SVG) */
async function shrinkImage(file, size = 512, type = "image/webp", { svg = true } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (svg && file.type === "image/svg+xml") {
      const text = await file.text();
      if (text.length < 120000) return "data:image/svg+xml;base64," + C.b64encodeUtf8(text);
    }
    const s = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = h("canvas", { width: Math.max(1, Math.round(img.naturalWidth * s)), height: Math.max(1, Math.round(img.naturalHeight * s)) });
    const g = cv.getContext("2d");
    if (type === "image/jpeg") { g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); }
    g.drawImage(img, 0, 0, cv.width, cv.height);
    const out = cv.toDataURL(type, 0.86);
    return out.startsWith("data:" + type) ? out : cv.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}
function dataBlob(dataUrl) {
  const [head, b64] = dataUrl.split(",");
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: (head.match(/^data:([^;]+)/) || [])[1] || "application/octet-stream" });
}

function setTab(name) {
  for (const t of ["edit", "remix", "export"]) {
    $(`#t-${t}`).setAttribute("aria-selected", t === name ? "true" : "false");
    $(`#t-${t}`).tabIndex = t === name ? 0 : -1;
    $(`#p-${t}`).hidden = t !== name;
  }
  if (name === "remix") resetRemix();
}

// ---------- the key ----------
function updateKeyUI() {
  const on = !!S.key;
  $("#keyin").placeholder = !on ? "paste it here" : S.keyRemembered ? "saved on this device" : "saved for this tab";
  $("#keyin").title = on ? "Paste a new key here to replace this one" : "";
  $("#keyforget").hidden = !on;
  $("#keyremember").checked = on ? S.keyRemembered : $("#keyremember").checked;
}
let keyTimer = 0;
/** a word about the key, where the fine print sits; good news steps aside after a few seconds */
function keyStatus(text, bad = false, ok = false) {
  const s = $("#keystatus");
  clearTimeout(keyTimer);
  s.textContent = text;
  s.classList.toggle("bad", bad);
  s.classList.toggle("ok", ok);
  if (ok) keyTimer = setTimeout(() => { s.textContent = ""; s.classList.remove("ok"); }, 6000);
}
function needKey(why) {
  keyStatus(why, true);
  $("#keyform").scrollIntoView({ behavior: motion(), block: "nearest" });
  $("#keyin").focus({ preventScroll: true });
}
function storeKey() {
  local.del(K.key); session.del(K.key);
  if (S.key) (S.keyRemembered ? local : session).set(K.key, S.key);
}
async function saveKey(ev) {
  ev.preventDefault();
  const k = $("#keyin").value.trim();
  if (!k) { keyStatus(S.key ? "the key is saved already." : "paste a key first.", !S.key); return; }
  keyStatus("checking the key with venice…");
  $("#keysave").disabled = true;
  try {
    await new Venice(k).characters({ limit: 1 });
  } catch (e) {
    keyStatus(e.message, true);
    return;
  } finally { $("#keysave").disabled = false; }
  S.key = k;
  S.keyRemembered = $("#keyremember").checked;
  storeKey();
  $("#keyin").value = "";
  updateKeyUI();
  keyStatus(S.keyRemembered ? "saved on this device." : "saved for this tab.", false, true);
  renderChat();
  resetRemix();
  session.del(K.pages);                                     // a new key: Venice is asked afresh
  loadVenice(0);
  loadBalance();
  resumeJobs();
  comingBack();
}
function forgetKey() {
  for (const ctrl of S.busy.values()) ctrl.abort();         // every reply on its way stops
  S.busy.clear();
  for (const t of Object.values(S.threads)) done(t);
  if (S.rec) stopRecording(true);
  S.ask = null;
  S.key = "";
  S.keyRemembered = false;
  storeKey();
  S.v.list = [];
  S.v.more = false;
  S.v.offset = 0;
  session.del(K.pages);
  tiles.clear();
  $("#keyremember").checked = false;
  updateKeyUI();
  keyStatus("forgotten.", false, true);
  $("#balance").hidden = true;
  renderGrid();
  renderChat();
  resetRemix();
}

// ---------- import ----------
async function importFile(file) {
  const st = $("#impstatus");
  try {
    if (file.size > 12 * 1024 * 1024) throw new Error("That file is too big for a character card.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { card: c, kind } = C.fromAny(bytes);
    if (kind === "png card" && !c.portrait) {
      try { c.portrait = await shrinkImage(file, 320); } catch { /* no portrait then */ }
    }
    if ($("#importdlg").open) $("#importdlg").close();
    const added = addCard(c);
    toast(`${added.name} arrived (${kind}).`);
  } catch (e) {
    if ($("#importdlg").open) { st.textContent = e.message; st.classList.add("bad"); } else toast(e.message);
  }
}
function importText() {
  const st = $("#impstatus");
  try {
    const { card: c, kind } = C.fromAny($("#paste").value);
    $("#paste").value = "";
    $("#importdlg").close();
    const added = addCard(c);
    openCard("edit");
    toast(`${added.name} arrived (${kind}). Check their card.`);
  } catch (e) { st.textContent = e.message; st.classList.add("bad"); }
}

// ---------- remix with credit ----------
function reveal(el) { el.scrollIntoView({ behavior: motion(), block: "nearest" }); }
function rxStatus(text, bad = false) { const s = $("#rx-status"); s.textContent = text; s.classList.toggle("bad", bad); }
function resetRemix() {
  const c = card();
  S.rx = { ideas: null, draft: null, check: null, source: null, busy: false };
  $("#rx-from").textContent = c ? c.name : "a character";
  $("#rx-ideas").hidden = true;
  $("#rx-ideas").textContent = "";
  $("#rx-twist-label").hidden = true;
  $("#rx-write").hidden = true;
  $("#rx-draft").hidden = true;
  $("#rx-draft").textContent = "";
  $("#rx-distill").disabled = !c;
  rxStatus(S.key ? "" : "Remix needs your Venice key: it makes two short model calls (a few more for a Venice character).");
  const r = $("#rx-rights");
  const msgs = [];
  if (c && c.engine.venice_character) msgs.push(`Havre can't see ${c.name}'s prompt, so it asks ${c.name} a few short questions through Venice and distills the answers.`);
  if (c && c.license === "all-rights-reserved") msgs.push(`${c.creator || "Their creator"} reserves the rights to ${c.name}. Remix still takes only ideas, writes new words, checks them, and keeps the credit.`);
  r.hidden = !msgs.length;
  r.textContent = msgs.join(" ");
}
function rxBusy(on) {
  S.rx.busy = on;
  for (const b of ["#rx-distill", "#rx-write"]) $(b).disabled = on;
  for (const b of $$("#rx-draft button")) b.disabled = on;
}
async function rxSource(c) {
  const pasted = $("#rx-paste").value.trim();
  if (pasted) {
    const { card: pc } = C.fromAny(pasted);
    return { name: pc.name === "Pasted character" ? "" : pc.name, creator: "", ref: "sha256:" + (await C.sha256Hex(pasted)).slice(0, 32), text: pasted };
  }
  if (c.engine.venice_character) {
    const v = new Venice(S.key), hist = [];
    let transcript = "";
    for (let i = 0; i < C.INTERVIEW.length; i++) {
      rxStatus(`Asking ${c.name} question ${i + 1} of ${C.INTERVIEW.length}…`);
      hist.push({ role: "user", content: C.INTERVIEW[i] });
      const r = await v.chat({ model: c.model || S.model, messages: hist, characterSlug: c.engine.venice_character, maxTokens: 300 });
      const a = C.stripThinking(r.text);
      hist.push({ role: "assistant", content: a });
      transcript += `Q: ${C.INTERVIEW[i]}\nA: ${a}\n\n`;
    }
    return { name: c.name, creator: c.creator, ref: "venice:" + c.engine.venice_character, text: transcript };
  }
  const text = C.cardText(c);
  const own = c.lineage.find((l) => l.relation === "ported-from" && l.ref);
  return { name: c.name, creator: c.creator, ref: own ? own.ref : "sha256:" + (await C.sha256Hex(text)).slice(0, 32), text };
}
async function distill() {
  const c = card();
  if (!c || c.plain || S.rx.busy) return;
  if (!S.key) return needKey("remix needs your venice key.");
  rxBusy(true);
  try {
    S.rx.source = await rxSource(c);
    rxStatus("Distilling the ideas…");
    const r = await new Venice(S.key).chat({ model: c.model || S.model, messages: C.distillMessages(S.rx.source.text),
      schema: C.DISTILL_SCHEMA, maxTokens: 900, temperature: 0.4 });
    S.rx.ideas = C.normalizeDistillate(C.parseJsonLoose(r.text));
    renderIdeas();
    $("#rx-twist-label").hidden = false;
    $("#rx-write").hidden = false;
    reveal($("#rx-ideas"));
    rxStatus("These are the ideas, in other words. Remove what you don't want, add your own, then write.");
  } catch (e) { rxStatus(e.message, true); } finally { rxBusy(false); }
}
const IDEA_LABELS = { archetype: "ARCHETYPE", premise: "PREMISE", setting: "SETTING", drives: "DRIVES", fears: "FEARS", voice: "VOICE",
  quirks: "QUIRKS", relationships: "RELATIONSHIPS", boundaries: "WON'T", themes: "THEMES" };
const ideaName = (k) => IDEA_LABELS[k].charAt(0) + IDEA_LABELS[k].slice(1).toLowerCase();
function renderIdeas() {
  const box = $("#rx-ideas");
  box.textContent = "";
  box.hidden = false;
  for (const k of C.DISTILL_KEYS) {
    const v = S.rx.ideas[k];
    const grp = h("div", { class: "grp" }, h("h4", { text: IDEA_LABELS[k] }));
    if (typeof v === "string") {
      const input = h("input", { "aria-label": ideaName(k) });
      input.value = v;
      input.addEventListener("input", () => { S.rx.ideas[k] = input.value; });
      grp.append(input);
    } else {
      v.forEach((item, i) => grp.append(h("span", { class: "chip" }, h("span", { text: item }),
        h("button", { type: "button", "aria-label": `Remove ${item}`, text: "×", onclick: () => { S.rx.ideas[k].splice(i, 1); renderIdeas(); } }))));
      const add = h("input", { placeholder: "+ add", "aria-label": `Add to ${ideaName(k)}`, maxlength: 80 });
      add.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); const t = add.value.trim(); if (t) { S.rx.ideas[k].push(t); renderIdeas(); $(`#rx-ideas [aria-label="Add to ${ideaName(k)}"]`).focus(); } }
      });
      grp.append(h("span", { class: "chip add" }, add));
    }
    box.append(grp);
  }
}
async function writeFresh(avoid = []) {
  const c = card();
  if (!c || !S.rx.ideas || S.rx.busy) return;
  rxBusy(true);
  rxStatus(avoid.length ? "Rewriting, steering clear of what was shared…" : "Writing someone new…");
  try {
    const model = c.model || S.model;
    const r = await new Venice(S.key).chat({ model, messages: C.writeMessages(S.rx.ideas, $("#rx-twist").value, avoid),
      schema: C.WRITE_SCHEMA, maxTokens: 1500, temperature: 0.95 });
    const o = C.parseJsonLoose(r.text);
    const first = C.cardFromWrite(o, { model });
    const src = S.rx.source;
    const check = C.similarity(C.cardText(first), src.text, { names: [src.name].filter(Boolean), newName: first.name });
    S.rx.draft = C.cardFromWrite(o, { source: src.name || src.ref ? src : null, check, model });
    S.rx.check = check;
    renderDraft();
    reveal($("#rx-draft"));
    rxStatus("");
  } catch (e) { rxStatus(e.message, true); } finally { rxBusy(false); }
}
const VERDICT = { fresh: "FRESH: the words are its own", close: "CLOSE: some phrasing is shared", "too-close": "TOO CLOSE: rewrite before keeping it" };
function renderDraft() {
  const d = S.rx.draft, chk = S.rx.check, box = $("#rx-draft");
  box.textContent = "";
  box.hidden = false;
  const pct = Math.round(chk.share * 1000) / 10;
  box.append(h("h4", { text: d.name }), h("p", { class: "tagline", text: d.tagline }),
    h("p", { class: "persona", text: d.persona }),
    h("span", { class: `verdict ${chk.verdict}`, text: VERDICT[chk.verdict] }),
    h("p", { class: "mono", text: `${pct}% of its five-word phrases appear in the source; the longest shared run is ${chk.run.len} words.` }));
  if (chk.reasons.length) box.append(h("ul", { class: "why-list" }, chk.reasons.map((r) => h("li", { text: r }))));
  if (d.lineage[0]) box.append(h("p", { class: "mono", text: "lineage: " + C.creditLine(d.lineage[0]) + "." }));
  const row = h("div", { class: "acts" });
  const keep = h("button", { type: "button", class: "btn solid small", text: "KEEP IN HARBOR", onclick: keepDraft });
  if (chk.verdict === "too-close") keep.disabled = true;
  row.append(keep);
  if (chk.verdict !== "fresh") row.append(h("button", { type: "button", class: "btn small", text: "REWRITE, AVOIDING THESE",
    onclick: () => writeFresh(C.avoidList(chk, [S.rx.source.name])) }));
  row.append(h("button", { type: "button", class: "btn small", text: "WRITE ANOTHER", onclick: () => writeFresh() }));
  box.append(row);
}
function keepDraft() {
  const d = S.rx.draft;
  if (!d || S.rx.check.verdict === "too-close") return;
  const from = card();
  const c = addCard(d);
  toast(`${c.name} joined the harbor${from ? ", inspired by " + from.name : ""}.`);
  setTab("edit");
}

// ---------- export ----------
function absolute(c) {
  const p = c.portrait;
  return p && !/^(data:|https?:)/.test(p) ? { ...c, portrait: new URL(p, location.href).href } : c;
}
function download(name, data, type) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
/** words that fit a width, on at most `lines` lines; a line is cut with … where something didn't fit */
function wrap(g, text, width, lines) {
  const words = String(text).split(/\s+/).filter(Boolean), out = [];
  let i = 0;
  while (i < words.length && out.length < lines) {
    let cur = words[i++];
    while (i < words.length && g.measureText(cur + " " + words[i]).width <= width) cur += " " + words[i++];
    out.push(cur);
  }
  const more = i < words.length;
  return out.map((l, n) => {
    let s = l, cut = more && n === out.length - 1;
    while (s.length > 1 && g.measureText(s + (cut ? "…" : "")).width > width) { s = s.slice(0, -1); cut = true; }
    return cut ? s.trimEnd() + "…" : s;
  });
}
async function cardPng(c) {
  // the card as a picture, set like the page: a black band, the portrait in a frame, the name, the address
  const W = 512, H = 768, M = 24, side = W - 2 * M, cv = h("canvas", { width: W, height: H }), g = cv.getContext("2d");
  const SERIF = '"Times New Roman", Times, "Liberation Serif", serif', MONO = '"Courier New", Courier, "Liberation Mono", monospace';
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#000"; g.fillRect(0, 0, W, 52);
  g.fillStyle = "#fff"; g.font = `700 16px ${MONO}`; g.textBaseline = "middle";
  g.textAlign = "left"; g.fillText("HAVRE CARD", M, 27);
  g.textAlign = "right"; g.fillText((C.LICENSES[c.license] || "").toUpperCase(), W - M, 27);
  g.textAlign = "left";
  const x = M, y = 52 + M;
  const src = portraitSrc(c);
  let drew = false;
  if (src && !/^https:/.test(src)) {          // a Venice photo would taint the canvas, so it stays a frame
    try {
      const img = new Image(); img.src = src; await img.decode();
      const s = Math.max(side / img.naturalWidth, side / img.naturalHeight);
      g.save(); g.beginPath(); g.rect(x, y, side, side); g.clip();
      g.drawImage(img, x + side / 2 - (img.naturalWidth * s) / 2, y + side / 2 - (img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
      g.restore();
      drew = true;
    } catch { /* an empty frame then */ }
  }
  g.strokeStyle = "#000";
  if (!drew) { g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + side, y + side); g.moveTo(x + side, y); g.lineTo(x, y + side); g.stroke(); }
  g.lineWidth = 2; g.strokeRect(x + 1, y + 1, side - 2, side - 2);
  g.fillStyle = "#000"; g.textBaseline = "alphabetic";
  const name = c.name.toUpperCase();
  let size = 52;
  g.font = `700 ${size}px ${SERIF}`;
  while (g.measureText(name).width > side && size > 26) { size -= 2; g.font = `700 ${size}px ${SERIF}`; }
  const base = y + side + 22 + Math.round(size * 0.78);
  g.fillText(wrap(g, name, side, 1)[0] || "", x, base);
  g.font = `20px ${SERIF}`;
  wrap(g, c.tagline || "", side, 2).forEach((ln, i) => g.fillText(ln, x, base + 32 + i * 25));
  g.fillRect(M, H - 46, side, 2);
  g.font = `15px ${MONO}`;
  g.fillText("havre.yolopreneur.lol", M, H - 19);
  g.textAlign = "right"; g.fillText("havre: " + C.HAVRE, W - M, H - 19);
  const blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't draw the card."))), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}
async function exportAs(kind) {
  const c = card();
  if (!c) return;
  const abs = absolute(c);
  try {
    if (kind === "havre") download(C.fileName(c, "havre.json"), JSON.stringify(abs, null, 1) + "\n", "application/json");
    else if (kind === "v3") download(C.fileName(c, "card.json"), JSON.stringify(C.toCharacterCardV3(abs), null, 1) + "\n", "application/json");
    else if (kind === "prompt") download(C.fileName(c, "txt"), C.systemPrompt(c) + "\n", "text/plain");
    else if (kind === "png") download(C.fileName(c, "png"), new Blob([C.toPngCard(await cardPng(c), abs)], { type: "image/png" }), "image/png");
    toast("Made in your browser. Nothing was uploaded.");
  } catch (e) { toast(e.message); }
}

// ---------- small things ----------
function growSay() { const say = $("#say"); say.style.height = "auto"; say.style.height = Math.min(150, say.scrollHeight + 2) + "px"; }
/** wait for the reply on its way in the chat on screen, before saying the next thing there */
async function idle() { while (thread() && S.busy.has(thread().id)) await sleep(150); }
/** nothing on its way anywhere: no reply, no photo, no voice note, no recording */
const quiet = () => !S.busy.size && !S.moving.size && !(S.ask && S.ask.busy) && !S.rec && !S.inflight;
/** nothing on its way in the chat on screen */
const quietHere = () => { const t = thread(); return !(t && (S.busy.has(t.id) || S.doing.has(t.id))) && !S.rec; };
const waiting = new Map();
let waitingOn = false;
/** run fn as soon as ready() (once per name; the last fn given for a name is the one run) */
function whenIdle(name, fn, ready = quiet) {
  waiting.set(name, { fn, ready });
  if (waitingOn) return;
  waitingOn = true;
  (async () => {
    try {
      while (waiting.size) {
        for (const [k, w] of [...waiting]) if (w.ready()) { waiting.delete(k); w.fn(); }
        if (waiting.size) await sleep(500);
      }
    } finally { waitingOn = false; }
  })();
}
/** clips another tab started (followed here too, by one tab at a time) or finished (gone here too) */
function syncJobs() {
  const home = new Set(local.get(K.jobsDone, []) || []);
  for (const j of local.get(K.jobs, []) || []) {
    if (j && j.queueId && !home.has(j.queueId) && !S.jobs.some((x) => x.queueId === j.queueId)) { S.jobs.push(j); if (S.key) pollJob(j); }
  }
  S.jobs = S.jobs.filter((x) => !home.has(x.queueId));
  renderJobs();
}
async function copyFrom(id, btn) {
  const pre = document.getElementById(id);
  let ok = false;
  try { await navigator.clipboard.writeText(pre.textContent); ok = true; } catch {
    const r = document.createRange(); r.selectNodeContents(pre);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    try { ok = document.execCommand("copy"); } catch { ok = false; }
  }
  const was = btn.dataset.label || btn.textContent;
  btn.dataset.label = was;
  btn.textContent = ok ? "COPIED" : "SELECTED: PRESS ⌘C OR CTRL+C";
  setTimeout(() => { btn.textContent = was; }, 2200);
}
let toastTimer = 0;
function toast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3600);
}

// ---------- wiring ----------
function bind() {
  $("#agent-prompt").textContent = C.agentPrompt("a retired lighthouse engineer who explains how things work with tiny drawings, and says so when they don't know.");
  for (const b of $$("button.copy")) b.addEventListener("click", () => copyFrom(b.dataset.copy, b));

  const say = $("#say");
  $("#composer").addEventListener("submit", (e) => {
    e.preventDefault();
    const t = say.value;
    if (!t.trim() || (thread() && S.busy.has(thread().id))) return;
    say.value = "";
    growSay();
    send(t);
  });
  say.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#composer").requestSubmit(); } });
  say.addEventListener("input", growSay);
  $("#photo-in").addEventListener("change", () => { const pf = $("#photo-in").files[0]; $("#photo-in").value = ""; if (pf) sendPhoto(pf); });
  $("#abclose").addEventListener("click", () => $("#abilitydlg").close());
  $("#abform").addEventListener("submit", (e) => e.preventDefault());

  $("#keyform").addEventListener("submit", saveKey);
  $("#keyforget").addEventListener("click", forgetKey);
  $("#keyremember").addEventListener("change", () => {
    if (!S.key) return;
    S.keyRemembered = $("#keyremember").checked;
    storeKey();
    updateKeyUI();
    keyStatus(S.keyRemembered ? "kept on this device." : "kept for this tab only.", false, true);
  });

  $("#vsearch").value = S.v.query;
  $("#vsort").value = S.v.sort;
  $("#venform").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!S.key) return needKey("paste your venice key first.");
    const q = $("#vsearch").value.trim(), again = q === S.v.query;
    S.v.query = q;
    loadVenice(0, { fresh: again });                        // the same search again asks Venice afresh
  });
  $("#vsort").addEventListener("change", () => {
    S.v.sort = $("#vsort").value;
    local.set(K.sort, S.v.sort);
    if (S.key) loadVenice(0);
  });
  $("#vadult").checked = S.v.adult;
  $("#vadult").addEventListener("change", () => {
    const box = $("#vadult");
    if (box.checked && !local.get(K.adult18, false)) {
      if (!confirm("Adult characters are for people 18 or older.\n\nAre you 18 or older?")) { box.checked = false; return; }
      local.set(K.adult18, true);
    }
    S.v.adult = box.checked;
    local.set(K.adult, S.v.adult);
    if (S.key) loadVenice(0);
  });
  $("#plain").addEventListener("click", () => selectCard(PLAIN, { talk: true }));
  $("#msearch").addEventListener("input", renderModels);
  $("#modelform").addEventListener("submit", (e) => e.preventDefault());       // Enter in the search box keeps it open
  $("#mclose").addEventListener("click", () => $("#modeldlg").close());
  $("#vprev").addEventListener("click", () => loadVenice(Math.max(0, S.v.offset - PAGE), { paging: true }));
  $("#vnext").addEventListener("click", () => loadVenice(S.v.offset + PAGE, { paging: true }));

  $("#new").addEventListener("click", () => {
    addCard({ name: "New character", persona: "", greeting: "", voice: { short_form: true }, model: S.model, license: "remix-with-credit" });
    openCard("edit");
    const n = $("#sheet").name; n.focus({ preventScroll: true }); n.select();
  });
  $("#import").addEventListener("click", () => { $("#impstatus").textContent = ""; $("#impstatus").classList.remove("bad"); $("#importdlg").showModal(); });
  $("#impcancel").addEventListener("click", () => $("#importdlg").close());
  $("#imp-paste").addEventListener("click", importText);
  const drop = $("#drop"), file = $("#file");
  drop.addEventListener("click", () => file.click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } });
  file.addEventListener("change", () => { if (file.files[0]) importFile(file.files[0]); file.value = ""; });
  for (const el of [drop, $("#studio"), $("#harbor")]) {
    el.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); drop.classList.add("over"); } });
    el.addEventListener("dragleave", () => drop.classList.remove("over"));
    el.addEventListener("drop", (e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); drop.classList.remove("over"); importFile(e.dataTransfer.files[0]); });
  }

  const f = $("#sheet");
  for (const ev of ["focus", "pointerdown"]) $("#model-select").addEventListener(ev, loadModels, { once: true });
  f.addEventListener("input", saveSheet);
  f.addEventListener("change", saveSheet);
  f.addEventListener("submit", (e) => e.preventDefault());
  $("#flow-add").addEventListener("click", () => { $("#flow").append(itemRow(FLOW_FIELDS, {})); $("#flow-group").open = true; $("#flow > li:last-child input").focus(); });
  $("#ex-add").addEventListener("click", () => { $("#examples").append(itemRow(EX_FIELDS, {})); $("#ex-group").open = true; $("#examples > li:last-child input").focus(); });
  $("#portrait-pick").addEventListener("click", () => $("#portrait-file").click());
  $("#portrait-file").addEventListener("change", async () => {
    const pf = $("#portrait-file").files[0];
    $("#portrait-file").value = "";
    if (!pf) return;
    try { const c = card(); replaceCard({ ...c, portrait: await shrinkImage(pf) }); renderSheet(); renderThreads(); picturesChanged(); }
    catch { toast("That image didn't load."); }
  });
  $("#portrait-clear").addEventListener("click", () => {
    const c = card();
    if (!c) return;
    replaceCard({ ...c, portrait: "" });
    renderSheet(); renderThreads(); picturesChanged();
  });
  $("#ref-add").addEventListener("click", () => {
    if (!local.get(K.refOk, false)) {
      if (!confirm("Photos and clips of a character are made from their pictures. Add only pictures of the character: art, or pictures you made. Never a photo of a real person.\n\nAdd a picture of the character?")) return;
      local.set(K.refOk, true);
    }
    $("#ref-file").click();
  });
  $("#ref-file").addEventListener("change", () => { const rf = $("#ref-file").files[0]; $("#ref-file").value = ""; if (rf) addReference(rf); });
  $("#portrait-make").addEventListener("click", () => makePicture("portrait"));
  $("#ref-make").addEventListener("click", () => makePicture());
  $("#speech-sample").addEventListener("click", hearSample);
  $("#speech-group").addEventListener("toggle", () => { if ($("#speech-group").open) loadList("tts"); });
  $("#speech-on").addEventListener("change", (e) => { e.stopPropagation(); const c = card(); if (c && !c.plain) setVoiceNotes(c, $("#speech-on").checked); });
  $("#delete").addEventListener("click", () => {
    const c = card();
    if (!c || !confirm(`Remove ${c.name} from your harbor? Your chats with them go too. Export them first if you want to keep a copy.`)) return;
    for (const t of threadsOf(c.id)) dropThread(t.id);                       // their chats go with them
    S.cards = S.cards.filter((x) => x.id !== c.id);
    for (const j of S.jobs.filter((x) => x.card === c.id)) dropJob(j);         // and their clips on the way
    if (S.voiceOn[c.id]) { delete S.voiceOn[c.id]; local.set(K.voiceOn, S.voiceOn); }
    if (S.ask && S.ask.card === c.id) S.ask = null;
    S.sel = S.cards[0] ? S.cards[0].id : "";
    S.open = S.sel ? (latestOf(S.sel) || {}).id || null : null;
    local.set(K.open, S.open);
    persistCards(true);
    renderAll();
  });

  const tabs = $$('.tabs [role="tab"]');
  for (const t of tabs) {
    t.addEventListener("click", () => setTab(t.id.slice(2)));
    t.addEventListener("keydown", (e) => {
      const i = tabs.indexOf(t), j = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i + tabs.length - 1) % tabs.length : -1;
      if (j >= 0) { e.preventDefault(); tabs[j].focus(); setTab(tabs[j].id.slice(2)); }
    });
  }

  $("#rx-distill").addEventListener("click", distill);
  $("#rx-write").addEventListener("click", () => writeFresh());
  for (const b of $$("[data-out]")) b.addEventListener("click", () => exportAs(b.dataset.out));

  // your chats, and the left column's two tabs
  const left = [$("#lt-chats"), $("#lt-chars")];
  for (const t of left) {
    t.addEventListener("click", () => setLeft(t.id === "lt-chats" ? "chats" : "chars"));
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      setLeft(t.id === "lt-chats" ? "chars" : "chats", { focus: true });
    });
  }
  // coming back to the tab: what's on screen has been seen, and after a while away, characters text first
  document.addEventListener("visibilitychange", () => {
    if (!seen()) return;
    markRead(thread());
    renderThreads();
    comingBack();
  });
  setInterval(() => { if (seen()) renderThreads(); }, 60000);   // "3m" becomes "4m"

  // another tab changed something: catch up, once nothing is on its way here (a reload mid-photo would waste it)
  addEventListener("storage", (e) => {
    if (e.key === K.cards || e.key === K.key) whenIdle("reload", () => location.reload());
    else if (e.key === K.threads || e.key === K.gone) {
      if (syncIndex()) renderThreads();
      if (S.shown !== S.open) { renderChat(); markTiles(); renderRoster(); }   // the chat on screen was deleted
    }
    else if (e.key && e.key.startsWith(K.msgs)) {
      const t = S.threads[e.key.slice(K.msgs.length)], kept = t && readMsgs(t.id);
      if (!kept || !T.mergeMessages(t.msgs, kept.msgs, takenBack)) return;
      if (here(t)) { markRead(t); whenIdle("log", renderLog, quietHere); }
      renderThreads();
    }
    else if (e.key === K.chats && e.newValue) { if (fromV1()) { saveIndex(); renderThreads(); } }    // a tab still on the first page
    else if (e.key === K.jobs || e.key === K.jobsDone) syncJobs();
    else if (e.key === K.spent) { renderTools(); if ($("#abilitydlg").open) renderAbilities(); }
    else if (e.key === K.ab) {
      S.ab = { ...S.ab, ...(local.get(K.ab, {}) || {}) };
      renderTools();
      if (S.ask && !S.ask.busy) { if (S.ask.kind === "clip") { S.ask.opts = A.clipOptions(clipModel(), S.ab.clip); requote(); } renderAsk(); }
    }
  });
}

boot();
