import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(here, 'public/index.html'), 'utf8');
const page = 'const TEMPLATE = ' + JSON.stringify(html) + ';\n' +
  'const escape = (s) => String(s ?? "").replace(/[&<>"\\x27]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",\'"\':"&quot;","\\x27":"&#39;"}[c]));\n' +
  'export function renderPage(meta = {}) {\n' +
  'const title = escape(meta.title || "typy — one word at a time");\n' +
  'const description = escape(meta.description || "Find your rhythm. One word at a time, a little faster with every beat. Type, replay, and race a friend.");\n' +
  'const image = escape(meta.image || "https://typy.yolopreneur.lol/api/og/default.png");\n' +
  'const url = escape(meta.url || "https://typy.yolopreneur.lol/");\n' +
  'const tags = "<title>" + title + "</title><meta name=\\"description\\" content=\\"" + description + "\\"><meta property=\\"og:type\\" content=\\"website\\"><meta property=\\"og:title\\" content=\\"" + title + "\\"><meta property=\\"og:description\\" content=\\"" + description + "\\"><meta property=\\"og:url\\" content=\\"" + url + "\\"><meta property=\\"og:image\\" content=\\"" + image + "\\"><meta property=\\"og:image:width\\" content=\\"1200\\"><meta property=\\"og:image:height\\" content=\\"630\\"><meta name=\\"twitter:card\\" content=\\"summary_large_image\\">";\n' +
  'return TEMPLATE.replace("<!--OG-->", tags);\n}\n';
await writeFile(join(here, 'src/page.js'), page);
const assets = {};
for (const [url, path, type] of [
  ['/app.js', 'public/app.js', 'text/javascript; charset=utf-8'],
  ['/style.css', 'public/style.css', 'text/css; charset=utf-8'],
  ['/favicon.svg', 'public/favicon.svg', 'image/svg+xml'],
  ['/game.js', 'src/game.js', 'text/javascript; charset=utf-8'],
  ['/words.js', 'src/words.js', 'text/javascript; charset=utf-8'],
]) {
  assets[url] = {body: await readFile(join(here, path), 'utf8'), type};
}
await writeFile(join(here, 'src/assets.js'), 'export const ASSETS = ' + JSON.stringify(assets) + ';\n');
console.log('typy: built ' + Object.keys(assets).length + ' assets');
