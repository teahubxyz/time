import { generateWords, normalizePassage } from './words.js';

export const MODES = ['30', '60', '50', 'endless', 'tempo'];
export const MAX_REPLAY_EVENTS = 30000;
export const MAX_REPLAY_WORDS = 6000;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const rounded = value => Math.round(value * 10) / 10;
const lengthOf = word => Array.from(word || '').length;
const prefixLength = flags => {
  const index = flags.indexOf(false);
  return index < 0 ? flags.length : index;
};
const speed = (chars, durationMs) => durationMs > 0
  ? rounded(chars * 12000 / Math.max(1000, durationMs)) : 0;

/**
 * Recompute public metrics from privacy-safe replay outcomes and word timings.
 * A hit/miss records whether a key matched, never what the visitor typed.
 * Fully complete words count one normalized separator in either advance setting.
 * Backspacing never earns output; accuracy still reflects every typing attempt.
 */
export function summarizeRun(run) {
  const words = Array.isArray(run.words) ? run.words : [];
  const events = Array.isArray(run.events) ? run.events : [];
  const timings = Array.isArray(run.wordTimings) ? run.wordTimings : [];
  const durationMs = Math.max(0, Number(run.durationMs) || 0);
  const states = new Map();
  let hits = 0;
  let errors = 0;
  for (const event of events) {
    if (!states.has(event.index)) states.set(event.index, { flags: [], errors: 0 });
    const state = states.get(event.index);
    if (event.type === 'hit') {
      state.flags.push(true);
      hits++;
    } else if (event.type === 'miss') {
      state.flags.push(false);
      state.errors++;
      errors++;
    } else if (event.type === 'backspace') {
      state.flags.pop();
    }
  }
  let correctChars = 0;
  let completedWords = 0;
  let streak = 0;
  let bestStreak = 0;
  const wordSpeeds = [];
  for (let index = 0; index < timings.length; index++) {
    const timing = timings[index];
    const word = words.length ? words[timing.index % words.length] : '';
    const state = states.get(timing.index) || { flags: [], errors: 0 };
    // The backend also validates timing structure. Here a claimed completion must
    // agree with replayed character outcomes before it can earn output.
    const complete = timing.completed === true && state.flags.length === lengthOf(word)
      && prefixLength(state.flags) === lengthOf(word) && lengthOf(word) > 0;
    if (complete) {
      correctChars += lengthOf(word) + 1;
      completedWords++;
      streak = state.errors === 0 ? streak + 1 : 0;
      bestStreak = Math.max(bestStreak, streak);
      const stop = Number.isFinite(timing.typedEnd) ? timing.typedEnd : timing.end;
      const ms = stop - timing.start;
      // A one-letter first word in automatic mode can finish at t=0. There is
      // no measured interval for that word, so don't invent an infinite spike.
      if (ms > 0) wordSpeeds.push({ word, index: timing.index, ms: Math.round(ms), wpm: rounded((lengthOf(word) + 1) * 12000 / ms) });
    } else {
      streak = 0;
      if (index === timings.length - 1 && timing.missed !== true) {
        correctChars += Math.min(lengthOf(word), prefixLength(state.flags));
      }
    }
  }
  const slowest = [...wordSpeeds].sort((a, b) => a.wpm - b.wpm || b.ms - a.ms).slice(0, 5);
  // Preserve the shape of long runs without sending hundreds of graph columns.
  const bucketSize = Math.max(1, Math.ceil(wordSpeeds.length / 80));
  const sparkline = [];
  for (let i = 0; i < wordSpeeds.length; i += bucketSize) {
    const bucket = wordSpeeds.slice(i, i + bucketSize);
    sparkline.push(rounded(bucket.reduce((sum, row) => sum + row.wpm, 0) / bucket.length));
  }
  return {
    wpm: speed(correctChars, durationMs),
    accuracy: hits + errors ? rounded(hits * 100 / (hits + errors)) : 100,
    bestStreak, correctChars, keystrokes: hits + errors, errors,
    completedWords, slowest, sparkline
  };
}

export class TypingGame {
  constructor({ words, mode = '30', advance = 'space', paceWpm = 40 } = {}) {
    const supplied = Array.isArray(words) ? normalizePassage(words.join(' ')) : normalizePassage(words);
    this.words = supplied.length ? supplied : generateWords();
    this.mode = MODES.includes(String(mode)) ? String(mode) : '30';
    this.advance = advance === 'letter' ? 'letter' : 'space';
    this.paceWpm = clamp(Number(paceWpm) || 40, 10, 200);
    this.status = 'ready';
    this.wordIndex = 0;
    this.buffer = [];
    this.startedAt = null;
    this.endedAt = null;
    this.lastAt = null;
    this.wordStartedAt = null;
    this.typedEnd = null;
    this.wordErrors = 0;
    this.hits = 0;
    this.errors = 0;
    this.completedWords = 0;
    this.completedChars = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.misses = 0;
    this.waitingForBeat = false;
    this.allowOptionalSeparator = false;
    this.beatDeadline = null;
    this.beatDurationMs = null;
    this.finishedReason = null;
    this.events = [];
    this.wordTimings = [];
    this.replayTruncated = false;
  }

  get word() { return this.words[this.wordIndex % this.words.length]; }

  _now(nowMs) {
    const proposed = Number.isFinite(nowMs) ? nowMs : globalThis.performance?.now?.() ?? Date.now();
    this.lastAt = this.lastAt === null ? proposed : Math.max(this.lastAt, proposed);
    return this.lastAt;
  }

  _relative(time) { return Math.max(0, Math.round(time - this.startedAt)); }

  _event(type, now) {
    this.events.push({ t: this._relative(now), type, index: this.wordIndex });
    if (this.events.length > MAX_REPLAY_EVENTS) {
      this.events.splice(0, this.events.length - MAX_REPLAY_EVENTS);
      this.replayTruncated = true;
    }
  }

  _flags() {
    const target = Array.from(this.word);
    return this.buffer.map((character, index) => character === target[index]);
  }

  _prefix() { return Math.min(lengthOf(this.word), prefixLength(this._flags())); }

  _setBeat(now) {
    this.beatDurationMs = clamp((lengthOf(this.word) + 1) * 12000 / this.paceWpm, 350, 15000);
    this.beatDeadline = now + this.beatDurationMs;
  }

  _start(now) {
    this.status = 'running';
    this.startedAt = now;
    this.wordStartedAt = now;
    if (this.mode === 'tempo') this._setBeat(now);
  }

  _recordWord(now, completed, missed = false) {
    const timing = {
      index: this.wordIndex,
      start: this._relative(this.wordStartedAt),
      end: this._relative(now),
      completed,
      errors: this.wordErrors
    };
    if (this.typedEnd !== null) timing.typedEnd = this._relative(this.typedEnd);
    if (missed) timing.missed = true;
    this.wordTimings.push(timing);
    if (this.wordTimings.length > MAX_REPLAY_WORDS) {
      this.wordTimings.splice(0, this.wordTimings.length - MAX_REPLAY_WORDS);
      this.replayTruncated = true;
    }
  }

  _advance(now, completed, isBeat = false) {
    this._event(isBeat ? 'beat' : 'advance', now);
    this._recordWord(now, completed, isBeat && !completed);
    if (completed) {
      this.completedWords++;
      this.completedChars += lengthOf(this.word) + 1;
      this.streak = this.wordErrors === 0 ? this.streak + 1 : 0;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      if (isBeat) this.paceWpm = Math.min(240, this.paceWpm * 1.035);
    } else {
      this.streak = 0;
      this.misses++;
    }
    this.wordIndex++;
    this.buffer = [];
    this.wordErrors = 0;
    this.typedEnd = null;
    this.waitingForBeat = false;
    this.allowOptionalSeparator = completed && !isBeat && this.advance === 'letter';
    this.wordStartedAt = now;
    if (this.mode === '50' && this.completedWords >= 50) {
      this._finish(now, 'words', false);
    } else if (this.mode === 'tempo' && this.misses >= 3) {
      this._finish(now, 'misses', false);
    } else if (isBeat) {
      this._setBeat(now);
    }
  }

  _finish(now, reason, closeCurrent = true) {
    if (this.status === 'finished') return;
    if (this.startedAt !== null && closeCurrent) this._recordWord(now, false);
    this.status = 'finished';
    this.endedAt = now;
    this.finishedReason = reason;
  }

  tick(nowMs) {
    const now = this._now(nowMs);
    if (this.status === 'running') {
      if (this.mode === '30' || this.mode === '60') {
        const deadline = this.startedAt + Number(this.mode) * 1000;
        if (now >= deadline) this._finish(deadline, 'time');
      } else if (this.mode === 'tempo') {
        // Catch up from a suspended tab. No human gains extra time by hiding it.
        while (this.status === 'running' && now >= this.beatDeadline) {
          const deadline = this.beatDeadline;
          this._advance(deadline, this.waitingForBeat, true);
        }
      }
    }
    return this._snapshot(now);
  }

  press(key, nowMs) {
    const now = this._now(nowMs);
    this.tick(now);
    if (this.status === 'finished' || typeof key !== 'string') return this._snapshot(now);
    if (key === 'Backspace') {
      if (this.status === 'running' && !this.waitingForBeat && this.buffer.length) {
        this.buffer.pop();
        this.typedEnd = null;
        this._event('backspace', now);
      }
      return this._snapshot(now);
    }
    if (Array.from(key).length !== 1 || /[\r\n\t\u0000-\u001f\u007f]/u.test(key)) return this._snapshot(now);
    if (this.status === 'ready') {
      if (/\s/u.test(key)) return this._snapshot(now);
      this._start(now);
    }
    if (this.waitingForBeat) return this._snapshot(now);
    // Automatic advancement already earned one normalized separator. Let a
    // typist press that space out of habit without corrupting the next word.
    // Only the very next printable key gets this allowance; extra or mid-word
    // spaces still need correction, and an ignored separator earns no output.
    if (this.allowOptionalSeparator) {
      this.allowOptionalSeparator = false;
      if (key === ' ') return this._snapshot(now);
    }
    if (key === ' ' && this.buffer.join('') === this.word) {
      if (this.mode === 'tempo') {
        this.waitingForBeat = true;
      } else {
        this._advance(now, true);
      }
      return this._snapshot(now);
    }
    // The small bound prevents an accidentally held key growing a buffer forever.
    // Ignored overflow presses are not logged or included in accuracy.
    if (this.buffer.length >= 4096) return this._snapshot(now);
    const target = Array.from(this.word);
    const correct = key === target[this.buffer.length];
    this.buffer.push(key);
    if (correct) this.hits++;
    else {
      this.errors++;
      this.wordErrors++;
      this.streak = 0;
    }
    this._event(correct ? 'hit' : 'miss', now);
    if (this.buffer.join('') === this.word) {
      this.typedEnd = now;
      if (this.mode === 'tempo') this.waitingForBeat = true;
      else if (this.advance === 'letter') this._advance(now, true);
    }
    return this._snapshot(now);
  }

  finish(nowMs) {
    const now = this._now(nowMs);
    this.tick(now);
    if (this.status !== 'finished') this._finish(now, 'manual');
    return this._snapshot(now);
  }

  _snapshot(now) {
    const stop = this.endedAt ?? now;
    const elapsedMs = this.startedAt === null ? 0 : Math.max(0, stop - this.startedAt);
    const flags = this._flags();
    const errorIndex = flags.indexOf(false);
    const correctPrefix = this._prefix();
    const remainingMs = this.mode === '30' || this.mode === '60'
      ? Math.max(0, Number(this.mode) * 1000 - elapsedMs) : null;
    return {
      status: this.status, mode: this.mode, advance: this.advance,
      wordIndex: this.wordIndex, word: this.word,
      nextWord: this.words[(this.wordIndex + 1) % this.words.length],
      buffer: this.buffer.join(''), correctPrefix, errorIndex,
      startedAt: this.startedAt, elapsedMs, remainingMs,
      wpm: speed(this.completedChars + correctPrefix, elapsedMs),
      accuracy: this.hits + this.errors ? rounded(this.hits * 100 / (this.hits + this.errors)) : 100,
      bestStreak: this.bestStreak, streak: this.streak, misses: this.misses,
      paceWpm: rounded(this.paceWpm),
      beatRemainingMs: this.beatDeadline === null ? null : Math.max(0, this.beatDeadline - now),
      beatDurationMs: this.beatDurationMs,
      waitingForBeat: this.waitingForBeat,
      completedWords: this.completedWords, finishedReason: this.finishedReason,
      correctChars: this.completedChars + correctPrefix,
      keystrokes: this.hits + this.errors, errors: this.errors,
      replayTruncated: this.replayTruncated
    };
  }

  snapshot(nowMs) { return this.tick(nowMs); }

  result(nowMs) {
    const state = this.tick(nowMs);
    const wordTimings = this.wordTimings.map(timing => ({ ...timing }));
    // Useful for previews or manual save callers, without mutating a running game.
    if (this.status === 'running') {
      const timing = {
        index: this.wordIndex, start: this._relative(this.wordStartedAt),
        end: Math.round(state.elapsedMs), completed: false, errors: this.wordErrors
      };
      if (this.typedEnd !== null) timing.typedEnd = this._relative(this.typedEnd);
      wordTimings.push(timing);
    }
    const run = {
      version: 1, mode: this.mode, advance: this.advance,
      words: [...this.words], durationMs: Math.round(state.elapsedMs),
      finishedReason: this.finishedReason,
      events: this.events.map(event => ({ ...event })), wordTimings,
      replayTruncated: this.replayTruncated
    };
    run.stats = summarizeRun(run);
    if (this.replayTruncated) {
      // The full run still has correct local results. The server refuses partial
      // replay uploads instead of pretending the retained tail is the full run.
      Object.assign(run.stats, {
        wpm: state.wpm, accuracy: state.accuracy, bestStreak: state.bestStreak,
        correctChars: state.correctChars, keystrokes: state.keystrokes,
        errors: state.errors, completedWords: state.completedWords
      });
    }
    return run;
  }
}
