// app.js: the Havre studio. Everything runs in this page; the only address it talks to is api.venice.ai,
// with the visitor's own key, and the page's security policy enforces that.
import * as C from "./card.js";
import { Venice } from "./venice.js";
import CAST_CARDS from "./cast/index.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

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
const K = { cards: "havre.cards.v1", chats: "havre.chats.v1", sel: "havre.selected", key: "havre.key", model: "havre.model", seeded: "havre.seeded.v1" };
const TINTS = ["#A1E9FF", "#B3FFC7", "#FFE780", "#FFB3E6", "#C5C5FF", "#FFC897"];

const S = { cards: [], sel: "", chats: {}, key: "", model: C.DEFAULT_MODEL, models: null, replying: null, demo: {}, rx: null, keyRemembered: false };
const card = () => S.cards.find((c) => c.id === S.sel) || S.cards[0] || null;

// ---------- boot ----------
async function boot() {
  S.cards = (local.get(K.cards, []) || []).map((c) => { try { return C.normalizeCard(c); } catch { return null; } }).filter(Boolean);
  S.chats = local.get(K.chats, {}) || {};
  for (const [id, h] of Object.entries(S.chats)) if (!Array.isArray(h)) delete S.chats[id];
  const kept = local.get(K.key, "");
  S.key = kept || session.get(K.key, "") || "";
  S.keyRemembered = !!kept;
  S.model = local.get(K.model, C.DEFAULT_MODEL) || C.DEFAULT_MODEL;
  if (!S.cards.length && !local.get(K.seeded, false)) await seedCast();
  S.sel = local.get(K.sel, "") || "";
  if (!S.cards.some((c) => c.id === S.sel)) S.sel = S.cards[0] ? S.cards[0].id : "";
  bind();
  renderAll();
  drawStory();
}

async function seedCast() {
  for (const raw of CAST_CARDS) {
    const c = C.normalizeCard(raw);
    if (!S.cards.some((x) => x.id === c.id)) S.cards.push(c);
  }
  local.set(K.seeded, true);
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
function hash(s) { let x = 0; for (const ch of s || "") x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x; }
function portraitSrc(c) {
  const p = (c && c.portrait) || "";
  if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml)[;,]/i.test(p)) return p;
  if (/^https:\/\/outerface\.venice\.ai\//.test(p)) return p;
  if (p.startsWith(C.SITE)) return p.slice(C.SITE.length);
  if (p && !/^[a-z][a-z0-9+.-]*:/i.test(p) && !p.startsWith("//")) return p;
  return "";
}
function paintFace(el, c) {
  el.textContent = "";
  el.style.background = "";
  if (!c) return;
  const initial = () => { el.textContent = (c.name || "?").trim().charAt(0).toUpperCase(); el.style.background = TINTS[hash(c.id) % TINTS.length]; };
  const src = portraitSrc(c);
  if (!src) return initial();
  const img = h("img", { src, alt: "", decoding: "async" });
  img.addEventListener("error", () => { img.remove(); initial(); });
  el.append(img);
}

// ---------- render ----------
function renderAll() { renderRoster(); renderChat(); renderSheet(); resetRemix(); renderExport(); updateKeyUI(); }

function renderRoster() {
  const ul = $("#roster");
  ul.textContent = "";
  for (const c of S.cards) {
    const f = h("span", { class: "face", "aria-hidden": "true" });
    paintFace(f, c);
    const b = h("button", { type: "button", "aria-current": c.id === S.sel ? "true" : "false", onclick: () => selectCard(c.id) }, f,
      h("span", { class: "t" }, h("b", {}, c.name, c.engine.venice_character ? h("span", { class: "badge", text: "Venice" }) : null),
        h("small", { text: c.tagline || (c.lineage[0] ? C.creditLine(c.lineage[0]) : "") })));
    ul.append(h("li", {}, b));
  }
  if (!S.cards.length) {
    ul.append(h("li", { class: "tiny" }, "Your harbor is empty. ",
      h("button", { type: "button", class: "linkish", text: "Bring back the first arrivals", onclick: async () => { local.del(K.seeded); await seedCast(); S.sel = S.cards[0] ? S.cards[0].id : ""; renderAll(); } })));
  }
}

function selectCard(id) {
  if (S.replying) { S.replying.abort(); S.replying = null; setBusy(false); }
  S.sel = id;
  local.set(K.sel, id);
  renderRoster(); renderChat(); renderSheet(); resetRemix(); renderExport();
  if (matchMedia("(max-width: 760px)").matches) setPane("chat");
}

function renderChat() {
  const c = card();
  paintFace($("#who-face"), c);
  $("#who-name").textContent = c ? c.name : "Havre";
  $("#who-tag").textContent = c ? c.tagline : "Your harbor is empty.";
  $("#who-credit").textContent = c && c.lineage.length ? C.creditLine(c.lineage[0]) + (c.lineage.length > 1 ? ` · +${c.lineage.length - 1} more` : "") : "";
  $("#say").disabled = !c;
  $("#sendbtn").disabled = !c;
  renderLog();
}

function bubble(text, who) {
  const p = h("p", { class: `msg ${who}` });
  const parts = String(text).split(/```(?:[a-z0-9+#-]*\n)?/i);
  parts.forEach((part, i) => {
    if (i % 2) p.append(h("pre", {}, h("code", { text: part.replace(/\n$/, "") })));
    else if (part.trim()) p.append(document.createTextNode(i ? part.replace(/^\n/, "") : part));
  });
  return p;
}
function note(text, cls = "note") { return h("p", { class: `msg ${cls}`, text }); }
function typingBubble() { return h("p", { class: "msg them typing", "aria-label": "typing" }, h("i"), h("i"), h("i")); }
function scrollLog() { const l = $("#log"); l.scrollTop = l.scrollHeight; }

function renderLog() {
  const log = $("#log"), c = card();
  log.textContent = "";
  if (!c) { log.append(note("Press New or Import to bring someone into your harbor.")); return; }
  const hist = S.chats[c.id] || [];
  if (c.engine.venice_character) log.append(note(`${c.name} speaks through Venice with their own prompt. Say hello.`));
  else if (c.greeting) for (const b of C.splitBubbles(C.fill(c.greeting, c, "you"))) log.append(bubble(b, "them"));
  for (const m of hist) {
    if (m.role === "user") log.append(bubble(m.content, "me"));
    else if (m.role === "assistant") for (const b of C.splitBubbles(m.content)) log.append(bubble(b, "them"));
  }
  const ideas = hist.some((m) => m.role === "user") ? [] : C.suggestions(c);
  if (ideas.length) {
    log.append(h("div", { class: "suggest" }, h("span", { text: "Try saying" }),
      ideas.map((t) => h("button", { type: "button", text: t, onclick: () => send(t) }))));
  }
  scrollLog();
}

function setBusy(on) {
  $("#sendbtn").disabled = on || !card();
  $("#composer").setAttribute("aria-busy", on ? "true" : "false");
}

// ---------- talking ----------
async function send(text) {
  const c = card();
  text = text.trim();
  if (!text || !c || S.replying) return;
  const hist = (S.chats[c.id] = S.chats[c.id] || []);
  const demo = !S.key;
  hist.push({ role: "user", content: text, ...(demo ? { demo: true } : {}) });
  persistChats();
  const log = $("#log");
  for (const el of $$(".suggest", log)) el.remove();
  log.append(bubble(text, "me"));
  const ctrl = new AbortController();
  S.replying = ctrl;
  setBusy(true);
  const typing = typingBubble();
  log.append(typing);
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
      if (!reply) throw new Error("Venice sent back an empty reply. Try again, or pick another model on the sheet.");
    }
    if (ctrl.signal.aborted) return;
    hist.push({ role: "assistant", content: reply, ...(demo ? { demo: true } : {}) });
    persistChats();
    typing.remove();
    await play(C.splitBubbles(reply), ctrl.signal);
  } catch (e) {
    if (e && e.name === "AbortError") return;
    typing.remove();
    log.append(note(e && e.message || "Something went wrong.", "err"));
    if (e && (e.status === 401 || e.status === 403)) updateKeyUI();
  } finally {
    typing.remove();
    if (S.replying === ctrl) S.replying = null;
    setBusy(false);
    scrollLog();
  }
}

async function play(bubbles, signal) {
  const log = $("#log");
  for (let i = 0; i < bubbles.length; i++) {
    if (signal.aborted) return;
    if (i > 0) {
      const t = typingBubble();
      log.append(t); scrollLog();
      await sleep(C.typingDelay(bubbles[i]) * (still ? 0.25 : 1));
      t.remove();
      if (signal.aborted) return;
    }
    const b = bubble(bubbles[i], "them");
    b.classList.add("pop");
    log.append(b);
    scrollLog();
  }
}

// ---------- the sheet ----------
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
    fillModels($("#keymodel"), S.model);
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
  paintFace($("#sheet-face"), c);
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

function itemRow(kind, fields, values) {
  const li = h("li");
  for (const [k, label, multi] of fields) {
    const input = multi ? h("textarea", { rows: 2, "data-k": k }) : h("input", { "data-k": k });
    input.value = values[k] || "";
    li.append(h("label", {}, label, input));
  }
  li.append(h("button", { type: "button", class: "pill small ghost rm", text: "Remove", onclick: () => { li.remove(); saveSheet(); } }));
  return li;
}
const FLOW_FIELDS = [["stage", "Stage"], ["goal", "Goal", true], ["next", "Move on when"]];
const EX_FIELDS = [["user", "They say"], ["character", "Character replies", true]];
function renderFlow(c) { const ol = $("#flow"); ol.textContent = ""; for (const s of c.flow) ol.append(itemRow("flow", FLOW_FIELDS, s)); }
function renderExamples(c) { const ol = $("#examples"); ol.textContent = ""; for (const e of c.examples) ol.append(itemRow("ex", EX_FIELDS, e)); }
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
  const next = readSheet();
  replaceCard(next);
  clearTimeout(sheetTimer);
  sheetTimer = setTimeout(() => { renderRoster(); renderChatHead(); renderExport(); }, 120);
}
function renderChatHead() {
  const c = card();
  if (!c) return;
  paintFace($("#who-face"), c);
  $("#who-name").textContent = c.name;
  $("#who-tag").textContent = c.tagline;
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

// ---------- tabs and panes ----------
function setTab(name) {
  for (const t of ["edit", "remix", "export"]) {
    $(`#t-${t}`).setAttribute("aria-selected", t === name ? "true" : "false");
    $(`#t-${t}`).tabIndex = t === name ? 0 : -1;
    $(`#p-${t}`).hidden = t !== name;
  }
  if (name === "remix") resetRemix();
  if (name === "export") renderExport();
}
function setPane(name) {
  const st = $("#studio");
  st.dataset.pane = name;
  for (const b of $$(".panes button")) b.setAttribute("aria-current", b.dataset.pane === name ? "true" : "false");
}

// ---------- the key ----------
function updateKeyUI() {
  const on = !!S.key;
  const b = $("#keybtn");
  b.textContent = on ? "Venice key ✓" : "Add Venice key";
  b.classList.toggle("on", on);
  $("#keynote").hidden = on;
}
function openKey(why = "") {
  const d = $("#keydlg");
  $("#keyin").value = "";
  $("#keyin").placeholder = S.key ? "saved; paste a new one to replace it" : "paste it here";
  $("#keyremember").checked = S.keyRemembered || !S.key;
  $("#keystatus").textContent = why;
  $("#keystatus").classList.remove("bad");
  $("#keyforget").hidden = !S.key;
  fillModels($("#keymodel"), S.model);
  loadModels();
  d.showModal();
  $("#keyin").focus();
}
async function saveKey(ev) {
  ev.preventDefault();
  const k = $("#keyin").value.trim();
  const st = $("#keystatus");
  S.model = $("#keymodel").value || S.model;
  local.set(K.model, S.model);
  if (!k) { if (S.key) $("#keydlg").close(); else { st.textContent = "Paste a key first."; st.classList.add("bad"); } return; }
  st.textContent = "Checking the key with Venice…";
  st.classList.remove("bad");
  try {
    await new Venice(k).characters({ limit: 1 });
  } catch (e) {
    st.textContent = e.message;
    st.classList.add("bad");
    return;
  }
  S.key = k;
  S.keyRemembered = $("#keyremember").checked;
  local.del(K.key); session.del(K.key);
  (S.keyRemembered ? local : session).set(K.key, k);
  $("#keyin").value = "";
  $("#keydlg").close();
  updateKeyUI();
  toast("Key saved. Characters can really talk now.");
}
function forgetKey() {
  S.key = "";
  S.keyRemembered = false;
  local.del(K.key); session.del(K.key);
  $("#keydlg").close();
  updateKeyUI();
  toast("Key forgotten.");
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
    const added = addCard(c);
    if ($("#importdlg").open) $("#importdlg").close();
    toast(`${added.name} arrived (${kind}).`);
  } catch (e) {
    if ($("#importdlg").open) { st.textContent = e.message; st.classList.add("bad"); } else toast(e.message);
  }
}
function importText() {
  const st = $("#impstatus");
  try {
    const { card: c, kind } = C.fromAny($("#paste").value);
    const added = addCard(c);
    $("#paste").value = "";
    $("#importdlg").close();
    setTab("edit");
    if (matchMedia("(max-width: 1180px)").matches) setPane("sheet");
    toast(`${added.name} arrived (${kind}). Check their sheet.`);
  } catch (e) { st.textContent = e.message; st.classList.add("bad"); }
}

// ---------- Venice characters ----------
async function searchVenice(ev) {
  if (ev) ev.preventDefault();
  const st = $("#venstatus"), ul = $("#vresults");
  st.classList.remove("bad");
  if (!S.key) {
    ul.textContent = "";
    st.textContent = "";
    st.append("Searching Venice needs your key. ", h("button", { type: "button", class: "linkish", text: "Add your Venice key", onclick: () => { $("#venicedlg").close(); openKey(); } }));
    return;
  }
  st.textContent = "Searching…";
  try {
    const list = await new Venice(S.key).characters({ search: $("#vsearch").value.trim(), limit: 24 });
    ul.textContent = "";
    st.textContent = list.length ? `${list.length} characters. Bringing one in adds a link and the credit, not a copy.` : "No safe-for-work characters matched.";
    for (const v of list) ul.append(veniceResult(v));
  } catch (e) { st.textContent = e.message; st.classList.add("bad"); }
}
function veniceResult(v) {
  const f = h("span", { class: "face", "aria-hidden": "true" });
  paintFace(f, { id: v.slug, name: v.name, portrait: v.photo });
  const meta = [v.creator && "by " + v.creator, v.imports ? `${v.imports.toLocaleString()} imports` : ""].filter(Boolean).join(" · ");
  return h("li", {}, f, h("b", { text: v.name }), h("div", {}, h("p", { text: v.description }), h("p", { class: "meta", text: meta })),
    h("div", { class: "row" },
      h("button", { type: "button", class: "pill small", text: "Bring to harbor", onclick: () => bringVenice(v) }),
      h("a", { href: v.url, target: "_blank", rel: "noopener", class: "tiny", text: "Open on Venice" })));
}
function bringVenice(v) {
  const existing = S.cards.find((c) => c.engine.venice_character === v.slug);
  if (existing) { $("#venicedlg").close(); selectCard(existing.id); toast(`${v.name} is already in your harbor.`); return; }
  const c = addCard({
    name: v.name, tagline: v.description, engine: { venice_character: v.slug }, portrait: v.photo, creator: v.creator,
    model: v.model || S.model, license: "all-rights-reserved", tags: v.tags, voice: { short_form: true },
    lineage: [{ relation: "ported-from", name: v.name, creator: v.creator, ref: "venice:" + v.slug, at: today(), note: "a link: speaks through Venice with its own prompt" }],
  });
  $("#venicedlg").close();
  toast(`${c.name} came over from Venice, with credit.`);
}

// ---------- remix with credit ----------
/** scroll a panel (not the page) so this element is at its top */
function reveal(el) {
  const panel = el.closest(".panel");
  if (panel) panel.scrollTo({ top: Math.max(0, el.offsetTop - 12), behavior: still ? "auto" : "smooth" });
}
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
  if (!S.key) return openKey("Remix needs your Venice key.");
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
const IDEA_LABELS = { archetype: "Archetype", premise: "Premise", setting: "Setting", drives: "Drives", fears: "Fears", voice: "Voice",
  quirks: "Quirks", relationships: "Relationships", boundaries: "Won't", themes: "Themes" };
function renderIdeas() {
  const box = $("#rx-ideas");
  box.textContent = "";
  box.hidden = false;
  for (const k of C.DISTILL_KEYS) {
    const v = S.rx.ideas[k];
    const grp = h("div", { class: "grp" }, h("h4", { text: IDEA_LABELS[k] }));
    if (typeof v === "string") {
      const input = h("input", { "aria-label": IDEA_LABELS[k] });
      input.value = v;
      input.addEventListener("input", () => { S.rx.ideas[k] = input.value; });
      grp.append(input);
    } else {
      v.forEach((item, i) => grp.append(h("span", { class: "chip" }, h("span", { text: item }),
        h("button", { type: "button", "aria-label": `Remove ${item}`, text: "×", onclick: () => { S.rx.ideas[k].splice(i, 1); renderIdeas(); } }))));
      const add = h("input", { placeholder: "+ add", "aria-label": `Add to ${IDEA_LABELS[k]}`, maxlength: 80 });
      add.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); const t = add.value.trim(); if (t) { S.rx.ideas[k].push(t); renderIdeas(); $(`#rx-ideas [aria-label="Add to ${IDEA_LABELS[k]}"]`).focus(); } }
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
const VERDICT = { fresh: "Fresh: the words are its own", close: "Close: some phrasing is shared", "too-close": "Too close: rewrite before keeping it" };
function renderDraft() {
  const d = S.rx.draft, chk = S.rx.check, box = $("#rx-draft");
  box.textContent = "";
  box.hidden = false;
  const pct = Math.round(chk.share * 1000) / 10;
  box.append(h("h4", { text: d.name }), h("p", { class: "tagline", text: d.tagline }),
    h("p", { class: "persona", text: d.persona }),
    h("span", { class: `verdict ${chk.verdict}`, text: VERDICT[chk.verdict] }),
    h("p", { class: "tiny", text: `${pct}% of its five-word phrases appear in the source; the longest shared run is ${chk.run.len} words.` }));
  if (chk.reasons.length) box.append(h("ul", { class: "why-list" }, chk.reasons.map((r) => h("li", { text: r }))));
  if (d.lineage[0]) box.append(h("p", { class: "tiny", text: "Lineage: " + C.creditLine(d.lineage[0]) + "." }));
  const row = h("div", { class: "row wrap" });
  const keep = h("button", { type: "button", class: "pill small", text: "Keep in harbor", onclick: keepDraft });
  if (chk.verdict === "too-close") keep.disabled = true;
  row.append(keep);
  if (chk.verdict !== "fresh") row.append(h("button", { type: "button", class: "pill small ghost", text: "Rewrite, avoiding these",
    onclick: () => writeFresh(C.avoidList(chk, [S.rx.source.name])) }));
  row.append(h("button", { type: "button", class: "pill small ghost", text: "Write another", onclick: () => writeFresh() }));
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
async function cardPng(c) {
  const W = 512, H = 768, cv = h("canvas", { width: W, height: H }), g = cv.getContext("2d");
  try { await document.fonts.load('600 44px "Fredoka"'); } catch { /* system font */ }
  g.fillStyle = "#FFEAD2"; g.fillRect(0, 0, W, H);
  const cx = W / 2, cy = 300, r = 200;
  g.save();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.closePath();
  g.fillStyle = TINTS[hash(c.id) % TINTS.length]; g.fill();
  g.clip();
  const src = portraitSrc(c);
  let drew = false;
  if (src && !/^https:/.test(src)) {
    try {
      const img = new Image(); img.src = src; await img.decode();
      const s = Math.max((2 * r) / img.naturalWidth, (2 * r) / img.naturalHeight);
      g.drawImage(img, cx - (img.naturalWidth * s) / 2, cy - (img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
      drew = true;
    } catch { /* fall back to the initial */ }
  }
  if (!drew) {
    g.fillStyle = "#2B2135"; g.font = '600 160px "Fredoka", system-ui, sans-serif'; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText((c.name || "?").charAt(0).toUpperCase(), cx, cy + 8);
  }
  g.restore();
  g.lineWidth = 8; g.strokeStyle = "#2B2135"; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#2B2135"; g.textAlign = "center"; g.textBaseline = "alphabetic";
  g.font = '600 46px "Fredoka", system-ui, sans-serif';
  g.fillText(c.name.slice(0, 22), cx, 590);
  g.font = '400 24px system-ui, sans-serif'; g.fillStyle = "#6A5672";
  g.fillText((c.tagline || "").slice(0, 40), cx, 632);
  g.font = '500 20px "Fredoka", system-ui, sans-serif';
  g.fillText("havre.yolopreneur.lol", cx, 720);
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
function renderExport() {
  $("#agent-prompt-sheet").textContent = C.agentPrompt();
}

// ---------- the page around the studio ----------
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
  btn.textContent = ok ? "Copied" : "Selected: press ⌘C or Ctrl+C";
  setTimeout(() => { btn.textContent = was; }, 2200);
}
function drawStory() {
  const img = $(".crossing img");
  if (!img) return;
  const fig = img.closest("figure"), btn = $(".redraw", fig);
  img.addEventListener("error", () => { fig.hidden = true; }, { once: true });
  let n = 0;
  const draw = () => { img.src = img.dataset.drawn + "?" + (++n); };
  btn.hidden = false;
  btn.textContent = still ? "Watch it being drawn" : "Draw it again";
  btn.addEventListener("click", draw);
  if (still || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { io.disconnect(); draw(); } }, { threshold: 0.35 });
  io.observe(img);
}
let toastTimer = 0;
function toast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

// ---------- wiring ----------
function bind() {
  $("#agent-prompt").textContent = C.agentPrompt("a retired lighthouse engineer who explains how things work with tiny drawings, and says so when they don't know.");
  for (const b of $$("button.copy")) b.addEventListener("click", () => copyFrom(b.dataset.copy, b));

  const say = $("#say");
  $("#composer").addEventListener("submit", (e) => { e.preventDefault(); const t = say.value; say.value = ""; grow(); send(t); });
  say.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#composer").requestSubmit(); } });
  const grow = () => { say.style.height = "auto"; say.style.height = Math.min(150, say.scrollHeight + 6) + "px"; };
  say.addEventListener("input", grow);
  $("#clear").addEventListener("click", () => { const c = card(); if (!c) return; delete S.chats[c.id]; S.demo[c.id] = 0; persistChats(); renderLog(); });

  $("#keybtn").addEventListener("click", () => openKey());
  $("#addkey").addEventListener("click", () => openKey());
  $("#keyform").addEventListener("submit", saveKey);
  $("#keyforget").addEventListener("click", forgetKey);
  $("#keycancel").addEventListener("click", () => $("#keydlg").close());

  $("#new").addEventListener("click", () => {
    addCard({ name: "New character", persona: "", greeting: "", voice: { short_form: true }, model: S.model, license: "remix-with-credit" });
    setTab("edit");
    if (matchMedia("(max-width: 1180px)").matches) setPane("sheet");
    const n = $("#sheet").name; n.focus(); n.select();
  });
  $("#import").addEventListener("click", () => { $("#impstatus").textContent = ""; $("#importdlg").showModal(); });
  $("#impcancel").addEventListener("click", () => $("#importdlg").close());
  $("#imp-paste").addEventListener("click", importText);
  $("#imp-venice").addEventListener("click", () => { $("#importdlg").close(); openVenice(); });
  const drop = $("#drop"), file = $("#file");
  drop.addEventListener("click", () => file.click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } });
  file.addEventListener("change", () => { if (file.files[0]) importFile(file.files[0]); file.value = ""; });
  for (const el of [drop, $("#studio")]) {
    el.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); drop.classList.add("over"); } });
    el.addEventListener("dragleave", () => drop.classList.remove("over"));
    el.addEventListener("drop", (e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); drop.classList.remove("over"); importFile(e.dataTransfer.files[0]); });
  }

  $("#browse").addEventListener("click", openVenice);
  $("#venform").addEventListener("submit", searchVenice);
  $("#vclose").addEventListener("click", () => $("#venicedlg").close());

  const f = $("#sheet");
  for (const ev of ["focus", "pointerdown"]) $("#model-select").addEventListener(ev, loadModels, { once: true });
  f.addEventListener("input", saveSheet);
  f.addEventListener("change", saveSheet);
  f.addEventListener("submit", (e) => e.preventDefault());
  $("#flow-add").addEventListener("click", () => { $("#flow").append(itemRow("flow", FLOW_FIELDS, {})); $("#flow-group").open = true; $("#flow > li:last-child input").focus(); });
  $("#ex-add").addEventListener("click", () => { $("#examples").append(itemRow("ex", EX_FIELDS, {})); $("#ex-group").open = true; $("#examples > li:last-child input").focus(); });
  $("#portrait-pick").addEventListener("click", () => $("#portrait-file").click());
  $("#portrait-file").addEventListener("change", async () => {
    const pf = $("#portrait-file").files[0];
    $("#portrait-file").value = "";
    if (!pf) return;
    try { const c = card(); replaceCard({ ...c, portrait: await shrinkImage(pf) }); renderSheet(); renderRoster(); renderChatHead(); }
    catch { toast("That image didn't load."); }
  });
  $("#portrait-clear").addEventListener("click", () => { const c = card(); if (!c) return; replaceCard({ ...c, portrait: "" }); renderSheet(); renderRoster(); renderChatHead(); });
  $("#delete").addEventListener("click", () => {
    const c = card();
    if (!c || !confirm(`Remove ${c.name} from your harbor? Export them first if you want to keep a copy.`)) return;
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
  for (const b of $$(".panes button")) b.addEventListener("click", () => setPane(b.dataset.pane));

  $("#rx-distill").addEventListener("click", distill);
  $("#rx-write").addEventListener("click", () => writeFresh());
  for (const b of $$("[data-out]")) b.addEventListener("click", () => exportAs(b.dataset.out));

  addEventListener("storage", (e) => { if (e.key === K.cards || e.key === K.key) location.reload(); });
}
function openVenice() {
  $("#venstatus").textContent = "";
  $("#venicedlg").showModal();
  $("#vsearch").focus();
  if (!$("#vresults").children.length) searchVenice();
}

boot();
