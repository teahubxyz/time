// quc: app shell + API in one Worker (no build step; the same module runs on Cloudflare and under dev.mjs).
//   GET /            the shell (start form)   GET /run/:id  the shell (chair view)   GET /chair.svg  the chair-in-the-corner motif
//   GET /api/health  {ok, rev}                anything else  404
// Fonts: system stacks on purpose (no webfont files, no third-party requests). shortcut: swap in self-hosted fonts when the brand picks them.

export const CHAIR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="A chair in the corner of the room">
<path d="M0 118h120M118 0v120" stroke="currentColor" stroke-width="2" fill="none" opacity=".35"/>
<g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
<path d="M44 20 40 66M44 20h30l6 46M40 66h46M44 66l-4 44M82 66l4 44M66 66l-2 44"/></g></svg>`;

// Inlined into the page via toString(), so the browser and the tests run the same code. Returns {repo?, task?} errors; {} is valid.
export function validate(repo, task) {
  const e = {};
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+?(\.git)?\/?$/.test(repo)) e.repo = "Use a public GitHub repo URL, like https://github.com/owner/name.";
  if (task.length < 10) e.task = "Say a bit more: at least 10 characters.";
  else if (task.length > 200) e.task = "Keep it to one line: 200 characters at most.";
  return e;
}

const NOTICE = "Replays are public. Anyone with the link to a run can watch it, so don't point this at anything you wouldn't show a stranger.";

export const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>quc</title>
<meta name="description" content="Give quc a public repo and one line of task. It sits in the corner and does the work.">
<style>
:root{--bg:#faf9f6;--fg:#1d1d1b;--mute:#6b6a65;--line:#e3e1da;--accent:#2f6fdf;--err:#b3261e;--serif:ui-serif,Georgia,"Times New Roman",serif;--sans:system-ui,-apple-system,"Segoe UI",sans-serif}
@media (prefers-color-scheme:dark){:root{--bg:#161614;--fg:#ecebe6;--mute:#9b9a94;--line:#2c2b28;--accent:#7aa5ff;--err:#ff8a80}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--fg);font:16px/1.5 var(--sans)}
header,footer{padding:16px;max-width:960px;width:100%;margin:0 auto}
header{border-bottom:1px solid var(--line);font:600 20px var(--serif)}
main{flex:1;max-width:960px;width:100%;margin:0 auto;padding:32px 16px 160px}
h1{font:600 clamp(28px,6vw,48px)/1.1 var(--serif);margin:0 0 12px}
p{margin:0 0 16px;color:var(--mute)}
[hidden]{display:none}
form{max-width:560px}
label{display:block;font-weight:600;margin-bottom:4px}
input,button{font:inherit;width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:6px;background:transparent;color:var(--fg)}
input[aria-invalid=true]{border-color:var(--err)}
button{width:auto;background:var(--accent);border-color:var(--accent);color:var(--bg);font-weight:600;cursor:pointer}
.field{margin-bottom:16px}.field p{margin:4px 0 0}
.err{color:var(--err);font-size:14px}
.notice{max-width:560px;padding:10px 12px;border-left:3px solid var(--accent);background:var(--line);color:var(--fg);font-size:14px}
dt{font-weight:600}dd{margin:0 0 12px;overflow-wrap:anywhere}
#health::before{content:"";display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px;background:var(--mute)}
#health[data-ok=true]::before{background:#2a9d4a}#health[data-ok=false]::before{background:#d33}
.chair{position:fixed;right:0;bottom:0;width:clamp(96px,22vw,160px);color:var(--fg);pointer-events:none}
</style></head><body>
<header>quc</header>
<main>
<section id="start">
<h1>Leave it with the chair.</h1>
<p>Point quc at a public GitHub repo, say in one line what you want done, and go do something else. It works in the corner, quietly, and you can watch the replay.</p>
<form id="form" novalidate>
<div class="field"><label for="repo">Public GitHub repo</label>
<input id="repo" name="repo" type="url" inputmode="url" autocomplete="off" placeholder="https://github.com/owner/name" aria-describedby="repo-err">
<p class="err" id="repo-err" role="alert"></p></div>
<div class="field"><label for="task">One-line task</label>
<input id="task" name="task" type="text" autocomplete="off" maxlength="400" placeholder="Fix the flaky date test in utils" aria-describedby="task-err">
<p class="err" id="task-err" role="alert"></p></div>
<p class="notice" role="note">${NOTICE}</p>
<button type="submit">Start a run</button>
</form>
</section>
<section id="run" hidden>
<h1>Run <span id="run-id"></span></h1>
<p>The chair is in the corner. Nothing has been done yet.</p>
<dl><dt>Repo</dt><dd id="run-repo"></dd><dt>Task</dt><dd id="run-task"></dd></dl>
<p class="notice" role="note">${NOTICE}</p>
</section>
</main>
<footer><span id="health">checking…</span></footer>
<img class="chair" src="/chair.svg" alt="">
<script>
// the SVG uses currentColor, which an <img> cannot inherit: inline it instead
fetch("/chair.svg").then((r) => r.text()).then((s) => { const i = document.querySelector(".chair"), d = document.createElement("div"); d.className = "chair"; d.innerHTML = s; d.firstElementChild.setAttribute("aria-hidden", "true"); i.replaceWith(d); }).catch(() => {});
const h = document.getElementById("health");
fetch("/api/health").then((r) => r.json()).then((j) => { h.dataset.ok = !!j.ok; h.textContent = j.ok ? "API healthy" : "API unhealthy"; })
  .catch(() => { h.dataset.ok = false; h.textContent = "API unreachable"; });

${validate}
const $ = (id) => document.getElementById(id);
const show = (repo, task, errs) => ["repo", "task"].forEach((k) => { $(k + "-err").textContent = errs[k] || ""; $(k).setAttribute("aria-invalid", !!errs[k]); });
// shortcut: no run store yet, so the run lives in the link (id + repo + task in the URL); move it server-side when runs persist.
$("form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const repo = $("repo").value.trim(), task = $("task").value.trim(), errs = validate(repo, task);
  show(repo, task, errs);
  if (Object.keys(errs).length) return $(errs.repo ? "repo" : "task").focus();
  location.assign("/run/" + crypto.randomUUID().slice(0, 8) + "?" + new URLSearchParams({ repo, task }));
});
const m = location.pathname.match(/^\\/run\\/([\\w-]+)$/), q = new URLSearchParams(location.search);
if (m) {
  const ok = !Object.keys(validate(q.get("repo") || "", q.get("task") || "")).length;
  $("start").hidden = true; $("run").hidden = false;
  $("run-id").textContent = m[1];
  $("run-repo").textContent = ok ? q.get("repo") : "(unknown)"; $("run-task").textContent = ok ? q.get("task") : "(unknown)";
  document.title = "quc: run " + m[1];
}
</script></body></html>`;

const headers = (type, extra = {}) => ({ "content-type": type, ...extra });

export default {
  async fetch(req, env = {}) {
    const { pathname } = new URL(req.url);
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405 });
    if (pathname === "/api/health") return Response.json({ ok: true, rev: env.REV || "" }, { headers: { "cache-control": "no-store" } });
    if (pathname === "/chair.svg") return new Response(CHAIR, { headers: headers("image/svg+xml", { "cache-control": "public, max-age=3600" }) });
    if (pathname === "/" || pathname === "/index.html" || /^\/run\/[\w-]+$/.test(pathname)) return new Response(PAGE, { headers: headers("text/html; charset=utf-8") });
    return new Response("not found", { status: 404 });
  },
};
