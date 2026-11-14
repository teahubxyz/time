import test from 'node:test';
import assert from 'node:assert/strict';
import { KEEP, BUDGET, runEntry, jamEntry, readHistory, addEntry, whenLabel } from '../public/history.js';

const result = (wpm, events = 10) => ({run: {mode: '30', words: ['a', 'b'], stats: {wpm, accuracy: 98}, events: Array.from({length: events}, (_, i) => ({t: i, type: 'hit', index: 0})), wordTimings: []}, source: {kind: 'common'}, local: false});

test('history keeps whole runs to open again, and a jam’s keys', () => {
  const entry = runEntry(result(50), 1000);
  assert.equal(entry.kind, 'run');
  assert.equal(entry.result.local, true, 'a run from history is yours again');
  assert.equal(entry.result.run.events.length, 10);
  const big = runEntry(result(50, 9000));
  assert.equal(big.result.run.events.length, 0, 'too big to replay: the score stays, the replay goes');
  assert.equal(big.result.replayDropped, true);
  const jam = jamEntry({keys: [[0, 'h'], [90, 'i']], id: 'abc', name: 'bun'}, 2000);
  assert.deepEqual([jam.kind, jam.keys.length, jam.shareId, jam.name], ['jam', 2, 'abc', 'bun']);
});

test('history is newest first, capped, within its budget, and checked when read', () => {
  let entries = [];
  for (let i = 0; i < KEEP + 5; i++) entries = addEntry(entries, runEntry(result(i), i));
  assert.equal(entries.length, KEEP);
  assert.equal(entries[0].result.run.stats.wpm, KEEP + 4, 'the newest comes first');
  let packed = [];
  for (let i = 0; i < 12; i++) packed = addEntry(packed, runEntry(result(i, 5500), i));
  assert.ok(JSON.stringify(packed).length <= BUDGET);
  assert.ok(packed.length > 1 && packed.length < 12);
  assert.equal(packed[0].result.run.stats.wpm, 11);
  assert.deepEqual(readHistory('nope'), []);
  assert.deepEqual(readHistory([null, {kind: 'run', id: 'x', at: 1}, {kind: 'jam', id: 'y', at: 2, keys: []}]), []);
  assert.equal(readHistory([jamEntry({keys: [[0, 'a']]}, 5)]).length, 1);
});

test('history says when, the way a person would', () => {
  const now = new Date(2026, 10, 13, 22, 10).getTime();
  assert.match(whenLabel(new Date(2026, 10, 13, 21, 41).getTime(), now), /^today 9:41/);
  assert.match(whenLabel(new Date(2026, 10, 12, 8, 2).getTime(), now), /^yesterday 8:02/);
  assert.equal(whenLabel(new Date(2026, 10, 2, 8, 2).getTime(), now), 'nov 2');
});
