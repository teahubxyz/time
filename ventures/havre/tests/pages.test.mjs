// node --test tests/*.test.mjs: the pages of the harbor's own (tools/pages.mjs), built from cast/
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as C from "../card.js";
import { build, cardPage, indexPage, readCast, sitemap } from "../tools/pages.mjs";

const SITE_DIR = fileURLToPath(new URL("../", import.meta.url));
const out = mkdtempSync(join(tmpdir(), "havre-pages-"));
const cards = build(out);
const read = (root, p) => readFileSync(join(root, p), "utf8");
/** what a browser reads out of a text in the page: the tags' escapes undone */
const text = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const inPage = (html, s) => text(html).includes(s);

test("a page for every card, with their name and their greeting, and the first three examples as a conversation", () => {
  assert.deepEqual(cards.map((c) => c.id), ["maren", "odile", "taskmaster"]);
  for (const card of cards) {
    const html = read(out, `c/${card.id}/index.html`);
    assert.match(html, new RegExp(`<h2>${card.name}</h2>`));
    assert.ok(inPage(html, card.greeting), `${card.id}: the greeting`);
    assert.ok(inPage(html, card.tagline), `${card.id}: the tagline`);
    const said = [...html.matchAll(/<span class="who">([^<]*)<\/span><span class="said">([^<]*)<\/span>/g)].map((m) => [m[1], text(m[2])]);
    const want = [[card.name, card.greeting]];
    for (const e of card.examples.slice(0, 3)) want.push(["you", e.user], [card.name, e.character]);
    assert.deepEqual(said, want.map(([who, t]) => [who, C.fill(t, card, "you")]), `${card.id}: the greeting, then three exchanges`);
    assert.ok(card.examples.length > 3 && !inPage(html, card.examples[3].character), `${card.id}: only the first three examples`);
  }
});

test("each page links the way into the Studio and the card in both forms; its head says what it is", () => {
  for (const card of cards) {
    const html = read(out, `c/${card.id}/index.html`);
    assert.ok(html.includes(`<a href="/?meet=${card.id}">MEET ${card.name.toUpperCase()} IN HAVRE</a>`), `${card.id}: the way in`);
    assert.ok(html.includes(`href="/cast/${card.id}.havre.json"`), `${card.id}: the card file`);
    assert.ok(html.includes(`href="/c/${card.id}/${card.id}.card.json"`), `${card.id}: the same as a V3 card`);
    assert.ok(html.includes(`<title>${card.name} in Havre</title>`));
    assert.match(html, /<meta name="description" content="[^"]+">/);
    assert.ok(html.includes(`<link rel="canonical" href="${C.SITE}c/${card.id}/">`));
    for (const p of ["og:title", "og:description", "og:url", "og:image"]) assert.match(html, new RegExp(`<meta property="${p}" content="[^"]+">`), `${card.id}: ${p}`);
    assert.ok(html.includes(`<meta property="og:image" content="${C.SITE}shots/og.png">`));
    assert.ok(html.includes(`<meta property="og:url" content="${C.SITE}c/${card.id}/">`));
    assert.ok(existsSync(join(SITE_DIR, "shots/og.png")), "the share picture is the site's own");
  }
});

test("nothing on a page runs: no script, no inline style, no handler, and a policy that allows none", () => {
  for (const f of ["c/index.html", ...cards.map((c) => `c/${c.id}/index.html`)]) {
    const html = read(out, f);
    assert.ok(!/<script|<iframe|<form|<object|<embed/i.test(html), `${f}: no script or embed`);
    assert.ok(!/\sstyle=|\son[a-z]+=/i.test(html), `${f}: no inline style or handler`);
    assert.ok(!/<style/i.test(html) && (html.match(/<link rel="stylesheet"/g) || []).length === 1 && html.includes('href="/style.css"'), `${f}: the site's own stylesheet, and no other`);
    assert.match(html, /Content-Security-Policy" content="default-src 'none'; style-src 'self'; img-src 'self'/);
  }
});

test("every link on every page goes somewhere that is there", () => {
  const known = new Set(["/", "/c/", "/favicon.svg", "/style.css"]);
  for (const f of ["c/index.html", ...cards.map((c) => `c/${c.id}/index.html`)]) {
    for (const [, href] of read(out, f).matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
      if (/^\/\?meet=/.test(href)) { assert.ok(cards.some((c) => href === `/?meet=${c.id}`), `${f}: ${href} meets one of them`); continue; }
      if (known.has(href)) continue;
      const file = href.endsWith("/") ? href + "index.html" : href;
      assert.ok(existsSync(join(out, file)) || existsSync(join(SITE_DIR, file)), `${f}: ${href} exists`);
    }
  }
});

test("a lineage line appears on a page when the card has one", () => {
  const card = C.normalizeCard({ ...cards[0], lineage: [{ relation: "inspired-by", name: "Old Sal", creator: "Someone", ref: "venice:old-sal" }] });
  assert.ok(inPage(cardPage(card), C.creditLine(card.lineage[0])), "Inspired by Old Sal by Someone on Venice");
  assert.ok(!/Inspired by|Ported from|Forked from/.test(read(out, "c/maren/index.html")), "and none when it has none");
});

test("every V3 card written comes back through fromCharacterCard as the same card", () => {
  for (const card of cards) {
    const v3 = JSON.parse(read(out, `c/${card.id}/${card.id}.card.json`));
    assert.equal(v3.spec, "chara_card_v3");
    assert.deepEqual(v3, C.toCharacterCardV3(card), `${card.id}: what toCharacterCardV3 makes`);
    assert.deepEqual(C.fromCharacterCard(v3), card, `${card.id}: comes back whole`);
    assert.equal(C.fromAny(read(out, `c/${card.id}/${card.id}.card.json`)).kind, "character card V3");
    assert.deepEqual(C.fromAny(read(out, `c/${card.id}/${card.id}.card.json`)).card, card);
  }
});

test("the list: THE HARBOR'S OWN, every one of them, with the same mast and footer as the pages", () => {
  const html = read(out, "c/index.html"), page = read(out, "c/maren/index.html");
  assert.match(html, /<h2>THE HARBOR'S OWN<\/h2>/);
  assert.match(html, /<title>THE HARBOR'S OWN \| Havre<\/title>/);
  for (const c of cards) {
    assert.ok(html.includes(`<a href="/c/${c.id}/">${c.name}</a>`), `${c.id} in the list`);
    assert.ok(html.includes(`<a href="/?meet=${c.id}">`), `${c.id}: the way in`);
  }
  const part = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b) + b.length);
  assert.equal(part(html, '<header class="mast"', "</header>"), part(page, '<header class="mast"', "</header>"), "the same mast");
  assert.equal(part(html, '<footer class="foot"', "</footer>"), part(page, '<footer class="foot"', "</footer>"), "the same footer");
  assert.ok(html.includes(`<link rel="canonical" href="${C.SITE}c/">`));
  assert.ok(html.includes(`<meta property="og:image" content="${C.SITE}shots/og.png">`));
});

test("the sitemap lists the studio, the list and each page", () => {
  assert.deepEqual(read(out, "sitemap.txt").trim().split("\n"),
    [C.SITE, C.SITE + "c/", ...cards.map((c) => `${C.SITE}c/${c.id}/`)]);
  assert.equal(sitemap(cards), read(out, "sitemap.txt"));
});

test("a build leaves only this version's pages: what an earlier one wrote is gone", () => {
  const root = mkdtempSync(join(tmpdir(), "havre-pages-"));
  build(root);
  build(root);
  assert.deepEqual(readdirSync(join(root, "c")).sort(), ["index.html", "maren", "odile", "taskmaster"]);
  assert.deepEqual(readdirSync(join(root, "c", "odile")).sort(), ["index.html", "odile.card.json"]);
});

test("the site holds what the build makes (run tools/pages.mjs again after editing a card)", () => {
  for (const f of ["sitemap.txt", "c/index.html", ...cards.flatMap((c) => [`c/${c.id}/index.html`, `c/${c.id}/${c.id}.card.json`])]) {
    assert.equal(read(SITE_DIR, f), read(out, f), f);
  }
  assert.deepEqual(readdirSync(join(SITE_DIR, "c")).sort(), ["index.html", ...cards.map((c) => c.id)].sort(), "no page for anyone who left");
});

test("nothing adult is hosted: an adult card stops the build, and a page only carries what a card says", () => {
  assert.equal(readCast().filter((c) => c.adult).length, 0);
  const html = indexPage(cards) + cards.map(cardPage).join("");
  assert.ok(!/18\+|nsfw/i.test(html));
});

test("what a card says is escaped, in the page and in its tags", () => {
  const card = C.normalizeCard({ ...cards[0], name: "Mo <b>", tagline: 'Says "hi" & <i>bye</i>', greeting: "<script>alert(1)</script>" });
  const html = cardPage(card);
  assert.ok(!/<script|Mo <b>|<i>bye/.test(html), "no markup from a card gets through");
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;") && html.includes("Says &quot;hi&quot; &amp; &lt;i&gt;bye&lt;/i&gt;"));
});
