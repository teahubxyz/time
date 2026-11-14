// The typing coach. It learns from every live run on this device: how accurate
// and how quick each key is, which letter-to-letter moves are slow, which keys
// slip to which, and the rhythm of each run. Nothing here leaves the browser.

export const KEYBOARD = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const LETTERS = KEYBOARD.join('');
const LEFT = new Set(Array.from('qwertasdfgzxcvb'));
const RIGHT = new Set(Array.from('yuiophjklnm'));
// The same finger on the other hand: the classic mirror slip.
const MIRROR = {f: 'j', d: 'k', s: 'l', g: 'h', r: 'u', e: 'i', w: 'o', q: 'p', t: 'y', v: 'm', b: 'n'};
for (const [a, b] of Object.entries({...MIRROR})) MIRROR[b] = a;
const STAGGER = [0, 0.25, 0.75];
const PLACE = {};
KEYBOARD.forEach((row, r) => Array.from(row).forEach((key, c) => { PLACE[key] = {r, x: c + STAGGER[r]}; }));
// A longer gap is a pause for thought, not a keystroke.
const PAUSE = 1500;
// How many tries a key needs before the coach has an opinion about it.
export const ENOUGH = 8;

export function emptyStats() {
  return {version: 1, keys: {}, pairs: {}, slips: {}, runs: []};
}

const finite = value => Number.isFinite(value) && value >= 0;

/** Local storage holds whatever an older version, or a curious person, left there. */
export function readStats(value) {
  const stats = emptyStats();
  if (!value || typeof value !== 'object' || value.version !== 1) return stats;
  for (const [key, entry] of Object.entries(value.keys || {})) {
    if (Array.from(key).length === 1 && entry && finite(entry.n) && finite(entry.miss) && finite(entry.ms) && finite(entry.timed)) {
      stats.keys[key] = {n: entry.n, miss: Math.min(entry.miss, entry.n), ms: entry.ms, timed: entry.timed};
    }
  }
  for (const [pair, entry] of Object.entries(value.pairs || {})) {
    if (Array.from(pair).length === 2 && entry && finite(entry.n) && finite(entry.ms)) stats.pairs[pair] = {n: entry.n, ms: entry.ms};
  }
  for (const [slip, count] of Object.entries(value.slips || {})) {
    const parts = slip.split(' ');
    if (parts.length === 2 && Array.from(parts[0]).length === 1 && Array.from(parts[1]).length === 1 && finite(count)) stats.slips[slip] = count;
  }
  if (Array.isArray(value.runs)) {
    stats.runs = value.runs.filter(run => run && finite(run.wpm) && finite(run.accuracy)).slice(-60).map(run => ({
      day: String(run.day || '').slice(0, 10), wpm: run.wpm, accuracy: run.accuracy,
      within: finite(run.within) ? run.within : 0, start: finite(run.start) ? run.start : 0,
      evenness: finite(run.evenness) ? Math.min(1, run.evenness) : 0, samples: finite(run.samples) ? run.samples : 0,
      ...(run.drill === true ? {drill: true} : {})
    }));
  }
  return stats;
}

/** Learns from a live run's events as they happen. A miss also brings the key
 *  that was typed, so the coach can tell which keys slip to which. */
export function createRecorder(stats) {
  let words = [];
  let index = -1;
  let flags = [];
  let lastT = null;
  let lastLetter = null;
  const recorder = {
    reset(list = []) {
      words = Array.isArray(list) ? list : [];
      index = -1; flags = []; lastT = null; lastLetter = null;
      return recorder;
    },
    event(event, typed = '') {
      if (!event || !Number.isFinite(event.index)) return;
      if (event.index !== index) { index = event.index; flags = []; lastLetter = null; }
      const gap = lastT === null || !Number.isFinite(event.t) ? null : event.t - lastT;
      if (Number.isFinite(event.t)) lastT = event.t;
      if (event.type === 'hit' || event.type === 'miss') {
        const word = words.length ? Array.from(words[index % words.length]) : [];
        const target = (word[flags.length] || '').toLowerCase();
        const clean = flags.every(Boolean);
        if (target) {
          const key = stats.keys[target] || (stats.keys[target] = {n: 0, miss: 0, ms: 0, timed: 0});
          key.n += 1;
          if (event.type === 'miss') {
            key.miss += 1;
            const slip = String(typed || '').toLowerCase();
            if (Array.from(slip).length === 1 && slip !== target && slip !== ' ') stats.slips[target + ' ' + slip] = (stats.slips[target + ' ' + slip] || 0) + 1;
          } else if (clean && lastLetter && gap !== null && gap < PAUSE) {
            // Only clean moves inside a word time a key: corrections and word starts would blur it.
            key.ms += gap; key.timed += 1;
            const pair = stats.pairs[lastLetter + target] || (stats.pairs[lastLetter + target] = {n: 0, ms: 0});
            pair.n += 1; pair.ms += gap;
          }
        }
        flags.push(event.type === 'hit');
        lastLetter = event.type === 'hit' && clean && target ? target : null;
      } else if (event.type === 'backspace') {
        flags.pop(); lastLetter = null;
      } else if (event.type === 'advance' || event.type === 'beat') {
        index += 1; flags = []; lastLetter = null;
      }
    }
  };
  return recorder.reset();
}

/** The rhythm of one run: the usual gap between keys inside a word, the gap
 *  before a word's first key, and how even the inside-word gaps are. */
export function runRhythm(run) {
  const within = [];
  const starts = [];
  let index = -1;
  let flags = [];
  let lastT = null;
  let lastClean = false;
  for (const event of run?.events || []) {
    if (event.index !== index) { index = event.index; flags = []; lastClean = false; }
    const gap = lastT === null ? null : event.t - lastT;
    lastT = event.t;
    if (event.type === 'hit' || event.type === 'miss') {
      if (event.type === 'hit' && gap !== null && gap < PAUSE) {
        if (!flags.length) starts.push(gap);
        else if (lastClean && flags.every(Boolean)) within.push(gap);
      }
      flags.push(event.type === 'hit');
      lastClean = event.type === 'hit';
    } else if (event.type === 'backspace') {
      flags.pop(); lastClean = false;
    } else {
      lastClean = false;
    }
  }
  const mean = list => list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0;
  const average = mean(within);
  const spread = within.length > 1 ? Math.sqrt(mean(within.map(value => (value - average) * (value - average)))) : 0;
  return {
    within: Math.round(average), start: Math.round(mean(starts)),
    evenness: average ? Math.round(Math.max(0, Math.min(1, 1 - spread / average)) * 100) / 100 : 0,
    samples: within.length
  };
}

/** Fold a finished run into the coach. Its rhythm joins the history, and old
 *  counts fade, so the coach follows how you type now rather than last month. */
export function finishRun(stats, run, day = '', drill = false) {
  if ((run?.stats?.keystrokes || 0) >= 20) {
    // A drill is hard on purpose: it teaches the coach your keys but stays out of your trend and style.
    stats.runs.push({day: String(day).slice(0, 10), wpm: run.stats.wpm, accuracy: run.stats.accuracy, ...runRhythm(run), ...(drill ? {drill: true} : {})});
    stats.runs = stats.runs.slice(-60);
  }
  for (const key of Object.values(stats.keys)) {
    if (key.n > 400) for (const field of ['n', 'miss', 'ms', 'timed']) key[field] /= 2;
  }
  for (const pair of Object.values(stats.pairs)) {
    if (pair.n > 80) { pair.n /= 2; pair.ms /= 2; }
  }
  const pairs = Object.entries(stats.pairs);
  if (pairs.length > 600) stats.pairs = Object.fromEntries(pairs.sort((a, b) => b[1].n - a[1].n).slice(0, 400));
  let slips = Object.entries(stats.slips).sort((a, b) => b[1] - a[1]);
  if (slips.length > 120) slips = slips.slice(0, 80);
  if (slips.length && slips[0][1] > 60) slips = slips.map(([slip, count]) => [slip, count / 2]);
  stats.slips = Object.fromEntries(slips);
  return stats;
}

function slipKind(target, typed) {
  if (MIRROR[target] === typed) return 'mirror';
  const a = PLACE[target];
  const b = PLACE[typed];
  if (a && b && Math.abs(a.r - b.r) <= 1 && Math.abs(a.x - b.x) <= 1.1) return 'neighbour';
  return 'other';
}

const STYLES = {
  sprinter: {name: 'sprinter', line: 'Quick inside words, with a breath at every space.'},
  metronome: {name: 'metronome', line: 'Steady from key to key, word after word.'},
  surgeon: {name: 'surgeon', line: 'Careful and clean: backspace barely knows you.'},
  wave: {name: 'wave', line: 'The rhythm comes in waves: a burst, then a breath.'}
};

function describeStyle(runs) {
  const average = pick => runs.reduce((sum, run) => sum + pick(run), 0) / runs.length;
  const evenness = average(run => run.evenness);
  const chunk = average(run => run.within ? run.start / run.within : 1);
  const accuracy = average(run => run.accuracy);
  const style = chunk >= 2.4 ? STYLES.sprinter : evenness >= 0.62 && chunk < 1.8 ? STYLES.metronome : accuracy >= 98.5 ? STYLES.surgeon : STYLES.wave;
  return {...style, evenness: Math.round(evenness * 100), chunk: Math.round(chunk * 10) / 10, accuracy: Math.round(accuracy * 10) / 10};
}

/** Everything the coach shows: a weakness for each key it has seen enough of
 *  (slow or slippy, relative to your own typical key), the slowest pairs, the
 *  usual slips, which hand lags, your style, and your recent speeds. */
export function coachReport(stats) {
  const letters = Array.from(LETTERS);
  const entry = key => stats.keys[key];
  const seen = letters.filter(key => (entry(key)?.n || 0) >= ENOUGH);
  const speed = key => entry(key)?.timed >= 4 ? entry(key).ms / entry(key).timed : null;
  const speeds = seen.map(speed).filter(Number.isFinite).sort((a, b) => a - b);
  const typical = speeds.length ? speeds[Math.floor(speeds.length / 2)] : 0;
  const errors = seen.map(key => entry(key).miss / entry(key).n).sort((a, b) => a - b);
  const usualError = errors.length ? errors[Math.floor(errors.length / 2)] : 0;
  const keys = {};
  for (const key of letters) {
    const value = entry(key);
    if (!value || value.n < ENOUGH) { keys[key] = null; continue; }
    const error = value.miss / value.n;
    const ms = speed(key);
    const slow = ms && typical ? Math.max(0, ms / typical - 1) : 0;
    // Weak means weak for you: slippier or slower than your own usual key.
    const weakness = Math.min(1, Math.max(0, error - usualError) * 8 + slow * 1.5);
    keys[key] = {accuracy: Math.round((1 - error) * 100), ms: ms ? Math.round(ms) : null, weakness: Math.round(weakness * 100) / 100};
  }
  const weakest = seen.filter(key => keys[key].weakness >= 0.15)
    .sort((a, b) => keys[b].weakness - keys[a].weakness).slice(0, 3).map(key => ({key, ...keys[key]}));
  const pairs = Object.entries(stats.pairs).filter(([, value]) => value.n >= 4)
    .map(([pair, value]) => ({pair, ms: Math.round(value.ms / value.n)})).sort((a, b) => b.ms - a.ms).slice(0, 5);
  const slips = Object.entries(stats.slips).filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([slip, count]) => { const [target, typed] = slip.split(' '); return {target, typed, count: Math.round(count), kind: slipKind(target, typed)}; });
  const handSpeed = set => {
    let ms = 0, n = 0;
    for (const key of seen) if (set.has(key) && entry(key).timed >= 4) { ms += entry(key).ms; n += entry(key).timed; }
    return n ? ms / n : 0;
  };
  const left = handSpeed(LEFT);
  const right = handSpeed(RIGHT);
  const hands = left && right ? {slower: left > right ? 'left' : 'right', by: Math.round(Math.abs(left - right) / Math.min(left, right) * 100)} : null;
  const normal = stats.runs.filter(run => !run.drill);
  const recent = normal.slice(-10).filter(run => run.samples >= 10);
  return {
    keys, weakest, pairs, slips, hands,
    style: recent.length >= 2 ? describeStyle(recent) : null,
    missing: letters.filter(key => !keys[key]),
    runs: stats.runs.length,
    progress: normal.slice(-20).map(run => run.wpm)
  };
}

/** Words for a drill: common words that lean on the keys in `focus` (a letter
 *  and how much to lean on it) and on slow pairs, with plain words mixed in so
 *  it still reads like words rather than a cipher. */
export function practiceWords(focus, pairs, vocabulary, count = 60, random = Math.random) {
  const slow = new Set(pairs || []);
  const scored = (vocabulary || []).map(word => {
    const letters = Array.from(word);
    let score = 0;
    letters.forEach((letter, i) => {
      score += focus[letter] || 0;
      if (i && slow.has(letters[i - 1] + letter)) score += 0.8;
    });
    return {word, weight: 0.08 + Math.pow(score / Math.sqrt(letters.length || 1), 2)};
  });
  const total = scored.reduce((sum, item) => sum + item.weight, 0);
  const out = [];
  for (let tries = 0; out.length < count && scored.length && tries < count * 20; tries++) {
    let pick = random() * total;
    let chosen = scored[scored.length - 1];
    for (const item of scored) { pick -= item.weight; if (pick <= 0) { chosen = item; break; } }
    if (chosen.word !== out[out.length - 1]) out.push(chosen.word);
  }
  return out;
}
