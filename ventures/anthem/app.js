// Anthem — name to an 8-bar theme, synthesized in the browser.
// The preloaded sample and a typed name share one path: seed a melody, paint
// the title card, and (when the user presses play) schedule the same notes.

(function () {
  "use strict";

  var STYLES = {
    chiptune: { wave: "square", gain: 0.22, filter: 1800, q: 0.7, detune: 0, attack: 0.005, release: 0.04, color: "#7CFF6B" },
    "lo-fi": { wave: "triangle", gain: 0.28, filter: 900, q: 0.6, detune: 7, attack: 0.04, release: 0.18, color: "#F2A7C3" },
    fanfare: { wave: "sawtooth", gain: 0.16, filter: 2400, q: 0.8, detune: 4, attack: 0.01, release: 0.12, color: "#F6C945" }
  };

  var SCALE = [0, 2, 4, 5, 7, 9, 11];
  var SAMPLE_NAME = "Maya Chen";
  var BARS = 8;
  var BEATS = 4;
  var STEPS = BARS * BEATS;

  var audioContext = null;
  var isPlaying = false;
  var scheduled = [];
  var vizTimer = 0;

  var state = {
    name: SAMPLE_NAME,
    style: "chiptune"
  };

  function $(id) { return document.getElementById(id); }

  function hashString(str) {
    var h = 2166136261;
    var s = String(str || "");
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function clampName(value) {
    var name = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    if (!name) return "";
    return name.slice(0, 48);
  }

  // Letters seed the melody. Same name + style always yields the same notes.
  function compose(name, style) {
    var clean = clampName(name) || SAMPLE_NAME;
    var key = STYLES[style] ? style : "chiptune";
    var seed = hashString(clean.toLowerCase() + "|" + key);
    var rand = mulberry32(seed);
    var root = 60 + (seed % 7);
    var motif = [];
    var i;
    for (i = 0; i < 4; i++) {
      var degree = SCALE[Math.floor(rand() * SCALE.length)];
      var octave = rand() < 0.22 ? 12 : rand() < 0.12 ? -12 : 0;
      motif.push(root + degree + octave);
    }
    // A name with more letters leans the motif toward those letter degrees,
    // so "Maya" and "Maya Chen" are related but not identical.
    for (i = 0; i < clean.length && i < 4; i++) {
      var code = clean.toLowerCase().charCodeAt(i);
      if (code >= 97 && code <= 122) {
        motif[i % 4] = root + SCALE[(code - 97) % SCALE.length] + (i > 6 ? 12 : 0);
      }
    }
    var notes = [];
    for (i = 0; i < STEPS; i++) {
      var bar = Math.floor(i / BEATS);
      var beat = i % BEATS;
      var midi = motif[beat];
      if (bar === 1 || bar === 5) midi += bar % 2 === 1 ? 2 : 0;
      if (bar >= 4) midi += rand() < 0.35 ? 12 : 0;
      if (bar === 6 && beat === 3) midi += 5;
      if (bar === 7 && beat === 3) midi = root + 12;
      if (key === "fanfare" && beat === 0) midi += 7;
      if (key === "lo-fi" && beat === 2) midi -= rand() < 0.5 ? 0 : 2;
      var rest = key === "lo-fi" ? rand() < 0.18 : rand() < 0.08;
      notes.push({
        midi: midi,
        freq: midiToFreq(midi),
        rest: rest && beat !== 0,
        beat: beat,
        bar: bar
      });
    }
    return { name: clean, style: key, seed: seed, notes: notes };
  }

  function activeStyle() {
    return STYLES[state.style] ? state.style : "chiptune";
  }

  function song() {
    return compose(state.name, activeStyle());
  }

  function ensureAudio() {
    if (!audioContext) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioContext = new Ctx();
    }
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }
    return audioContext;
  }

  function stopPlayback() {
    scheduled.forEach(function (node) {
      try { node.stop(); } catch (e) { /* already stopped */ }
    });
    scheduled = [];
    if (vizTimer) {
      clearInterval(vizTimer);
      vizTimer = 0;
    }
    document.querySelectorAll("#visualization .bar").forEach(function (bar) {
      bar.classList.remove("on");
    });
  }

  function setPlaying(on) {
    isPlaying = on;
    var btn = $("play-button");
    if (btn) btn.textContent = on ? "Stop" : "Play";
    var card = document.querySelector(".title-card");
    if (card) card.classList.toggle("is-playing", on);
  }

  function voice(ctx, dest, freq, when, dur, styleKey) {
    var spec = STYLES[styleKey] || STYLES.chiptune;
    var osc = ctx.createOscillator();
    var osc2 = ctx.createOscillator();
    var gain = ctx.createGain();
    var filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(spec.filter, when);
    filter.Q.setValueAtTime(spec.q, when);
    osc.type = spec.wave;
    osc2.type = spec.wave;
    osc.frequency.setValueAtTime(freq, when);
    osc2.frequency.setValueAtTime(freq, when);
    osc2.detune.setValueAtTime(spec.detune, when);
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    var peak = spec.gain;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + spec.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(spec.attack + 0.02, dur));
    osc.start(when);
    osc2.start(when);
    osc.stop(when + dur + 0.02);
    osc2.stop(when + dur + 0.02);
    return osc;
  }

  function scheduleInto(ctx, dest, piece, startTime, secondsPerBeat) {
    var nodes = [];
    piece.notes.forEach(function (note, i) {
      if (note.rest) return;
      var when = startTime + i * secondsPerBeat;
      var dur = secondsPerBeat * (piece.style === "lo-fi" ? 0.92 : 0.72);
      if (piece.style === "fanfare" && note.beat === 0) dur = secondsPerBeat * 0.95;
      nodes.push(voice(ctx, dest, note.freq, when, dur, piece.style));
    });
    return nodes;
  }

  function pulseBars(piece) {
    var bars = document.querySelectorAll("#visualization .bar");
    var step = 0;
    var tempo = piece.style === "fanfare" ? 132 : piece.style === "lo-fi" ? 86 : 120;
    var ms = (60 / tempo) * 1000;
    if (vizTimer) clearInterval(vizTimer);
    vizTimer = setInterval(function () {
      bars.forEach(function (bar, i) {
        bar.classList.toggle("on", i === step % bars.length);
      });
      step += 1;
      if (step >= piece.notes.length) {
        clearInterval(vizTimer);
        vizTimer = 0;
        bars.forEach(function (bar) { bar.classList.remove("on"); });
        setPlaying(false);
      }
    }, ms);
  }

  function playMelody() {
    var ctx = ensureAudio();
    if (!ctx) return;
    stopPlayback();
    var piece = song();
    var tempo = piece.style === "fanfare" ? 132 : piece.style === "lo-fi" ? 86 : 120;
    var secondsPerBeat = 60 / tempo;
    scheduled = scheduleInto(ctx, ctx.destination, piece, ctx.currentTime + 0.05, secondsPerBeat);
    setPlaying(true);
    pulseBars(piece);
    var last = scheduled[scheduled.length - 1];
    if (last) {
      last.onended = function () {
        if (scheduled.indexOf(last) !== -1) setPlaying(false);
      };
    }
  }

  function renderOutput(piece) {
    var title = $("title-text");
    if (title) title.textContent = piece.name;
    var input = $("name-input");
    if (input && input.value !== piece.name) input.value = piece.name;
    document.querySelectorAll(".style-chip").forEach(function (chip) {
      chip.classList.toggle("active", chip.dataset.style === piece.style);
      chip.setAttribute("aria-pressed", chip.dataset.style === piece.style ? "true" : "false");
    });
    var viz = $("visualization");
    if (!viz) return;
    viz.innerHTML = "";
    viz.setAttribute("aria-label", "Melody for " + piece.name);
    var min = 999;
    var max = 0;
    piece.notes.forEach(function (n) {
      if (n.midi < min) min = n.midi;
      if (n.midi > max) max = n.midi;
    });
    var span = Math.max(1, max - min);
    var color = (STYLES[piece.style] || STYLES.chiptune).color;
    piece.notes.forEach(function (note, i) {
      var bar = document.createElement("div");
      bar.className = "bar" + (note.rest ? " rest" : "");
      var height = note.rest ? 8 : 18 + ((note.midi - min) / span) * 78;
      bar.style.height = height + "%";
      bar.style.backgroundColor = note.rest ? "rgba(255,255,255,0.18)" : color;
      bar.title = note.rest ? "rest" : "bar " + (note.bar + 1) + " beat " + (note.beat + 1);
      bar.dataset.step = String(i);
      viz.appendChild(bar);
    });
    var caption = $("melody-caption");
    if (caption) {
      var sounding = piece.notes.filter(function (n) { return !n.rest; }).length;
      caption.textContent = piece.name + " · " + piece.style + " · " + BARS + " bars · " + sounding + " notes";
    }
  }

  function applyState(next, pushUrl) {
    var name = clampName(next && next.name) || SAMPLE_NAME;
    var style = next && STYLES[next.style] ? next.style : "chiptune";
    state.name = name;
    state.style = style;
    renderOutput(song());
    if (pushUrl) writeUrl();
  }

  function encodeState(obj) {
    var json = JSON.stringify({ name: obj.name, style: obj.style });
    return btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  function decodeState(token) {
    try {
      var b64 = String(token).replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      var json = decodeURIComponent(escape(atob(b64)));
      var obj = JSON.parse(json);
      if (!obj || typeof obj !== "object") return null;
      if (!clampName(obj.name)) return null;
      return { name: clampName(obj.name), style: STYLES[obj.style] ? obj.style : "chiptune" };
    } catch (e) {
      return null;
    }
  }

  function shareUrl() {
    var url = new URL(window.location.href);
    url.searchParams.set("s", encodeState(state));
    url.hash = "";
    return url.toString();
  }

  function writeUrl() {
    try {
      var url = new URL(window.location.href);
      url.searchParams.set("s", encodeState(state));
      window.history.replaceState({}, "", url);
    } catch (e) { /* file:// or a locked history */ }
  }

  function readUrl() {
    var params = new URLSearchParams(window.location.search);
    var token = params.get("s");
    if (!token) return null;
    return decodeState(token);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var input = document.createElement("textarea");
      input.value = text;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.left = "-9999px";
      document.body.appendChild(input);
      input.select();
      try {
        document.execCommand("copy") ? resolve() : reject(new Error("copy failed"));
      } catch (e) {
        reject(e);
      }
      document.body.removeChild(input);
    });
  }

  function flash(button, label) {
    var original = button.textContent;
    button.textContent = label;
    setTimeout(function () { button.textContent = original; }, 1600);
  }

  function audioBufferToWav(buffer) {
    var channels = buffer.numberOfChannels;
    var rate = buffer.sampleRate;
    var length = buffer.length;
    var bytesPerSample = 2;
    var blockAlign = channels * bytesPerSample;
    var dataSize = length * blockAlign;
    var view = new DataView(new ArrayBuffer(44 + dataSize));
    function str(offset, s) {
      for (var i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    }
    str(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    str(8, "WAVE");
    str(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    str(36, "data");
    view.setUint32(40, dataSize, true);
    var channelData = [];
    for (var c = 0; c < channels; c++) channelData.push(buffer.getChannelData(c));
    var offset = 44;
    for (var i = 0; i < length; i++) {
      for (c = 0; c < channels; c++) {
        var sample = Math.max(-1, Math.min(1, channelData[c][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }
    return new Blob([view], { type: "audio/wav" });
  }

  function downloadWav() {
    var piece = song();
    var tempo = piece.style === "fanfare" ? 132 : piece.style === "lo-fi" ? 86 : 120;
    var secondsPerBeat = 60 / tempo;
    var duration = piece.notes.length * secondsPerBeat + 0.4;
    var rate = 44100;
    var Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) return;
    var offline = new Offline(1, Math.ceil(rate * duration), rate);
    scheduleInto(offline, offline.destination, piece, 0.05, secondsPerBeat);
    offline.startRendering().then(function (buffer) {
      var blob = audioBufferToWav(buffer);
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      var slug = piece.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "anthem";
      a.href = url;
      a.download = slug + "-" + piece.style + ".wav";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }).catch(function (err) {
      console.error(err);
    });
  }

  function bind() {
    var input = $("name-input");
    var play = $("play-button");
    var share = $("share-button");
    var download = $("download-button");

    input.addEventListener("input", function () {
      state.name = clampName(input.value) || SAMPLE_NAME;
      renderOutput(song());
      writeUrl();
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        play.click();
      }
    });

    play.addEventListener("click", function () {
      if (isPlaying) {
        stopPlayback();
        setPlaying(false);
      } else {
        playMelody();
      }
    });

    document.querySelectorAll(".style-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        state.style = STYLES[chip.dataset.style] ? chip.dataset.style : "chiptune";
        renderOutput(song());
        writeUrl();
        if (isPlaying) playMelody();
      });
    });

    share.addEventListener("click", function () {
      var link = shareUrl();
      writeUrl();
      copyText(link).then(function () {
        flash(share, "Copied!");
      }).catch(function () {
        flash(share, "Copy the link");
        window.prompt("Share link", link);
      });
      if (window.Time && typeof window.Time.save === "function") {
        try { window.Time.save({ name: state.name, style: state.style }); } catch (e) { /* extra only */ }
      }
    });

    download.addEventListener("click", downloadWav);
  }

  function boot() {
    bind();
    var fromUrl = readUrl();
    if (fromUrl) {
      applyState(fromUrl, false);
      return;
    }
    // Time.load() is a promise of a shared object, or null. Never treat the
    // promise itself as the song. First visit has no share token, so the
    // sample name goes through compose() and paints the real melody.
    var pending = window.Time && typeof window.Time.load === "function" ? window.Time.load() : null;
    Promise.resolve(pending).then(function (loaded) {
      if (loaded && typeof loaded === "object" && clampName(loaded.name)) {
        applyState({ name: loaded.name, style: loaded.style }, true);
        return;
      }
      applyState({ name: SAMPLE_NAME, style: "chiptune" }, false);
    }).catch(function () {
      applyState({ name: SAMPLE_NAME, style: "chiptune" }, false);
    });
  }

  document.addEventListener("DOMContentLoaded", boot);

  window.Anthem = {
    compose: compose,
    sample: function () { return compose(SAMPLE_NAME, "chiptune"); }
  };
})();
