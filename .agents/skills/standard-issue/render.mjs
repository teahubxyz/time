#!/usr/bin/env node
// Standard issue: render a page folder's raster assets with headless Chrome (see SKILL.md).
//   node render.mjs <dir> [--css fonts/fonts.css]
// <dir>/icon.svg                    -> favicon-32.png, icon-192.png, icon-512.png (corners stay transparent)
// <dir>/icon-maskable.svg (or icon) -> icon-maskable-512.png, apple-touch-icon.png (full bleed: iOS and Android round it)
// <dir>/og.html (or index.html)     -> og.png, the 1200x630 link-preview card
// --css: a stylesheet inside <dir> (e.g. self-hosted fonts) for the SVG renders, so text in the icon uses the page's font.
import { createRequire } from 'module';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { resolve, join, extname, normalize, sep } from 'path';

const require = createRequire(process.env.STANDARD_ISSUE_MODULES || '/Users/hyperbox/claude/pydgn-test/node_modules/');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const argv = process.argv.slice(2);
const dir = resolve(argv[0] || '.');
const css = argv.includes('--css') ? argv[argv.indexOf('--css') + 1] : '';
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const wrap = (file, size) => `<!doctype html><meta charset="utf-8">${css ? `<link rel="stylesheet" href="/${css}">` : ''}` +
  `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>` + readFileSync(join(dir, file), 'utf8');

const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  if (u.pathname === '/__icon') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(wrap(u.searchParams.get('f'), Number(u.searchParams.get('s'))));
  }
  const file = normalize(join(dir, decodeURIComponent(u.pathname)));
  if (!(file + sep).startsWith(dir + sep) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
const made = [];
async function shot(url, w, h, out, transparent) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 150)); // let a layout script (e.g. og.html placing an element) run once fonts are in
  await page.screenshot({ path: join(dir, out), omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
  made.push(`${out} ${w}x${h}`);
}
try {
  if (!existsSync(join(dir, 'icon.svg'))) throw new Error(`no icon.svg in ${dir}`);
  for (const [size, out] of [[32, 'favicon-32.png'], [192, 'icon-192.png'], [512, 'icon-512.png']]) await shot(`${base}/__icon?f=icon.svg&s=${size}`, size, size, out, true);
  const mask = existsSync(join(dir, 'icon-maskable.svg')) ? 'icon-maskable.svg' : 'icon.svg';
  for (const [size, out] of [[512, 'icon-maskable-512.png'], [180, 'apple-touch-icon.png']]) await shot(`${base}/__icon?f=${mask}&s=${size}`, size, size, out, false);
  await shot(`${base}/${existsSync(join(dir, 'og.html')) ? 'og.html' : 'index.html'}`, 1200, 630, 'og.png', false);
} finally {
  await browser.close();
  server.close();
}
console.log(made.join('\n'));
