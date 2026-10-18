// tools/pages.mjs: a page and a link for each of the harbor's own, as static files, from the cast/*.havre.json cards.
// tools/build.sh runs it right after tools/cast.mjs, every build: node tools/pages.mjs
//
//   c/index.html                  the list: THE HARBOR'S OWN
//   c/<id>/index.html             one character: who they are, a few lines of them talking, and a way in
//   c/<id>/<id>.card.json         the same character as a Character Card V3 (toCharacterCardV3, card.js)
//   sitemap.txt                   the site's addresses: /, /c/ and each page
//
// The pages are the site's own style (style.css as it is), say what a visitor needs and nothing else, and run no
// script. A character for grown-ups gets no page: adult characters stay in the Studio (OWNER.md, decision 4).
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SITE, creditLine, fill, normalizeCard, toCharacterCardV3, validateCard } from "../card.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const castDir = join(ROOT, "cast");
const OG_IMAGE = SITE + "shots/og.png";
const EXAMPLES = 3;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** the harbor's own, as normalized cards, by file name; a card that isn't fit to host stops the build */
export function readCast() {
  const files = readdirSync(castDir).filter((f) => f.endsWith(".havre.json")).sort();
  return files.map((f) => {
    const card = normalizeCard(JSON.parse(readFileSync(join(castDir, f), "utf8")));
    const problems = validateCard(card);
    if (problems.length) throw new Error(`${f}: ${problems.join("; ")}`);
    if (f !== card.id + ".havre.json") throw new Error(`${f}: the file is named after the id (${card.id})`);
    if (card.adult) throw new Error(`${f}: adult characters stay in the Studio; they get no hosted page`);
    return card;
  });
}

const MAST = `<header class="mast" id="top">
  <h1>HAVRE</h1>
  <p class="motto">a harbor for characters. <br>talk to venice characters on your own key. <br>no account. no server. nothing kept but what you keep.</p>
  <nav class="nav" aria-label="Havre"><a href="/">the studio</a> / <a href="/c/">the harbor's own</a></nav>
</header>`;

const FOOT = `<footer class="foot">havre.yolopreneur.lol / a venture on <a href="https://yolopreneur.lol/">yolopreneur.lol</a> / made by claude, october 2026 / not affiliated with venice.ai</footer>`;

/** the page around a body: title, description, canonical and Open Graph tags; no script, and a policy that allows none */
function shell({ title, description, path, body }) {
  const url = SITE + path;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="strict-origin">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Havre">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/style.css">
</head>
<body>
${MAST}

<main>
${body}
</main>

${FOOT}
</body>
</html>
`;
}

/** one line of the script, set like the chat's own */
const said = (who, text) => `<div class="line"><span class="who">${esc(who)}</span><span class="said">${esc(text)}</span></div>`;

/** a character's page */
export function cardPage(card) {
  const hello = (t) => fill(t, card, "you");
  const talk = [said(card.name, hello(card.greeting))];
  for (const e of card.examples.slice(0, EXAMPLES)) {
    if (e.user) talk.push(said("you", hello(e.user)));
    talk.push(said(card.name, hello(e.character)));
  }
  const credit = card.lineage.map(creditLine);
  const title = `${card.name} in Havre`;
  const description = `${card.name}${card.tagline ? ": " + card.tagline : "."} Meet ${card.name} in Havre, a harbor for characters: in your browser, no account.`
    .replace(/\s+/g, " ");
  const id = card.id;
  const body = `<div class="sechead"><h2>${esc(card.name)}</h2>${card.tagline ? `<p class="meta">${esc(card.tagline)}</p>` : ""}</div>
<div class="pad">
${talk.join("\n")}
</div>${credit.length ? `\n<p class="meta pad">${esc(credit.join(" / "))}</p>` : ""}
<p class="mono pad"><b><a href="/?meet=${encodeURIComponent(id)}">MEET ${esc(card.name.toUpperCase())} IN HAVRE</a></b></p>
<p class="more">no key needed to say hello: ${esc(card.name)} answers from the card's own examples. with your own Venice key, they really talk. nothing leaves your browser but the call to api.venice.ai.</p>
<p class="more">the card: <a href="/cast/${encodeURIComponent(id)}.havre.json">${esc(id)}.havre.json</a> / the same character as a Character Card V3, for SillyTavern-style apps: <a href="/c/${encodeURIComponent(id)}/${encodeURIComponent(id)}.card.json">${esc(id)}.card.json</a></p>
<p class="more"><a href="/c/">&larr; the harbor's own</a></p>`;
  return shell({ title, description, path: `c/${id}/`, body });
}

/** the list of them all */
export function indexPage(cards) {
  const items = cards.map((c) => `  <li><a href="/c/${encodeURIComponent(c.id)}/">${esc(c.name)}</a>${c.tagline ? ": " + esc(c.tagline) : ""} / <a href="/?meet=${encodeURIComponent(c.id)}">meet ${esc(c.name)} in Havre</a></li>`);
  const body = `<div class="sechead"><h2>THE HARBOR'S OWN</h2><p class="meta">${cards.length} characters who live in Havre. a page and a link for each.</p></div>
<div class="pad">
<ul>
${items.join("\n")}
</ul>
</div>
<p class="more">each page has the character's card to keep, and the same character as a Character Card V3.</p>`;
  return shell({
    title: "THE HARBOR'S OWN | Havre",
    description: `${cards.map((c) => c.name).join(", ")}: the characters who live in Havre, a harbor for characters. A page and a link for each.`,
    path: "c/", body,
  });
}

/** the site's addresses, one to a line */
export function sitemap(cards) {
  return [SITE, SITE + "c/", ...cards.map((c) => `${SITE}c/${c.id}/`)].join("\n") + "\n";
}

/** write c/ and sitemap.txt under `root` (the site, by default); what c/ held from an earlier build goes first */
export function build(root = ROOT) {
  const cards = readCast(), c = join(root, "c");
  rmSync(c, { recursive: true, force: true });
  const put = (file, text) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); };
  put(join(c, "index.html"), indexPage(cards));
  for (const card of cards) {
    put(join(c, card.id, "index.html"), cardPage(card));
    put(join(c, card.id, `${card.id}.card.json`), JSON.stringify(toCharacterCardV3(card), null, 1) + "\n");
  }
  put(join(root, "sitemap.txt"), sitemap(cards));
  return cards;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cards = build();
  console.log(`c/: ${cards.map((c) => c.name).join(", ")}, and the list`);
}
