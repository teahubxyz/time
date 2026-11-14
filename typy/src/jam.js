// Jam: free typing that plays. A jam is only its keys and when each one
// landed, so the words, the stats and the music can all be rebuilt from it:
// live, in a playback, or on the server that checks a shared one.

/** How big a jam can get: keys pressed, characters on the page, and time. */
export const JAM = Object.freeze({keys: 4000, chars: 2000, ms: 600000, pause: 1500});
export const NEWLINE = String.fromCharCode(10);
const NBSP = String.fromCharCode(160);

export const isSpace = char => char === ' ' || char === NEWLINE || char === NBSP;

/** Backspace, Enter, or one printable character. Invisible characters and the
 *  ones that flip the direction of text stay out, so a shared jam shows what it says. */
export function jamKey(key) {
  if (key === 'Backspace' || key === 'Enter') return true;
  if (typeof key !== 'string') return false;
  const points = Array.from(key);
  if (points.length !== 1) return false;
  const code = points[0].codePointAt(0);
  if (code < 32 || (code >= 127 && code < 160)) return false;
  if ((code >= 0x200b && code <= 0x200f) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069) || code === 0xfeff) return false;
  return true;
}

/** Puts one key on the page: a character, a new line, or one taken away. */
export function typeKey(chars, key) {
  if (key === 'Backspace') chars.pop();
  else if (key === 'Enter') chars.push(NEWLINE);
  else chars.push(key);
  return chars;
}

export function jamText(keys) {
  const chars = [];
  for (const [, key] of keys || []) typeKey(chars, key);
  return chars.join('');
}

/** What a jam adds up to. Words and pace count what is left on the page;
 *  notes, fixes and flow count every key that was played. Flow is typing
 *  without a pause of a second and a half or more. */
export function jamStats(keys = []) {
  const list = Array.isArray(keys) ? keys : [];
  let notes = 0, fixes = 0, flowMs = 0, flowKeys = 0, burst = 0, longest = 0;
  let previous = null;
  const chars = [];
  for (const [t, key] of list) {
    if (previous !== null) {
      const gap = t - previous;
      if (gap < JAM.pause) {
        flowMs += gap; burst += gap;
        if (key !== 'Backspace') flowKeys += 1;
        if (burst > longest) longest = burst;
      } else burst = 0;
    }
    previous = t;
    if (key === 'Backspace') fixes += 1;
    else if (key !== 'Enter' && !isSpace(key)) notes += 1;
    typeKey(chars, key);
  }
  let words = 0;
  chars.forEach((char, i) => { if (!isSpace(char) && (i === 0 || isSpace(chars[i - 1]))) words += 1; });
  const durationMs = list.length ? list[list.length - 1][0] - list[0][0] : 0;
  const perMinute = (count, ms) => ms >= 1000 ? Math.round((count / 5) / (ms / 60000)) : 0;
  return {
    durationMs, chars: chars.length, words, notes, fixes,
    wpm: perMinute(chars.length, durationMs),
    flowWpm: perMinute(flowKeys, flowMs),
    longestFlowMs: longest
  };
}
