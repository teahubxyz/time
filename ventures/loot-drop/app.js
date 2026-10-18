(() => {
'use strict';
const $ = s => document.querySelector(s);
const RAR = {
  normal: { label: 'Normal', color: '#e8e8e8', aff: 0 },
  magic: { label: 'Magic', color: '#7b8cff', aff: 2 },
  rare: { label: 'Rare', color: '#ffe45e', aff: 4 },
  set: { label: 'Set', color: '#4fe07a', aff: 3 },
  unique: { label: 'Unique', color: '#d9a441', aff: 4 }
};
const L = {
  skills: ['Passive-Aggressive Emails', 'Meeting Avoidance', 'Snack Acquisition', 'Deep Work', 'Standup Endurance', 'Reply-All Restraint', 'Couch Surfing', 'Grill Mastery', 'Small Talk', 'Parallel Parking'],
  spells: ['Nap', 'Awkward Silence', 'Sigh', 'Coffee Break', 'Mute Yourself', 'Buffering', 'Dad Joke', 'Snooze'],
  stats: ['Faster Snack Recovery', 'Meeting Resistance', 'Coffee Find', 'Procrastination Speed', 'Chair Swivel Rate', 'Mild Inconvenience Reduction'],
  dmg: ['Lukewarm', 'Passive-Aggressive', 'Sarcastic', 'Crumb', 'Static Cling'],
  bases: ['Heirloom', 'Relic', 'Trinket', 'Totem', 'Contraption', 'Artifact'],
  sets: ['Break Room Regalia', 'Cubicle Warden', 'Weekend Warrior', 'Garage Sale Vestments'],
  flavor: ['It has seen things. Mostly spreadsheets.', 'Some say it was here before the Wi-Fi.', 'Held together by habit and one good screw.', 'Legends tell of a time it was new.', 'It does not work. It does not need to.', 'Everyone has borrowed it. No one has returned it.']
};
const SAMPLE = {
  n: 'Loot Drop', r: 'unique', p: '',
  c: "Crown your buddy's office chair in under a minute\nFree: no account, nothing uploaded\nSame name, same roll, every time",
  f: 'Type a name. Pick a rarity. Post it before the joke goes cold.'
};

// FNV-1a string hash + mulberry32 PRNG: same name, same sequence.
const hash = s => { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = a => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

function artCanvas(card) {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d');
  if (card.p) {
    const b = unb64(card.p), im = g.createImageData(16, 16);
    for (let i = 0; i < 256; i++) { im.data.set(b.subarray(i * 3, i * 3 + 3), i * 4); im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0); return c;
  }
  const s = hash(card.n.toLowerCase() + '#art'), r = rng(s); // no photo: a seeded mirrored pixel sigil
  g.fillStyle = '#1b1b26'; g.fillRect(0, 0, 16, 16);
  g.fillStyle = `hsl(${s % 360} 70% 60%)`;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) if (r() < .5) { g.fillRect(x, y, 1, 1); g.fillRect(15 - x, y, 1, 1); }
  return c;
}

function build(card) {
  const R = RAR[card.r], r = rng(hash(card.n.toLowerCase()));
  const pick = a => a[Math.floor(r() * a.length)], int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const T = [
    () => `+${int(1, 4)} to ${pick(L.skills)}`,
    () => `${int(5, 25)}% Chance to Cast ${pick(L.spells)} on Striking`,
    () => `+${int(10, 60)}% ${pick(L.stats)}`,
    () => `Adds ${int(1, 9)}-${int(10, 40)} ${pick(L.dmg)} Damage`,
    () => `${int(5, 20)}% Chance of ${pick(L.spells)} when Hit`,
    () => `+${int(1, 3)} to ${pick(L.skills)} (Per Character Level)`
  ];
  const base = pick(L.bases), ilvl = int(5, 85), req = int(1, Math.min(60, ilvl)), set = pick(L.sets), flavor = pick(L.flavor), start = int(0, T.length - 1);
  const aff = [0, 1, 2, 3, 4].map(i => T[(start + i) % T.length]());
  const own = card.c.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 6);
  return {
    title: card.n, color: R.color, type: `${R.label} ${base}`,
    stats: [`Item Level: ${ilvl}`, `Required Level: ${req}`],
    lines: [...own, ...aff.slice(0, R.aff)],
    set: card.r === 'set' ? `Part of the ${set} set` : '',
    flavor: card.f || flavor, art: artCanvas(card)
  };
}

const TW = 360, M = 12, P = 16;
// Draws the tooltip; H = 0 measures only, returns total height.
function paint(g, it, H) {
  const tw = TW - 2 * M - 2 * P, cx = TW / 2; let y = M + P;
  if (H) {
    g.beginPath(); g.roundRect ? g.roundRect(M, M, TW - 2 * M, H - 2 * M, 6) : g.rect(M, M, TW - 2 * M, H - 2 * M);
    g.fillStyle = 'rgba(10,10,14,.94)'; g.fill(); g.lineWidth = 2; g.strokeStyle = it.color; g.stroke();
  }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const text = (t, font, color, lh) => {
    g.font = font; g.fillStyle = color; let line = ''; const out = [];
    for (const w of t.split(/\s+/)) { const n = line ? line + ' ' + w : w; if (g.measureText(n).width > tw && line) { out.push(line); line = w; } else line = n; }
    out.push(line);
    for (const l of out) { y += lh; if (H) g.fillText(l, cx, y - lh / 2, tw); } // maxWidth squeezes an unbreakable long word
  };
  const rule = () => { y += 8; if (H) { g.fillStyle = '#3a3a4c'; g.fillRect(M + P, y, tw, 1); } y += 8; };
  text(it.title, 'bold 21px Georgia, serif', it.color, 26);
  text(it.type, '13px Georgia, serif', '#9a97a8', 18);
  y += 10;
  if (H) {
    g.imageSmoothingEnabled = false; g.drawImage(it.art, cx - 48, y, 96, 96);
    g.lineWidth = 2; g.strokeStyle = it.color; g.strokeRect(cx - 49, y - 1, 98, 98);
  }
  y += 96 + 6;
  rule();
  it.stats.forEach(s => text(s, '13px Georgia, serif', '#b8b5c4', 18));
  if (it.lines.length) { rule(); it.lines.forEach(s => text(s, '14px Georgia, serif', '#8f9bff', 20)); }
  if (it.set) text(it.set, '14px Georgia, serif', '#4fe07a', 22);
  rule();
  text(it.flavor, 'italic 13px Georgia, serif', '#b99d6a', 18);
  return y + P + M;
}

const enc = card => {
  let s = ''; new TextEncoder().encode(JSON.stringify(card)).forEach(b => s += String.fromCharCode(b));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
function dec(h) {
  const o = JSON.parse(new TextDecoder().decode(unb64(h.replace(/-/g, '+').replace(/_/g, '/'))));
  if (typeof o.n !== 'string' || !RAR[o.r]) throw new Error('bad card');
  const p = typeof o.p === 'string' ? o.p : '';
  if (p && unb64(p).length !== 768) throw new Error('bad art');
  return { n: o.n.slice(0, 60), r: o.r, c: String(o.c || '').slice(0, 300), f: String(o.f || '').slice(0, 140), p };
}

const cv = $('#card'), g = cv.getContext('2d'), status = $('#status'), stage = $('#stage');
let photo = '';
const read = () => ({
  n: $('#name').value.trim() || 'Nameless Thing', r: document.querySelector('input[name=r]:checked').value,
  c: $('#lines').value, f: $('#flavor').value.trim(), p: photo
});
function apply(card) {
  $('#name').value = card.n; $('#lines').value = card.c; $('#flavor').value = card.f; photo = card.p;
  document.querySelector(`input[name=r][value=${card.r}]`).checked = true;
}
function render() {
  const card = read(), it = build(card), S = 2;
  cv.width = TW * S; cv.height = 2000 * S; g.setTransform(S, 0, 0, S, 0, 0);
  const H = Math.ceil(paint(g, it, 0));
  cv.height = H * S; g.setTransform(S, 0, 0, S, 0, 0); paint(g, it, H);
  cv.setAttribute('aria-label', [it.type, it.title, ...it.stats, ...it.lines, it.set, it.flavor].filter(Boolean).join('. '));
  return card;
}
function clink() {
  try {
    const a = clink.a || (clink.a = new AudioContext()); a.resume();
    [1760, 2637, 3520].forEach((f, i) => {
      const o = a.createOscillator(), v = a.createGain(), t = a.currentTime;
      o.type = 'triangle'; o.frequency.value = f; v.gain.setValueAtTime(.1, t); v.gain.exponentialRampToValueAtTime(.0001, t + .3 + i * .1);
      o.connect(v).connect(a.destination); o.start(t); o.stop(t + .6);
    });
  } catch (e) { /* audio may be blocked until the page gets a click or tap */ }
}
function drop() {
  stage.classList.remove('drop'); void stage.offsetWidth; stage.classList.add('drop');
  setTimeout(clink, 600);
}
async function pixelate(file) {
  const bmp = await createImageBitmap(file), c = document.createElement('canvas'); c.width = c.height = 16;
  const x = c.getContext('2d'), s = Math.min(bmp.width, bmp.height); x.imageSmoothingQuality = 'high';
  x.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 16, 16);
  const d = x.getImageData(0, 0, 16, 16).data, out = new Uint8Array(768);
  for (let i = 0; i < 256; i++) out.set(d.subarray(i * 4, i * 4 + 3), i * 3);
  let b = ''; out.forEach(v => b += String.fromCharCode(v)); return btoa(b);
}
const say = t => { status.textContent = t; };

$('#f').addEventListener('input', e => { if (e.target.id !== 'photo') render(); });
$('#photo').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try { photo = await pixelate(f); render(); say('Photo pixelated in your browser. Nothing was uploaded.'); }
  catch (err) { say('Could not read that image.'); }
});
$('#clear').addEventListener('click', () => { photo = ''; $('#photo').value = ''; render(); say('Photo removed.'); });
$('#drop').addEventListener('click', () => { render(); drop(); });
$('#png').addEventListener('click', () => {
  render(); cv.toBlob(b => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(b);
    a.download = (read().n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item') + '.png';
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); say('PNG saved (transparent background).');
  });
});
$('#link').addEventListener('click', async () => {
  const url = location.href.split('#')[0] + '#' + enc(render());
  try { await navigator.clipboard.writeText(url); say('Link copied. Opening it drops the item.'); }
  catch (e) { prompt('Copy this link:', url); }
});

let card = SAMPLE, fromLink = false;
try { if (location.hash.length > 1) { card = dec(location.hash.slice(1)); fromLink = true; } }
catch (e) { say('That link could not be read, so here is the sample.'); }
if (matchMedia('(max-width:700px)').matches) $('#more').open = false;
apply(card); render(); if (fromLink) drop();

// Self-check: the same name must roll the same lines, and links must round-trip.
const lines = c => JSON.stringify(build(c).lines);
console.assert(lines(SAMPLE) === lines({ ...SAMPLE }), 'roll is not deterministic');
console.assert(JSON.stringify(dec(enc(SAMPLE))) === JSON.stringify(SAMPLE), 'link does not round-trip');
})();
