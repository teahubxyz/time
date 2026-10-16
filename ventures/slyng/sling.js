// The slingshot. The pull is a polar coordinate around the fork: its angle picks who, its length picks how much.
// Pure geometry first (exported for the tests), then the SVG component that draws and animates it.

export const LADDER = [0, 21, 100, 210, 1000, 2100, 5000, 10000, 21000];
export const GEOM = { w: 420, h: 470, top: 34, rx: 210, ry: 300, dead: 22, max: 118, fence: 210, grab: 70, tip: 46 };

export const fmt = (n) => Number(n).toLocaleString('en-US');

export function ringRadius(i, g = GEOM) {
  return g.dead + ((g.max - g.dead) * i) / (LADDER.length - 1);
}

// which step of the ladder a stretch reaches; -1 is slack (nothing happens)
export function detentFor(stretch, g = GEOM) {
  if (!(stretch >= g.dead)) return -1;
  const t = (Math.min(stretch, g.max) - g.dead) / (g.max - g.dead);
  return Math.min(LADDER.length - 1, Math.round(t * (LADDER.length - 1)));
}

// the nearest ladder step for a suggested amount (from a link an agent made)
export function detentForAmount(sats) {
  const n = Number(sats);
  if (!Number.isFinite(n) || n <= 0) return 0;
  let best = 0;
  for (let i = 0; i < LADDER.length; i++) if (Math.abs(LADDER[i] - n) < Math.abs(LADDER[best] - n)) best = i;
  return best;
}

// angles of n targets along the fence, centred straight up (-π/2), spread at most `spread` radians
export function fenceAngles(n, spread = Math.PI / 2) {
  if (n <= 0) return [];
  if (n === 1) return [-Math.PI / 2];
  const s = Math.min(spread, (n - 1) * 0.55);
  return Array.from({ length: n }, (_, i) => -Math.PI / 2 - s / 2 + (s * i) / (n - 1));
}

export function fencePoint(angle, g = GEOM) {
  return { x: g.rx + g.fence * Math.cos(angle), y: g.ry + g.fence * Math.sin(angle) };
}

// clamp a pull (pointer minus rest point) to the band's reach
export function clampPull(dx, dy, g = GEOM) {
  const d = Math.hypot(dx, dy);
  if (d <= g.max || d === 0) return { dx, dy, stretch: d };
  return { dx: (dx / d) * g.max, dy: (dy / d) * g.max, stretch: g.max };
}

// who a pull aims at: the stone flies opposite the pull. null when aimed down, or too far off every target
export function aimAt(dx, dy, angles) {
  const ax = -dx, ay = -dy;
  if (ay > -6 || !angles.length) return null;
  const a = Math.atan2(ay, ax);
  let best = 0;
  for (let i = 1; i < angles.length; i++) if (Math.abs(a - angles[i]) < Math.abs(a - angles[best])) best = i;
  const gap = angles.length > 1 ? Math.abs(angles[1] - angles[0]) : 0.6;
  return Math.abs(a - angles[best]) <= Math.max(0.45, gap * 0.75) ? best : null;
}

// the stone's arc: a quadratic from the fork to the target, with its top above both
export function arcPoint(from, to, t) {
  const c = { x: (from.x + to.x) / 2 + (to.x - from.x) * 0.12, y: Math.min(from.y, to.y) - 70 };
  const u = 1 - t;
  return { x: u * u * from.x + 2 * u * t * c.x + t * t * to.x, y: u * u * from.y + 2 * u * t * c.y + t * t * to.y };
}

export function arcPath(from, to) {
  const c = { x: (from.x + to.x) / 2 + (to.x - from.x) * 0.12, y: Math.min(from.y, to.y) - 70 };
  return `M${from.x.toFixed(1)} ${from.y.toFixed(1)} Q${c.x.toFixed(1)} ${c.y.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
}

// ---------------------------------------------------------------------------------------------------- the drawing

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}, parent = null) => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, String(v));
  if (parent) parent.appendChild(e);
  return e;
};

const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const ease = (t) => 1 - Math.pow(1 - t, 3);

export class Slingshot {
  constructor(svg, handlers = {}) {
    this.svg = svg;
    this.h = handlers;
    this.g = GEOM;
    this.targets = [];
    this.angles = [];
    this.pouch = { x: GEOM.rx, y: GEOM.ry };
    this.pull = { dx: 0, dy: 0, stretch: 0 };
    this.aim = null;
    this.detent = -1;
    this.dragging = false;
    this.flying = false;
    this.keyTarget = 0;
    this.keyDetent = -1;
    this.noted = false;
    this.build();
    this.bind();
    this.render();
  }

  build() {
    const g = this.g, s = this.svg;
    s.setAttribute('viewBox', `0 ${g.top} ${g.w} ${g.h - g.top}`);
    s.innerHTML = '';
    const defs = el('defs', {}, s);
    this.clipBase = 'clip' + Math.random().toString(36).slice(2, 7);
    this.defs = defs;

    // the fence: an arc of equal distance from the fork, so distance never matters, only who and how much
    this.fenceArc = el('path', { class: 'fence-arc' }, s);
    this.rings = el('g', { class: 'rings', 'aria-hidden': 'true' }, s);
    this.ringEls = LADDER.map((v, i) => {
      const r = ringRadius(i);
      return el('circle', { cx: g.rx, cy: g.ry, r, class: 'ring' + (i === 0 ? ' ring-note' : '') }, this.rings);
    });
    this.ringLabels = LADDER.map((v, i) => {
      const r = ringRadius(i), a = (-18 * Math.PI) / 180;
      const t = el('text', { x: g.rx + r * Math.cos(a) + 4, y: g.ry + r * Math.sin(a) + 4, class: 'ring-label' }, this.rings);
      t.textContent = i === 0 ? 'note' : fmt(v);
      if (i !== LADDER.length - 1) t.classList.add('minor');
      return t;
    });
    this.suggestRing = el('circle', { cx: g.rx, cy: g.ry, r: 0, class: 'ring-suggest' }, s);
    this.path = el('path', { class: 'trajectory' }, s);
    this.targetLayer = el('g', { class: 'targets' }, s);

    // the fork, drawn as the Y in the name
    const fork = el('g', { class: 'fork', 'aria-hidden': 'true' }, s);
    const crotch = g.ry + 64, top = g.ry + 4, t = g.tip;
    el('path', { d: `M${g.rx} ${g.ry + 152} L${g.rx} ${crotch}`, class: 'fork-handle' }, fork);
    el('path', { d: `M${g.rx - t} ${top} C${g.rx - t + 1} ${g.ry + 42} ${g.rx - 20} ${crotch - 6} ${g.rx} ${crotch} C${g.rx + 20} ${crotch - 6} ${g.rx + t - 1} ${g.ry + 42} ${g.rx + t} ${top}`, class: 'fork-arms' }, fork);
    const w = [44, 58, 72].map((dy) => `M${g.rx - 11} ${crotch + dy} L${g.rx + 11} ${crotch + dy}`).join(' ');
    el('path', { d: w, class: 'fork-wrap' }, fork);
    this.tipL = { x: g.rx - t, y: top };
    this.tipR = { x: g.rx + t, y: top };
    this.bandL = el('line', { class: 'band', x1: this.tipL.x, y1: this.tipL.y }, s);
    this.bandR = el('line', { class: 'band', x1: this.tipR.x, y1: this.tipR.y }, s);
    this.pouchEl = el('path', { class: 'pouch' }, s);
    this.noteTag = el('g', { class: 'note-tag' }, s);
    el('line', { x1: 0, y1: 0, x2: 13, y2: -15, class: 'note-string' }, this.noteTag);
    el('rect', { x: 9, y: -29, width: 22, height: 15, rx: 2, class: 'note-paper' }, this.noteTag);
    el('path', { d: 'M13 -24 L27 -24 M13 -19 L23 -19', class: 'note-lines' }, this.noteTag);
    this.stone = el('circle', { r: 10.5, class: 'stone' }, s);
    this.hit = el('circle', { cx: g.rx, cy: g.ry + 16, r: g.grab, class: 'grab' }, s);
    this.fx = el('g', { class: 'fx', 'aria-hidden': 'true' }, s);
  }

  bind() {
    const s = this.svg;
    const pt = (e) => {
      const r = s.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * this.g.w, y: this.g.top + ((e.clientY - r.top) / r.height) * (this.g.h - this.g.top) };
    };
    const near = (p) => Math.hypot(p.x - this.g.rx, p.y - (this.g.ry + 16)) <= this.g.grab;
    s.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1 && !this.flying && near(pt(e.touches[0]))) e.preventDefault();
    }, { passive: false });
    s.addEventListener('touchmove', (e) => { if (this.dragging) e.preventDefault(); }, { passive: false });
    s.addEventListener('pointerdown', (e) => {
      if (this.flying || e.button > 0) return;
      const p = pt(e);
      if (!near(p)) return;
      e.preventDefault();
      this.dragging = true;
      this.keyDetent = -1;
      try { s.setPointerCapture(e.pointerId); } catch {}
      s.classList.add('pulling');
      this.move(p);
      this.h.onStart?.();
    });
    s.addEventListener('pointermove', (e) => { if (this.dragging) this.move(pt(e)); });
    const end = (cancelled) => {
      if (!this.dragging) return;
      this.dragging = false;
      s.classList.remove('pulling');
      this.letGo(cancelled);
    };
    s.addEventListener('pointerup', () => end(false));
    s.addEventListener('pointercancel', () => end(true));
    s.addEventListener('keydown', (e) => this.key(e));
  }

  move(p) {
    const c = clampPull(p.x - this.g.rx, p.y - this.g.ry);
    this.pull = c;
    this.pouch = { x: this.g.rx + c.dx, y: this.g.ry + c.dy };
    const aim = aimAt(c.dx, c.dy, this.angles);
    const detent = aim == null ? -1 : detentFor(c.stretch);
    const changed = aim !== this.aim || detent !== this.detent;
    this.aim = aim;
    this.detent = detent;
    this.render();
    if (changed) this.h.onAim?.({ target: aim == null ? null : this.targets[aim], index: aim, detent, sats: detent < 0 ? 0 : LADDER[detent] });
  }

  // keyboard: arrows aim (left, right) and stretch (down pulls back, up eases off); Enter lets go; Escape lets the band go slack
  key(e) {
    if (this.flying || !this.targets.length) return;
    const k = e.key;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape'].includes(k)) return;
    e.preventDefault();
    if (k === 'Escape') { this.keyDetent = -1; this.reset(); this.h.onAim?.({ target: null, index: null, detent: -1, sats: 0 }); return; }
    if (k === 'Enter' || k === ' ') { if (this.keyDetent >= 0) this.letGo(false); return; }
    if (k === 'ArrowLeft') this.keyTarget = Math.max(0, this.keyTarget - 1);
    if (k === 'ArrowRight') this.keyTarget = Math.min(this.targets.length - 1, this.keyTarget + 1);
    if (k === 'ArrowDown') this.keyDetent = Math.min(LADDER.length - 1, this.keyDetent + 1);
    if (k === 'ArrowUp') this.keyDetent = Math.max(-1, this.keyDetent - 1);
    if (this.keyDetent < 0) { this.reset(); this.h.onAim?.({ target: null, index: null, detent: -1, sats: 0 }); return; }
    const a = this.angles[this.keyTarget] + Math.PI;
    const r = ringRadius(this.keyDetent) + 0.5;
    this.move({ x: this.g.rx + r * Math.cos(a), y: this.g.ry + r * Math.sin(a) });
  }

  letGo(cancelled) {
    const aim = this.aim, detent = this.detent;
    if (cancelled || aim == null || detent < 0) {
      this.keyDetent = -1;
      this.snapBack();
      this.h.onAim?.({ target: null, index: null, detent: -1, sats: 0 });
      this.h.onSlack?.();
      return;
    }
    this.keyDetent = -1;
    const ok = this.h.onRelease?.({ target: this.targets[aim], index: aim, detent, sats: LADDER[detent] });
    if (ok === false) this.snapBack();
  }

  reset() {
    this.pull = { dx: 0, dy: 0, stretch: 0 };
    this.pouch = { x: this.g.rx, y: this.g.ry };
    this.aim = null;
    this.detent = -1;
    this.render();
  }

  snapBack() {
    const from = { ...this.pouch };
    this.aim = null;
    this.detent = -1;
    if (reduced()) { this.reset(); return; }
    const t0 = performance.now(), dur = 260;
    const step = (t) => {
      const u = Math.min(1, (t - t0) / dur);
      const k = 1 - ease(u) + Math.sin(u * Math.PI) * 0.12 * (1 - u);
      this.pouch = { x: this.g.rx + (from.x - this.g.rx) * k, y: this.g.ry + (from.y - this.g.ry) * k };
      this.pull = { dx: 0, dy: 0, stretch: 0 };
      this.render();
      if (u < 1) requestAnimationFrame(step); else this.reset();
    };
    requestAnimationFrame(step);
  }

  setTargets(list) {
    this.targets = list.slice(0, 5);
    this.angles = fenceAngles(this.targets.length);
    this.keyTarget = Math.min(this.keyTarget, Math.max(0, this.targets.length - 1));
    const layer = this.targetLayer;
    layer.innerHTML = '';
    this.defs.innerHTML = '';
    this.targetEls = this.targets.map((t, i) => {
      const p = fencePoint(this.angles[i]);
      const grp = el('g', { class: 'target', transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})` }, layer);
      el('circle', { r: 27, class: 'target-halo' }, grp);
      el('circle', { r: 22, class: 'target-face' }, grp);
      const ini = el('text', { y: 6, class: 'target-initial', 'text-anchor': 'middle' }, grp);
      ini.textContent = t.initial || '?';
      if (t.picture) {
        const id = `${this.clipBase}-${i}`;
        const cp = el('clipPath', { id }, this.defs);
        el('circle', { r: 21 }, cp);
        const img = el('image', { href: t.picture, x: -21, y: -21, width: 42, height: 42, 'clip-path': `url(#${id})`, preserveAspectRatio: 'xMidYMid slice' }, grp);
        img.addEventListener('error', () => img.remove());
      }
      const label = el('text', { y: 42, class: 'target-name', 'text-anchor': 'middle' }, grp);
      label.textContent = t.label.length > 10 ? t.label.slice(0, 9) + '…' : t.label;
      if (!t.canTakeSats) {
        const n = el('text', { y: 56, class: 'target-sub', 'text-anchor': 'middle' }, grp);
        n.textContent = 'notes only';
      }
      return grp;
    });
    if (this.targets.length) {
      const a0 = this.angles[0] - 0.22, a1 = this.angles[this.angles.length - 1] + 0.22;
      const p0 = fencePoint(a0), p1 = fencePoint(a1);
      this.fenceArc.setAttribute('d', `M${p0.x.toFixed(1)} ${p0.y.toFixed(1)} A${this.g.fence} ${this.g.fence} 0 0 1 ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`);
    } else {
      this.fenceArc.removeAttribute('d');
    }
    this.render();
  }

  setNoted(on) { this.noted = Boolean(on); this.render(); }

  setSuggested(detent) {
    this.suggestRing.setAttribute('r', detent > 0 ? ringRadius(detent) : 0);
    this.svg.classList.toggle('suggesting', detent > 0);
  }

  pointFor(index) { return fencePoint(this.angles[index]); }

  render() {
    const { x, y } = this.pouch;
    for (const b of [this.bandL, this.bandR]) { b.setAttribute('x2', x.toFixed(1)); b.setAttribute('y2', y.toFixed(1)); }
    const tension = Math.min(1, this.pull.stretch / this.g.max);
    this.svg.style.setProperty('--tension', tension.toFixed(3));
    // the pouch: a short strap across the stone, turned to face along the bands
    const ang = Math.atan2(this.g.ry - y, this.g.rx - x || 0.0001);
    const nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
    const bx = x - Math.cos(ang) * 9, by = y - Math.sin(ang) * 9;
    this.pouchEl.setAttribute('d', `M${(x + nx * 13).toFixed(1)} ${(y + ny * 13).toFixed(1)} Q${(bx).toFixed(1)} ${(by).toFixed(1)} ${(x - nx * 13).toFixed(1)} ${(y - ny * 13).toFixed(1)}`);
    if (!this.flying) {
      this.stone.setAttribute('cx', x.toFixed(1));
      this.stone.setAttribute('cy', y.toFixed(1));
      this.noteTag.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    }
    this.noteTag.style.display = this.noted ? '' : 'none';
    this.ringEls.forEach((r, i) => {
      r.classList.toggle('reached', this.detent > i);
      r.classList.toggle('at', this.detent === i);
    });
    const top = LADDER.length - 1;
    this.ringLabels.forEach((t, i) => {
      t.classList.toggle('current', this.detent === i);
      t.classList.toggle('crowded', i === top && this.detent >= top - 2 && this.detent !== top);
    });
    (this.targetEls || []).forEach((t, i) => t.classList.toggle('aimed', this.aim === i));
    if (this.aim != null && this.detent >= 0) {
      this.path.setAttribute('d', arcPath({ x: this.g.rx, y: this.g.ry }, this.pointFor(this.aim)));
      this.path.classList.add('on');
    } else {
      this.path.classList.remove('on');
    }
  }

  // fly the stone to a target. Returns { cancel } while it is in the air; onLand runs when it gets there.
  launch(index, { duration = 900, onLand, onBack } = {}) {
    const from = { x: this.g.rx, y: this.g.ry };
    const to = this.pointFor(index);
    this.flying = true;
    this.svg.classList.add('flying');
    this.pouch = { x: this.g.rx, y: this.g.ry };
    this.pull = { dx: 0, dy: 0, stretch: 0 };
    const keepAim = this.aim;
    this.detent = -1;
    this.render();
    (this.targetEls || []).forEach((t, i) => t.classList.toggle('aimed', keepAim === i));
    this.path.setAttribute('d', arcPath(from, to));
    this.path.classList.add('on', 'live');
    const dur = reduced() ? Math.min(duration, 400) : duration;
    let raf = 0, done = false, t0 = performance.now();
    const place = (p) => {
      this.stone.setAttribute('cx', p.x.toFixed(1));
      this.stone.setAttribute('cy', p.y.toFixed(1));
      this.noteTag.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    };
    const finish = () => {
      this.flying = false;
      this.svg.classList.remove('flying');
      this.path.classList.remove('on', 'live');
      this.aim = null;
      this.reset();
    };
    const step = (t) => {
      if (done) return;
      const u = Math.min(1, (t - t0) / dur);
      place(arcPoint(from, to, u));
      if (u < 1) { raf = requestAnimationFrame(step); return; }
      done = true;
      this.splash(index);
      finish();
      onLand?.();
    };
    raf = requestAnimationFrame(step);
    return {
      cancel: () => {
        if (done) return false;
        done = true;
        cancelAnimationFrame(raf);
        const cur = { x: Number(this.stone.getAttribute('cx')), y: Number(this.stone.getAttribute('cy')) };
        const b0 = performance.now();
        const back = (t) => {
          const u = Math.min(1, (t - b0) / 300);
          const k = ease(u);
          place({ x: cur.x + (from.x - cur.x) * k, y: cur.y + (from.y - cur.y) * k });
          if (u < 1) requestAnimationFrame(back); else { finish(); onBack?.(); }
        };
        requestAnimationFrame(back);
        return true;
      },
    };
  }

  // a small ring where the stone lands
  splash(index) {
    if (index == null || !this.angles.length) return;
    const p = this.pointFor(index);
    const c = el('circle', { cx: p.x, cy: p.y, r: 24, class: 'splash' }, this.fx);
    setTimeout(() => c.remove(), 700);
  }

  // a figure that rises above someone: "+2,100" when they catch sats, or a word
  float(index, text) {
    if (index == null || !this.angles.length) return;
    const p = this.pointFor(index);
    const t = el('text', { x: p.x, y: p.y - 34, class: 'float', 'text-anchor': 'middle' }, this.fx);
    t.textContent = text;
    setTimeout(() => t.remove(), 1500);
  }
}
