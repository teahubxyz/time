/* Roll Credits: type names, pick a style, watch the roll, download a 15-second WebM or GIF. All in the page. */
(function () {
  'use strict';
  var W0 = 640, H0 = 360, INSET = 28, DUR = 15;

  var SAMPLE_TITLE = 'Roll Credits';
  var SAMPLE_NAMES = [
    '# For team leads and organizers',
    'Thank-yous, for a launch, a trip, a bake-off or a last day',
    '# You do',
    'Type, a title and the names',
    'Pick, a style and a speed',
    '# It does',
    'Your browser, draws the credits live',
    'WebM or GIF, 15 seconds, yours to keep',
    '# It costs',
    'Nothing, and nothing is uploaded'
  ].join('\n');

  /* ---------- parsing: "Name, role" per line; "# text" is a heading ---------- */
  function parse(text) {
    var out = [];
    String(text).split('\n').forEach(function (raw) {
      var l = raw.trim(), i;
      if (!l) return;
      if (l[0] === '#') { l = l.replace(/^#+\s*/, ''); if (l) out.push({ k: 'head', t: l }); return; }
      i = l.indexOf(',');
      out.push(i < 0 ? { k: 'e', name: l, role: '' } : { k: 'e', name: l.slice(0, i).trim(), role: l.slice(i + 1).trim() });
    });
    return out;
  }
  function hh(it) { return it.k === 'title' ? 70 : it.k === 'head' ? 46 : it.role ? 54 : 38; }
  function total(items) { return items.reduce(function (a, it) { return a + hh(it); }, 0); }
  function rollLength(items, speed) { return (H0 - 2 * INSET + total(items)) / speed; }

  /* ---------- styles ---------- */
  var MONO = 'ui-monospace, Menlo, Consolas, "Courier New", monospace';
  var SERIF = 'Georgia, "Times New Roman", serif';
  var SANS = '"Trebuchet MS", Verdana, "Segoe UI", sans-serif';

  function perim(step, f) { // walks a rectangle 12px inside the canvas edge
    var a = 12, b = W0 - 12, c = H0 - 12, i = 0, x, y;
    for (x = a; x < b; x += step) f(x, a, i++);
    for (y = a; y < c; y += step) f(b, y, i++);
    for (x = b; x > a; x -= step) f(x, c, i++);
    for (y = c; y > a; y -= step) f(a, y, i++);
  }
  function vgrad(c, a, b) { var g = c.createLinearGradient(0, 0, 0, H0); g.addColorStop(0, a); g.addColorStop(1, b); c.fillStyle = g; c.fillRect(0, 0, W0, H0); }

  var STYLES = {
    arcade: {
      fam: MONO, wt: 'bold ', rs: '', up: true, glow: true,
      c: { title: '#ffe14a', name: '#39f5ff', role: '#ff4fd8' },
      bg: function (c) { c.fillStyle = '#07021a'; c.fillRect(0, 0, W0, H0); c.fillStyle = 'rgba(0,0,0,.28)'; for (var y = 0; y < H0; y += 4) c.fillRect(0, y, W0, 2); },
      frame: function (c, t) {
        var k = Math.floor(t * 6);
        perim(16, function (x, y, i) { c.fillStyle = (i + k) % 3 === 0 ? '#ff4fd8' : '#39f5ff'; c.fillRect(x - 4, y - 4, 8, 8); });
      }
    },
    epic: {
      fam: SERIF, wt: '', rs: 'italic ', up: false, glow: false,
      c: { title: '#f2c75c', name: '#f5e6c4', role: '#c9a35a' },
      bg: function (c) { vgrad(c, '#2a1a0a', '#120a04'); },
      frame: function (c) {
        c.strokeStyle = '#d4a93f'; c.lineWidth = 2; c.strokeRect(10, 10, W0 - 20, H0 - 20);
        c.lineWidth = 1; c.strokeRect(17, 17, W0 - 34, H0 - 34);
        c.fillStyle = '#f2c75c';
        [[10, 10], [W0 - 10, 10], [10, H0 - 10], [W0 - 10, H0 - 10]].forEach(function (p) {
          c.beginPath(); c.moveTo(p[0], p[1] - 8); c.lineTo(p[0] + 8, p[1]); c.lineTo(p[0], p[1] + 8); c.lineTo(p[0] - 8, p[1]); c.closePath(); c.fill();
        });
      }
    },
    sitcom: {
      fam: SANS, wt: 'bold ', rs: '', up: false, glow: false,
      c: { title: '#ffd23f', name: '#ffffff', role: '#ffd9a8' },
      bg: function (c) { vgrad(c, '#12818f', '#0b4f5c'); },
      frame: function (c, t) {
        var k = Math.floor(t * 3);
        c.strokeStyle = '#ff6b4a'; c.lineWidth = 5; c.strokeRect(12, 12, W0 - 24, H0 - 24);
        perim(24, function (x, y, i) { c.fillStyle = (i + k) % 2 ? '#ffd23f' : '#9a6b12'; c.beginPath(); c.arc(x, y, 5, 0, 6.2832); c.fill(); });
      }
    }
  };

  /* ---------- drawing: draw(ctx, pixelWidth, pixelHeight, seconds, model) is the single path for preview, WebM and GIF ---------- */
  function txt(c, s, x, y, px, pre, fam, col, maxW, S) {
    var p = px;
    if (S.up && pre !== S.rs) s = s.toUpperCase();
    for (; p > 8; p--) { c.font = pre + p + 'px ' + fam; if (c.measureText(s).width <= maxW) break; }
    c.font = pre + p + 'px ' + fam;
    c.fillStyle = col; c.shadowColor = col; c.shadowBlur = S.glow ? 6 : 0;
    c.fillText(s, x, y);
    c.shadowBlur = 0;
  }
  function draw(c, W, H, t, m) {
    var S = STYLES[m.style] || STYLES.arcade, cx = W0 / 2, mw = W0 - 2 * INSET - 30;
    var len = rollLength(m.items, m.speed), y = H0 - INSET - m.speed * (t % len);
    c.setTransform(W / W0, 0, 0, W / W0, 0, 0);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    S.bg(c, t);
    c.save(); c.beginPath(); c.rect(INSET, INSET, W0 - 2 * INSET, H0 - 2 * INSET); c.clip();
    m.items.forEach(function (it) {
      var h = hh(it);
      if (y + h > INSET && y < H0 - INSET) {
        if (it.k === 'title') txt(c, it.t, cx, y + 35, 34, S.wt, S.fam, S.c.title, mw, S);
        else if (it.k === 'head') txt(c, it.t, cx, y + 28, 17, S.wt, S.fam, S.c.role, mw, S);
        else {
          txt(c, it.name, cx, y + 20, 22, S.wt, S.fam, S.c.name, mw, S);
          if (it.role) txt(c, it.role, cx, y + 42, 13, S.rs, S.fam, S.c.role, mw, S);
        }
      }
      y += h;
    });
    c.restore();
    S.frame(c, t);
  }

  /* ---------- GIF89a encoder: fixed 3-3-2 colour palette, looping ---------- */
  // shortcut: fixed 256-colour palette bands gradients, upgrade to per-frame quantisation if it looks bad
  function lzw(px) {
    var out = [], cur = 0, bits = 0, size = 9, next = 258, dict = new Map(), p = px[0], i, k, c;
    function put(code) { cur |= code << bits; bits += size; while (bits >= 8) { out.push(cur & 255); cur >>= 8; bits -= 8; } }
    put(256);
    for (i = 1; i < px.length; i++) {
      k = p << 8 | px[i]; c = dict.get(k);
      if (c !== undefined) { p = c; continue; }
      put(p); dict.set(k, next++);
      if (next > (1 << size) && size < 12) size++;
      if (next === 4096) { put(256); dict = new Map(); next = 258; size = 9; }
      p = px[i];
    }
    put(p);
    if (next >= (1 << size) && size < 12) size++;
    put(257);
    if (bits) out.push(cur & 255);
    return out;
  }
  function gifEncoder(w, h, delayCs) {
    var parts = [], i, pal = new Uint8Array(768);
    for (i = 0; i < 256; i++) { pal[i * 3] = (i >> 5) * 255 / 7; pal[i * 3 + 1] = ((i >> 2) & 7) * 255 / 7; pal[i * 3 + 2] = (i & 3) * 85; }
    parts.push(new Uint8Array([71, 73, 70, 56, 57, 97, w & 255, w >> 8, h & 255, h >> 8, 0xF7, 0, 0]), pal,
      new Uint8Array([0x21, 0xFF, 11, 78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48, 3, 1, 0, 0, 0]));
    return {
      add: function (rgba) {
        var idx = new Uint8Array(w * h), j, d, b = [];
        for (j = 0; j < idx.length; j++) idx[j] = (rgba[j * 4] & 0xE0) | ((rgba[j * 4 + 1] & 0xE0) >> 3) | (rgba[j * 4 + 2] >> 6);
        d = lzw(idx);
        b.push(0x21, 0xF9, 4, 0, delayCs & 255, delayCs >> 8, 0, 0, 0x2C, 0, 0, 0, 0, w & 255, w >> 8, h & 255, h >> 8, 0, 8);
        for (j = 0; j < d.length; j += 255) { var n = Math.min(255, d.length - j); b.push(n); for (var q = 0; q < n; q++) b.push(d[j + q]); }
        b.push(0);
        parts.push(new Uint8Array(b));
      },
      done: function () { parts.push(new Uint8Array([0x3B])); return parts; }
    };
  }

  if (typeof document === 'undefined') { module.exports = { parse: parse, draw: draw, lzw: lzw, gifEncoder: gifEncoder, STYLES: STYLES, rollLength: rollLength, SAMPLE_NAMES: SAMPLE_NAMES }; return; }

  /* ---------- the page ---------- */
  var root = document.getElementById('try');
  root.innerHTML =
    '<div class="rc">' +
    '<div class="stage"><canvas id="rc-cv" width="' + W0 + '" height="' + H0 + '" aria-label="Live credits preview"></canvas>' +
    '<p id="rc-len" class="len"></p></div>' +
    '<form class="panel" onsubmit="return false">' +
    '<fieldset class="styles"><legend>Style</legend>' +
    '<label><input type="radio" name="st" value="arcade" checked><span>1980s arcade</span></label>' +
    '<label><input type="radio" name="st" value="epic"><span>Adventure epic</span></label>' +
    '<label><input type="radio" name="st" value="sitcom"><span>Sitcom</span></label></fieldset>' +
    '<label class="f">Speed <input id="rc-speed" type="range" min="20" max="120" step="5" value="60"></label>' +
    '<label class="f">Title <input id="rc-title" type="text" maxlength="60" autocomplete="off"></label>' +
    '<label class="f">Names and roles <small>one per line: Name, role. Start a line with # for a heading.</small>' +
    '<textarea id="rc-names" rows="6" spellcheck="false"></textarea></label>' +
    '<div class="row"><button id="rc-webm" type="button">Download WebM</button><button id="rc-gif" type="button">Download GIF</button></div>' +
    '<p id="rc-status" class="status" role="status" aria-live="polite">Exports record 15 seconds at the chosen speed.</p>' +
    '</form></div>';

  var $ = function (id) { return document.getElementById(id); };
  var cv = $('rc-cv'), ctx = cv.getContext('2d'), start = performance.now(), busy = false;
  $('rc-title').value = SAMPLE_TITLE;
  $('rc-names').value = SAMPLE_NAMES;

  function model() {
    var t = $('rc-title').value.trim(), items = parse($('rc-names').value);
    if (t) items.unshift({ k: 'title', t: t });
    return { items: items, style: document.querySelector('input[name=st]:checked').value, speed: +$('rc-speed').value };
  }
  function status(s) { $('rc-status').textContent = s; }
  function update() {
    var m = model(), len = rollLength(m.items, m.speed);
    $('rc-len').textContent = 'Roll length ' + len.toFixed(1) + ' s' + (len > DUR ? ': an export stops at 15 s, so raise the speed to fit it all' : ': fits in the 15-second export');
    start = performance.now();
  }
  function frame(now) { draw(ctx, W0, H0, (now - start) / 1000, model()); requestAnimationFrame(frame); }
  document.querySelector('.panel').addEventListener('input', update);
  update();
  requestAnimationFrame(frame);

  function lock(on) { busy = on; $('rc-webm').disabled = $('rc-gif').disabled = on; }
  function save(blob, ext) {
    var a = document.createElement('a'), kb = Math.round(blob.size / 1024);
    a.href = URL.createObjectURL(blob); a.download = 'roll-credits.' + ext;
    document.body.appendChild(a); a.click(); a.remove();
    status('Done: roll-credits.' + ext + ' (' + kb + ' KB) was downloaded. Nothing left this page.');
    lock(false);
  }

  $('rc-webm').addEventListener('click', function () {
    var mime, rec, ch = [], iv, t0, c, x, m;
    if (busy) return;
    try {
      mime = window.MediaRecorder && ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].filter(function (s) { return MediaRecorder.isTypeSupported(s); })[0];
      if (!mime) { status('This browser cannot record WebM. Try the GIF button.'); return; }
      m = model(); c = document.createElement('canvas'); c.width = W0; c.height = H0; x = c.getContext('2d');
      rec = new MediaRecorder(c.captureStream(30), { mimeType: mime, videoBitsPerSecond: 4000000 });
      rec.ondataavailable = function (e) { if (e.data.size) ch.push(e.data); };
      rec.onstop = function () { clearInterval(iv); save(new Blob(ch, { type: 'video/webm' }), 'webm'); };
      lock(true); draw(x, W0, H0, 0, m); rec.start(); t0 = performance.now();
      iv = setInterval(function () {
        var t = (performance.now() - t0) / 1000;
        if (t >= DUR) { clearInterval(iv); rec.stop(); return; }
        draw(x, W0, H0, t, m); status('Recording WebM in real time: ' + Math.ceil(DUR - t) + ' s left. Keep this tab visible.');
      }, 33);
    } catch (e) { lock(false); status('WebM recording failed in this browser: ' + e.message + '. Try the GIF button.'); }
  });

  $('rc-gif').addEventListener('click', async function () {
    var w = 320, h = 180, fps = 10, n = DUR * fps, c, x, m, enc, i;
    if (busy) return;
    try {
      lock(true); m = model(); c = document.createElement('canvas'); c.width = w; c.height = h;
      x = c.getContext('2d', { willReadFrequently: true }); enc = gifEncoder(w, h, 100 / fps);
      for (i = 0; i < n; i++) {
        draw(x, w, h, i / fps, m); enc.add(x.getImageData(0, 0, w, h).data);
        if (i % 5 === 4) { status('Encoding GIF: ' + Math.round((i + 1) / n * 100) + '%'); await new Promise(function (r) { setTimeout(r); }); }
      }
      save(new Blob(enc.done(), { type: 'image/gif' }), 'gif');
    } catch (e) { lock(false); status('GIF export failed: ' + e.message); }
  });
})();
