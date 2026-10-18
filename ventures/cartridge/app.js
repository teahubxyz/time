'use strict';
// Cartridge: everything runs in this page. No network calls, no libraries.
const W = 600, H = 840;
const STYLES = {
  snes: { label: '16-BIT', bg: '#c5c3cf', ink: '#1b1630', band: '#4b3a8c', accent: '#e0433a', bandInk: '#ffffff', font: 'Impact, "Arial Black", sans-serif', px: 150, smooth: false, levels: 5 },
  ps1: { label: '32-BIT CD', bg: '#0b0b0f', ink: '#f2f2f2', band: '#2a2d3a', accent: '#9aa7c7', bandInk: '#e8ecf8', font: '"Arial Black", Impact, sans-serif', px: 320, smooth: true, levels: 8 },
  hand: { label: 'HANDHELD', bg: '#a9b08c', ink: '#1e2a14', band: '#3b4a2a', accent: '#b3263e', bandInk: '#dbe5b0', font: '"Courier New", monospace', px: 96, smooth: false, pal: [[15, 56, 15], [48, 98, 48], [139, 172, 15], [155, 188, 15]] }
};
const RATINGS = [['E', 'EVERYONE'], ['T', 'TEEN'], ['M', 'MATURE'], ['?', 'RATING PENDING']];

// Pure helpers (self-checked in test.js).
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function parseStats(t, n) {
  return t.split('\n').map(l => l.trim()).filter(Boolean).slice(0, n).map(l => {
    const i = l.indexOf(':');
    return i < 0 ? ['', l] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  });
}
// shortcut: a single word wider than max is not broken, upgrade if long unbroken strings matter.
function wrap(measure, text, max, maxLines) {
  const lines = []; let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const t = cur ? cur + ' ' + w : w;
    if (!cur || measure(t) <= max) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let l = lines[maxLines - 1];
    while (l && measure(l + '…') > max) l = l.slice(0, -1);
    lines[maxLines - 1] = l.trimEnd() + '…';
  }
  return lines;
}
if (typeof module !== 'undefined') module.exports = { hash, parseStats, wrap };

if (typeof document !== 'undefined') (function () {
  const $ = id => document.getElementById(id);
  const cv = $('cv'), form = document.querySelector('#try form'), status = $('status');
  let photo = null;

  // Photo cropped to w x h, reduced to the console's resolution and palette, then scaled up.
  function art(g, x, y, w, h, st, zoom, fx, fy) {
    const sw = Math.max(8, Math.round(st.px * w / W)), sh = Math.max(8, Math.round(sw * h / w));
    const c = document.createElement('canvas'); c.width = sw; c.height = sh;
    const k = c.getContext('2d');
    k.fillStyle = '#fff'; k.fillRect(0, 0, sw, sh);
    const s = Math.max(sw / photo.width, sh / photo.height) * zoom;
    k.drawImage(photo, (sw - photo.width * s) * fx, (sh - photo.height * s) * fy, photo.width * s, photo.height * s);
    const d = k.getImageData(0, 0, sw, sh), a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      if (st.pal) {
        const l = (0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]) / 255, p = st.pal[Math.min(3, (l * 4) | 0)];
        a[i] = p[0]; a[i + 1] = p[1]; a[i + 2] = p[2];
      } else {
        const q = 255 / (st.levels - 1);
        for (let j = 0; j < 3; j++) a[i + j] = Math.round(a[i + j] / q) * q;
      }
    }
    k.putImageData(d, 0, 0);
    g.imageSmoothingEnabled = st.smooth;
    g.drawImage(c, x, y, w, h);
  }
  function fit(g, text, font, max, size) {
    for (; size > 12; size -= 2) { g.font = size + 'px ' + font; if (g.measureText(text).width <= max) break; }
  }
  function top(g, m, st) {
    g.fillStyle = st.bg; g.fillRect(0, 0, W, H);
    g.fillStyle = st.band; g.fillRect(0, 0, W, 84);
    g.fillStyle = st.accent; g.fillRect(0, 84, W, 8);
    g.textBaseline = 'middle'; g.fillStyle = st.bandInk;
  }
  function front(g, m) {
    const st = m.st;
    top(g, m, st);
    g.textAlign = 'left'; g.font = 'bold 34px ' + st.font; g.fillText(st.label, 30, 44);
    g.textAlign = 'right'; fit(g, 'PLAYER 1: ' + m.player.toUpperCase(), st.font, 300, 22); g.fillText('PLAYER 1: ' + m.player.toUpperCase(), 570, 44);
    g.fillStyle = st.ink; g.fillRect(24, 112, 552, 552);
    art(g, 30, 118, 540, 540, st, m.zoom, m.fx, m.fy);
    const r = RATINGS[m.rating], x = 42, y = 530;
    g.fillStyle = '#fff'; g.fillRect(x, y, 84, 114);
    g.strokeStyle = '#000'; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, 80, 110);
    g.fillStyle = '#000'; g.textAlign = 'center';
    g.font = 'bold 70px Arial, sans-serif'; g.fillText(r[0], x + 42, y + 52);
    g.font = 'bold 11px Arial, sans-serif'; g.fillText(r[1], x + 42, y + 98, 74);
    g.fillStyle = st.band; g.fillRect(24, 684, 552, 96);
    g.fillStyle = st.bandInk; fit(g, m.title, st.font, 520, 76); g.fillText(m.title, W / 2, 733);
    g.fillStyle = st.ink; fit(g, m.tag, st.font, 552, 24); g.fillText(m.tag, W / 2, 812);
  }
  function shot(g, x, y, w, h, m, zoom, fx, fy, n) {
    const st = m.st;
    g.fillStyle = st.ink; g.fillRect(x, y, w, h);
    art(g, x + 3, y + 3, w - 6, h - 6, st, zoom, fx, fy);
    g.save(); g.beginPath(); g.rect(x + 3, y + 3, w - 6, h - 6); g.clip();
    g.font = 'bold 16px "Courier New", monospace'; g.textBaseline = 'top'; g.textAlign = 'left';
    const t = (s, tx, ty) => { g.fillStyle = '#000'; g.fillText(s, tx + 1, ty + 1); g.fillStyle = '#fff'; g.fillText(s, tx, ty); };
    t('P1 ' + m.player.slice(0, 10).toUpperCase(), x + 10, y + 10);
    t('SCORE ' + String((hash(m.title) * (n + 1)) % 1000000).padStart(6, '0'), x + 10, y + h - 26);
    g.fillStyle = '#e0433a'; for (let i = 0; i < 3; i++) g.fillRect(x + w - 24 - i * 18, y + 12, 12, 12);
    g.restore(); g.textBaseline = 'middle';
  }
  function back(g, m) {
    const st = m.st;
    top(g, m, st);
    g.textAlign = 'left'; fit(g, m.title, st.font, 380, 40); g.fillText(m.title, 30, 44);
    g.textAlign = 'right'; g.font = 'bold 22px ' + st.font; g.fillText(st.label, 570, 44);
    shot(g, 30, 112, 540, 230, m, m.zoom * 1.6, 0.3, 0.4, 0);
    shot(g, 30, 358, 262, 150, m, m.zoom * 2.4, 0.8, 0.25, 1);
    shot(g, 308, 358, 262, 150, m, m.zoom * 2.4, 0.5, 0.95, 2);
    g.fillStyle = st.ink; g.textAlign = 'left'; g.textBaseline = 'top'; g.font = '20px Arial, sans-serif';
    wrap(s => g.measureText(s).width, m.blurb, 540, 4).forEach((l, i) => g.fillText(l, 30, 526 + i * 26));
    g.fillStyle = st.band; g.fillRect(30, 664, 410, 140);
    g.fillStyle = st.bandInk; g.font = '19px "Courier New", monospace';
    m.stats.forEach(([a, b], i) => {
      g.textAlign = 'left'; g.fillText(a.toUpperCase(), 44, 678 + i * 30, 150);
      g.textAlign = 'right'; g.fillText(b, 426, 678 + i * 30, 220);
    });
    g.fillStyle = '#fff'; g.fillRect(460, 664, 110, 140);
    g.fillStyle = '#000'; let s = hash(m.title) || 1;
    for (let x = 470; x < 560; ) { s = Math.imul(s, 1664525) + 1013904223 >>> 0; const w = 2 + (s >>> 28) % 4; g.fillRect(x, 676, w, 100); x += w + 2 + (s >>> 24) % 3; }
    g.textBaseline = 'middle';
  }

  function read() {
    const f = form.elements;
    return {
      st: STYLES[f.style.value], title: (f.ttl.value.trim() || 'Untitled').toUpperCase(),
      player: f.player.value.trim() || 'Player', tag: f.tag.value.trim(), blurb: f.blurb.value.trim(),
      stats: parseStats(f.stats.value, 4), rating: +f.rating.value,
      zoom: +f.zoom.value, fx: +f.fx.value, fy: +f.fy.value
    };
  }
  function render() {
    if (!photo) return;
    const g = cv.getContext('2d'), m = read();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#14141c'; g.fillRect(0, 0, cv.width, cv.height);
    g.save(); g.translate(20, 20); front(g, m); g.restore();
    g.save(); g.translate(660, 20); back(g, m); g.restore();
  }
  let queued = false;
  const later = () => queued || (queued = requestAnimationFrame(() => { queued = false; render(); }));

  // Same path for a user's file and the built-in sample.
  function loadPhoto(blob, label) {
    return new Promise(res => {
      const url = URL.createObjectURL(blob), img = new Image();
      img.onload = () => { photo = img; URL.revokeObjectURL(url); status.textContent = label; render(); res(); };
      img.onerror = () => { URL.revokeObjectURL(url); status.textContent = 'That file could not be read as an image.'; res(); };
      img.src = url;
    });
  }
  const pick = f => f && loadPhoto(f, 'Using ' + f.name + '. It stays in this page.');

  function save(kind) {
    let c = cv;
    if (kind) { c = document.createElement('canvas'); c.width = W; c.height = H; (kind === 'front' ? front : back)(c.getContext('2d'), read()); }
    const name = (read().title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cartridge') + '-' + (kind || 'front-back') + '.png';
    c.toBlob(b => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1e4);
    }, 'image/png');
  }

  form.addEventListener('submit', e => e.preventDefault());
  form.addEventListener('input', later);
  $('file').addEventListener('change', e => pick(e.target.files[0]));
  const tryEl = $('try');
  tryEl.addEventListener('dragover', e => { e.preventDefault(); tryEl.classList.add('over'); });
  tryEl.addEventListener('dragleave', () => tryEl.classList.remove('over'));
  tryEl.addEventListener('drop', e => { e.preventDefault(); tryEl.classList.remove('over'); pick(e.dataTransfer.files[0]); });
  document.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => save(b.dataset.k)));

  const SAMPLE = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1a5e"/><stop offset=".55" stop-color="#e5557a"/><stop offset="1" stop-color="#ffb35c"/></linearGradient></defs><rect width="800" height="800" fill="url(#s)"/><circle cx="580" cy="400" r="120" fill="#ffe08a"/><path d="M0 560L180 380 330 520 480 340 680 560 800 470V800H0Z" fill="#2a1d4d"/><path d="M0 650L220 520 420 640 620 520 800 620V800H0Z" fill="#150f2b"/><g transform="translate(300 330)"><path d="M-70 340L-50 130Q0 100 50 130L70 340Z" fill="#e0433a"/><path d="M50 150L112 96" stroke="#f2c9a0" stroke-width="22" stroke-linecap="round"/><path d="M86 20H136Q136 70 111 76 86 70 86 20Z" fill="#ffd23f"/><rect x="106" y="76" width="10" height="24" fill="#ffd23f"/><rect x="92" y="100" width="38" height="8" fill="#ffd23f"/><circle cy="70" r="55" fill="#f2c9a0"/><path d="M-58 62Q0-30 58 62Q30 30-58 62Z" fill="#4a2a1a"/><circle cx="-20" cy="68" r="6" fill="#222"/><circle cx="20" cy="68" r="6" fill="#222"/><path d="M-22 92Q0 112 22 92" stroke="#222" stroke-width="5" fill="none" stroke-linecap="round"/></g></svg>';
  loadPhoto(new Blob([SAMPLE], { type: 'image/svg+xml' }), 'Showing the built-in sample image. Drop your own photo to replace it.');
})();
