import test from 'node:test';
import assert from 'node:assert/strict';
import { PROGRESSION, RANGE, chordFor, keyPosition, melody, velocityFor, createConductor } from '../public/music.js';
import { TypingGame } from '../src/game.js';

test('every chord tone and bass note sits inside its bar’s scale', () => {
  assert.equal(PROGRESSION.length, 8);
  for (const chord of PROGRESSION) {
    for (const midi of [chord.bass, ...chord.voicing]) assert.ok(chord.scale.includes(midi % 12), chord.name + ' has ' + midi);
  }
});

test('the loop wraps both ways', () => {
  assert.equal(chordFor(8), chordFor(0));
  assert.equal(chordFor(17), chordFor(1));
  assert.equal(chordFor(-1), chordFor(7));
});

test('a word’s tune has a note per letter, in range and in its bar’s scale, the same every time', () => {
  const words = ['breathe', 'the', 'quick', 'pneumonoultramicroscopicsilicovolcanoconiosis', 'aaaa', 'qpqpqpqp', 'don’t', 'Café', 'Straße', '漢字', '42', 'x'.repeat(64), ''];
  for (let bar = 0; bar < 16; bar++) {
    for (const word of words) {
      const tune = melody(word, bar);
      assert.equal(tune.length, Array.from(word).length);
      for (const midi of tune) {
        assert.ok(midi >= RANGE[0] && midi <= RANGE[1], word + ' leaves the range');
        assert.ok(chordFor(bar).scale.includes(midi % 12), word + ' leaves the scale in bar ' + bar);
      }
      assert.deepEqual(melody(word, bar), tune);
    }
  }
});

test('doubled letters repeat, keys to the right climb and keys to the left fall', () => {
  const hello = melody('hello', 0);
  assert.equal(hello[2], hello[3]);
  for (const bar of [0, 4]) {
    const up = melody('qwerty', bar);
    const down = melody('poiuyt', bar);
    for (let i = 1; i < up.length; i++) assert.ok(up[i] > up[i - 1], 'qwerty climbs in bar ' + bar);
    for (let i = 1; i < down.length; i++) assert.ok(down[i] < down[i - 1], 'poiuyt falls in bar ' + bar);
  }
});

test('capitals, accents and curly quotes sit on their plain keys', () => {
  assert.deepEqual(keyPosition('E'), keyPosition('e'));
  assert.deepEqual(keyPosition('é'), keyPosition('e'));
  assert.deepEqual(keyPosition('’'), keyPosition("'"));
  assert.deepEqual(keyPosition('?'), keyPosition('/'));
  const elsewhere = keyPosition('漢');
  assert.ok(elsewhere.x >= 0 && elsewhere.x < 11);
});

test('notes after a pause land harder, quick runs play lighter, a word leans into its first letter', () => {
  assert.ok(velocityFor(60) < velocityFor(300));
  assert.ok(velocityFor(300) < velocityFor(900));
  assert.equal(velocityFor(5000), velocityFor(900));
  assert.ok(velocityFor(200, true) > velocityFor(200));
  assert.ok(velocityFor(null) > 0 && velocityFor(null) < 1);
});

test('the conductor turns a run into chords, notes, muted notes and ticks', () => {
  const conductor = createConductor(['ab', 'cd']);
  const actions = [
    {t: 0, type: 'hit', index: 0},
    {t: 120, type: 'miss', index: 0},
    {t: 300, type: 'backspace', index: 0},
    {t: 420, type: 'hit', index: 0},
    {t: 600, type: 'advance', index: 0},
    {t: 700, type: 'hit', index: 1}
  ].flatMap(event => conductor.event(event));
  assert.deepEqual(actions.map(action => action.type), ['chord', 'note', 'dead', 'tick', 'note', 'chord', 'note']);
  const ab = melody('ab', 0);
  assert.equal(actions[0].bar, 0);
  assert.equal(actions[1].midi, ab[0]);
  assert.equal(actions[2].midi, ab[1], 'a miss thumps where its letter’s note would be');
  assert.equal(actions[4].midi, ab[1], 'after a backspace the letter lands on the same note');
  assert.equal(actions[5].bar, 1);
  assert.equal(actions[6].midi, melody('cd', 1)[0]);
});

test('tempo beats change the chord on the beat and mark a missed one', () => {
  const conductor = createConductor(['ab', 'cd', 'ef']);
  const chords = [
    {t: 0, type: 'hit', index: 0}, {t: 100, type: 'hit', index: 0},
    {t: 900, type: 'beat', index: 0}, {t: 1800, type: 'beat', index: 1}
  ].flatMap(event => conductor.event(event)).filter(action => action.type === 'chord');
  assert.deepEqual(chords.map(chord => [chord.bar, chord.missed]), [[0, false], [1, false], [2, true]]);
});

test('a replay makes exactly the music its live run made', () => {
  const game = new TypingGame({words: ['the', 'quick', 'brown', 'fox'], mode: 'endless'});
  const live = createConductor(game.words);
  const heard = [];
  let seen = 0;
  let clock = 1000;
  for (const key of ['t', 'h', 'x', 'Backspace', 'e', ' ', 'q', 'u', 'i', 'c', 'k', ' ', 'b', 'r']) {
    clock += 90 + (clock % 7) * 23;
    game.press(key, clock);
    while (seen < game.events.length) heard.push(...live.event(game.events[seen++]));
  }
  const run = game.result(clock + 50);
  const replay = createConductor(run.words);
  assert.deepEqual(run.events.flatMap(event => replay.event(event)), heard);
  assert.equal(heard.filter(action => action.type === 'chord').length, 3);
  assert.equal(heard.filter(action => action.type === 'dead').length, 1);
});
