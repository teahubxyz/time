import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingGame, summarizeRun } from '../src/game.js';
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
  for (const mode of ['30', '60']) {
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
