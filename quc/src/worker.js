// quc: app shell + API in one Worker (no build step; the same module runs on Cloudflare and under dev.mjs).
//   GET /            the shell        GET /chair.svg   the chair-in-the-corner motif
//   GET /api/health  {ok, rev}        anything else    404
// Fonts: system stacks on purpose (no webfont files, no third-party requests). shortcut: swap in self-hosted fonts when the brand picks them.

export const CHAIR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="A chair in the corner of the room">
<path d="M0 118h120M118 0v120" stroke="currentColor" stroke-width="2" fill="none" opacity=".35"/>
<g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
<path d="M44 20 40 66M44 20h30l6 46M40 66h46M44 66l-4 44M82 66l4 44M66 66l-2 44"/></g></svg>`;

export const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>quc</title>
<meta name="description" content="quc">
<style>
:root{--bg:#faf9f6;--fg:#1d1d1b;--mute:#6b6a65;--line:#e3e1da;--accent:#2f6fdf;--serif:ui-serif,Georgia,"Times New Roman",serif;--sans:system-ui,-apple-system,"Segoe UI",sans-serif}
@media (prefers-color-scheme:dark){:root{--bg:#161614;--fg:#ecebe6;--mute:#9b9a94;--line:#2c2b28;--accent:#7aa5ff}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--fg);font:16px/1.5 var(--sans)}
header,footer{padding:16px;max-width:960px;width:100%;margin:0 auto}
header{border-bottom:1px solid var(--line);font:600 20px var(--serif)}
main{flex:1;max-width:960px;width:100%;margin:0 auto;padding:32px 16px 160px}
h1{font:600 clamp(28px,6vw,48px)/1.1 var(--serif);margin:0 0 12px}
p{margin:0 0 16px;color:var(--mute)}
#health::before{content:"";display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px;background:var(--mute)}
#health[data-ok=true]::before{background:#2a9d4a}#health[data-ok=false]::before{background:#d33}
.chair{position:fixed;right:0;bottom:0;width:clamp(96px,22vw,160px);color:var(--fg);pointer-events:none}
</style></head><body>
<header>quc</header>
<main><h1>Coming together.</h1><p>The app shell is up. Nothing to do here yet.</p><p id="health">checking…</p></main>
<footer></footer>
<img class="chair" src="/chair.svg" alt="">
<script>
// the SVG uses currentColor, which an <img> cannot inherit: inline it instead
fetch("/chair.svg").then((r) => r.text()).then((s) => { const i = document.querySelector(".chair"), d = document.createElement("div"); d.className = "chair"; d.innerHTML = s; d.firstElementChild.setAttribute("aria-hidden", "true"); i.replaceWith(d); }).catch(() => {});
const h = document.getElementById("health");
fetch("/api/health").then((r) => r.json()).then((j) => { h.dataset.ok = !!j.ok; h.textContent = j.ok ? "API healthy" : "API unhealthy"; })
  .catch(() => { h.dataset.ok = false; h.textContent = "API unreachable"; });
</script></body></html>`;

const headers = (type, extra = {}) => ({ "content-type": type, ...extra });

export default {
  async fetch(req, env = {}) {
    const { pathname } = new URL(req.url);
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405 });
    if (pathname === "/api/health") return Response.json({ ok: true, rev: env.REV || "" }, { headers: { "cache-control": "no-store" } });
    if (pathname === "/chair.svg") return new Response(CHAIR, { headers: headers("image/svg+xml", { "cache-control": "public, max-age=3600" }) });
    if (pathname === "/" || pathname === "/index.html") return new Response(PAGE, { headers: headers("text/html; charset=utf-8") });
    return new Response("not found", { status: 404 });
  },
};
