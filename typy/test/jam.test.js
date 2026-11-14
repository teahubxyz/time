import test from 'node:test';
import assert from 'node:assert/strict';
import { NEWLINE, jamKey, typeKey, jamText, jamStats } from '../src/jam.js';
import { createJamConductor, melody, chordFor } from '../public/music.js';

const keysOf = (text, gap = 100) => Array.from(text).map((key, i) => [i * gap, key]);

test('a jam keeps printable keys, Backspace and Enter, and nothing invisible', () => {
  for (const key of ['a', 'Z', '7', '.', ' ', 'é', '😀', 'Backspace', 'Enter']) assert.equal(jamKey(key), true, key);
  for (const key of ['', 'ab', 'Shift', 'Tab', NEWLINE, String.fromCharCode(0), String.fromCharCode(127), String.fromCharCode(0x202e), String.fromCharCode(0x200b), 5, null]) assert.equal(jamKey(key), false, String(key));
});

test('keys make the page: Enter starts a line and Backspace takes one character away', () => {
  assert.equal(jamText([[0, 'h'], [10, 'i'], [20, 'Enter'], [30, 'y'], [40, 'Backspace'], [50, '😀']]), 'hi' + NEWLINE + '😀');
  assert.deepEqual(typeKey(['a'], 'Backspace'), []);
  assert.deepEqual(typeKey([], 'Backspace'), []);
});

test('stats count what is left on the page and every key that was played', () => {
  const keys = [...keysOf('hello world'), [1100, 'Backspace'], [1200, 'd'], [4000, '!']];
  const stats = jamStats(keys);
  assert.equal(stats.durationMs, 4000);
  assert.equal(stats.chars, 12);
  assert.equal(stats.words, 2);
  assert.equal(stats.notes, 12, 'ten letters, the retyped d and the !');
  assert.equal(stats.fixes, 1);
  assert.equal(stats.wpm, 36);
  assert.equal(stats.longestFlowMs, 1200, 'the pause before ! ends the flow');
  assert.equal(stats.flowWpm, 110, 'flow counts keys typed without a pause, not Backspace');
  assert.deepEqual(jamStats([]), {durationMs: 0, chars: 0, words: 0, notes: 0, fixes: 0, wpm: 0, flowWpm: 0, longestFlowMs: 0});
});

test('the jam conductor sings each word as it is typed and moves the harmony on spaces', () => {
  const conductor = createJamConductor();
  const play = (key, t) => conductor.key(key, t);
  assert.deepEqual(play('h', 0).map(action => action.type), ['chord', 'note']);
  assert.equal(play('i', 120)[0].midi, melody('hi', 0)[1], 'each letter is the next note of the word so far');
  assert.deepEqual(play(' ', 240), [{type: 'chord', bar: 1, missed: false}]);
  assert.deepEqual(play(' ', 300), [], 'a second space adds nothing');
  play('y', 400); play('o', 500); play('.', 600);
  assert.equal(play(' ', 700)[0].bar, 8, 'the end of a sentence goes home');
  assert.deepEqual(play('Backspace', 800), [{type: 'tick'}]);
  assert.equal(play('Enter', 900)[0].bar, 16, 'a new line goes home too');
  assert.deepEqual(play('Enter', 950), [], 'a blank line is quiet');
  assert.equal(conductor.chord.name, chordFor(16).name);
  assert.deepEqual(createJamConductor().key('Backspace', 0), [], 'nothing to take back yet');
  assert.deepEqual(createJamConductor().key(' ', 0), [], 'leading spaces are quiet');
});

test('playback rebuilds the same music from the same keys', () => {
  const keys = keysOf('one quiet morning. the river moves', 90);
  const run = () => { const conductor = createJamConductor(); return keys.flatMap(([t, key]) => conductor.key(key, t)); };
  assert.deepEqual(run(), run());
  assert.equal(run().filter(action => action.type === 'chord').length, 6, 'the first chord, then one for each new word');
});
