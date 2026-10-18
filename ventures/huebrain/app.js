// Huebrain: a 4-8-1 neural net trained in the page on Love/Nope taps. No network calls.
const N = 20, H = 8, BG = [20, 18, 26];
// 20 sample taps (earthy colors loved, neon/cool colors passed) go through addTap + fit, like a user's taps.
const SAMPLE = [['#c8795a',1],['#00e5ff',0],['#8fa88a',1],['#ff00cc',0],['#e0b89a',1],['#4a4a55',0],['#b5603f',1],['#39ff14',0],['#f1e4cf',1],['#2b3a8c',0],['#a9bfa0',1],['#ffee00',0],['#d9a37c',1],['#8a8fa8',0],['#7c9a8a',1],['#6b2fd0',0],['#e8c9a0',1],['#1fa0ff',0],['#c98f6b',1],['#d0d3dc',0]];

const rng = s => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const rgb = ({ h, s, l }) => { const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)].map(v => Math.round(v * 255)); };
const hex = c => '#' + rgb(c).map(v => v.toString(16).padStart(2, '0')).join('');
function fromHex(x) {
  const r = [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16) / 255), mx = Math.max(...r), mn = Math.min(...r), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = 60 * (mx == r[0] ? ((r[1] - r[2]) / d + 6) % 6 : mx == r[1] ? (r[2] - r[0]) / d + 2 : (r[0] - r[1]) / d + 4); }
  return { h, s, l };
}
const feat = c => [Math.cos(c.h * Math.PI / 180), Math.sin(c.h * Math.PI / 180), 2 * c.s - 1, 2 * c.l - 1];

// weights flat: W1[h*4+i] 0..31, b1 32..39, w2 40..47, b2 48
const newNet = seed => { const r = rng(seed); return Array.from({ length: 49 }, (_, i) => i < 32 || (i >= 40 && i < 48) ? (r() - .5) * 2 : 0); };
function forward(p, x) {
  const a = [];
  let z = p[48];
  for (let h = 0; h < H; h++) { let s = p[32 + h]; for (let i = 0; i < 4; i++) s += p[h * 4 + i] * x[i]; a[h] = Math.tanh(s); z += p[40 + h] * a[h]; }
  return { a, z, y: 1 / (1 + Math.exp(-z)) };
}
const predict = (p, c) => forward(p, feat(c)).y;
function train(p, taps, epochs, lr = .15, reg = .003) {
  for (let e = 0; e < epochs; e++) for (const t of taps) {
    const x = feat(t.c), { a, y } = forward(p, x), dz = y - t.y;
    for (let h = 0; h < H; h++) {
      const dh = dz * p[40 + h] * (1 - a[h] * a[h]);
      p[40 + h] -= lr * (dz * a[h] + reg * p[40 + h]);
      for (let i = 0; i < 4; i++) p[h * 4 + i] -= lr * (dh * x[i] + reg * p[h * 4 + i]);
      p[32 + h] -= lr * dh;
    }
    p[48] -= lr * dz;
  }
}
const addTap = (b, c, y) => b.taps.push({ c, y });
const fit = (b, epochs) => train(b.p, b.taps, epochs);

function palette(p) {
  const cand = [];
  for (let h = 0; h < 360; h += 10) for (const s of [.3, .5, .7, .9]) for (const l of [.3, .45, .6, .75]) { const c = { h, s, l }; cand.push({ c, z: forward(p, feat(c)).z, v: rgb(c) }); }
  cand.sort((a, b) => b.z - a.z);
  const out = [];
  for (const d of [90, 60, 30, 0]) for (const k of cand) if (out.length < 5 && !out.includes(k) && out.every(o => Math.hypot(...o.v.map((v, i) => v - k.v[i])) > d)) out.push(k);
  return out.map(k => hex(k.c));
}
function match(a, b) {
  let sum = 0, n = 0;
  for (let h = 0; h < 360; h += 15) for (const s of [.3, .6, .9]) for (const l of [.3, .5, .7]) { const c = { h, s, l }; sum += 1 - Math.abs(predict(a, c) - predict(b, c)); n++; }
  return Math.round(100 * sum / n);
}
const enc = p => btoa(String.fromCharCode(...p.map(w => Math.max(-127, Math.min(127, Math.round(w * 16))) + 128))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = s => { try { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return b.length == 49 ? Array.from(b, ch => (ch.charCodeAt(0) - 128) / 16) : null; } catch (e) { return null; } };

function wheelCanvas(p, l, n) {
  const cv = document.createElement('canvas'); cv.width = cv.height = n;
  const x = cv.getContext('2d'), im = x.createImageData(n, n), R = n / 2;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const dx = (i + .5 - R) / R, dy = (j + .5 - R) / R, r = Math.hypot(dx, dy);
    if (r > 1) continue;
    const h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, c = { h, s: r, l }, t = .08 + .92 * Math.pow(predict(p, c), 1.5), v = rgb(c), o = (j * n + i) * 4;
    for (let k = 0; k < 3; k++) im.data[o + k] = BG[k] + (v[k] - BG[k]) * t;
    im.data[o + 3] = 255;
  }
  x.putImageData(im, 0, 0);
  return cv;
}

const randColor = () => ({ h: Math.random() * 360, s: .25 + .7 * Math.random(), l: .22 + .58 * Math.random() });
const makeSeq = () => { const o = Math.random() * 360; return Array.from({ length: N }, (_, i) => ({ h: (o + i * 137.508) % 360, s: .25 + .7 * Math.random(), l: .22 + .58 * Math.random() })); };
function sampleBrain() { const b = { p: newNet(7), taps: [], own: false }; SAMPLE.forEach(([x, y]) => addTap(b, fromHex(x), y)); fit(b, 700); return b; }

if (typeof module !== 'undefined') module.exports = { SAMPLE, sampleBrain, fromHex, hex, palette, match, enc, dec, predict, newNet, train, feat };

function init() {
  const $ = id => document.getElementById(id);
  $('try').innerHTML = `<div class="app">
<div class="col">
 <div class="card"><div class="swrow"><div class="sw" id="sw"></div><div class="swinfo"><b id="swHex"></b><span id="count"></span><div class="pbar"><i id="prog"></i></div></div></div>
  <div class="btns"><button id="nope" class="nope">Nope <kbd>←</kbd></button><button id="love" class="love">Love <kbd>→</kbd></button></div>
  <p id="status" class="note" aria-live="polite"></p></div>
 <div class="card"><h2>The net, live</h2><canvas id="net" width="320" height="170" aria-label="Neural net: 4 inputs, 8 neurons, 1 output"></canvas>
  <p class="note">4 color inputs, 8 neurons, 1 yes score. Neurons glow as they fire while it trains on your taps.</p></div>
</div>
<div class="col">
 <div class="card"><h2 id="brainName"></h2><canvas id="wheel" width="240" height="240" aria-label="Color wheel heat map of what this brain says yes to"></canvas>
  <label class="note">Lightness <input id="lt" type="range" min="15" max="85" value="50"></label>
  <p class="note">Bright = it would say yes. Dim = nope. Hue around, saturation outward.</p>
  <div id="pal" class="pal"></div></div>
</div>
<div class="col">
 <div class="card"><h2>Does it know you?</h2><div class="swrow"><div class="sw small" id="gsw"></div><div class="btns tight"><button id="gn" class="nope">Nope</button><button id="gl" class="love">Love</button></div></div>
  <p id="gmsg" class="note" aria-live="polite"></p></div>
 <div class="card" id="cmp" hidden><h2>Side by side</h2><div class="two"><figure><canvas id="cw1" width="120" height="120"></canvas><figcaption>Their brain (from link)</figcaption></figure><figure id="f2"><canvas id="cw2" width="120" height="120"></canvas><figcaption>Your brain</figcaption></figure></div><p id="cmsg" class="score"></p></div>
 <div class="card acts"><button id="dl">Download wallpaper PNG</button><button id="copy">Copy share link</button><button id="again" class="ghost">Start over</button><input id="lnk" readonly hidden aria-label="Share link"><p class="note" id="amsg" aria-live="polite">Everything runs in this page. Nothing is uploaded.</p></div>
</div></div>`;

  let mine = sampleBrain(), other = null, seq = makeSeq(), g = { c: randColor(), n: 0, ok: 0, msg: '' }, anim = 0;
  const m = /^#b=([\w-]+)$/.exec(location.hash), op = m && dec(m[1]);
  if (op) other = { p: op };
  const k = () => mine.own ? mine.taps.length : 0;
  const draw = (id, cv) => { const x = $(id).getContext('2d'); x.clearRect(0, 0, $(id).width, $(id).height); x.drawImage(cv, 0, 0); };
  const drawWheel = () => draw('wheel', wheelCanvas(mine.p, $('lt').value / 100, 240));

  function drawNet(c, pulse) {
    const p = mine.p, x = $('net').getContext('2d'), f = feat(c), r = forward(p, f);
    const I = f.map((_, i) => [30, 25 + i * 40]), Hd = r.a.map((_, h) => [160, 14 + h * 20.3]);
    x.clearRect(0, 0, 320, 170); x.shadowBlur = 0; x.lineWidth = 1;
    const line = (a, b, w) => { x.strokeStyle = (w > 0 ? 'rgba(255,176,64,' : 'rgba(90,160,255,') + Math.min(.8, Math.abs(w) / 3) + ')'; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); };
    Hd.forEach((q, h) => { I.forEach((a, i) => line(a, q, p[h * 4 + i])); line(q, [290, 85], p[40 + h]); });
    I.forEach((a, i) => { x.fillStyle = `rgba(230,225,240,${.25 + .5 * (f[i] + 1) / 2})`; x.beginPath(); x.arc(a[0], a[1], 7, 0, 7); x.fill(); });
    Hd.forEach((q, h) => { const v = Math.abs(r.a[h]); x.shadowColor = r.a[h] > 0 ? '#ffb040' : '#5aa0ff'; x.shadowBlur = pulse ? 16 * v : 5 * v; x.fillStyle = (r.a[h] > 0 ? 'rgba(255,176,64,' : 'rgba(90,160,255,') + (.25 + .75 * v) + ')'; x.beginPath(); x.arc(q[0], q[1], 5 + 4 * v * (pulse ? 1.3 : 1), 0, 7); x.fill(); });
    x.shadowBlur = 0; x.fillStyle = `rgba(74,222,128,${.3 + .7 * r.y})`; x.beginPath(); x.arc(290, 85, 11, 0, 7); x.fill();
    x.fillStyle = '#9a93a8'; x.font = '10px system-ui'; x.fillText('color', 12, 166); x.fillText('neurons', 135, 166); x.fillText('yes?', 278, 120);
  }

  function animate(frames) {
    const id = ++anim, per = Math.ceil(240 / frames);
    let f = 0;
    (function step() {
      if (id !== anim) return;
      train(mine.p, mine.taps, per);
      drawNet(mine.taps[f % mine.taps.length].c, true);
      if (f % 3 == 0) drawWheel();
      if (++f < frames) requestAnimationFrame(step); else render();
    })();
  }

  function tap(y) {
    if (k() >= N) return;
    if (!mine.own) mine = { p: newNet(Date.now() % 1e6), taps: [], own: true };
    addTap(mine, seq[mine.taps.length], y);
    render();
    animate(24);
  }

  function render() {
    const n = k(), done = n >= N, cur = seq[Math.min(n, N - 1)];
    $('sw').style.background = done ? '#2a2632' : hex(cur);
    $('swHex').textContent = done ? 'All 20 tapped' : hex(cur);
    $('count').textContent = n + ' / ' + N;
    $('prog').style.width = 100 * n / N + '%';
    $('love').disabled = $('nope').disabled = done;
    $('status').textContent = !mine.own ? 'Preloaded: a brain trained on 20 sample taps. Tap Love or Nope to train your own from scratch.' : done ? 'Done. Your brain is trained on your 20 taps. Download it or copy your link.' : 'The net retrains after every tap.';
    $('brainName').textContent = mine.own ? 'Your brain' : 'Sample brain (20 sample taps)';
    drawWheel();
    drawNet(cur, false);
    $('pal').innerHTML = palette(mine.p).map(c => `<div style="background:${c};color:${fromHex(c).l > .55 ? '#111' : '#fff'}">${c}</div>`).join('');
    $('gsw').style.background = hex(g.c);
    $('gmsg').textContent = (g.msg ? g.msg + ' ' : 'Pick what you would say about this new swatch; the brain guessed too. ') + (g.n ? `Matched ${g.ok} of ${g.n}.` : '');
    $('cmp').hidden = !other;
    if (other) {
      draw('cw1', wheelCanvas(other.p, .5, 120));
      $('f2').hidden = !mine.own;
      if (mine.own) draw('cw2', wheelCanvas(mine.p, .5, 120));
      $('cmsg').textContent = mine.own ? `Match score: ${match(mine.p, other.p)}%` : 'Tap your own 20 to see the match score.';
    }
  }

  function guess(y) {
    const p = predict(mine.p, g.c), say = p >= .5 ? 1 : 0, ok = say == y;
    g.n++; g.ok += ok; g.msg = `Brain guessed ${say ? 'Love' : 'Nope'} (${Math.round(100 * (say ? p : 1 - p))}% sure): ${ok ? 'it matched you.' : 'it missed.'}`;
    g.c = randColor(); render();
  }

  function wallpaper() {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
    const x = c.getContext('2d'), pal = palette(mine.p);
    x.fillStyle = '#14121a'; x.fillRect(0, 0, 1080, 1920);
    x.fillStyle = '#f4efe6'; x.font = '700 76px system-ui,sans-serif'; x.fillText(mine.own ? 'My color brain' : 'A sample color brain', 80, 190);
    x.fillStyle = '#9a93a8'; x.font = '34px system-ui,sans-serif'; x.fillText('Heat map of the colors it would say yes to', 80, 250);
    x.drawImage(wheelCanvas(mine.p, .5, 640), 90, 340, 900, 900);
    pal.forEach((h, i) => { x.fillStyle = h; x.fillRect(80 + i * 190, 1330, 170, 300); x.fillStyle = '#f4efe6'; x.font = '28px system-ui,sans-serif'; x.fillText(h, 90 + i * 190, 1672); });
    x.fillStyle = '#6f6a7c'; x.font = '30px system-ui,sans-serif'; x.fillText('Huebrain: trained and drawn in the browser', 80, 1820);
    c.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'huebrain-wallpaper.png'; a.click(); });
  }

  $('love').onclick = () => tap(1); $('nope').onclick = () => tap(0);
  $('gl').onclick = () => guess(1); $('gn').onclick = () => guess(0);
  $('lt').oninput = drawWheel;
  $('dl').onclick = () => { wallpaper(); $('amsg').textContent = 'Wallpaper PNG made in this page.'; };
  $('again').onclick = () => { anim++; mine = sampleBrain(); seq = makeSeq(); g = { c: randColor(), n: 0, ok: 0, msg: '' }; render(); };
  $('copy').onclick = () => {
    const u = location.origin + location.pathname + '#b=' + enc(mine.p), l = $('lnk');
    l.value = u; l.hidden = false;
    (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => $('amsg').textContent = 'Link copied. It holds your net weights, nothing else.', () => { l.select(); $('amsg').textContent = 'Copy the link above.'; });
  };
  document.addEventListener('keydown', e => { if (e.target.tagName == 'INPUT' || e.target.tagName == 'BUTTON') return; if (e.key == 'ArrowRight') tap(1); if (e.key == 'ArrowLeft') tap(0); });
  render();
}
if (typeof document !== 'undefined') init();
