// Self-check for the pure helpers: node ventures/box-art-night/test.js
const assert = require('assert');
const { hash, parseStats, wrap } = require('./app.js');
assert.strictEqual(hash('a'), hash('a'));
assert.notStrictEqual(hash('a'), hash('b'));
assert.deepStrictEqual(parseStats('Players: 1\n\n Price : Free: yes \nNo colon\nx: y\nz: w', 4),
  [['Players', '1'], ['Price', 'Free: yes'], ['', 'No colon'], ['x', 'y']]);
const m = s => s.length * 10;
assert.deepStrictEqual(wrap(m, 'aa bb cc dd', 50, 5), ['aa bb', 'cc dd']);
assert.deepStrictEqual(wrap(m, 'aa bb cc dd', 50, 1), ['aa b…'.length * 10 <= 50 ? 'aa b…' : 'aa…']);
assert.deepStrictEqual(wrap(m, '', 50, 2), []);
console.log('ok');
