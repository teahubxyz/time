#!/usr/bin/env node
// run.mjs: an openvenice workflow, one node at a time, headless. The same graph the canvas at /open runs in a
// browser, run on a machine: a Gitea Actions runner, your laptop, a cron. Node 20+, no dependencies; ffmpeg for a
// Cover + Track node.
//
//   node run.mjs --graph graph.json --node <id> [--out out]      one node: reads its parents' outputs from out/,
//                                                                 writes out/<id>.txt (and a file for media)
//   node run.mjs --graph graph.json --all [--out out]             every node, in dependency order
//   OV_WORKFLOW=<base64 json> node run.mjs --node <id>            the graph as the exported workflow carries it
//
// Needs VENICE_API_KEY. A node's output is one string, exactly as in the browser engine: text, or [image:<file>],
// [audio:<file>], [video:<file>] for media; a node with several parents gets their outputs joined with blank lines.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const BASE = process.env.VENICE_BASE_URL || "https://api.venice.ai/api/v1";
const KEY = process.env.VENICE_API_KEY || "";
const POLL_MS = Number(process.env.OV_POLL_MS || 3000), POLL_MAX = Number(process.env.OV_POLL_MAX || 200);

const args = process.argv.slice(2);
const flag = (name, dflt = "") => { const i = args.indexOf("--" + name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : dflt; };
const has = (name) => args.includes("--" + name);
const OUT = flag("out", "out");

function loadGraph() {
  const path = flag("graph");
  const raw = path ? readFileSync(path, "utf8") : process.env.OV_WORKFLOW ? Buffer.from(process.env.OV_WORKFLOW, "base64").toString("utf8") : "";
  if (!raw) fail("no graph: --graph graph.json, or OV_WORKFLOW in the environment");
  const g = JSON.parse(raw);
  const nodes = Array.isArray(g.nodes) ? g.nodes : [], edges = Array.isArray(g.edges) ? g.edges : [];
  if (!nodes.length) fail("the graph has no nodes");
  return { name: g.name || "workflow", nodes, edges };
}

function fail(msg) { console.error("run.mjs: " + msg); process.exit(1); }

async function venice(path, body, { binary = false } = {}) {
  if (!KEY) fail("VENICE_API_KEY is not set");
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(BASE + path, { method: "POST", headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if ([408, 425, 429, 500, 502, 503, 504].includes(res.status) && attempt < 2) { await sleep(1500 * (attempt + 1)); continue; }
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.text()).slice(0, 400); } catch { /* none */ }
      throw new Error(`Venice ${res.status} on ${path}${detail ? ": " + detail : ""}`);
    }
    const type = res.headers.get("content-type") || "";
    if (binary || !/json/i.test(type)) return { binary: Buffer.from(await res.arrayBuffer()), type };
    return { json: await res.json(), type };
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** a queued music or video job, asked about until it's done; the file, however Venice sends it */
async function retrieve(kind, model, queueId, downloadUrl) {
  for (let i = 0; i < POLL_MAX; i++) {
    await sleep(POLL_MS);
    const r = await venice(`/${kind}/retrieve`, { model, queue_id: queueId });
    if (r.binary) return { bytes: r.binary, type: r.type };
    const d = r.json || {}, status = String(d.status || "").toUpperCase(), ready = d.audio_url || d.video_url || d.url;
    if (status === "COMPLETED") {
      const url = ready || downloadUrl;
      if (!url) throw new Error("completed, but Venice sent no file");
      const f = await fetch(url);
      if (!f.ok) throw new Error(`download failed (${f.status})`);
      return { bytes: Buffer.from(await f.arrayBuffer()), type: f.headers.get("content-type") || "" };
    }
    if (/FAIL|ERROR|CANCEL|REJECT|EXPIRE/.test(status)) throw new Error(d.error || `generation ${status.toLowerCase()}`);
  }
  throw new Error(`timed out after ${(POLL_MS * POLL_MAX) / 1000}s`);
}

const ext = (type, dflt) => (/mp4/.test(type) ? "mp4" : /webm/.test(type) ? "webm" : /mpeg|mp3/.test(type) ? "mp3" : /wav/.test(type) ? "wav" : /ogg|opus/.test(type) ? "ogg" : /flac/.test(type) ? "flac" : /png/.test(type) ? "png" : /jpe?g/.test(type) ? "jpg" : /webp/.test(type) ? "webp" : dflt);

function resolvePrompt(template, input) {
  if (!template) return input;
  if (template.includes("{{input}}")) return template.replace(/\{\{input\}\}/g, input);
  return input ? `${template}\n\n${input}` : template;
}

function inputsOf(node, graph) {
  return graph.edges.filter((e) => e.target === node.id).map((e) => {
    const p = join(OUT, e.source + ".txt");
    return existsSync(p) ? readFileSync(p, "utf8") : "";
  }).filter(Boolean).join("\n\n");
}

const mediaPath = (s, tag) => { const m = new RegExp(`\\[${tag}:([^\\]]+)\\]`).exec(s); return m ? m[1] : ""; };

async function runNode(node, graph) {
  const d = node.data || {}, input = inputsOf(node, graph), file = (e) => join(OUT, `${node.id}.${e}`);
  switch (d.nodeType) {
    case "textInput": return d.inputText ?? "";
    case "output": return input;
    case "step": return input;   // a runner's own step: the workflow file runs it, not this
    case "chat": {
      const r = await venice("/chat/completions", { model: d.model || "llama-3.3-70b", messages: [{ role: "user", content: resolvePrompt(d.prompt, input) }],
        temperature: d.temperature ?? 0.7, max_tokens: d.maxTokens ?? 4096, venice_parameters: { enable_web_search: d.webSearch ?? "off" } });
      return r.json?.choices?.[0]?.message?.content ?? "";
    }
    case "imageGen": {
      const body = { model: d.model || "z-image-turbo", prompt: resolvePrompt(d.prompt, input), negative_prompt: d.negativePrompt || undefined, steps: d.steps ?? 20,
        style_preset: d.style || undefined, width: d.width ?? 1024, height: d.height ?? 1024, hide_watermark: d.hideWatermark ?? true };
      if (d.aspectRatio) body.aspect_ratio = d.aspectRatio;
      const r = await venice("/image/generate", body);
      const img = r.json?.images?.[0], b64 = typeof img === "string" ? img : img?.b64_json;
      if (!b64) throw new Error("no image came back");
      const e = b64.startsWith("/9j/") ? "jpg" : b64.startsWith("UklGR") ? "webp" : "png";
      writeFileSync(file(e), Buffer.from(b64, "base64"));
      return `[image:${file(e)}]`;
    }
    case "tts": {
      const r = await venice("/audio/speech", { model: d.model || "tts-kokoro", input: resolvePrompt(d.prompt, input), voice: d.voice || "af_sky", speed: d.speed ?? 1,
        response_format: d.responseFormat || "mp3" }, { binary: true });
      const e = d.responseFormat || ext(r.type, "mp3");
      writeFileSync(file(e), r.binary);
      return `[audio:${file(e)}]`;
    }
    case "music": {
      const body = { model: d.model || "stable-audio-25", prompt: resolvePrompt(d.prompt, input), duration_seconds: d.duration ?? 30, force_instrumental: d.instrumental ?? false };
      if (d.lyrics) body.lyrics_prompt = d.lyrics;
      const q = (await venice("/audio/queue", body)).json || {};
      const { bytes, type } = await retrieve("audio", q.model || body.model, q.queue_id, q.download_url);
      const e = ext(type, "mp3");
      writeFileSync(file(e), bytes);
      return `[audio:${file(e)}]`;
    }
    case "video": {
      const body = { model: d.model || "wan-3-0-text-to-video", prompt: resolvePrompt(d.prompt, input), aspect_ratio: d.videoAspectRatio || "16:9" };
      if (d.videoDuration) body.duration = d.videoDuration;
      if (d.videoResolution) body.resolution = d.videoResolution;
      const q = (await venice("/video/queue", body)).json || {};
      const { bytes, type } = await retrieve("video", q.model || body.model, q.queue_id || q.id, q.download_url);
      const e = ext(type, "mp4");
      writeFileSync(file(e), bytes);
      return `[video:${file(e)}]`;
    }
    case "compose": {
      const image = mediaPath(input, "image"), audio = mediaPath(input, "audio");
      if (!image || !audio) throw new Error("Cover + Track needs one image node and one audio node connected to it");
      const side = Math.max(256, Math.min(2048, Number(d.maxSide) || 1080));
      const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-i", image, "-i", audio, "-c:v", "libx264", "-tune", "stillimage", "-preset", "medium",
        "-vf", `scale='if(gt(iw,ih),${side},-2)':'if(gt(iw,ih),-2,${side})',pad=ceil(iw/2)*2:ceil(ih/2)*2`, "-c:a", "aac", "-b:a", "160k", "-pix_fmt", "yuv420p", "-shortest", "-movflags", "+faststart", file("mp4")], { encoding: "utf8" });
      if (r.error) throw new Error("ffmpeg is not installed (a Cover + Track node needs it)");
      if (r.status !== 0) throw new Error("ffmpeg: " + (r.stderr || "").trim().slice(-400));
      return `[video:${file("mp4")}]`;
    }
    default: throw new Error(`unknown node type ${d.nodeType}`);
  }
}

/** nodes in dependency order (a cycle is an error) */
function order(graph) {
  const indeg = new Map(graph.nodes.map((n) => [n.id, 0])), adj = new Map(graph.nodes.map((n) => [n.id, []]));
  for (const e of graph.edges) { if (!indeg.has(e.source) || !indeg.has(e.target)) continue; adj.get(e.source).push(e.target); indeg.set(e.target, indeg.get(e.target) + 1); }
  const out = [];
  let frontier = graph.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  while (frontier.length) {
    out.push(...frontier);
    const next = [];
    for (const id of frontier) for (const c of adj.get(id)) { indeg.set(c, indeg.get(c) - 1); if (indeg.get(c) === 0) next.push(c); }
    frontier = next;
  }
  if (out.length !== graph.nodes.length) fail("the graph has a cycle");
  return out.map((id) => graph.nodes.find((n) => n.id === id));
}

async function main() {
  const graph = loadGraph();
  mkdirSync(OUT, { recursive: true });
  const which = has("all") ? order(graph) : [graph.nodes.find((n) => n.id === flag("node"))].filter(Boolean);
  if (!which.length) fail(`no such node: ${flag("node")} (nodes: ${graph.nodes.map((n) => n.id).join(", ")})`);
  for (const node of which) {
    const label = `${node.id} [${node.data?.nodeType}]`;
    process.stdout.write(`${label}… `);
    const started = Date.now();
    const result = await runNode(node, graph);
    writeFileSync(join(OUT, node.id + ".txt"), result);
    const shown = result.startsWith("[") ? result : result.replace(/\s+/g, " ").slice(0, 120) + (result.length > 120 ? "…" : "");
    console.log(`${((Date.now() - started) / 1000).toFixed(1)}s  ${shown}`);
  }
}

main().catch((e) => fail(e.message || String(e)));
