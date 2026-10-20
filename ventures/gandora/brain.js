/* ============================================================
   the taste brain — gandora's recommendation engine.
   A tiny net (5 inputs → 8 neurons → like) retrained from scratch on every reaction and every play count;
   its picture of the listener rides along in the DJ's prompt, and TASTE shows it: neurons firing, the heat map
   of where it predicts liking, the listener's emoji on each track, and the five tracks that define a station.
   (huebrain, with songs for swatches.)
   ============================================================ */

/* ---------- signals: every reaction and every play, as one signed weight per track ---------- */
function reactionWeight(spec, row) {
  const r = String(spec.reaction || "");
  let w = 0;
  for (const ch of r.replace(/"[^"]*"/g, "")) { if ("🔥❤️⚡🎸🎹🌧️".includes(ch) && ch !== "️") w += 1; if ("🚫😴".includes(ch)) w -= 1; }
  if (/\[skipped\]/.test(r)) w -= 1.5;
  if (/"[^"]*"/.test(r)) w += 0.3;                                   // words mean engagement, mildly warm
  const plays = (row && row.plays) || spec.plays || 0;
  if (plays > 1) w += Math.log2(plays) * 0.6;                        // on repeat: 4 plays ≈ a 🔥, 100 ≈ four of them
  if (row && row.kept) w += 1.5;
  return w;
}

/* ---------- the net ---------- */
function feats(spec) {
  const bpm = Math.min(180, Math.max(60, +spec.bpm || 100)), en = Math.min(1, Math.max(0, Number.isFinite(+spec.energy) ? +spec.energy : 0.5));
  const h = keyHue(spec.key) * Math.PI / 180, minor = /m(in|inor)?\b/i.test(spec.key || "") && !/maj/i.test(spec.key || "");
  return [(bpm - 60) / 60 - 1, en * 2 - 1, Math.cos(h), Math.sin(h), minor ? 1 : -1];
}
class Net {
  constructor(seed = 7) {
    const r = prng(seed), g = () => (r() - 0.5) * 1.2;
    this.W1 = Array.from({ length: 8 }, () => Array.from({ length: 5 }, g)); this.b1 = Array.from({ length: 8 }, g);
    this.W2 = Array.from({ length: 8 }, g); this.b2 = 0; this.n = 0;
  }
  forward(x) {
    const h = this.W1.map((w, i) => Math.tanh(w.reduce((s, wi, j) => s + wi * x[j], this.b1[i])));
    const z = h.reduce((s, hi, i) => s + hi * this.W2[i], this.b2);
    return { h, y: 1 / (1 + Math.exp(-z)) };
  }
  predict(spec) { return this.forward(feats(spec)).y; }
  /* samples: [{ x, t (0|1), w }] — weighted logistic loss, plain SGD, a touch of L2 so a handful of taps stay smooth */
  train(samples, epochs = 240, lr = 0.08) {
    this.n = samples.length; if (!samples.length) return this;
    const r = prng(99);
    for (let e = 0; e < epochs; e++) {
      const order = samples.map((s, i) => [r(), i]).sort((a, b) => a[0] - b[0]).map((a) => a[1]);
      for (const i of order) {
        const { x, t, w } = samples[i], { h, y } = this.forward(x), d = (y - t) * w * lr;
        for (let k = 0; k < 8; k++) {
          const dh = d * this.W2[k] * (1 - h[k] * h[k]);
          this.W2[k] -= d * h[k] + lr * 1e-3 * this.W2[k];
          for (let j = 0; j < 5; j++) this.W1[k][j] -= dh * x[j] + lr * 1e-3 * this.W1[k][j];
          this.b1[k] -= dh;
        }
        this.b2 -= d;
      }
    }
    return this;
  }
}
/* a net for a set of library rows: warm → 1, cold → 0, sample weight by how loud the signal was */
function brainFor(rows) {
  const samples = [];
  for (const t of rows) { const w = reactionWeight(t.spec, t); if (Math.abs(w) < 0.25) continue; samples.push({ x: feats(t.spec), t: w > 0 ? 1 : 0, w: Math.min(3, Math.abs(w)) }); }
  if (samples.length < 3) return null;                               // not enough to say anything
  return new Net(7).train(samples);
}
const brains = { all: null, station: null, stationId: "", rows: [] };
async function rebuildBrains() {
  const rows = await db.all(); brains.rows = rows;
  brains.all = brainFor(rows);
  brains.stationId = state.stationId;
  brains.station = state.stationId ? brainFor(rows.filter((t) => t.spec.stationId === state.stationId)) : null;
  return brains;
}
const brainNow = () => brains.station || brains.all;

/* ---------- the net's picture in words, for the DJ ---------- */
function tasteText() {
  const net = brainNow(); if (!net) return "";
  const cells = [];
  for (const bpm of [70, 90, 110, 130, 150, 170]) for (const en of [0.2, 0.5, 0.8]) for (const key of ["C major", "A minor"]) {
    const p = net.predict({ bpm, energy: en, key });
    cells.push({ bpm, en, key, p });
  }
  cells.sort((a, b) => b.p - a.p);
  const word = (c) => `~${c.bpm} bpm, ${c.en < 0.4 ? "calm" : c.en < 0.7 ? "mid" : "high"} energy, ${/minor/.test(c.key) ? "minor" : "major"} (${Math.round(c.p * 100)}%)`;
  const top = cells.slice(0, 3).map(word).join("; "), low = cells.slice(-2).map(word).join("; ");
  const which = brains.station ? "this station" : "all their stations";
  return `Taste model (a small net trained on the listener's reactions and play counts across ${which}, ${net.n} signals): most likely to land: ${top}. Least likely: ${low}. Aim near the likely region unless the listener's own words say otherwise; keep some variety.`;
}
const _djPromptBase = djPrompt;                                       // assignment, not a declaration: a declaration would hoist over this
djPrompt = function () {
  const base = _djPromptBase();
  const tt = tasteText();
  return tt ? base.replace("\nWrite the NEXT track.", `\n${tt}\n\nWrite the NEXT track.`) : base;
};
const _openStation = openStation;
openStation = async function (seed, s) { await _openStation(seed, s); rebuildBrains().catch(() => {}); };

/* ---------- plays: every start counts, and so does every pass of the loop ---------- */
async function countPlay(spec) {
  if (!spec || !spec.id) return;
  const row = (await db.all()).find((t) => t.id === spec.id); if (!row) return;
  row.plays = (row.plays || 0) + 1; row.spec.plays = row.plays; spec.plays = row.plays;
  await db.put(row);
  if (row.plays === 2 || row.plays === 4 || row.plays % 8 === 0) rebuildBrains().catch(() => {});
}
state.audio.addEventListener("play", () => { if (state.audio.currentTime < 1 && state.current && state.current.spec && state.current.spec.id) countPlay(state.current.spec).catch(() => {}); });
let lastT = 0;
state.audio.addEventListener("timeupdate", () => {                 // a loop wrapping round is another play
  const t = state.audio.currentTime;
  if (state.audio.loop && lastT > 20 && t < 2 && state.current) countPlay(state.current.spec).catch(() => {});
  lastT = t;
});

/* ---------- the NEXT line carries the net's guess for the track in the oven ---------- */
const _makeJob = makeJob;
makeJob = function (spec) {
  const net = brainNow(); if (net) spec.guess = net.predict(spec);
  return _makeJob(spec);
};
const guessText = (spec) => spec && spec.guess != null ? ` · ${Math.round(spec.guess * 100)}% YOU` : "";
(function () {
  const next = $("#next");
  const mo = new MutationObserver(() => {
    const spec = state.nextJob && state.nextJob.spec; if (!spec || !spec.guess || next.textContent.includes("% YOU") || !next.textContent.startsWith("NEXT")) return;
    next.textContent += guessText(spec);
  });
  mo.observe(next, { childList: true, characterData: true, subtree: true });
})();

/* ---------- TASTE: the brain and the map ---------- */
function drawBrain(canvas, net, spec, pulse = 0) {
  const ctx = canvas.getContext("2d"), W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = "#121216"; ctx.fillRect(0, 0, W, H);
  const cols = [W * 0.14, W * 0.5, W * 0.86], ins = ["tempo", "energy", "key·x", "key·y", "minor"];
  const yI = (i) => H * (0.15 + 0.7 * i / 4), yH = (i) => H * (0.08 + 0.84 * i / 7), yO = H / 2;
  if (!net) { ctx.fillStyle = "#8a8a96"; ctx.font = `${W * 0.035}px -apple-system, system-ui, sans-serif`; ctx.textAlign = "center"; ctx.fillText("react to three tracks and the brain wakes up", W / 2, H / 2); return; }
  const x = spec ? feats(spec) : [0, 0, 0, 0, 0], { h, y } = net.forward(x);
  const maxW = Math.max(1e-6, ...net.W1.flat().map(Math.abs), ...net.W2.map(Math.abs));
  // wires: alpha by weight, warm for positive, cold for negative
  for (let k = 0; k < 8; k++) {
    for (let j = 0; j < 5; j++) { const w = net.W1[k][j]; ctx.strokeStyle = `hsl(${w > 0 ? 44 : 220} 70% 60% / ${0.08 + 0.6 * Math.abs(w) / maxW})`; ctx.lineWidth = 1 + 2 * Math.abs(w) / maxW; ctx.beginPath(); ctx.moveTo(cols[0], yI(j)); ctx.lineTo(cols[1], yH(k)); ctx.stroke(); }
    const w = net.W2[k]; ctx.strokeStyle = `hsl(${w > 0 ? 44 : 220} 70% 60% / ${0.08 + 0.6 * Math.abs(w) / maxW})`; ctx.lineWidth = 1 + 2 * Math.abs(w) / maxW; ctx.beginPath(); ctx.moveTo(cols[1], yH(k)); ctx.lineTo(cols[2], yO); ctx.stroke();
  }
  const node = (cx, cy, r, a, label) => {
    const glow = Math.abs(a) * (1 + pulse);
    ctx.beginPath(); ctx.arc(cx, cy, r + 10 * glow, 0, Math.PI * 2); ctx.fillStyle = `hsl(${a >= 0 ? 44 : 220} 80% 65% / ${0.18 * glow})`; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = `hsl(${a >= 0 ? 44 : 220} ${40 + 50 * Math.abs(a)}% ${35 + 35 * Math.abs(a)}%)`; ctx.fill();
    if (label) { ctx.fillStyle = "#8a8a96"; ctx.font = `600 ${W * 0.026}px ui-monospace, Menlo, monospace`; ctx.textAlign = "right"; ctx.fillText(label, cx - r - 8, cy + 4); }
  };
  x.forEach((v, j) => node(cols[0], yI(j), W * 0.018, v, ins[j]));
  h.forEach((v, k) => node(cols[1], yH(k), W * 0.02, v));
  node(cols[2], yO, W * 0.034, y * 2 - 1);
  ctx.fillStyle = "#ededf0"; ctx.font = `600 ${W * 0.03}px ui-monospace, Menlo, monospace`; ctx.textAlign = "left"; ctx.fillText(`${Math.round(y * 100)}%`, cols[2] + W * 0.05, yO + 5);
  ctx.fillStyle = "#8a8a96"; ctx.font = `${W * 0.024}px ui-monospace, Menlo, monospace`; ctx.fillText(spec ? "would like this" : "", cols[2] + W * 0.05, yO + 5 + W * 0.03);
}
function drawTaste(rows, title, net) {
  const c = $("#tasteMap"), ctx = c.getContext("2d"), W = c.width, H = c.height, pad = 70;
  const X = (bpm) => pad + (Math.min(180, Math.max(60, bpm)) - 60) / 120 * (W - 2 * pad);
  const Y = (en) => H - pad - Math.min(1, Math.max(0, en)) * (H - 2 * pad);
  const pts = rows.map((t) => ({ x: X(+t.spec.bpm || 100), y: Y(+t.spec.energy || 0.5), w: reactionWeight(t.spec, t), hue: keyHue(t.spec.key), minor: /m(in|inor)?\b/i.test(t.spec.key || "") && !/maj/i.test(t.spec.key || ""), t }));
  ctx.fillStyle = "#121216"; ctx.fillRect(0, 0, W, H);
  // the field: the net's prediction, in the station's usual key; lit gold where it says yes, blue where no
  const keys = {}; for (const t of rows) keys[t.spec.key] = (keys[t.spec.key] || 0) + 1;
  const key = Object.entries(keys).sort((a, b) => b[1] - a[1])[0]?.[0] || "A minor";
  const cell = 18;
  for (let gy = pad; gy < H - pad; gy += cell) for (let gx = pad; gx < W - pad; gx += cell) {
    let v = 0;
    if (net) v = net.predict({ bpm: 60 + (gx - pad) / (W - 2 * pad) * 120, energy: (H - pad - gy) / (H - 2 * pad), key }) * 2 - 1;
    else { let like = 0, heard = 0; for (const p of pts) { const k = Math.exp(-((p.x - gx) ** 2 + (p.y - gy) ** 2) / 16200); like += k * p.w; heard += k; } if (heard < 0.02) continue; v = Math.tanh(like / 1.5); }
    if (Math.abs(v) < 0.06) continue;
    ctx.fillStyle = v > 0 ? `hsl(44 60% 60% / ${0.5 * Math.abs(v)})` : `hsl(220 30% 45% / ${0.45 * Math.abs(v)})`;
    ctx.fillRect(gx, gy, cell, cell);
  }
  ctx.strokeStyle = "#232329"; ctx.lineWidth = 2; ctx.strokeRect(pad, pad, W - 2 * pad, H - 2 * pad);
  ctx.fillStyle = "#8a8a96"; ctx.font = `600 ${W * 0.018}px ui-monospace, Menlo, monospace`; ctx.textAlign = "center";
  for (const b of [60, 90, 120, 150, 180]) ctx.fillText(b + "", X(b), H - pad + 34);
  ctx.textAlign = "right"; for (const e of [0, 0.5, 1]) ctx.fillText(e === 0 ? "calm" : e === 1 ? "wild" : "·", pad - 14, Y(e) + 6);
  // the points, with the listener's emoji over them
  ctx.textAlign = "center";
  for (const p of pts) {
    const r = (W * 0.012) * (1 + Math.min(3, Math.abs(p.w)) * 0.3);
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${p.hue} ${p.minor ? 55 : 80}% ${p.minor ? 48 : 62}% / .9)`; ctx.fill();
    if (Math.abs(p.w) >= 0.25) { ctx.lineWidth = 3; ctx.strokeStyle = p.w > 0 ? "hsl(44 80% 70%)" : "hsl(220 40% 60%)"; ctx.stroke(); }
    if (p.t.kept) { ctx.beginPath(); ctx.arc(p.x, p.y, r + 7, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.strokeStyle = "hsl(44 80% 70% / .7)"; ctx.stroke(); }
    const em = String(p.t.spec.reaction || "").replace(/"[^"]*"/g, "💬").replace(/\[skipped\]/g, "⏭").replace(/\s+/g, "");
    const tag = [...em].slice(0, 4).join("") + ((p.t.plays || 0) > 1 ? `×${p.t.plays}` : "");
    if (tag) { ctx.font = `${W * 0.024}px -apple-system, system-ui, sans-serif`; ctx.fillStyle = "#ededf0"; ctx.fillText(tag, p.x, p.y - r - 8); }
  }
  // the track in the oven, as a hollow mark
  const nx = state.nextJob && state.nextJob.spec;
  if (nx && rows.some((t) => t.spec.stationId === nx.stationId || title === "ALL")) {
    ctx.beginPath(); ctx.arc(X(+nx.bpm || 100), Y(+nx.energy || 0.5), W * 0.014, 0, Math.PI * 2); ctx.setLineDash([4, 4]); ctx.lineWidth = 2; ctx.strokeStyle = "#ededf0"; ctx.stroke(); ctx.setLineDash([]);
  }
  const warm = pts.filter((p) => p.w >= 0.25).length, cold = pts.filter((p) => p.w <= -0.25).length;
  $("#tasteNote").textContent = !pts.length ? "Nothing heard here yet." :
    `${title}: ${pts.length} tracks · ${warm} warm, ${cold} cold` + (net ? ` · ${net.n} signals in the brain` : " · react to a few tracks and the brain wakes up");
}
function drawPalette(rows, net) {
  const box = $("#tastePalette"); box.innerHTML = "";
  const scored = rows.map((t) => ({ t, s: (net ? net.predict(t.spec) : 0.5) + reactionWeight(t.spec, t) * 0.15 })).sort((a, b) => b.s - a.s).slice(0, 5);
  if (!scored.length) return;
  box.append(Object.assign(document.createElement("h3"), { textContent: "THE FIVE" }));
  const row = document.createElement("div"); row.className = "row";
  for (const { t } of scored) {
    const d = document.createElement("div"); d.className = "s";
    const c = document.createElement("canvas"); c.width = c.height = 144; drawCover(c, t.spec);
    d.append(c, Object.assign(document.createElement("b"), { textContent: t.spec.title }));
    d.addEventListener("click", () => { $("#taste").classList.add("hidden"); state.audio.pause(); $("#player").classList.remove("hidden"); $("#seed").classList.add("hidden"); playJob({ id: ++seq, spec: { ...t.spec }, blob: t.blob, err: null, done: Promise.resolve() }); });
    row.append(d);
  }
  box.append(row);
}
let brainPulse = 0;
async function openTaste() {
  await rebuildBrains();
  const rows = brains.rows, stations = await db.all("stations"), byId = Object.fromEntries(stations.map((s) => [s.id, s]));
  const tabs = $("#tasteTabs"); tabs.innerHTML = "";
  const groups = [["all", "ALL", "", rows]];
  const seen = new Map();
  for (const t of rows) { const k = t.spec.stationId || "seed:" + t.spec.seed; if (!seen.has(k)) seen.set(k, []); seen.get(k).push(t); }
  for (const [k, list] of seen) { const s = byId[k]; groups.push([k, ((s && s.name) || list[0].spec.seed).toUpperCase(), (s && s.seed) || list[0].spec.seed, list]); }
  let pick = groups.find((g) => g[0] === state.stationId) || groups[0];
  const show = () => {
    for (const b of tabs.children) b.classList.toggle("on", b.dataset.k === pick[0]);
    const net = pick[0] === "all" ? brains.all : (brainFor(pick[3]) || brains.all);
    drawTaste(pick[3], pick[1], net);
    drawBrain($("#brainMap"), net, state.current && state.current.spec, brainPulse);
    drawPalette(pick[3], net);
  };
  for (const g of groups) {
    const b = document.createElement("button"); b.dataset.k = g[0];
    if (g[2]) { const c = document.createElement("canvas"); c.width = c.height = 44; drawCover(c, { seed: g[2], title: "", tags: "", bpm: 100, key: KEYS[hash32(g[2]) % 12], energy: 0.5 }); b.append(c); }
    b.append(document.createTextNode(g[1] + " · " + g[3].length));
    b.addEventListener("click", () => { pick = g; show(); });
    tabs.append(b);
  }
  show(); $("#taste").classList.remove("hidden");
  openTaste.redraw = show;
}
/* a reaction while TASTE is open: retrain, and let the neurons flare */
const _react = react;
react = async function (emoji, text) {
  await _react(emoji, text);
  rebuildBrains().then(() => {
    if ($("#taste").classList.contains("hidden") || !openTaste.redraw) return;
    let t0 = performance.now();
    const flare = () => { brainPulse = Math.max(0, 1 - (performance.now() - t0) / 700) * 2; openTaste.redraw(); if (brainPulse > 0) requestAnimationFrame(flare); };
    flare();
  }).catch(() => {});
};
rebuildBrains().catch(() => {});
