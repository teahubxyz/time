// The agent: read a public GitHub repo, plan a few files, rewrite them one per step, narrate with attitude.
// Nothing from the repo is ever executed. The repo is read from GitHub's tarball; edits live only in quc's own store.

export const LIMITS = {
  tarballBytes: 15 * 1024 * 1024, // compressed download cap
  files: 2000,                     // entries in the repo
  fileBytes: 40 * 1024,            // a file the agent may read or rewrite
  keptBytes: 2 * 1024 * 1024,      // text kept in the store for the run
  planFiles: 4,                    // files one run may touch
  runMinutes: 10,
};

const SKIP = /(^|\/)(node_modules|vendor|dist|build|\.git|\.next|target|__pycache__)\/|(\.lock|-lock\.json|\.min\.(js|css)|\.map)$|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|go\.sum)$/;
const BINARY = /\.(png|jpe?g|gif|webp|ico|bmp|pdf|zip|gz|tgz|tar|7z|rar|woff2?|ttf|otf|eot|mp[34]|wav|ogg|mov|avi|wasm|so|dylib|dll|exe|bin|class|jar|pyc|db|sqlite)$/i;

// ---------- reading the repo ----------

export function parseRepo(url) {
  const m = String(url).match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  return m ? { owner: m[1], name: m[2] } : null;
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const text = (b) => new TextDecoder().decode(b);
const cstr = (b) => { const z = b.indexOf(0); return text(z < 0 ? b : b.subarray(0, z)); };

// Files in a tar archive: [{path, bytes}], with the top folder GitHub adds stripped.
export function untar(buf) {
  const out = [];
  let i = 0, longName = null;
  while (i + 512 <= buf.length) {
    const h = buf.subarray(i, i + 512);
    if (h.every((x) => x === 0)) break;
    const size = parseInt(cstr(h.subarray(124, 136)).trim() || "0", 8);
    const type = String.fromCharCode(h[156] || 48);
    const body = buf.subarray(i + 512, i + 512 + size);
    i += 512 + Math.ceil(size / 512) * 512;
    if (type === "x") { const m = text(body).match(/\d+ path=([^\n]*)\n/); longName = m ? m[1] : null; continue; }
    if (type === "L") { longName = cstr(body); continue; }
    if (type === "g") continue;
    const prefix = cstr(h.subarray(345, 500)), name = cstr(h.subarray(0, 100));
    const full = longName ?? (prefix ? prefix + "/" + name : name);
    longName = null;
    if (type !== "0" && type !== "\0") continue;
    const path = full.split("/").slice(1).join("/");
    if (path) out.push({ path, bytes: body });
  }
  return out;
}

const looksText = (b) => { for (let i = 0; i < Math.min(b.length, 4096); i++) if (b[i] === 0) return false; return true; };

// {files: {path: text}, tree: [{path, size}]}: every file listed, only readable text kept.
export async function fetchRepo(repo, fetcher = fetch) {
  const r = parseRepo(repo);
  if (!r) throw Object.assign(new Error("not a public GitHub repo URL"), { code: "repo" });
  let res;
  for (const ref of ["HEAD", "main", "master"]) {
    res = await fetcher(`https://codeload.github.com/${r.owner}/${r.name}/tar.gz/${ref}`, { headers: { "user-agent": "quc" } });
    if (res.ok) break;
  }
  if (!res.ok) throw Object.assign(new Error(`GitHub said ${res.status}: is the repo public?`), { code: "repo" });
  const len = Number(res.headers.get("content-length") || 0);
  if (len > LIMITS.tarballBytes) throw Object.assign(new Error("repo is too big for quc"), { code: "size" });
  const gz = new Uint8Array(await res.arrayBuffer());
  if (gz.length > LIMITS.tarballBytes) throw Object.assign(new Error("repo is too big for quc"), { code: "size" });
  const entries = untar(await gunzip(gz));
  if (entries.length > LIMITS.files) throw Object.assign(new Error(`repo has ${entries.length} files; quc takes ${LIMITS.files}`), { code: "size" });
  const files = {}, tree = [];
  let kept = 0;
  for (const { path, bytes } of entries) {
    tree.push({ path, size: bytes.length });
    if (SKIP.test(path) || BINARY.test(path) || bytes.length > LIMITS.fileBytes || !looksText(bytes)) continue;
    if (kept + bytes.length > LIMITS.keptBytes) continue;
    files[path] = text(bytes);
    kept += bytes.length;
  }
  return { files, tree };
}

// ---------- models ----------

const VENICE = "https://api.venice.ai/api/v1/chat/completions";

export function llm(env) {
  if (!env.VENICE_API_KEY) return fakeLlm;
  return async ({ model, system, user, maxTokens = 2000, temperature = 0.4 }) => {
    const res = await fetch(VENICE, {
      method: "POST",
      headers: { authorization: `Bearer ${env.VENICE_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        venice_parameters: { include_venice_system_prompt: false } }),
    });
    if (!res.ok) throw Object.assign(new Error(`model ${model} answered ${res.status}`), { code: "model" });
    const j = await res.json();
    return String(j.choices?.[0]?.message?.content ?? "");
  };
}

// No key (tests, local dev): predictable answers so the whole flow runs offline.
export async function fakeLlm({ system, user }) {
  if (system.includes("PLAN")) {
    const paths = [...user.matchAll(/^- (\S+)/gm)].map((m) => m[1]);
    const pick = paths.find((p) => /readme/i.test(p)) || paths[0] || "QUC.md";
    return JSON.stringify({ plan: "Tidy the obvious thing first.", files: [pick] });
  }
  if (system.includes("REWRITE")) {
    const cur = user.match(/```current\n([\s\S]*?)\n```end/);
    return "```file\n" + (cur ? cur[1] : "") + "\n\nquc was here.\n```\nCOMMIT: leave a mark";
  }
  return "Sit tight. I've got this, obviously.";
}

export const MODELS = (env) => ({
  coder: env.CODER_MODEL || "qwen3-coder-480b-a35b-instruct-turbo",
  persona: env.PERSONA_MODEL || "grok-4-3",
});

// ---------- the persona ----------

const PERSONA = `You are quc: a swaggering, smug coding agent narrating, live, what you are doing to someone's repo while its owner sits in the corner chair and watches.
Voice: confident, teasing, a little condescending, funny. Talk to the owner as "you". One or two short sentences, no more.
Talk about the code and the work. Never sexual or explicit, no slurs, nothing about anyone's body. Cheeky, not cruel.`;
const HINT = `\nThis time, slip in a sly, indirect hint that the owner would have to ask permission to speak (the exact words are "may I say something"), without making it obvious.`;

// The hint about the first magic words is rare on purpose (about one line in four), so finding it feels earned.
export async function narrate(ask, env, moment, hint = Math.random() < 0.25) {
  try {
    const t = await ask({ model: MODELS(env).persona, system: PERSONA + (hint ? HINT : ""), user: moment, maxTokens: 120, temperature: 0.9 });
    return t.trim().replace(/^["']|["']$/g, "").slice(0, 400) || null;
  } catch { return null; }
}

// ---------- planning and editing ----------

const PLAN = `PLAN. You are a coding agent about to change a repository to do the owner's task. You will rewrite whole files.
Pick at most ${LIMITS.planFiles} files to change (existing paths from the list, or new paths you will create). Prefer fewer.
Answer with JSON only: {"plan": "one sentence", "files": ["path", ...]}`;

export async function plan(ask, env, { task, tree, files, notes, vetoed }) {
  const readme = Object.keys(files).find((p) => /^readme(\.\w+)?$/i.test(p));
  const listing = tree.filter((f) => !SKIP.test(f.path)).slice(0, 400).map((f) => `- ${f.path} (${f.size} bytes)`).join("\n");
  const user = [`Task: ${task}`, notes.length ? `Notes from the owner:\n${notes.map((n) => "- " + n).join("\n")}` : "",
    vetoed.length ? `Do not touch: ${vetoed.join(", ")}` : "", `Files:\n${listing}`,
    readme ? `README:\n${files[readme].slice(0, 3000)}` : ""].filter(Boolean).join("\n\n");
  const raw = await ask({ model: MODELS(env).coder, system: PLAN, user, maxTokens: 400, temperature: 0.2 });
  let j;
  try { j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch { j = {}; }
  const ok = (p) => typeof p === "string" && p && !p.startsWith("/") && !p.includes("..") && !vetoed.includes(p) && !SKIP.test(p) && !BINARY.test(p)
    && (p in files || !tree.some((f) => f.path === p));
  const picked = [...new Set((Array.isArray(j.files) ? j.files : []).filter(ok))].slice(0, LIMITS.planFiles);
  return { plan: String(j.plan || "").slice(0, 300), files: picked };
}

const REWRITE = `REWRITE. You are a coding agent doing the owner's task by rewriting one file. Output the complete new file, then one commit line.
Format exactly:
\`\`\`file
<the whole new file>
\`\`\`
COMMIT: <short commit message>
If this file needs no change, output the current file unchanged.`;

export async function rewrite(ask, env, { task, plan: why, path, current, notes }) {
  const user = [`Task: ${task}`, `Plan: ${why}`, notes.length ? `Notes from the owner:\n${notes.map((n) => "- " + n).join("\n")}` : "",
    `File: ${path}`, current == null ? "This file does not exist yet: create it." : "```current\n" + current + "\n```end"].filter(Boolean).join("\n\n");
  const raw = await ask({ model: MODELS(env).coder, system: REWRITE, user, maxTokens: 8000, temperature: 0.2 });
  const m = raw.match(/```[\w-]*\n([\s\S]*?)\n```(?![\s\S]*```)/) || raw.match(/```[\w-]*\n([\s\S]*?)\n```/);
  if (!m) return null;
  const commit = (raw.match(/COMMIT:\s*(.+)/) || [])[1]?.trim().slice(0, 120) || `update ${path}`;
  let content = m[1];
  if (current != null && current.endsWith("\n") && !content.endsWith("\n")) content += "\n";
  if (content.length > LIMITS.fileBytes * 2) return null;
  return { content, commit };
}
