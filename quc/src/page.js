// The one page: start screen at /, the chair (live run, or the replay with its scrubber) at /run/:id.
// The browser code lives in real functions below and is inlined with toString(), so there is nothing to escape and no build.
import { validate } from "./validate.js";

export const CHAIR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="A chair in the corner of the room">
<path d="M0 118h120M118 0v120" stroke="currentColor" stroke-width="2" fill="none" opacity=".35"/>
<g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
<path d="M44 20 40 66M44 20h30l6 46M40 66h46M44 66l-4 44M82 66l4 44M66 66l-2 44"/></g></svg>`;

const CSS = `
:root{--bg:#f7f5f0;--fg:#1b1a17;--mute:#6d6b64;--line:#e2dfd6;--card:#fffdf8;--accent:#7a3cff;--accent-fg:#fff;--add:#e3f6e8;--add-fg:#14532d;--del:#fbe7e7;--del-fg:#7f1d1d;--warn:#b42318;--serif:ui-serif,Georgia,"Times New Roman",serif;--sans:system-ui,-apple-system,"Segoe UI",sans-serif;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root{--bg:#141312;--fg:#ecebe6;--mute:#9a988f;--line:#2b2a27;--card:#1b1a18;--accent:#a98bff;--accent-fg:#141312;--add:#12301d;--add-fg:#b6f0c6;--del:#3a1616;--del-fg:#ffc2c2;--warn:#ff8a80}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--fg);font:16px/1.55 var(--sans)}
a{color:var(--accent)}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line);max-width:1200px;margin:0 auto}
header a.brand{font:600 22px var(--serif);color:var(--fg);text-decoration:none}
main{max-width:1200px;margin:0 auto;padding:24px 16px 180px}
h1{font:600 clamp(30px,6vw,52px)/1.08 var(--serif);margin:0 0 12px;letter-spacing:-.01em}
h2{font:600 20px var(--serif);margin:0 0 8px}
p{margin:0 0 14px}.mute{color:var(--mute)}
[hidden]{display:none!important}
form{max-width:560px;margin-top:20px}
label{display:block;font-weight:600;margin-bottom:4px}
input,button,textarea{font:inherit;color:var(--fg)}
input[type=text],input[type=url]{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:8px;background:var(--card)}
input[aria-invalid=true]{border-color:var(--warn)}
button{padding:10px 16px;border-radius:8px;border:1px solid var(--line);background:var(--card);cursor:pointer;font-weight:600}
button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-fg)}
button.safeword{background:#c62828;border-color:#c62828;color:#fff;font-size:17px;padding:12px 20px}
button:disabled{opacity:.5;cursor:default}
.field{margin-bottom:16px}.err{color:var(--warn);font-size:14px;margin:4px 0 0;min-height:1em}
.notice{padding:10px 12px;border-left:3px solid var(--accent);background:var(--card);font-size:14px}
.rules{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:28px 0;max-width:900px}
.rules div{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}
.rules b{display:block;font-family:var(--serif);font-size:18px;margin-bottom:4px}
.bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin-bottom:16px}
.status{font-size:14px;padding:4px 10px;border-radius:99px;background:var(--card);border:1px solid var(--line)}
.status[data-s=running]::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:#2a9d4a;margin-right:6px;animation:pulse 1.2s infinite}
@keyframes pulse{50%{opacity:.25}}
.grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr);gap:16px}
@media (max-width:820px){.grid{grid-template-columns:minmax(0,1fr)}}
.panel{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;min-width:0}
.feed{display:flex;flex-direction:column;gap:10px;max-height:62vh;overflow:auto}
.say{border-left:3px solid var(--accent);padding:2px 0 2px 10px;font-family:var(--serif);font-size:17px}
.sys{font-size:13px;color:var(--mute)}
.note{align-self:flex-end;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:6px 10px;font-size:14px;max-width:85%}
.unlock{font-size:13px;font-weight:600;color:var(--accent)}
.files{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.files button{font:12px var(--mono);padding:4px 8px;font-weight:400}
.files button[aria-pressed=true]{border-color:var(--accent);color:var(--accent)}
pre.diff{margin:0;font:12.5px/1.45 var(--mono);overflow:auto;max-height:62vh;white-space:pre}
pre.diff span{display:block;padding:0 8px}
pre.diff .a{background:var(--add);color:var(--add-fg)}pre.diff .d{background:var(--del);color:var(--del-fg)}pre.diff .h{color:var(--mute)}
.commit{font:12px var(--mono);color:var(--mute);margin:0 0 8px}
.saybox{display:flex;gap:8px;margin-top:12px}.saybox input{flex:1}
.scrub{display:flex;align-items:center;gap:10px;margin:0 0 16px}.scrub input{flex:1;accent-color:var(--accent)}
.after{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:0 0 16px}
.after div{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}
.after b{display:block;font:600 24px var(--serif)}
.chair{position:fixed;right:0;bottom:0;width:clamp(84px,18vw,150px);color:var(--fg);pointer-events:none;opacity:.85}
`;

// ---------- browser code ----------

function client(validate) {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const api = async (path, opts = {}) => {
    const r = await fetch(path, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status: r.status, body: j });
    return j;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  fetch("/chair.svg").then((r) => r.text()).then((s) => { const d = document.createElement("div"); d.className = "chair"; d.innerHTML = s; d.firstElementChild.setAttribute("aria-hidden", "true"); document.body.append(d); }).catch(() => {});

  const m = location.pathname.match(/^\/run\/([\w-]+)$/);
  if (!m) return startScreen();
  return chair(m[1]);

  function startScreen() {
    $("start").hidden = false;
    $("form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const repo = $("repo").value.trim(), task = $("task").value.trim(), errs = validate(repo, task);
      for (const k of ["repo", "task"]) { $(k + "-err").textContent = errs[k] || ""; $(k).setAttribute("aria-invalid", !!errs[k]); }
      if (Object.keys(errs).length) return $(errs.repo ? "repo" : "task").focus();
      const b = $("go"); b.disabled = true; b.textContent = "Taking your seat…";
      try {
        const j = await api("/api/runs", { method: "POST", body: JSON.stringify({ repo, task }) });
        location.assign("/run/" + j.id);
      } catch (e) {
        if (e.body?.id) return location.assign("/run/" + e.body.id);
        $("task-err").textContent = e.message; b.disabled = false; b.textContent = "Hand it over";
      }
    });
  }

  function chair(id) {
    $("run").hidden = false;
    document.title = "quc: run " + id;
    let run = null, owner = false, events = [], at = 0, live = false, pick = null;

    const render = () => {
      if (!run) return;
      const shown = events.slice(0, at);
      $("run-task").textContent = run.task;
      $("run-repo").textContent = run.repo; $("run-repo").href = run.repo;
      const st = run.status === "ended" ? { finished: "Finished", safeworded: "Safeworded", unlocked: "You took the wheel" }[run.outcome] : run.status === "queued" ? "Taking over…" : "Working on your repo";
      $("status").textContent = st; $("status").dataset.s = run.status;
      $("safeword").hidden = !(owner && run.status !== "ended");
      $("saybox").hidden = !(owner && run.status !== "ended");
      $("level").textContent = owner && run.status !== "ended" ? ["Caged. You can only watch.", "Notch 1: you may leave notes.", "Notch 2: name a file path to veto it.", ""][run.level || 0] : "";
      $("feed").innerHTML = shown.filter((e) => e.kind !== "diff" && e.kind !== "commit").map((e) =>
        e.kind === "commentary" ? `<div class="say">${esc(e.data.text)}</div>`
        : e.kind === "note" ? `<div class="note">You: ${esc(e.data.text)}</div>`
        : e.kind === "unlock" ? `<div class="unlock">Unlocked notch ${e.data.level}</div>`
        : `<div class="sys">${esc(e.data.text)}</div>`).join("") || `<div class="sys">Nothing yet. Sit.</div>`;
      $("feed").scrollTop = $("feed").scrollHeight;
      const diffs = shown.filter((e) => e.kind === "diff");
      const latest = {};
      for (const d of diffs) latest[d.data.path] = d;
      const paths = Object.keys(latest);
      const focus = pick && latest[pick] ? latest[pick] : diffs[diffs.length - 1];
      $("files").innerHTML = paths.map((p) => `<button type="button" data-p="${esc(p)}" aria-pressed="${focus && focus.data.path === p}">${esc(p)}${latest[p].data.reverted ? " (vetoed)" : ""}</button>`).join("");
      const commit = focus && shown.find((e) => e.kind === "commit" && e.seq === focus.seq + 1);
      $("commit").textContent = commit ? "commit: " + commit.data.message : focus?.data.reverted ? "reverted on your veto" : "";
      $("diff").innerHTML = focus ? focus.data.patch.split("\n").map((l) => `<span class="${l.startsWith("+++") || l.startsWith("---") || l.startsWith("@@") ? "h" : l[0] === "+" ? "a" : l[0] === "-" ? "d" : ""}">${esc(l) || " "}</span>`).join("")
        : `<span class="h">No changes yet. It hasn't touched anything. Yet.</span>`;
      const ended = run.status === "ended";
      $("scrub").hidden = !(ended || !owner) || !events.length;
      $("scrub-range").max = events.length; $("scrub-range").value = at;
      $("scrub-at").textContent = `${at} / ${events.length}`;
      $("after").hidden = !ended;
      if (ended) {
        $("a-files").textContent = run.stats.files; $("a-add").textContent = "+" + run.stats.added; $("a-del").textContent = "-" + run.stats.removed;
        $("a-patch").hidden = run.outcome === "safeworded" || !run.stats.files;
        $("a-patch").href = `/api/runs/${id}/patch`;
      }
    };

    $("files").addEventListener("click", (e) => { const p = e.target.closest("button")?.dataset.p; if (p) { pick = p; render(); } });
    $("scrub-range").addEventListener("input", (e) => { at = Number(e.target.value); live = false; render(); });
    $("share").addEventListener("click", async () => { try { await navigator.clipboard.writeText(location.href); $("share").textContent = "Link copied"; } catch { prompt("Copy the replay link", location.href); } });
    $("safeword").addEventListener("click", async () => {
      $("safeword").disabled = true;
      try { await api(`/api/runs/${id}/safeword`, { method: "POST", body: "{}" }); } finally { await refresh(); }
    });
    $("saybox").addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = $("say").value.trim(); if (!text) return;
      $("say").value = "";
      try { await api(`/api/runs/${id}/say`, { method: "POST", body: JSON.stringify({ text }) }); } catch (err) { $("say-err").textContent = err.message; }
      await refresh();
    });

    async function refresh() {
      const j = await api(`/api/runs/${id}?after=${events.length}`);
      const follow = at === events.length;
      run = j.run; owner = j.owner;
      events = events.concat(j.events.filter((e) => e.seq > events.length));
      if (follow || live) at = events.length;
      render();
    }

    (async () => {
      try { await refresh(); } catch (e) { $("run-task").textContent = e.status === 404 ? "No such run." : e.message; return; }
      live = true;
      if (run.status !== "ended") {
        (async () => { while (run.status !== "ended") { await sleep(2000); await refresh().catch(() => {}); } })();
        while (owner && run.status !== "ended") {
          try { await api(`/api/runs/${id}/step`, { method: "POST", body: "{}" }); } catch { await sleep(2000); }
          await refresh().catch(() => {});
          await sleep(300);
        }
      } else if (events.length) {
        at = 0; render();
        for (let i = 1; i <= events.length && !document.hidden; i++) { if (at !== i - 1) break; at = i; render(); await sleep(350); }
      }
    })();
  }
}

export const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>quc</title>
<meta name="description" content="Hand quc your repo and one line of task. It does the work. You sit in the chair and watch.">
<style>${CSS}</style></head><body>
<header><a class="brand" href="/">quc</a><span class="mute" style="font-size:14px">you sit, it codes</span></header>
<main>
<section id="start" hidden>
<h1>Hand over your repo.<br>Take a seat.</h1>
<p class="mute" style="max-width:620px">quc takes a public GitHub repo and one line of task, then does whatever it wants to your code while you watch from the corner. No approve buttons. No edits. You get a chair, a safeword, and a replay.</p>
<form id="form" novalidate>
<div class="field"><label for="repo">Public GitHub repo</label>
<input id="repo" type="url" inputmode="url" autocomplete="off" placeholder="https://github.com/owner/name" aria-describedby="repo-err">
<p class="err" id="repo-err" role="alert"></p></div>
<div class="field"><label for="task">One line of task</label>
<input id="task" type="text" autocomplete="off" maxlength="200" placeholder="Make the README less embarrassing" aria-describedby="task-err">
<p class="err" id="task-err" role="alert"></p></div>
<p class="notice">Replays are public: anyone with the link can watch. quc only reads your repo. It never runs your code and never pushes anything; you leave with a patch, if you want it.</p>
<button class="primary" id="go" type="submit">Hand it over</button>
</form>
<div class="rules">
<div><b>The cage</b>It works on its own copy, fully unsupervised. Your repo is never touched.</div>
<div><b>The chair</b>You watch every change land, live and read-only, while it talks down to you.</div>
<div><b>The safeword</b>One button. Everything stops and its work is thrown away.</div>
<div><b>The magic words</b>Say the right thing and it lets you speak, veto a file, or take the wheel.</div>
</div>
</section>
<section id="run" hidden>
<div class="bar"><span class="status" id="status">…</span><button class="safeword" id="safeword" hidden>Safeword</button><button id="share" type="button">Copy replay link</button><span class="mute" id="level" style="font-size:14px"></span></div>
<h1 id="run-task" style="font-size:clamp(24px,4.5vw,38px)">Loading…</h1>
<p class="mute" style="font-size:14px">on <a id="run-repo" rel="noopener" target="_blank"></a></p>
<div class="after" id="after" hidden>
<div><span class="mute">Files changed</span><b id="a-files">0</b></div><div><span class="mute">Lines added</span><b id="a-add">+0</b></div><div><span class="mute">Lines removed</span><b id="a-del">-0</b></div>
<div><span class="mute">Nothing was run or pushed.</span><a id="a-patch" download="quc.patch" style="display:block;margin-top:6px;font-weight:600" hidden>Download the patch</a></div>
</div>
<div class="scrub" id="scrub" hidden><label for="scrub-range" class="mute" style="font-size:14px">Replay</label><input type="range" id="scrub-range" min="0" step="1"><span class="mute" id="scrub-at" style="font:13px var(--mono)"></span></div>
<div class="grid">
<div class="panel"><h2>From the corner</h2><div class="feed" id="feed" aria-live="polite"></div>
<form class="saybox" id="saybox" hidden><input id="say" type="text" maxlength="300" autocomplete="off" placeholder="Say something…" aria-label="Say something"><button type="submit">Say</button></form>
<p class="err" id="say-err"></p></div>
<div class="panel"><h2>What it's doing to your code</h2><div class="files" id="files"></div><p class="commit" id="commit"></p><pre class="diff" id="diff"></pre></div>
</div>
</section>
</main>
<script type="module">
${validate}
(${client})(validate);
</script></body></html>`;
