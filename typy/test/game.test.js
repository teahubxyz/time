import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingGame, letterStates, summarizeRun, MODES, TIMED_MODES, timedSeconds } from '../src/game.js';
import { generateWords, normalizePassage } from '../src/words.js';

function type(game, word, at, spacing = 100) {
  for (const letter of word) game.press(letter, at += spacing);
  return at;
}

test('the first letter starts the run; controls and premature spaces do not', () => {
  const game = new TypingGame({ words: ['cat'] });
  for (const key of ['Shift', 'Escape', 'Backspace', ' ', 'Enter']) game.press(key, 20);
  assert.equal(game.snapshot(50).status, 'ready');
  const state = game.press('c', 120);
  assert.equal(state.status, 'running');
  assert.equal(state.startedAt, 120);
  assert.equal(state.correctPrefix, 1);
});

test('space advances exact words; an error must be corrected before advancing', () => {
  const game = new TypingGame({ words: ['cat', 'dog'] });
  type(game, 'cax', 0);
  assert.equal(game.snapshot(310).errorIndex, 2);
  game.press('Backspace', 400);
  game.press('t', 500);
  assert.equal(game.snapshot(600).wordIndex, 0);
  assert.equal(game.snapshot(600).buffer, 'cat');
  game.press(' ', 700);
  assert.equal(game.snapshot(700).word, 'dog');
  assert.equal(game.snapshot(700).completedWords, 1);
  assert.equal(game.snapshot(700).bestStreak, 0);
  assert.equal(game.snapshot(700).accuracy, 75);
});

test('an early space is an error and backspace can recover from it', () => {
  const game = new TypingGame({ words: ['a'], advance: 'letter' });
  game.press('x', 0);
  game.press('Backspace', 50);
  game.press(' ', 100);
  assert.equal(game.snapshot(100).errorIndex, 0);
  game.press('Backspace', 150);
  game.press('a', 200);
  assert.equal(game.snapshot(200).completedWords, 1);
  game.finish(1000);
  const result = game.result(1000);
  assert.equal(result.stats.correctChars, 2);
  assert.equal(result.stats.accuracy, 33.3);
});

const states = letters => letters.map(letter => letter.state);

test('letter state is marked in place; backspace returns a wrong letter to pending', () => {
  const game = new TypingGame({ words: ['cat', 'dog'] });
  assert.deepEqual(states(game.snapshot(0).letters), ['pending', 'pending', 'pending']);
  type(game, 'cax', 0);
  assert.deepEqual(states(game.snapshot(310).letters), ['correct', 'correct', 'incorrect']);
  assert.equal(game.snapshot(310).errorIndex, 2);
  game.press('Backspace', 400);
  assert.deepEqual(states(game.snapshot(400).letters), ['correct', 'correct', 'pending']);
  assert.equal(game.snapshot(400).errorIndex, -1);
  game.press('t', 500);
  assert.deepEqual(states(game.snapshot(500).letters), ['correct', 'correct', 'correct']);
  // Space takes the next word from the queue with its own letters untouched.
  game.press(' ', 600);
  assert.deepEqual(states(game.snapshot(600).letters), ['pending', 'pending', 'pending']);
  assert.equal(game.snapshot(600).word, 'dog');
});

test('keys typed past the end of a word are extra, never a letter of the word', () => {
  const game = new TypingGame({ words: ['go', 'on'] });
  type(game, 'gox', 0);
  const state = game.snapshot(310);
  assert.deepEqual(states(state.letters), ['correct', 'correct', 'extra']);
  assert.deepEqual(state.letters.at(-1), { char: 'x', state: 'extra' });
  assert.equal(state.errorIndex, 2);
  assert.equal(state.correctPrefix, 2);
  game.press('Backspace', 400);
  assert.deepEqual(states(game.snapshot(400).letters), ['correct', 'correct']);
});

test('the last correct letter advances and the next word starts unmarked', () => {
  const game = new TypingGame({ words: ['cat', 'dog'], mode: 'endless', advance: 'letter' });
  type(game, 'ca', 0);
  assert.deepEqual(states(game.snapshot(210).letters), ['correct', 'correct', 'pending']);
  game.press('t', 300);
  const state = game.snapshot(300);
  assert.equal(state.word, 'dog');
  assert.deepEqual(states(state.letters), ['pending', 'pending', 'pending']);
  assert.equal(state.buffer, '');
});

test('the built-in common-words list fills the stage at / with plain typeable words', () => {
  const words = generateWords(300, 'typy-262');
  assert.equal(words.length, 300);
  assert.ok(words.every(word => /^[a-z]+$/.test(word)), 'every word is plain lowercase letters');
  assert.ok(words.every(word => word.length <= 12), 'no word is too wide for the centred stage');
  // A small vocabulary drawn with frequency weighting, not a thousand strangers.
  assert.ok(new Set(words).size < 260, 'the list reuses its vocabulary');
  const commonest = ['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'it',
    'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this'];
  assert.ok(words.filter(word => commonest.includes(word)).length >= 15,
    'the commonest twenty words appear far more often than an even draw would give');
});

test('the next word snaps in on advance, including around the end of the passage', () => {
  const game = new TypingGame({ words: ['cat', 'dog'], mode: 'endless' });
  const first = game.snapshot(0);
  assert.equal(first.word, 'cat');
  assert.equal(first.nextWord, 'dog');
  type(game, 'cat', 0);
  // The advancing key itself produces the next word: no blank frame in between.
  const advanced = game.press(' ', 400);
  assert.equal(advanced.word, 'dog');
  assert.equal(advanced.nextWord, 'cat');
  assert.equal(advanced.buffer, '');
  assert.equal(advanced.wordIndex, 1);
  assert.deepEqual(states(advanced.letters), ['pending', 'pending', 'pending']);
  assert.equal(game.snapshot(400).word, 'dog');
  type(game, 'dog', 400);
  assert.equal(game.press(' ', 800).word, 'cat', 'a short passage wraps back to its first word');
});

test('desktop navigation and modifier keys never type a letter or cost accuracy', () => {
  const game = new TypingGame({ words: ['cat', 'dog'], mode: 'endless' });
  type(game, 'ca', 0);
  for (const key of ['Enter', 'Tab', 'ArrowLeft', 'Home', 'F5', 'Shift', 'Control', 'Dead', '\n', '\t']) {
    game.press(key, 300);
  }
  const state = game.snapshot(300);
  assert.equal(state.buffer, 'ca');
  assert.equal(state.keystrokes, 2);
  assert.equal(state.accuracy, 100);
  assert.equal(state.wordIndex, 0);
  game.press('t', 400);
  assert.equal(game.press(' ', 500).word, 'dog');
});

test('letter state is a pure function of the word and the keys typed into it', () => {
  assert.deepEqual(states(letterStates('cat', '')), ['pending', 'pending', 'pending']);
  assert.deepEqual(states(letterStates('cat', 'cx')), ['correct', 'incorrect', 'pending']);
  assert.deepEqual(states(letterStates('cat', 'cat')), ['correct', 'correct', 'correct']);
  assert.deepEqual(letterStates('hi', 'hix'), [
    { char: 'h', state: 'correct' }, { char: 'i', state: 'correct' }, { char: 'x', state: 'extra' }
  ]);
  assert.deepEqual(states(letterStates('', 'a')), ['extra']);
  assert.deepEqual(letterStates('a'), [{ char: 'a', state: 'pending' }]);
});

test('last-letter mode advances immediately with the same word output scoring', () => {
  const letter = new TypingGame({ words: ['cat', 'dog'], mode: 'endless', advance: 'letter' });
  const space = new TypingGame({ words: ['cat', 'dog'], mode: 'endless', advance: 'space' });
  type(letter, 'cat', 0);
  type(space, 'cat', 0);
  space.press(' ', 400);
  letter.finish(1100);
  space.finish(1100);
  assert.equal(letter.snapshot(1100).word, 'dog');
  assert.equal(letter.result(1100).stats.correctChars, 4);
  assert.equal(letter.result(1100).stats.wpm, space.result(1100).stats.wpm);
  assert.equal(letter.result(1100).stats.bestStreak, 1);
});

test('last-letter mode accepts one habitual separator without an extra attempt or output', () => {
  const game = new TypingGame({ words: ['cat', 'dog'], mode: 'endless', advance: 'letter' });
  type(game, 'cat', 0);
  const before = game.result(300);
  const state = game.press(' ', 400);
  const after = game.result(400);
  assert.equal(state.word, 'dog');
  assert.equal(state.buffer, '');
  assert.equal(state.errorIndex, -1);
  assert.equal(state.correctChars, 4);
  assert.equal(state.keystrokes, 3);
  assert.equal(state.errors, 0);
  assert.deepEqual(after.events, before.events);
  type(game, 'dog ', 400);
  game.finish(1100);
  const result = game.result(1100);
  assert.equal(result.stats.completedWords, 2);
  assert.equal(result.stats.correctChars, 8);
  assert.equal(result.stats.keystrokes, 6);
  assert.equal(result.stats.accuracy, 100);
  assert.equal(result.stats.bestStreak, 2);
  assert.deepEqual(summarizeRun(result), result.stats);
});

test('last-letter separator tolerance does not hide extra or mid-word spaces', () => {
  for (const nextKeys of ['  ', 'd ']) {
    const game = new TypingGame({ words: ['cat', 'dog'], mode: 'endless', advance: 'letter' });
    type(game, 'cat', 0);
    type(game, nextKeys, 300);
    const state = game.snapshot(500);
    assert.equal(state.wordIndex, 1);
    assert.equal(state.buffer, nextKeys === '  ' ? ' ' : 'd ');
    assert.equal(state.errors, 1);
    assert.equal(state.errorIndex, nextKeys === '  ' ? 0 : 1);
    game.press('Backspace', 600);
    type(game, nextKeys === '  ' ? 'dog' : 'og', 600);
    game.finish(1500);
    const result = game.result(1500);
    assert.equal(result.stats.completedWords, 2);
    assert.equal(result.stats.correctChars, 8);
    assert.equal(result.stats.errors, 1);
    assert.equal(result.stats.accuracy, 85.7);
    assert.equal(result.stats.bestStreak, 1);
    assert.deepEqual(summarizeRun(result), result.stats);
  }
});

for (const advance of ['space', 'letter']) {
  for (const targetWpm of [100, 160]) {
    test(`${advance} advancement scores steady ${targetWpm} WPM spaced typing accurately`, () => {
      for (const mode of ['30', '60', '120']) {
        const game = new TypingGame({ words: ['test'], mode, advance });
        const durationMs = Number(mode) * 1000;
        const intervalMs = 12000 / targetWpm;
        const outputChars = durationMs / intervalMs;
        const input = 'test '.repeat(outputChars / 5);
        for (let i = 0; i < input.length; i++) game.press(input[i], i * intervalMs);
        const result = game.result(durationMs);
        assert.equal(result.durationMs, durationMs);
        assert.equal(result.finishedReason, 'time');
        assert.equal(result.stats.wpm, targetWpm);
        assert.equal(result.stats.correctChars, outputChars);
        assert.equal(result.stats.completedWords, outputChars / 5);
        assert.equal(result.stats.keystrokes, outputChars * 4 / 5);
        assert.equal(result.stats.accuracy, 100);
        assert.equal(result.stats.errors, 0);
        assert.equal(game.snapshot(durationMs).wpm, targetWpm);
        assert.deepEqual(summarizeRun(result), result.stats);
      }
    });
  }
}

test('WPM measures net output and accuracy measures attempts, without deletion farming', () => {
  const game = new TypingGame({ words: ['cat'], mode: 'endless' });
  game.press('c', 0);
  game.press('Backspace', 100);
  game.press('c', 200);
  game.press('a', 300);
  game.press('x', 400);
  game.press('Backspace', 500);
  game.press('t', 600);
  game.press(' ', 700);
  game.finish(60000);
  const { stats } = game.result(60000);
  assert.equal(stats.correctChars, 4);
  assert.equal(stats.wpm, 0.8);
  assert.equal(stats.keystrokes, 5);
  assert.equal(stats.errors, 1);
  assert.equal(stats.accuracy, 80);
});

test('timed runs stop at the exact deadline, including when a background tab wakes late', () => {
  for (const mode of TIMED_MODES) {
    const game = new TypingGame({ words: ['cat'], mode });
    game.press('c', 500);
    game.press('a', 1000);
    game.press('t', 500 + Number(mode) * 1000);
    const result = game.result(100000);
    assert.equal(result.durationMs, Number(mode) * 1000);
    assert.equal(result.stats.correctChars, 2);
    assert.equal(result.events.length, 2);
    assert.equal(game.snapshot(100000).finishedReason, 'time');
  }
});

test('each selectable run mode ends on its own terms and leaves live stats to read', () => {
  assert.deepEqual(TIMED_MODES, ['30', '60', '120']);
  assert.ok(['30', '60', '120', '50'].every(mode => MODES.includes(mode)));
  assert.equal(timedSeconds('120'), 120);
  assert.equal(timedSeconds('50'), null);
  assert.equal(timedSeconds('endless'), null);
  for (const mode of ['30', '60', '120', '50']) {
    const game = new TypingGame({ words: ['cat', 'dog'], mode });
    let at = 0;
    for (let word = 0; word < 60; word++) {
      at = type(game, game.snapshot(at).word, at, 100);
      game.press(' ', at += 100);
      if (game.snapshot(at).status === 'finished') break;
    }
    const seconds = timedSeconds(mode);
    const state = game.snapshot(200000);
    assert.equal(state.status, 'finished', mode);
    assert.equal(state.finishedReason, seconds === null ? 'words' : 'time', mode);
    // Live figures stay readable the whole way through, then stop at the end.
    assert.equal(state.remainingMs, seconds === null ? null : 0, mode);
    assert.ok(state.wpm > 0 && state.accuracy === 100, mode);
    const result = game.result(200000);
    assert.equal(result.durationMs, seconds === null ? result.durationMs : seconds * 1000, mode);
    assert.equal(result.stats.completedWords, seconds === null ? 50 : result.stats.completedWords, mode);
    assert.deepEqual(summarizeRun(result), result.stats, mode);
    // Run end detection resets cleanly: the next run starts from nothing.
    const next = new TypingGame({ words: ['cat', 'dog'], mode });
    const fresh = next.snapshot(0);
    assert.equal(fresh.status, 'ready', mode);
    assert.equal(fresh.wordIndex, 0);
    assert.equal(fresh.buffer, '');
    assert.equal(fresh.wpm, 0);
    assert.equal(fresh.accuracy, 100);
    assert.equal(fresh.remainingMs, seconds === null ? null : seconds * 1000, mode);
  }
});

test('50-word runs finish exactly at 50, repeating a short custom passage', () => {
  const game = new TypingGame({ words: ['a', 'b'], mode: '50', advance: 'letter' });
  for (let i = 0; i < 51; i++) game.press(i % 2 ? 'b' : 'a', i * 300);
  const state = game.snapshot(20000);
  const result = game.result(20000);
  assert.equal(state.status, 'finished');
  assert.equal(state.finishedReason, 'words');
  assert.equal(result.stats.completedWords, 50);
  assert.equal(result.stats.bestStreak, 50);
  assert.equal(result.wordTimings.at(-1).index, 49);
});

test('endless repeats the capped passage without ending or losing absolute replay indices', () => {
  const game = new TypingGame({ words: ['a', 'b'], mode: 'endless', advance: 'letter' });
  for (let i = 0; i < 350; i++) game.press(i % 2 ? 'b' : 'a', i * 200);
  assert.equal(game.snapshot(70000).status, 'running');
  assert.equal(game.snapshot(70000).wordIndex, 350);
  game.finish(70000);
  const result = game.result(70000);
  assert.equal(result.words.length, 2);
  assert.equal(result.stats.completedWords, 350);
  assert.equal(result.wordTimings[349].index, 349);
  assert.equal(result.stats.sparkline.length <= 80, true);
});

test('tempo completion waits for its beat, then accelerates and shows the next word', () => {
  const game = new TypingGame({ words: ['cat', 'dog'], mode: 'tempo', paceWpm: 40 });
  type(game, 'cat', 0);
  let state = game.snapshot(500);
  assert.equal(state.waitingForBeat, true);
  assert.equal(state.wordIndex, 0);
  assert.equal(state.beatDurationMs, 1200);
  game.press('x', 600); // Inputs during a completed beat are ignored.
  assert.equal(game.snapshot(600).errors, 0);
  state = game.tick(1300);
  assert.equal(state.word, 'dog');
  assert.equal(state.completedWords, 1);
  assert.equal(state.paceWpm, 41.4);
  assert.equal(state.beatDurationMs < 1200, true);
  assert.equal(game.result(1300).wordTimings[0].typedEnd, 200);
});

test('tempo ends on the third missed beat; partial expired words earn no output', () => {
  const game = new TypingGame({ words: ['cat'], mode: 'tempo', paceWpm: 40 });
  game.press('c', 0);
  const state = game.tick(10000);
  const result = game.result(10000);
  assert.equal(state.status, 'finished');
  assert.equal(state.misses, 3);
  assert.equal(state.finishedReason, 'misses');
  assert.equal(result.durationMs, 3600);
  assert.equal(result.stats.correctChars, 0);
  assert.equal(result.wordTimings.length, 3);
  assert.equal(result.wordTimings.every(row => row.missed), true);
});

test('privacy-safe replay can independently recompute results and contains no typed characters', () => {
  const game = new TypingGame({ words: ['cat'], mode: 'endless', advance: 'letter' });
  game.press('q', 0);
  game.press('Backspace', 100);
  type(game, 'cat', 100);
  game.finish(1000);
  const result = game.result(1000);
  assert.deepEqual(summarizeRun({ ...result, stats: { wpm: 999 } }), result.stats);
  assert.equal(JSON.stringify(result.events).includes('"q"'), false);
  assert.equal(result.events.every(event => Object.keys(event).sort().join(',') === 'index,t,type'), true);
});

test('a claimed completed word without matching replay outcomes earns no output', () => {
  const stats = summarizeRun({
    words: ['elephant'], durationMs: 60000, events: [{ t: 0, type: 'hit', index: 0 }],
    wordTimings: [{ index: 0, start: 0, end: 60000, completed: true, errors: 0 }]
  });
  assert.equal(stats.completedWords, 0);
  assert.equal(stats.correctChars, 1);
  assert.equal(stats.bestStreak, 0);
});

test('passages are deterministic when seeded, capped, and normalized for a keyboard', () => {
  assert.deepEqual(generateWords(50, '2026-10-24'), generateWords(50, '2026-10-24'));
  assert.notDeepEqual(generateWords(50, '2026-10-24'), generateWords(50, '2026-10-25'));
  assert.equal(generateWords(1000).length, 300);
  assert.deepEqual(normalizePassage('  “hello”\nworld’s — here\u200B  '), ['"hello"', "world's", '-', 'here']);
  assert.equal(normalizePassage(Array(400).fill('word').join(' ')).length, 300);
  assert.equal(normalizePassage('a'.repeat(100))[0].length, 64);
});
