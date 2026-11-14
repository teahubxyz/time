import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStats, readStats, createRecorder, runRhythm, finishRun, coachReport, practiceWords, ENOUGH } from '../public/coach.js';
import { TypingGame } from '../src/game.js';
import { VOCABULARY, seededRandom } from '../src/words.js';

// Plays keys into a game at the given gaps and feeds the recorder the way the app does.
function play(words, keys) {
  const stats = emptyStats();
  const game = new TypingGame({words, mode: 'endless'});
  const recorder = createRecorder(stats).reset(game.words);
  let clock = 1000;
  let seen = 0;
  for (const [key, gap] of keys) {
    clock += gap;
    game.press(key, clock);
    while (seen < game.events.length) {
      const event = game.events[seen++];
      recorder.event(event, event.type === 'miss' ? key : '');
    }
  }
  return {stats, run: game.result(clock + 10)};
}
const keysOf = (text, gap) => Array.from(text).map(char => [char, gap]);

test('the coach times clean moves inside words, counts misses and remembers slips', () => {
  const {stats} = play(['the', 'bread'], [...keysOf('the ', 150), ['b', 400], ['r', 420], ['x', 150], ['Backspace', 150], ...keysOf('ead', 150)]);
  assert.equal(stats.keys.r.timed, 1);
  assert.equal(stats.keys.r.ms, 420);
  assert.deepEqual(stats.pairs.br, {n: 1, ms: 420});
  assert.equal(stats.keys.e.miss, 1);
  assert.equal(stats.slips['e x'], 1);
  assert.equal(stats.keys.e.timed, 1, 'the e after a backspace is not timed; the e in "the" is');
  assert.equal(stats.keys.b.timed, 0, 'a word start is not a finger move');
});

test('rhythm separates the gaps inside words from the pause before each word', () => {
  const {run} = play(['ab', 'cd', 'ef'], [['a', 100], ['b', 100], [' ', 100], ['c', 300], ['d', 100], [' ', 100], ['e', 300], ['f', 100]]);
  const rhythm = runRhythm(run);
  assert.equal(rhythm.within, 100);
  assert.equal(rhythm.start, 300);
  assert.equal(rhythm.evenness, 1);
});

test('a weak key is weak for you: slippier or slower than your own usual key', () => {
  const stats = emptyStats();
  for (const key of 'qwertyuiopasdfghjklzxcvbnm') stats.keys[key] = {n: 20, miss: 1, ms: 20 * 150, timed: 20};
  stats.keys.b = {n: 20, miss: 7, ms: 20 * 150, timed: 20};
  stats.keys.y = {n: 20, miss: 1, ms: 20 * 260, timed: 20};
  stats.keys.z = {n: ENOUGH - 1, miss: 0, ms: 0, timed: 0};
  stats.pairs = {br: {n: 6, ms: 6 * 320}, th: {n: 10, ms: 1000}, ty: {n: 2, ms: 900}};
  stats.slips = {'e r': 4, 'f j': 3, 'a p': 1};
  const report = coachReport(stats);
  assert.deepEqual(report.weakest.map(item => item.key).sort(), ['b', 'y']);
  assert.equal(report.keys.q.weakness, 0, 'a key at your usual pace and accuracy is not weak');
  assert.equal(report.keys.z, null);
  assert.ok(report.missing.includes('z'));
  assert.deepEqual(report.pairs.map(item => item.pair), ['br', 'th'], 'pairs need a few samples');
  assert.deepEqual(report.slips.map(slip => slip.kind), ['neighbour', 'mirror']);
  assert.equal(report.hands.slower, 'right');
});

test('your style comes from your recent runs', () => {
  const stats = emptyStats();
  stats.runs = [1, 2, 3].map(() => ({wpm: 60, accuracy: 96, within: 150, start: 420, evenness: 0.5, samples: 40}));
  assert.equal(coachReport(stats).style.name, 'sprinter');
  stats.runs = stats.runs.map(run => ({...run, start: 200, evenness: 0.7}));
  assert.equal(coachReport(stats).style.name, 'metronome');
  assert.equal(coachReport(emptyStats()).style, null);
});

test('a drill leans on weak keys and slow pairs but still reads like words', () => {
  const words = practiceWords({b: 1}, ['br'], VOCABULARY, 200, seededRandom(7));
  const plain = practiceWords({}, [], VOCABULARY, 200, seededRandom(7));
  const share = list => list.filter(word => word.includes('b')).length / list.length;
  assert.equal(words.length, 200);
  assert.ok(share(words) > share(plain) * 2, 'b words come up far more often');
  assert.ok(share(words) < 0.9, 'plain words still mix in');
  assert.ok(words.every(word => VOCABULARY.includes(word)));
  for (let i = 1; i < words.length; i++) assert.notEqual(words[i], words[i - 1]);
});

test('stored coach data is checked, and old counts fade', () => {
  assert.deepEqual(readStats(null), emptyStats());
  assert.deepEqual(readStats({version: 2, keys: {a: {n: 1, miss: 0, ms: 0, timed: 0}}}), emptyStats());
  const read = readStats({version: 1, keys: {a: {n: -1, miss: 0, ms: 0, timed: 0}, b: {n: 3, miss: 5, ms: 10, timed: 1}}, slips: {'e r': 2, junk: 3}, runs: [{wpm: 40, accuracy: 90}, null]});
  assert.deepEqual(Object.keys(read.keys), ['b']);
  assert.equal(read.keys.b.miss, 3);
  assert.deepEqual(read.slips, {'e r': 2});
  assert.equal(read.runs.length, 1);
  const stats = emptyStats();
  stats.keys.a = {n: 500, miss: 50, ms: 50000, timed: 400};
  finishRun(stats, {stats: {keystrokes: 5}});
  assert.equal(stats.keys.a.n, 250);
  assert.equal(stats.runs.length, 0, 'a run too short to say anything is not kept');
});

test('drills teach the coach your keys but stay out of your trend and style', () => {
  const stats = emptyStats();
  const run = wpm => ({stats: {keystrokes: 40, wpm, accuracy: 95}, events: []});
  finishRun(stats, run(70), '2026-11-13');
  finishRun(stats, run(41), '2026-11-13', true);
  finishRun(stats, run(72), '2026-11-13');
  const report = coachReport(stats);
  assert.equal(report.runs, 3);
  assert.deepEqual(report.progress, [70, 72]);
  const again = readStats(JSON.parse(JSON.stringify(stats)));
  assert.deepEqual(again.runs.map(item => Boolean(item.drill)), [false, true, false]);
});
