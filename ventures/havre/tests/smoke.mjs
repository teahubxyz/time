// node tests/smoke.mjs [--shots DIR]: Havre in a real browser, against a fake Venice (no network, no key).
//
// Serves this folder on localhost and drives Chromium through the page on a desktop and a phone: the first visit,
// a card import and a chat without a key, the key and the balance, Venice's characters (photos through Venice's
// image service, tags, adult ones only once asked for) and one who says hello first, the model picker, a plain
// chat, a remix end to end, the exports, the retirement of the first version's cast, and the page's security policy.
// Fails on any console error. With --shots, it also takes the screenshots: desktop.png and og.png are the ones the
// site serves (tools/build.sh copies them to shots/).
//
// Playwright: PW_MODULE (a path to playwright-core's index.mjs, or a package name), else playwright-core, else
// playwright. Chrome: CHROME, with CHROME_FLAGS (e.g. --no-sandbox as root); else Playwright's own Chromium.
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const argv = process.argv.slice(2);
const SHOTS = argv.includes("--shots") ? argv[argv.indexOf("--shots") + 1] || "" : "";

async function playwright() {
  const tries = [process.env.PW_MODULE, "playwright-core", "playwright"].filter(Boolean);
  for (const m of tries) {
    try {
      const mod = await import(m.startsWith("/") ? pathToFileURL(m).href : m);
      const pw = mod.chromium ? mod : mod.default;
      if (pw && pw.chromium) return pw;
    } catch { /* the next one */ }
  }
  throw new Error("no Playwright found: set PW_MODULE to playwright-core's index.mjs (tried " + tries.join(", ") + ")");
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8" };
function serve() {
  const srv = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch { res.writeHead(404, { "content-type": "text/plain" }).end("not found"); }
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ srv, base: `http://127.0.0.1:${srv.address().port}/` })));
}

// ---------- a stand-in for api.venice.ai that answers like it does ----------
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const seen = { characters: [], chats: [], photos: [] };
const CHARACTERS = [
  { slug: "sable-penrose", name: "Sable Penrose", description: "Your new neighbor needs help moving in.", author: "btrzm",
    photoUrl: "https://outerface.venice.ai/sable.png", adult: false, webEnabled: false, modelId: "zai-org-glm-5-2", tags: ["neighbor"], stats: { imports: 25752 } },
  { slug: "after-dark", name: "After Dark", description: "Only for grown-ups.", author: "x", photoUrl: null, adult: true, modelId: "m", tags: [], stats: {} },
  { slug: "wren", name: "Wren", description: "A deckhand on the night ferry.", author: "q", photoUrl: null, adult: false, modelId: "zai-org-glm-5-2", tags: [], stats: {} },
];
async function fakeVenice(route) {
  const req = route.request(), url = req.url(), body = req.postData() || "", auth = req.headers().authorization || "";
  const cors = { "access-control-allow-origin": "*" };
  const ok = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data), headers: cors });
  if (req.method() === "OPTIONS") {
    return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" } });
  }
  if (url.includes("/models")) {
    return ok({ data: [
      { id: "zai-org-glm-5-2", model_spec: { name: "GLM 5.2", privacy: "private", traits: ["default"], availableContextTokens: 198000,
        capabilities: { supportsFunctionCalling: true, supportsReasoning: true }, pricing: { input: { usd: 1.4 }, output: { usd: 4.4 } } } },
      { id: "tiny-model", model_spec: { name: "Tiny", privacy: "anonymized", uncensored: true, availableContextTokens: 32000,
        capabilities: { supportsVision: true }, pricing: { input: { usd: 0.1 }, output: { usd: 0.2 } } } },
      { id: "beta-model", model_spec: { name: "Beta only", beta: true, privacy: "private", pricing: {} } }] });
  }
  if (auth !== "Bearer sk-good") return ok({ error: "Authentication failed" }, 401);
  if (url.includes("/billing/balance")) {
    return ok({ canConsume: true, consumptionCurrency: "USD", balances: { usd: 12.5, diem: null, bundledCredits: null, earnedCredits: null }, diemEpochAllocation: 0 });
  }
  if (url.includes("/characters")) {
    seen.characters.push(url);
    const q = new URL(url).searchParams, tag = q.get("tags");
    return ok({ object: "list", data: CHARACTERS.filter((c) => (q.get("isAdult") !== "false" || !c.adult) && (!tag || c.tags.includes(tag))) });
  }
  if (url.includes("/chat/completions")) {
    const b = JSON.parse(body);
    seen.chats.push(b);
    const system = b.messages[0] && b.messages[0].role === "system" ? b.messages[0].content : "";
    const lastSaid = (b.messages.at(-1) || {}).content || "";
    let reply;
    if (system.startsWith("You read a character")) {
      reply = JSON.stringify({ archetype: "gruff shopkeeper", premise: "keeps a log of every newcomer", setting: "a small port town",
        drives: ["help newcomers settle"], fears: ["losing the logbook"], voice: ["wry", "plain"], quirks: ["counts boats"],
        relationships: ["grudging guide to the user"], boundaries: ["won't oversell"], themes: ["arrival"] });
    } else if (system.startsWith("You are a character writer")) {
      assert.ok(body.includes("logbook") || body.includes("log of every"), "the writer gets the ideas");
      assert.ok(!body.includes("bait shop"), "the writer never sees the source");
      reply = JSON.stringify({ name: "Ines Corbel", tagline: "Ferry pilot with a pencil behind her ear",
        greeting: "Ticket? Kidding.\n\nWhere are you headed?",
        persona: "You are Ines Corbel, who pilots the morning ferry across a cold grey estuary. You sketch every passenger in a tiny notebook and give them the drawing at the far pier. You are cheerful, nosy and quick, and you hate fog.",
        examples: [{ user: "Is it far?", character: "Twelve minutes.\n\nNine if the gulls cooperate." }], tags: ["ferry"] });
    } else if (lastSaid.startsWith("[Start the conversation")) {
      reply = "Oh! Hi.\n\nCareful, the boxes bite.";
    } else {
      reply = "Mm. Good question.\n\nAsk me again after the tide.";
    }
    return ok({ choices: [{ message: { role: "assistant", content: reply } }], usage: { total_tokens: 42 } });
  }
  return ok({ error: "not found" }, 404);
}

// ---------- small waits ----------
async function until(page, fn, arg, what, timeout = 7000) {
  try { await page.waitForFunction(fn, arg, { timeout }); } catch { throw new Error("timed out waiting for " + what); }
}
const count = (page, sel, n, timeout) => until(page, ([s, n]) => document.querySelectorAll(s).length === n, [sel, n], `${n} of ${sel}`, timeout);
const has = (page, sel, re, timeout) => until(page, ([s, src, fl]) => [...document.querySelectorAll(s)].some((el) => new RegExp(src, fl).test(el.textContent)),
  [sel, re.source, re.flags], `${sel} to read ${re}`, timeout);
const textOf = (page, sel) => page.locator(sel).first().evaluate((el) => el.textContent);
async function poll(fn, what, timeout = 7000) {
  for (const t0 = Date.now(); !(await fn());) {
    if (Date.now() - t0 > timeout) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 50));
  }
}

const v2 = { spec: "chara_card_v2", spec_version: "2.0", data: { name: "Captain Ro", description: "{{char}} runs a bait shop at the end of the pier.",
  first_mes: "We're closed. Mostly.", mes_example: "<START>\n{{user}}: Worms?\n{{char}}: Manners?", creator: "someone", tags: [] } };

async function main() {
  const pw = await playwright();
  const { srv, base } = await serve();
  const errors = [], missing = [];
  const quiet = (t) => t.startsWith("Failed to load resource") || t.includes("example.com");
  const watch = (page, tag) => {
    page.on("console", (m) => { if (m.type() === "error" && !quiet(m.text())) errors.push(tag + m.text()); });
    page.on("pageerror", (e) => errors.push(tag + String(e)));
    page.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith(base)) missing.push(r.url()); });
  };
  const venice = async (page) => {
    await page.route(/^https:\/\/api\.venice\.ai\//, fakeVenice);
    // Venice's photos only come through its image service; asked for directly, they're refused
    await page.route(/^https:\/\/venice\.ai\/_next\/image\?/, (r) => { seen.photos.push(r.request().url()); r.fulfill({ status: 200, contentType: "image/png", body: PIXEL }); });
    await page.route(/^https:\/\/outerface\.venice\.ai\//, (r) => r.fulfill({ status: 403, contentType: "application/json", body: "{}" }));
  };
  if (SHOTS) await mkdir(SHOTS, { recursive: true });
  const shot = async (page, name, opts = {}) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name), ...opts }); };
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME || undefined,
    args: (process.env.CHROME_FLAGS || "").split(/\s+/).filter(Boolean) });
  try {
    // ---------- desktop ----------
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    watch(page, "");
    await venice(page);
    await page.goto(base);

    // the first visit: no key and nobody in the harbor, so empty frames and a note
    await count(page, "#vgrid li.ghost", 8);
    assert.match(await textOf(page, "#venstatus"), /venice key/);
    assert.match(await textOf(page, "#who-name"), /^chat$/i);
    await has(page, "#log .line.note .said", /paste your venice key/);
    assert.ok(await page.locator("#harbor-empty").isVisible(), "the empty harbor says so");
    assert.ok(await page.locator("#card-empty").isVisible(), "so does the empty card");
    assert.ok(await page.locator("#say").isDisabled(), "nobody to talk to yet");
    assert.equal(await page.evaluate(() => localStorage.length), 0, "a first visit keeps nothing");
    await page.waitForTimeout(150);
    await shot(page, "desktop.png");

    // a card comes in through the import dialog, and talks from its own examples without a key
    await page.click("#import");
    await page.setInputFiles("#file", { name: "ro.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(v2)) });
    await count(page, "#roster tr", 1);
    await has(page, "#who-name", /^Captain Ro$/);
    await has(page, "#log .line.them .said", /We're closed\. Mostly\./);
    await has(page, "#roster td", /Ported from Captain Ro by someone/);
    assert.ok(await page.locator("#keynote").isVisible(), "demo mode says so");
    await page.fill("#say", "Worms?");
    await page.keyboard.press("Enter");
    await has(page, "#log .line.me .said", /^Worms\?$/);
    await has(page, "#log .line.them .said", /^Manners\?$/);

    // the key: a bad one is refused, a good one is kept for this tab only
    await page.fill("#keyin", "sk-bad");
    await page.click("#keysave");
    await has(page, "#keystatus", /didn't accept/);
    await page.fill("#keyin", "sk-good");
    await page.click("#keysave");
    await has(page, "#keystatus", /saved for this tab/);
    assert.ok(await page.locator("#keynote").isHidden(), "no demo note with a key");
    assert.equal(await page.evaluate(() => localStorage.getItem("havre.key")), null, "an unremembered key stays out of localStorage");
    assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem("havre.key"))), "sk-good");

    // Venice's characters: adult ones only when asked for, and photos come through Venice's image service
    await count(page, "#vgrid li:not(.ghost)", 2);
    assert.ok(seen.characters.some((u) => /isAdult=false/.test(u) && /sortBy=featured/.test(u)), "no adult characters unless asked");
    await until(page, () => { const i = document.querySelector("#vgrid img"); return !!i && i.complete && i.naturalWidth > 0; }, null, "a character's photo");
    assert.ok(seen.photos[0].startsWith("https://venice.ai/_next/image?url=https%3A%2F%2Fouterface.venice.ai%2Fsable.png&w="), seen.photos[0]);
    assert.equal(await page.locator("#vgrid .noface").count(), 1, "no photo is an empty frame");
    await has(page, "#balance", /^balance \$12\.50$/);
    let asked = seen.characters.length;
    await page.selectOption("#vsort", "imports");
    await poll(() => seen.characters.length > asked, "a sorted search");
    assert.ok(seen.characters.at(-1).includes("sortBy=imports"), "the sort reaches Venice");
    await count(page, "#vgrid li:not(.ghost)", 2);
    await has(page, "#vgrid .nm", /Wren/);
    // a tag narrows the list, and comes off again
    asked = seen.characters.length;
    await page.getByRole("button", { name: "Only characters tagged neighbor" }).click();
    await poll(() => seen.characters.length > asked, "a search by tag");
    assert.ok(seen.characters.at(-1).includes("tags=neighbor"));
    await count(page, "#vgrid li:not(.ghost)", 1);
    await page.getByRole("button", { name: "Show every tag, not just neighbor" }).click();
    await count(page, "#vgrid li:not(.ghost)", 2);
    // adult characters, once someone says they're 18 or older
    page.once("dialog", (d) => d.accept());
    await page.check("#vadult");
    await count(page, "#vgrid li:not(.ghost)", 3);
    assert.ok(!seen.characters.at(-1).includes("isAdult"), "every character, adult ones too");
    await has(page, "#vgrid .x18", /18\+/);
    assert.equal(await page.evaluate(() => localStorage.getItem("havre.adult.18")), "true");
    await page.uncheck("#vadult");
    await count(page, "#vgrid li:not(.ghost)", 2);

    // one of them says hello first, through Venice, with their own prompt
    const chatsBefore = seen.chats.length;
    await page.locator("#vgrid .tile", { hasText: "Sable Penrose" }).click();
    await page.waitForTimeout(50);
    await has(page, "#who-name", /^Sable Penrose$/);
    await has(page, "#log .line.them .said", /Careful, the boxes bite\./);
    assert.equal(await page.locator("#log .line.me").count(), 0, "what started it isn't shown");
    const hello = seen.chats[chatsBefore];
    assert.equal(hello.venice_parameters.character_slug, "sable-penrose");
    assert.equal(hello.messages.length, 1);
    assert.equal(hello.messages[0].role, "user");
    await count(page, "#roster tr", 2);
    assert.match(await page.locator('#vgrid .tile[aria-pressed="true"]').evaluate((el) => el.textContent), /Sable Penrose.*talking now/);
    // the model: their own on Venice to start with, and any other Venice model from the picker
    await has(page, "#model-btn", /^GLM 5\.2$/);
    await page.click("#model-btn");
    await count(page, "#mlist tr", 2);
    assert.match(await textOf(page, "#mlist tr"), /GLM 5\.2.*their own/);
    assert.match(await page.locator("#mlist tr", { hasText: "Tiny" }).evaluate((el) => el.textContent), /anonymized.*sees.*uncensored.*\$0\.10 \/ \$0\.20.*32k/);
    await shot(page, "desktop-models.png");
    await page.getByRole("button", { name: "Use Tiny" }).click();
    await has(page, "#model-btn", /^Tiny$/);
    await page.fill("#say", "Do you have a boat?");
    await page.keyboard.press("Enter");
    await has(page, "#log .line.them .said", /Ask me again after the tide\./);
    assert.equal(seen.chats.at(-1).model, "tiny-model");
    await page.waitForTimeout(400);
    await shot(page, "desktop-chat.png");

    // a plain chat: no character, just a model, in one piece
    await page.click("#plain");
    await has(page, "#who-name", /^no character$/);
    await page.fill("#say", "What is a harbor?");
    await page.keyboard.press("Enter");
    await has(page, "#log .line.them .said", /Mm\. Good question\.\n\nAsk me again after the tide\./);
    const plain = seen.chats.at(-1);
    assert.equal(plain.messages[0].role, "user", "no system prompt of Havre's");
    assert.equal(plain.venice_parameters.include_venice_system_prompt, true);
    assert.ok(!plain.venice_parameters.character_slug);
    assert.ok(await page.locator("#card-body").isHidden(), "a plain chat has no card");

    // remix with credit, end to end, from the card that came in
    await page.locator("#roster tr", { hasText: "Captain Ro" }).getByRole("button", { name: "Remix Captain Ro" }).click();
    await has(page, "#rx-from", /^Captain Ro$/);
    assert.match(await textOf(page, "#rx-rights"), /reserves the rights/);
    await page.click("#rx-distill");
    await page.locator("#rx-ideas .chip").first().waitFor();
    await page.locator('#rx-ideas [aria-label="Add to Quirks"]').fill("hums sea shanties");
    await page.keyboard.press("Enter");
    await page.locator("#rx-ideas .chip", { hasText: "hums sea shanties" }).waitFor();
    await page.fill("#rx-twist", "make her a ferry pilot");
    await page.click("#rx-write");
    await has(page, "#rx-draft h4", /^Ines Corbel$/);
    assert.match(await page.locator("#rx-draft .verdict").getAttribute("class"), /fresh/);
    await shot(page, "desktop-remix.png");
    await page.locator("#rx-draft button", { hasText: "KEEP IN HARBOR" }).click();
    await has(page, "#who-name", /^Ines Corbel$/);
    await count(page, "#roster tr", 3);
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("havre.cards.v1")).find((c) => c.name === "Ines Corbel"));
    assert.equal(kept.lineage[0].relation, "inspired-by");
    assert.equal(kept.lineage[0].name, "Captain Ro");
    assert.match(kept.lineage[0].ref, /^sha256:/);

    // exports, made in the browser; the PNG comes back in whole
    await page.getByRole("button", { name: "Export Ines Corbel" }).click();
    let png = "";
    for (const [kind, ext] of [["havre", ".havre.json"], ["v3", ".card.json"], ["prompt", ".txt"], ["png", ".png"]]) {
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click(`[data-out="${kind}"]`)]);
      assert.equal(dl.suggestedFilename(), "ines-corbel" + ext);
      const path = await dl.path(), data = await readFile(path);
      if (kind === "havre") assert.equal(JSON.parse(data).havre, 1);
      if (kind === "v3") assert.equal(JSON.parse(data).spec, "chara_card_v3");
      if (kind === "prompt") assert.match(String(data), /^You are Ines Corbel/);
      if (kind === "png") {
        assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
        assert.ok(data.includes("ccv3") && data.includes("chara"), "the card rides inside the picture");
        png = path;
      }
    }
    await page.click("#import");
    await page.setInputFiles("#file", png);
    await count(page, "#roster tr", 4);

    // the security policy: nothing but api.venice.ai
    assert.equal(await page.evaluate(() => fetch("https://example.com/").then(() => "reached", () => "blocked")), "blocked");
    const csp = await page.evaluate(() => document.querySelector("meta[http-equiv=Content-Security-Policy]").content);
    assert.ok(csp.includes("connect-src https://api.venice.ai;"), csp);

    // the page below the studio
    assert.match(await textOf(page, "#agent-prompt"), /skill\.md/);
    await shot(page, "desktop-full.png", { fullPage: true });

    // a share card for links
    if (SHOTS) {
      const og = await ctx.newPage();
      watch(og, "og: ");
      await og.setViewportSize({ width: 1200, height: 630 });
      await og.goto(base + "tools/og.html");
      await shot(og, "og.png");
      await og.close();
    }
    await ctx.close();

    // ---------- the first version's cast leaves, unless someone changed them ----------
    const old = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p2 = await old.newPage();
    watch(p2, "earlier visitor: ");
    await venice(p2);
    await p2.goto(base);
    await p2.evaluate(() => {
      const seed = (id, name, updated) => ({ havre: 1, id, name, persona: "You are " + name + ".", portrait: `art/${id}.svg`,
        created: "2026-10-16T00:00:00.000Z", updated });
      localStorage.setItem("havre.cards.v1", JSON.stringify([seed("maren", "Maren", "2026-10-16T00:00:00.000Z"),
        seed("taskmaster", "Taskmaster", "2026-10-17T09:00:00.000Z"), seed("odile", "Odile", "2026-10-16T00:00:00.000Z")]));
      localStorage.setItem("havre.seeded.v1", "true");
      localStorage.setItem("havre.selected", JSON.stringify("maren"));
      localStorage.setItem("havre.chats.v1", JSON.stringify({ maren: [{ role: "user", content: "hi" }] }));
    });
    await p2.reload();
    await count(p2, "#roster tr", 1);
    const left = await p2.evaluate(() => ({ cards: JSON.parse(localStorage.getItem("havre.cards.v1")), seeded: localStorage.getItem("havre.seeded.v1"),
      chats: JSON.parse(localStorage.getItem("havre.chats.v1") || "{}") }));
    assert.deepEqual(left.cards.map((c) => c.id), ["taskmaster"]);
    assert.equal(left.cards[0].portrait, "", "the old drawings are gone, so is the link to them");
    assert.equal(left.seeded, null);
    assert.ok(!("maren" in left.chats));
    await has(p2, "#who-name", /^Taskmaster$/);
    await old.close();

    // ---------- phone ----------
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p3 = await phone.newPage();
    watch(p3, "phone: ");
    await venice(p3);
    await p3.goto(base);
    await count(p3, "#vgrid li.ghost", 8);
    const wide = () => p3.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(await wide() <= 390, `no sideways scroll on a phone (scrollWidth ${await wide()})`);
    await shot(p3, "phone.png");
    await p3.fill("#keyin", "sk-good");
    await p3.click("#keysave");
    await count(p3, "#vgrid li:not(.ghost)", 2);
    await p3.locator("#vgrid .tile", { hasText: "Wren" }).click();
    await has(p3, "#log .line.them .said", /Careful, the boxes bite\./);
    assert.ok(await p3.locator("#say").isVisible(), "the chat is on screen");
    assert.ok(await wide() <= 390, `still no sideways scroll (scrollWidth ${await wide()})`);
    await p3.waitForTimeout(500);
    await shot(p3, "phone-chat.png");
    await shot(p3, "phone-full.png", { fullPage: true });
    await phone.close();
  } finally {
    await browser.close();
    srv.close();
  }
  if (errors.length || missing.length) {
    console.error("console errors:", ...errors.map((e) => "\n  " + e), "\nmissing files:", ...missing.map((u) => "\n  " + u));
    process.exit(1);
  }
  console.log("smoke ok" + (SHOTS ? ", screenshots in " + SHOTS : ""));
}

main().catch((e) => { console.error(e); process.exit(1); });
