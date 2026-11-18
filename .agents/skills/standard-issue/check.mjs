#!/usr/bin/env node
// Standard issue check (see SKILL.md): is this page an installable PWA with link previews, and does it work offline?
//   node check.mjs <url> [--no-offline]     (on hb-5; STANDARD_ISSUE_MODULES and CHROME override the defaults below)
// Prints one line per check and exits 1 if anything fails. Warnings are worth fixing but don't fail the page.
import { createRequire } from 'module';

const require = createRequire(process.env.STANDARD_ISSUE_MODULES || '/Users/hyperbox/claude/pydgn-test/node_modules/');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const argv = process.argv.slice(2);
const target = argv.find((a) => !a.startsWith('--'));
if (!target) { console.error('usage: node check.mjs <url> [--no-offline]'); process.exit(2); }
const results = [];
const add = (level) => (what, note = '') => results.push({ level, what, note });
const pass = add('pass'), warn = add('warn'), fail = add('fail');

const pngSize = (b) => (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null);
async function get(url) {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    return { ok: res.ok, status: res.status, type: res.headers.get('content-type') || '', buf: Buffer.from(await res.arrayBuffer()) };
  } catch (e) { return { ok: false, status: 0, type: '', buf: Buffer.alloc(0), error: String(e.message || e) }; }
}
async function image(what, url, want, required = true) { // fetch an image and compare its PNG size with want [w, h]
  if (!url) return (required ? fail : warn)(what, 'missing');
  const r = await get(url);
  if (!r.ok) return (required ? fail : warn)(what, `HTTP ${r.status || r.error} at ${url}`);
  const size = pngSize(r.buf);
  if (want && size && (size[0] !== want[0] || size[1] !== want[1])) return warn(what, `${size.join('x')}, expected ${want.join('x')}`);
  pass(what, size ? size.join('x') : r.type);
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 1280, height: 860 });
  const res = await page.goto(target, { waitUntil: 'networkidle2', timeout: 30000 });
  if (!res || !res.ok()) throw new Error(`the page answered HTTP ${res && res.status()}`);
  const h = await page.evaluate(() => {
    const attr = (sel, a = 'content') => document.querySelector(sel)?.getAttribute(a) ?? null;
    const props = (sel, key) => Object.fromEntries([...document.querySelectorAll(sel)].map((m) => [m.getAttribute(key), m.getAttribute('content')]));
    let css = '';
    for (const sheet of document.styleSheets) { try { for (const r of sheet.cssRules) css += r.cssText; } catch (e) { /* cross-origin sheet */ } }
    return {
      lang: document.documentElement.lang, title: document.title, description: attr('meta[name="description"]'),
      viewport: attr('meta[name="viewport"]'), theme: attr('meta[name="theme-color"]'),
      canonical: document.querySelector('link[rel="canonical"]')?.href || null, manifest: document.querySelector('link[rel="manifest"]')?.href || null,
      icon: document.querySelector('link[rel~="icon"]')?.href || null, apple: document.querySelector('link[rel="apple-touch-icon"]')?.href || null,
      og: props('meta[property^="og:"]', 'property'), tw: props('meta[name^="twitter:"]', 'name'), safe: /safe-area-inset/.test(css),
    };
  });
  pass('page loads', `HTTP ${res.status()}, "${h.title}"`);
  h.lang ? pass('html lang', h.lang) : warn('html lang', 'missing');
  h.description ? pass('meta description') : warn('meta description', 'missing');
  if (!h.viewport) fail('viewport', 'no <meta name="viewport">');
  else if (!/viewport-fit\s*=\s*cover/.test(h.viewport)) warn('viewport', 'add viewport-fit=cover so an installed app can use the whole screen');
  else pass('viewport', 'viewport-fit=cover');
  h.safe ? pass('safe areas', 'env(safe-area-inset-*) in the CSS') : warn('safe areas', 'no env(safe-area-inset-*): installed, the status bar or window controls can cover the top');
  h.theme ? pass('theme-color', h.theme) : warn('theme-color', 'missing');
  h.canonical && h.canonical.startsWith('https://') ? pass('canonical', h.canonical) : warn('canonical', h.canonical || 'missing');

  // Link previews: what a chat app or social site shows when someone pastes the link
  for (const k of ['og:title', 'og:description']) h.og[k] ? pass(k, h.og[k].slice(0, 70)) : fail(k, 'missing');
  for (const k of ['og:url', 'og:type', 'og:site_name', 'og:image:alt']) h.og[k] ? pass(k, h.og[k].slice(0, 70)) : warn(k, 'missing');
  h.tw['twitter:card'] === 'summary_large_image' ? pass('twitter:card') : fail('twitter:card', `${h.tw['twitter:card'] || 'missing'}, want summary_large_image`);
  const og = h.og['og:image'];
  if (!og) fail('og:image', 'missing');
  else if (!/^https:\/\//.test(og)) fail('og:image', `${og}: crawlers need an absolute https URL`);
  else {
    const live = await get(og);
    const local = new URL(new URL(og).pathname, target).href;
    if (live.ok) await image('og:image', og, [1200, 630]);
    else if (local !== og && (await get(local)).ok) { warn('og:image', `not live at ${og} yet`); await image('og:image (this copy)', local, [1200, 630]); }
    else fail('og:image', `HTTP ${live.status || live.error} at ${og}`);
  }

  // Icons and the manifest: what makes it installable and look right on a home screen
  await image('favicon', h.icon, null);
  await image('apple-touch-icon', h.apple, [180, 180]);
  if (!h.manifest) fail('manifest', 'no <link rel="manifest">');
  else {
    const m = await get(h.manifest);
    let man = null;
    try { man = JSON.parse(m.buf.toString('utf8')); } catch (e) { fail('manifest', m.ok ? 'not valid JSON' : `HTTP ${m.status || m.error}`); }
    if (man) {
      /manifest\+json|json/.test(m.type) ? pass('manifest', `${man.name || man.short_name}`) : warn('manifest', `served as ${m.type || 'no content-type'}`);
      man.name || man.short_name ? null : fail('manifest name', 'no name or short_name');
      man.start_url ? null : warn('manifest start_url', 'missing');
      ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].includes(man.display) || (man.display_override || []).length
        ? pass('manifest display', man.display) : fail('manifest display', `${man.display || 'missing'}, want standalone`);
      man.theme_color && man.background_color ? null : warn('manifest colors', 'theme_color and background_color');
      const icons = man.icons || [];
      const find = (px) => icons.find((i) => (i.sizes || '').split(/\s+/).includes(`${px}x${px}`) && !/maskable/.test(i.purpose || '') || false);
      for (const px of [192, 512]) {
        const icon = find(px);
        await image(`manifest icon ${px}`, icon && new URL(icon.src, h.manifest).href, [px, px]);
      }
      const mask = icons.find((i) => /maskable/.test(i.purpose || ''));
      mask ? await image('manifest maskable icon', new URL(mask.src, h.manifest).href, null) : warn('manifest maskable icon', 'missing: Android crops the icon into a circle or squircle');
    }
  }
  const cdp = await page.createCDPSession();
  const { installabilityErrors: ie } = await cdp.send('Page.getInstallabilityErrors');
  ie.length ? fail('installable (Chrome)', ie.map((e) => e.errorId).join(', ')) : pass('installable (Chrome)');

  // Service worker and offline
  const scope = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return null;
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 8000))]);
    return reg && reg.scope;
  });
  if (!scope) fail('service worker', 'none registered within 8 s');
  else {
    pass('service worker', scope);
    if (!argv.includes('--no-offline')) {
      await page.reload({ waitUntil: 'networkidle2' });
      const title = await page.title();
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      try {
        await page.reload({ waitUntil: 'load', timeout: 15000 });
        (await page.title()) === title ? pass('works offline', 'reloads with the network off') : fail('works offline', `offline reload showed "${await page.title()}"`);
      } catch (e) { fail('works offline', String(e.message || e).split('\n')[0]); }
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    }
  }
  errors.length ? warn('console', `${errors.length} error(s), first: ${errors[0].slice(0, 120)}`) : pass('console', 'no errors');
} catch (e) {
  fail('check', String(e.message || e).split('\n')[0]);
} finally {
  await browser.close();
}
const mark = { pass: '✓', warn: '!', fail: '✗' };
for (const r of results) console.log(`${mark[r.level]} ${r.what}${r.note ? `: ${r.note}` : ''}`);
const count = (l) => results.filter((r) => r.level === l).length;
console.log(`\nstandard issue: ${count('pass')} pass, ${count('warn')} warn, ${count('fail')} fail (share links are checked by hand: SKILL.md)`);
process.exit(count('fail') ? 1 : 0);
