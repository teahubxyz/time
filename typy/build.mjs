import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(here, 'public/index.html'), 'utf8');
const page = 'const TEMPLATE = ' + JSON.stringify(html) + ';\n' +
  'const escape = (s) => String(s ?? "").replace(/[&<>"\\x27]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",\'"\':"&quot;","\\x27":"&#39;"}[c]));\n' +
  'export function renderPage(meta = {}) {\n' +
  'const title = escape(meta.title || "typy — one word at a time");\n' +
  'const description = escape(meta.description || "Find your rhythm. One word at a time, a little faster with every beat. Type, replay, and race a friend.");\n' +
  'const image = escape(meta.image || "https://typy.lol/api/og/default.png");\n' +
  'const url = escape(meta.url || "https://typy.lol/");\n' +
  'const tags = "<title>" + title + "</title><meta name=\\"description\\" content=\\"" + description + "\\"><meta property=\\"og:type\\" content=\\"website\\"><meta property=\\"og:title\\" content=\\"" + title + "\\"><meta property=\\"og:description\\" content=\\"" + description + "\\"><meta property=\\"og:url\\" content=\\"" + url + "\\"><meta property=\\"og:image\\" content=\\"" + image + "\\"><meta property=\\"og:image:width\\" content=\\"1200\\"><meta property=\\"og:image:height\\" content=\\"630\\"><meta name=\\"twitter:card\\" content=\\"summary_large_image\\">";\n' +
  'const more = "<link rel=\\"canonical\\" href=\\"" + url + "\\"><meta property=\\"og:site_name\\" content=\\"typy\\"><meta property=\\"og:image:alt\\" content=\\"" + title + "\\"><meta name=\\"twitter:title\\" content=\\"" + title + "\\"><meta name=\\"twitter:description\\" content=\\"" + description + "\\"><meta name=\\"twitter:image\\" content=\\"" + image + "\\">";\n' +
  'return TEMPLATE.replace("<!--OG-->", tags + more);\n}\n';
await writeFile(join(here, 'src/page.js'), page);
// Everything in public/ is served at its own path, beside the modules the browser
// shares with the Worker. A new file needs no list, only a build.
const TYPES = {'.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json; charset=utf-8'};
// Images ride along as base64 (the Worker decodes them); everything else is text.
const BINARY = new Set(['.png']);
const sources = [];
async function collect(dir) {
  const entries = (await readdir(join(here, dir), {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const path = dir + '/' + entry.name;
    if (entry.isDirectory()) await collect(path);
    else if (TYPES[extname(entry.name)]) sources.push([path.slice('public'.length), path]);
  }
}
await collect('public');
for (const name of ['game.js', 'words.js', 'jam.js']) sources.push(['/' + name, 'src/' + name]);
const assets = {};
for (const [url, path] of sources) {
  const data = await readFile(join(here, path));
  assets[url] = BINARY.has(extname(path))
    ? {body: data.toString('base64'), type: TYPES[extname(path)], source: path, encoding: 'base64'}
    : {body: data.toString('utf8'), type: TYPES[extname(path)], source: path};
}
await writeFile(join(here, 'src/assets.js'), 'export const ASSETS = ' + JSON.stringify(assets) + ';\n');
console.log('typy: built ' + Object.keys(assets).length + ' assets');
