// Music mode: typing plays a little jazz. The letters of each word are its
// melody, every new word brings the next chord of an eight-bar loop, and a
// mistake is a soft muted note rather than a wrong one. Everything above the
// engine is pure and deterministic, so a replay plays back exactly the music
// its run made, and the same word in the same bar always sings the same tune.

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const wrap = (value, size) => ((value % size) + size) % size;
const mtof = midi => 440 * Math.pow(2, (midi - 69) / 12);

/** Eight bars in F: I–VI–ii–V, then iii–vi–ii–V back home, with the top voice
 *  of the chords walking down G–F#–F–E. Every voicing and bass note sits inside
 *  its bar's scale, so whatever the melody plays agrees with what's ringing. */
export const PROGRESSION = Object.freeze([
  {name: 'Fmaj9', bass: 41, voicing: [57, 60, 64, 67], scale: [5, 7, 9, 0, 2, 4]},
  {name: 'D9', bass: 50, voicing: [57, 60, 64, 66], scale: [2, 4, 6, 9, 11, 0]},
  {name: 'Gm9', bass: 43, voicing: [57, 58, 62, 65], scale: [7, 9, 10, 0, 2, 5]},
  {name: 'C13', bass: 48, voicing: [57, 58, 62, 64], scale: [0, 2, 4, 7, 9, 10]},
  {name: 'Am7', bass: 45, voicing: [55, 57, 60, 64], scale: [9, 0, 2, 4, 7]},
  {name: 'Dm9', bass: 50, voicing: [53, 57, 60, 64], scale: [2, 4, 5, 7, 9, 0]},
  {name: 'Gm9', bass: 43, voicing: [53, 57, 58, 62], scale: [7, 9, 10, 0, 2, 5]},
  {name: 'C9sus', bass: 48, voicing: [53, 55, 58, 62], scale: [0, 2, 5, 7, 9, 10]}
]);

/** Melody notes live between middle C and the C two octaves up. */
export const RANGE = Object.freeze([60, 84]);

const LADDERS = PROGRESSION.map(chord => {
  const notes = [];
  for (let midi = RANGE[0]; midi <= RANGE[1]; midi++) if (chord.scale.includes(midi % 12)) notes.push(midi);
  return notes;
});

export const chordFor = bar => PROGRESSION[wrap(Math.trunc(Number(bar) || 0), PROGRESSION.length)];

// Where each character sits on a QWERTY keyboard. Rows are staggered the way
// real keys are, so moving right always means moving up the scale.
const ROWS = ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'];
const STAGGER = [0, 0.5, 0.75, 1.25];
const KEYS = new Map();
ROWS.forEach((row, r) => Array.from(row).forEach((char, c) => KEYS.set(char, {x: c + STAGGER[r], row: r})));
const SHIFTED = {'!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', '_': '-', '+': '=',
  '{': '[', '}': ']', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/', '’': "'", '‘': "'", '“': "'", '”': "'", '—': '-', '–': '-'};

export function keyPosition(char) {
  let key = String(char ?? '').toLowerCase();
  key = SHIFTED[key] || key;
  // An accented letter sits on its plain key: drop the combining marks NFD splits off.
  if (!KEYS.has(key)) key = Array.from(key.normalize('NFD')).filter(mark => mark.codePointAt(0) < 0x300 || mark.codePointAt(0) > 0x36f).join('');
  const known = KEYS.get(key);
  if (known) return known;
  // Anything else still gets a stable home: its code point picks a key on the home row.
  return {x: wrap(key.codePointAt(0) || 0, 10) + 0.75, row: 2};
}

const tunes = new Map();

/** The tune a word plays in a bar: one note per letter. The first letter sets
 *  the register, above the chords (keys on the left start lower, keys on the
 *  right higher). Then each key steps up the bar's scale if it sits right of
 *  the previous key and down if it sits left: one to three steps, the further
 *  the reach. A doubled letter repeats its note; the range's edges bounce. */
export function melody(word, bar) {
  const index = wrap(Math.trunc(Number(bar) || 0), PROGRESSION.length);
  const text = String(word ?? '');
  const cacheKey = index + ':' + text;
  if (tunes.has(cacheKey)) return tunes.get(cacheKey);
  const ladder = LADDERS[index];
  const top = ladder.length - 1;
  const notes = [];
  let step = 0;
  let previous = 0;
  Array.from(text).forEach((char, i) => {
    const {x} = keyPosition(char);
    if (i === 0) step = Math.round(4 + (x / 10) * (ladder.length - 8));
    else if (x !== previous) {
      step += Math.sign(x - previous) * clamp(Math.round(Math.abs(x - previous) / 1.6), 1, 3);
      if (step < 0) step = Math.min(top, -step);
      if (step > top) step = Math.max(0, 2 * top - step);
    }
    previous = x;
    notes.push(ladder[step]);
  });
  if (tunes.size > 4000) tunes.clear();
  tunes.set(cacheKey, notes);
  return notes;
}

/** Quick runs play lighter, a note after a pause lands with more weight, and
 *  the first letter of a word leans in a little. */
export function velocityFor(gapMs, firstOfWord = false) {
  const gap = Number.isFinite(gapMs) ? gapMs : 600;
  return clamp(0.5 + 0.32 * clamp((gap - 70) / 450, 0, 1) + (firstOfWord ? 0.08 : 0), 0.35, 0.95);
}

/**
 * Turns a run's events (the same ones replays store) into musical actions:
 *   {type:'chord', bar, missed}   a new word's chord, or the first word's
 *   {type:'note', midi, velocity} a letter typed right
 *   {type:'dead', midi, velocity} a letter typed wrong: a muted thump at that letter's note
 *   {type:'tick'}                 a backspace
 * Live play and replays both feed it, so they make identical music.
 */
export function createConductor(words = []) {
  let list = [];
  let index = -1;
  let flags = [];
  let lastT = null;
  let started = false;
  const wordAt = i => list.length ? list[wrap(i, list.length)] : '';
  const conductor = {
    reset(newWords = []) {
      list = Array.isArray(newWords) ? newWords : [];
      index = -1; flags = []; lastT = null; started = false;
      return conductor;
    },
    event(event) {
      const actions = [];
      if (!event || typeof event.type !== 'string' || !Number.isFinite(event.index)) return actions;
      if (event.index !== index) { index = event.index; flags = []; }
      if (!started) { started = true; actions.push({type: 'chord', bar: index, missed: false}); }
      const gap = lastT === null || !Number.isFinite(event.t) ? null : event.t - lastT;
      if (Number.isFinite(event.t)) lastT = event.t;
      const word = wordAt(index);
      if (event.type === 'hit' || event.type === 'miss') {
        const tune = melody(word, index);
        if (tune.length) {
          const midi = tune[Math.min(flags.length, tune.length - 1)];
          if (event.type === 'hit') actions.push({type: 'note', midi, velocity: velocityFor(gap, flags.length === 0)});
          else actions.push({type: 'dead', midi, velocity: velocityFor(gap)});
        }
        flags.push(event.type === 'hit');
      } else if (event.type === 'backspace') {
        flags.pop();
        actions.push({type: 'tick'});
      } else if (event.type === 'advance' || event.type === 'beat') {
        const complete = flags.length === Array.from(word).length && flags.every(Boolean);
        actions.push({type: 'chord', bar: index + 1, missed: event.type === 'beat' && !complete});
        index += 1; flags = [];
      }
      return actions;
    }
  };
  return conductor.reset(words);
}

const NBSP = String.fromCharCode(160);
const NEWLINE = String.fromCharCode(10);
const spaceLike = char => char === ' ' || char === NEWLINE || char === NBSP;
const SENTENCE_ENDS = new Set(['.', '!', '?', '…']);

/**
 * Jam: free typing, so there is no word to match. Each character sings the
 * word you are making up as you go (the tune `melody` gives that word, one
 * note at a time), a space after a word brings the next chord, and the end of
 * a sentence or a new line goes home to the first one. Backspace is a soft
 * tick: the music only ever moves forward. Playback feeds it the same keys,
 * so a shared jam plays exactly the music its typist heard.
 */
export function createJamConductor() {
  let chars = [];
  let bar = -1;
  let lastT = null;
  const home = () => bar + PROGRESSION.length - wrap(bar, PROGRESSION.length);
  const conductor = {
    get bar() { return bar; },
    get chord() { return bar < 0 ? null : chordFor(bar); },
    reset() { chars = []; bar = -1; lastT = null; return conductor; },
    key(key, t) {
      const actions = [];
      const gap = lastT === null || !Number.isFinite(t) ? null : t - lastT;
      if (Number.isFinite(t)) lastT = t;
      if (key === 'Backspace') {
        if (chars.length) { chars.pop(); actions.push({type: 'tick'}); }
        return actions;
      }
      const char = key === 'Enter' ? NEWLINE : String(key ?? '');
      if (!char) return actions;
      const previous = chars[chars.length - 1];
      chars.push(char);
      if (spaceLike(char)) {
        if (bar < 0) return actions;
        if (char === NEWLINE ? previous !== NEWLINE : previous !== undefined && !spaceLike(previous)) {
          bar = char === NEWLINE || SENTENCE_ENDS.has(previous) ? home() : bar + 1;
          actions.push({type: 'chord', bar, missed: false});
        }
        return actions;
      }
      if (bar < 0) { bar = 0; actions.push({type: 'chord', bar, missed: false}); }
      let start = chars.length - 1;
      while (start > 0 && !spaceLike(chars[start - 1])) start--;
      const tune = melody(chars.slice(start).join(''), bar);
      actions.push({type: 'note', midi: tune[tune.length - 1], velocity: velocityFor(gap, start === chars.length - 1)});
      return actions;
    }
  };
  return conductor;
}

// A seeded noise source keeps the room and the clicks identical between renders.
function seeded(seed) {
  let state = seed;
  return () => { state = (state * 16807) % 2147483647; return state / 2147483647 * 2 - 1; };
}

function room(ctx, seconds = 2.4) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const random = seeded(7 + channel * 101);
    const data = buffer.getChannelData(channel);
    let low = 0;
    for (let i = 0; i < length; i++) {
      low += (random() - low) * 0.28;
      const onset = Math.min(1, i / (rate * 0.012));
      data[i] = low * onset * Math.pow(1 - i / length, 3.2);
    }
  }
  return buffer;
}

function noiseBuffer(ctx) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const random = seeded(29);
  for (let i = 0; i < data.length; i++) data[i] = random();
  return buffer;
}

// How the run ends: the home chord, a brighter one for a win, the relative
// minor for a loss, and a suspended chord left hanging for a dead heat.
const ENDINGS = {
  hello: {bass: null, notes: [57, 60, 64, 67], spread: 0.045, velocity: 0.4},
  solo: {bass: 41, notes: [57, 60, 64, 67, 72], spread: 0.07, velocity: 0.55},
  won: {bass: 41, notes: [57, 60, 64, 67, 72, 76, 79, 84], spread: 0.055, velocity: 0.6},
  lost: {bass: 38, notes: [53, 57, 60, 64, 69], spread: 0.09, velocity: 0.48},
  tied: {bass: 36, notes: [53, 55, 58, 62, 67], spread: 0.08, velocity: 0.5}
};

/** The sound engine: a small electric piano with bass, a room, and a gentle
 *  limiter, all synthesized (no samples to fetch). It makes no sound and no
 *  audio context until it is first asked to play. Pass an OfflineAudioContext
 *  to render a performance to a buffer instead of the speakers. */
export function createMusic({context = null, volume = 0.85} = {}) {
  let ctx = context;
  let input = null;
  let bar = null;
  let noise = null;
  let unlocked = false;
  const offline = () => typeof ctx?.startRendering === 'function';

  function ready() {
    if (!ctx) {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) return null;
      try { ctx = new AudioContextClass({latencyHint: 'interactive'}); } catch { return null; }
    }
    if (!input) build();
    if (!offline() && ctx.state === 'suspended') ctx.resume?.().catch(() => {});
    return ctx;
  }

  function build() {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12; limiter.knee.value = 8; limiter.ratio.value = 6;
    limiter.attack.value = 0.003; limiter.release.value = 0.25;
    const out = ctx.createGain();
    out.gain.value = volume;
    limiter.connect(out); out.connect(ctx.destination);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = 7200; tone.Q.value = 0.3;
    tone.connect(limiter);
    input = ctx.createGain();
    input.connect(tone);
    const verb = ctx.createConvolver();
    verb.buffer = room(ctx);
    const send = ctx.createGain();
    send.gain.value = 0.24;
    input.connect(send); send.connect(verb); verb.connect(limiter);
    noise = noiseBuffer(ctx);
    bar = ctx.createGain();
    bar.connect(input);
  }

  // Each bar rings on its own bus. A new chord lifts the hands off the last one,
  // so an old chord never smears into the next.
  function nextBar(when, release = 0.09) {
    const old = bar;
    bar = ctx.createGain();
    bar.connect(input);
    old.gain.setTargetAtTime(0, when, release);
    if (!offline()) setTimeout(() => { try { old.disconnect(); } catch {} }, 4000 + Math.max(0, when - ctx.currentTime) * 1000);
  }

  function voice(osc, start, stop) { osc.start(start); osc.stop(stop); return osc; }

  function epiano(midi, when, velocity, {ring = 1, bright = true, pan = (midi - 72) / 30} = {}) {
    const f = mtof(midi);
    const fade = ring * clamp(2.4 * Math.pow(2, -(midi - 60) / 30), 0.6, 3.5);
    const stop = when + 0.3 + fade;
    const amp = ctx.createGain();
    const peak = 0.2 * velocity;
    amp.gain.setValueAtTime(0, when);
    amp.gain.linearRampToValueAtTime(peak, when + 0.005);
    amp.gain.setTargetAtTime(peak * 0.55, when + 0.005, 0.09);
    amp.gain.setTargetAtTime(0, when + 0.25, fade / 4.5);
    // The body: a sine pushed by a 1:1 modulator that mellows right after the strike.
    const carrier = voice(ctx.createOscillator(), when, stop);
    const modulator = voice(ctx.createOscillator(), when, stop);
    carrier.frequency.setValueAtTime(f, when);
    modulator.frequency.setValueAtTime(f, when);
    const depth = ctx.createGain();
    const index = f * (0.9 + 1.5 * velocity) * (bright ? 1 : 0.6);
    depth.gain.setValueAtTime(index, when);
    depth.gain.setTargetAtTime(index * 0.15, when, 0.18);
    modulator.connect(depth); depth.connect(carrier.frequency);
    carrier.connect(amp);
    if (bright) {
      // The tine: a high, fast-fading modulator gives the bell of the strike.
      const shine = clamp((88 - midi) / 28, 0.15, 1);
      const tine = voice(ctx.createOscillator(), when, when + 0.4);
      const tineModulator = voice(ctx.createOscillator(), when, when + 0.4);
      tine.frequency.setValueAtTime(f, when);
      tineModulator.frequency.setValueAtTime(f * 14, when);
      const tineDepth = ctx.createGain();
      tineDepth.gain.setValueAtTime(f * 2.2 * shine, when);
      tineDepth.gain.setTargetAtTime(0, when, 0.025);
      tineModulator.connect(tineDepth); tineDepth.connect(tine.frequency);
      const tineLevel = ctx.createGain();
      tineLevel.gain.setValueAtTime(0.5 * velocity * shine, when);
      tineLevel.gain.setTargetAtTime(0, when, 0.07);
      tine.connect(tineLevel); tineLevel.connect(amp);
    }
    let last = amp;
    if (pan && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(clamp(pan, -0.8, 0.8), when);
      amp.connect(panner);
      last = panner;
    }
    last.connect(bar);
    carrier.onended = () => { try { last.disconnect(); } catch {} };
  }

  function bassNote(midi, when, velocity) {
    const f = mtof(midi);
    const stop = when + 2.6;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, when);
    amp.gain.linearRampToValueAtTime(0.2 * velocity, when + 0.008);
    amp.gain.setTargetAtTime(0.1 * velocity, when + 0.008, 0.12);
    amp.gain.setTargetAtTime(0, when + 0.35, 0.45);
    const body = voice(ctx.createOscillator(), when, stop);
    const edge = voice(ctx.createOscillator(), when, stop);
    body.type = 'triangle'; edge.type = 'sawtooth';
    body.frequency.setValueAtTime(f, when);
    edge.frequency.setValueAtTime(f, when);
    const edgeLevel = ctx.createGain();
    edgeLevel.gain.value = 0.35;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass'; tone.Q.value = 0.8;
    tone.frequency.setValueAtTime(f * 9, when);
    tone.frequency.setTargetAtTime(f * 3.5, when, 0.08);
    body.connect(tone); edge.connect(edgeLevel); edgeLevel.connect(tone);
    tone.connect(amp); amp.connect(bar);
    body.onended = () => { try { amp.disconnect(); } catch {} };
  }

  function click(when, level, frequency, type, target = input) {
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type; filter.frequency.value = frequency; filter.Q.value = 1;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(level, when);
    amp.gain.setTargetAtTime(0, when, 0.012);
    source.connect(filter); filter.connect(amp); amp.connect(target);
    source.start(when); source.stop(when + 0.12);
    source.onended = () => { try { amp.disconnect(); } catch {} };
  }

  // A wrong letter: a muted, sagging thump an octave under the letter's note.
  // Clearly not a note, never harsh.
  function deadNote(midi, when, velocity) {
    const f = mtof(midi - 12);
    const osc = voice(ctx.createOscillator(), when, when + 0.3);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f, when);
    osc.frequency.exponentialRampToValueAtTime(f * 0.84, when + 0.09);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = 1100;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, when);
    amp.gain.linearRampToValueAtTime(0.2 * velocity, when + 0.003);
    amp.gain.setTargetAtTime(0, when + 0.003, 0.04);
    osc.connect(tone); tone.connect(amp); amp.connect(bar);
    osc.onended = () => { try { amp.disconnect(); } catch {} };
    click(when, 0.07 * velocity, 1600, 'bandpass', bar);
  }

  function chord(index, when, missed) {
    const {bass, voicing} = chordFor(index);
    nextBar(when);
    const velocity = (missed ? 0.3 : 0.48) + (wrap(index, 4) === 0 ? 0.06 : 0);
    bassNote(bass, when, missed ? 0.5 : 0.85);
    voicing.forEach((midi, i) => epiano(midi, when + 0.008 + i * 0.011, velocity, {ring: 1.3, bright: false, pan: (i - 1.5) * 0.14}));
    if (missed) deadNote(bass + 12, when, 0.7);
  }

  const music = {
    get context() { return ctx; },
    /** The audio clock in seconds, starting the engine if it isn't yet. */
    clock() { return ready() ? ctx.currentTime : 0; },
    /** Call from a user gesture: browsers only start audio after one. */
    unlock() {
      if (!ready() || unlocked || offline()) return;
      unlocked = true;
      const source = ctx.createBufferSource();
      source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      source.connect(ctx.destination);
      source.start(0);
    },
    play(action, when = null) {
      if (!action || !ready()) return false;
      const at = Math.max(ctx.currentTime, Number.isFinite(when) ? when : ctx.currentTime);
      if (action.type === 'note') epiano(action.midi, at, clamp(Number(action.velocity) || 0.6, 0.1, 1));
      else if (action.type === 'dead') deadNote(action.midi, at, clamp(Number(action.velocity) || 0.6, 0.1, 1));
      else if (action.type === 'tick') click(at, 0.035, 5200, 'highpass');
      else if (action.type === 'chord') chord(action.bar, at, Boolean(action.missed));
      else return false;
      return true;
    },
    /** The rival's pace in a race: a soft high ting on the far side for each word they finish. */
    ghost(when = null) {
      if (!ready()) return;
      const at = Math.max(ctx.currentTime, Number.isFinite(when) ? when : ctx.currentTime);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0, at);
      amp.gain.linearRampToValueAtTime(0.05, at + 0.002);
      amp.gain.setTargetAtTime(0, at + 0.002, 0.09);
      [[2093, 1], [2093 * 2.76, 0.35]].forEach(([frequency, level]) => {
        const osc = voice(ctx.createOscillator(), at, at + 0.6);
        osc.frequency.setValueAtTime(frequency, at);
        const gain = ctx.createGain();
        gain.gain.value = level;
        osc.connect(gain); gain.connect(amp);
      });
      let last = amp;
      if (ctx.createStereoPanner) { last = ctx.createStereoPanner(); last.pan.value = 0.6; amp.connect(last); }
      last.connect(input);
    },
    finish(kind = 'solo', when = null) {
      if (!ready()) return;
      const at = Math.max(ctx.currentTime, Number.isFinite(when) ? when : ctx.currentTime);
      const ending = ENDINGS[kind] || ENDINGS.solo;
      nextBar(at, 0.12);
      if (ending.bass) bassNote(ending.bass, at, ending.velocity + 0.15);
      ending.notes.forEach((midi, i) => epiano(midi, at + i * ending.spread, ending.velocity, {ring: 1.8, bright: i >= ending.notes.length - 3}));
    },
    /** Lift every hand: whatever is ringing fades out in a few hundredths of a second. */
    hush() {
      if (!ctx || !input) return;
      nextBar(ctx.currentTime, 0.03);
    }
  };
  return music;
}
