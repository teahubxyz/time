// app.js: Havre. Everything runs in this page. The only address it talks to is api.venice.ai, with the visitor's own
// key, and the page's security policy enforces that.
import * as C from "./card.js";
import { Venice } from "./venice.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);
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
const K = { cards: "havre.cards.v1", chats: "havre.chats.v1", sel: "havre.selected", key: "havre.key", model: "havre.model",
  sort: "havre.vsort", seeded: "havre.seeded.v1" };
const PAGE = 24;
const SORTS = ["featured", "imports", "highestRating", "mostRecent"];
// what a character hears when they speak first; it stays out of the conversation on screen
const OPENER = "[Start the conversation: someone new just came to talk to you. Say hello in character, in a line or two.]";

const S = {
  cards: [], sel: "", chats: {}, key: "", keyRemembered: false, model: C.DEFAULT_MODEL, models: null, replying: null,
  demo: {}, rx: null, v: { list: [], offset: 0, more: false, query: "", sort: "featured", loading: false, asked: 0 },
};
const card = () => S.cards.find((c) => c.id === S.sel) || S.cards[0] || null;

// ---------- boot ----------
function boot() {
  S.cards = (local.get(K.cards, []) || []).map((c) => { try { return C.normalizeCard(c); } catch { return null; } }).filter(Boolean);
  S.chats = local.get(K.chats, {}) || {};
  for (const [id, hist] of Object.entries(S.chats)) if (!Array.isArray(hist)) delete S.chats[id];
  S.sel = local.get(K.sel, "") || "";
  retireFirstCast();
  if (!S.cards.some((c) => c.id === S.sel)) S.sel = S.cards[0] ? S.cards[0].id : "";
  const kept = local.get(K.key, "");
  S.key = kept || session.get(K.key, "") || "";
  S.keyRemembered = !!kept;
  S.model = local.get(K.model, C.DEFAULT_MODEL) || C.DEFAULT_MODEL;
  const sort = local.get(K.sort, "featured");
  S.v.sort = SORTS.includes(sort) ? sort : "featured";
  bind();
  renderAll();
  if (S.key) loadVenice(0);
}

// The first version of Havre arrived with three characters of its own. This one has none, so they leave, unless
// someone has changed them since; and their drawings went with that version.
function retireFirstCast() {
  if (!local.get(K.seeded, false)) return;
  S.cards = S.cards.filter((c) => !(["maren", "taskmaster", "odile"].includes(c.id) && c.updated === c.created));
  for (const c of S.cards) if (/^art\//.test(c.portrait)) c.portrait = "";
  local.del(K.seeded);
  if (!S.cards.some((c) => c.id === S.sel)) S.sel = S.cards[0] ? S.cards[0].id : "";
  persistCards(true);
  persistChats();
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
function persistChats() {
  for (const id of Object.keys(S.chats)) {
    if (!S.cards.some((c) => c.id === id)) delete S.chats[id];
    else if (S.chats[id].length > 80) S.chats[id] = S.chats[id].slice(-80);
  }
  local.set(K.chats, S.chats);
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
function portraitSrc(c) {
  const p = (c && c.portrait) || "";
  if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml)[;,]/i.test(p)) return p;
  if (/^https:\/\/outerface\.venice\.ai\//.test(p)) return p;
  if (p.startsWith(C.SITE)) return p.slice(C.SITE.length);
  if (p && !/^[a-z][a-z0-9+.-]*:/i.test(p) && !p.startsWith("//")) return p;
  return "";
}
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
function renderAll() { renderGrid(); renderRoster(); renderChat(); renderCard(); updateKeyUI(); }

// Venice's characters, a page at a time; without a key, empty frames where they will be
function ghosts(n = 8) {
  return Array.from({ length: n }, () => h("li", { class: "ghost", "aria-hidden": "true" },
    h("span", { class: "tile" }, h("span", { class: "ph noface" }), h("span", { class: "tx" }))));
}
function renderGrid() {
  const ul = $("#vgrid");
  ul.textContent = "";
  const cur = card(), now = cur && cur.engine.venice_character;
  const showing = !!S.key && S.v.list.length > 0;
  if (!showing) ul.append(...ghosts());
  else for (const v of S.v.list) ul.append(tile(v, now));
  $("#vpager").hidden = !showing || (S.v.offset === 0 && !S.v.more);
  $("#vprev").disabled = S.v.offset === 0 || S.v.loading;
  $("#vnext").disabled = !S.v.more || S.v.loading;
  $("#vrange").textContent = showing ? `${S.v.offset + 1}–${S.v.offset + S.v.list.length}` : "";
  if (!S.key) vStatus("paste your venice key above and venice's characters show up here.");
}
function tile(v, now) {
  const here = S.cards.some((c) => c.engine.venice_character === v.slug), on = now === v.slug;
  const ph = h("span", { class: "ph" });
  paintFace(ph, v.photo);
  return h("li", {}, h("button", { type: "button", class: "tile", "aria-pressed": on ? "true" : "false", "data-slug": v.slug,
    "aria-label": `Talk to ${v.name}`, title: v.description ? v.description.slice(0, 300) : null, onclick: () => talkTo(v) },
  ph, h("span", { class: "tx" }, h("span", { class: "nm", text: v.name }),
    v.description ? h("span", { class: "ds", text: v.description }) : null,
    h("span", { class: "go", text: on ? "talking now" : here ? "talk again" : "talk" }))));
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

async function loadVenice(offset = 0, { paging = false } = {}) {
  if (!S.key) { renderGrid(); return; }
  const asked = ++S.v.asked;
  S.v.loading = true;
  vStatus("asking venice for characters…");
  renderGrid();
  try {
    const { list, more } = await new Venice(S.key).characterPage({ search: S.v.query, sort: S.v.sort, limit: PAGE, offset });
    if (asked !== S.v.asked) return;                      // a newer search is on its way
    Object.assign(S.v, { list, more, offset, loading: false });
    vStatus(list.length ? "" : S.v.query ? `nothing safe for work matched “${S.v.query}”.` : "venice sent back no characters.");
    renderGrid();
    if (paging) $("#chars").scrollIntoView({ behavior: motion(), block: "start" });
  } catch (e) {
    if (asked !== S.v.asked) return;
    S.v.loading = false;
    vStatus(e.message, true);
    renderGrid();
  }
}

function talkTo(v) {
  if (!S.key) return needKey("paste your venice key first.");
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

function selectCard(id, { talk = false, scroll = false } = {}) {
  if (S.replying) { S.replying.abort(); S.replying = null; setBusy(false); }
  S.sel = id;
  local.set(K.sel, id);
  markTiles(); renderRoster(); renderChat(); renderCard();
  if (!talk) return;
  if (scroll || narrow()) (narrow() ? $("#chat") : $("#studio")).scrollIntoView({ behavior: motion(), block: "start" });
  if (!narrow()) $("#say").focus({ preventScroll: true });
  speakFirst();
}

// a Venice character, or one of yours with no greeting written, says hello first
function speakFirst() {
  const c = card();
  if (!c || !S.key || S.replying || (S.chats[c.id] || []).length) return;
  if (c.engine.venice_character || (!c.greeting && c.persona)) send(OPENER, { hidden: true });
}

// ---------- the conversation ----------
function renderChat() {
  const c = card();
  $("#who-name").textContent = c ? c.name : "chat";
  renderChatMeta();
  const venice = !!(c && c.engine.venice_character);
  const locked = !c || (venice && !S.key);
  $("#say").disabled = locked;
  $("#sendbtn").disabled = locked || !!S.replying;
  $("#say").placeholder = c ? `say something to ${c.name}` : "say something";
  const kn = $("#keynote");
  kn.hidden = !c || !!S.key;
  kn.textContent = venice ? `paste your venice key above to talk to ${c.name}.`
    : "no key yet: replies come from the card's own examples. paste your venice key above to really talk.";
  renderLog();
}
function renderChatMeta() {
  const c = card(), meta = $("#who-meta");
  meta.textContent = "";
  if (!c) return;
  meta.append(...slashed([
    c.engine.venice_character ? "via venice, with their own prompt" : c.tagline,
    linkish("card", () => openCard("edit")),
    linkish("start over", startOver, { title: "Start this conversation over" }),
  ]));
}
function startOver() {
  const c = card();
  if (!c) return;
  if (S.replying) { S.replying.abort(); S.replying = null; setBusy(false); }
  delete S.chats[c.id];
  S.demo[c.id] = 0;
  persistChats();
  renderLog();
  speakFirst();
}

/** one line of the script: who says it, then what they say. kind: note, err, typing or suggest */
function line(text, who, kind = "") {
  const c = card();
  const name = who === "me" ? "you" : who === "havre" ? "havre" : c ? c.name : "";
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
  const log = $("#log"), c = card();
  log.textContent = "";
  if (!c) {
    put(line(S.key ? "pick one of venice's characters, or write your own. they talk here."
      : "paste your venice key above, then pick one of venice's characters. or write a character of your own, or import a card: those work without a key.", "havre", "note"));
    return;
  }
  const hist = S.chats[c.id] || [];
  if (c.engine.venice_character) {
    if (!hist.length) put(line(`${c.name} speaks through venice, with their own prompt.${S.key ? " say hello." : ""}`, "havre", "note"));
  } else if (c.greeting) for (const b of C.splitBubbles(C.fill(c.greeting, c, "you"))) put(line(b, "them"));
  for (const m of hist) {
    if (m.role === "user" && !m.hidden) put(line(m.content, "me"));
    else if (m.role === "assistant") for (const b of C.splitBubbles(m.content)) put(line(b, "them"));
  }
  const ideas = hist.some((m) => m.role === "user" && !m.hidden) ? [] : C.suggestions(c);
  if (ideas.length) {
    const row = line("", "havre", "suggest");
    row.querySelector(".who").textContent = "try";
    row.querySelector(".said").append(...ideas.map((t) => linkish(t, () => send(t))));
    put(row);
  }
  scrollLog();
}

function setBusy(on) {
  const c = card();
  $("#sendbtn").disabled = on || !c || !!(c.engine.venice_character && !S.key);
  $("#composer").setAttribute("aria-busy", on ? "true" : "false");
}

async function send(text, { hidden = false } = {}) {
  const c = card();
  text = text.trim();
  if (!text || !c || S.replying) return;
  const demo = !S.key;
  if (demo && hidden) return;
  const hist = (S.chats[c.id] = S.chats[c.id] || []);
  hist.push({ role: "user", content: text, ...(demo ? { demo: true } : {}), ...(hidden ? { hidden: true } : {}) });
  persistChats();
  for (const el of $$("#log .suggest, #log .note")) el.remove();
  if (!hidden) put(line(text, "me"));
  const ctrl = new AbortController();
  S.replying = ctrl;
  setBusy(true);
  const typing = put(line("is typing…", "them", "typing"));
  scrollLog();
  try {
    let reply;
    if (demo) {
      if (c.engine.venice_character) throw new Error(`${c.name} lives on Venice, so they need your Venice key to talk.`);
      await sleep(still ? 250 : 750);
      const n = S.demo[c.id] || 0;
      S.demo[c.id] = n + 1;
      reply = C.demoReply(c, n, text);
    } else {
      const r = await new Venice(S.key).chat({ model: c.model || S.model, characterSlug: c.engine.venice_character || "",
        messages: C.chatMessages(c, hist.filter((m) => !m.demo)), signal: ctrl.signal });
      reply = C.stripThinking(r.text);
      if (!reply) throw new Error("Venice sent back an empty reply. Try again, or pick another model on the card.");
    }
    if (ctrl.signal.aborted) return;
    hist.push({ role: "assistant", content: reply, ...(demo ? { demo: true } : {}) });
    persistChats();
    typing.remove();
    await play(C.splitBubbles(reply), ctrl.signal);
  } catch (e) {
    if (e && e.name === "AbortError") return;
    typing.remove();
    put(line(e && e.message || "Something went wrong.", "havre", "err"));
  } finally {
    typing.remove();
    const last = hist[hist.length - 1];
    if (hidden && last && last.hidden) { hist.pop(); persistChats(); }    // the hello didn't happen: they can try again
    if (S.replying === ctrl) S.replying = null;
    setBusy(false);
    scrollLog();
  }
}

async function play(bubbles, signal) {
  for (let i = 0; i < bubbles.length; i++) {
    if (signal.aborted) return;
    if (i > 0) {
      const t = put(line("is typing…", "them", "typing"));
      scrollLog();
      await sleep(C.typingDelay(bubbles[i]) * (still ? 0.25 : 1));
      t.remove();
      if (signal.aborted) return;
    }
    put(line(bubbles[i], "them"));
    scrollLog();
  }
}

// ---------- the card ----------
function renderCard() {
  const c = card();
  $("#card-empty").hidden = !!c;
  $("#card-body").hidden = !c;
  $("#card-h").textContent = c ? "CARD: " + c.name.toUpperCase() : "CARD";
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
async function loadModels() {
  if (S.models) return;
  try {
    S.models = await new Venice("").models();
    const c = card();
    if (c) fillModels($("#model-select"), c.model);
  } catch { /* the recommended list is enough */ }
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
  renderFlow(c);
  renderExamples(c);
  renderLineage(c);
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
    $("#who-name").textContent = now.name;
    renderChatMeta();
    $("#card-h").textContent = "CARD: " + now.name.toUpperCase();
    $("#rx-from").textContent = now.name;
  }, 120);
}

async function shrinkImage(file, size = 256) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (file.type === "image/svg+xml") {
      const text = await file.text();
      if (text.length < 120000) return "data:image/svg+xml;base64," + C.b64encodeUtf8(text);
    }
    const s = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = h("canvas", { width: Math.max(1, Math.round(img.naturalWidth * s)), height: Math.max(1, Math.round(img.naturalHeight * s)) });
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    const webp = cv.toDataURL("image/webp", 0.86);
    return webp.startsWith("data:image/webp") ? webp : cv.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
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
  $("#keyin").placeholder = !on ? "paste it here"
    : S.keyRemembered ? "saved on this device. paste a new one to replace it" : "saved for this tab. paste a new one to replace it";
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
  loadVenice(0);
}
function forgetKey() {
  if (S.replying) { S.replying.abort(); S.replying = null; setBusy(false); }
  S.key = "";
  S.keyRemembered = false;
  storeKey();
  S.v.list = [];
  S.v.more = false;
  S.v.offset = 0;
  $("#keyremember").checked = false;
  updateKeyUI();
  keyStatus("forgotten.", false, true);
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
  if (!c || S.rx.busy) return;
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
  const grow = () => { say.style.height = "auto"; say.style.height = Math.min(150, say.scrollHeight + 2) + "px"; };
  $("#composer").addEventListener("submit", (e) => { e.preventDefault(); const t = say.value; if (!t.trim() || S.replying) return; say.value = ""; grow(); send(t); });
  say.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#composer").requestSubmit(); } });
  say.addEventListener("input", grow);

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
    S.v.query = $("#vsearch").value.trim();
    loadVenice(0);
  });
  $("#vsort").addEventListener("change", () => {
    S.v.sort = $("#vsort").value;
    local.set(K.sort, S.v.sort);
    if (S.key) loadVenice(0);
  });
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
    try { const c = card(); replaceCard({ ...c, portrait: await shrinkImage(pf) }); renderSheet(); }
    catch { toast("That image didn't load."); }
  });
  $("#portrait-clear").addEventListener("click", () => { const c = card(); if (!c) return; replaceCard({ ...c, portrait: "" }); renderSheet(); });
  $("#delete").addEventListener("click", () => {
    const c = card();
    if (!c || !confirm(`Remove ${c.name} from your harbor? Export them first if you want to keep a copy.`)) return;
    if (S.replying) { S.replying.abort(); S.replying = null; setBusy(false); }
    S.cards = S.cards.filter((x) => x.id !== c.id);
    delete S.chats[c.id];
    persistChats();
    S.sel = S.cards[0] ? S.cards[0].id : "";
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

  addEventListener("storage", (e) => { if (e.key === K.cards || e.key === K.key) location.reload(); });
}

boot();
