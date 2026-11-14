import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

// themes.js is a classic <head> script, so the tests run it the way a page does.
const code = await readFile(new URL('../public/themes.js', import.meta.url), 'utf8');
const load = (sandbox = {}) => { vm.runInNewContext(code, sandbox); return sandbox.typyThemes; };
const { THEMES, MODES, AUTO, TOKENS, DEFAULT, resolveTheme, findTheme, contrast, mix } = load();

function boot(saved, dark = false) {
  const props = {}, page = {meta: null};
  const sandbox = {
    localStorage: {getItem: () => saved},
    matchMedia: () => ({matches: dark}),
    document: {
      documentElement: {style: {setProperty: (key, value) => { props[key] = value; }, colorScheme: ''}},
      querySelector: () => ({setAttribute: (name, value) => { page.meta = value; }})
    }
  };
  const {start} = load(sandbox);
  return {start, props, meta: page.meta, scheme: sandbox.document.documentElement.style.colorScheme};
}

test('every theme resolves every token to a colour, under a unique id', () => {
  const ids = new Set();
  for (const theme of THEMES) {
    assert.ok(!ids.has(theme.id), 'duplicate id ' + theme.id);
    ids.add(theme.id);
    assert.match(theme.scheme, /^(light|dark)$/, theme.id);
    const {vars} = resolveTheme(theme);
    for (const token of TOKENS) assert.match(vars[token], /^#[0-9a-f]{6}([0-9a-f]{2})?$/i, theme.id + ' ' + token);
  }
  assert.equal(resolveTheme(AUTO.light).scheme, 'light');
  assert.equal(resolveTheme(AUTO.dark).scheme, 'dark');
  for (const mode of MODES) assert.equal(findTheme(mode.id), null, mode.id + ' is a mode, not a theme');
});

test('every theme keeps the stage readable', () => {
  for (const theme of THEMES) {
    const v = resolveTheme(theme).vars, id = theme.id;
    assert.ok(contrast(v.ink, v.paper) >= 7, id + ': typed letters stand out');
    assert.ok(contrast(v.word, v.paper) >= 3, id + ': the word to type is legible');
    assert.ok(contrast(v.ink, v.word) >= 1.6, id + ': typed and untyped letters differ');
    assert.ok(contrast(v.context, v.paper) >= 1.8, id + ': neighbouring words show');
    assert.ok(contrast(v.word, v.context) >= 1.2, id + ': the next word sits behind the target');
    const faint = contrast(v.faint, v.paper);
    assert.ok(faint >= 1.25 && faint < contrast(v.context, v.paper), id + ': the word after next is fainter still');
    assert.ok(contrast(v.accent, v.paper) >= 2.2, id + ': the cursor shows');
    assert.ok(contrast(v.error, v['error-soft']) >= 3, id + ': mistakes read on their highlight');
    assert.ok(contrast(v.muted, v.paper) >= 3, id + ': secondary text');
  }
});

test('the typy theme is exactly the stylesheet default', async () => {
  const css = await readFile(new URL('../public/style.css', import.meta.url), 'utf8');
  const root = css.match(/:root\{([^}]*)\}/)[1];
  const {vars} = resolveTheme('typy');
  for (const token of TOKENS) assert.ok(root.includes('--' + token + ':' + vars[token] + ';'), token + ' matches :root');
});

test('mixing and contrast are the usual sums', () => {
  assert.equal(mix('#ffffff', '#000000', .5), '#808080');
  assert.equal(mix('#ff0000', '#0000ff', 0), '#0000ff');
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
  assert.equal(contrast('#777777', '#777777'), 1);
});

test('a first visit paints a random theme before the page renders', () => {
  assert.equal(DEFAULT, 'random');
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const b = boot(null);
    assert.equal(b.start.choice, 'random');
    assert.equal(b.start.explicit, false);
    const theme = resolveTheme(b.start.shown);
    assert.ok(theme, 'a real theme');
    assert.equal(b.props['--paper'], theme.vars.paper);
    assert.equal(b.props['--accent'], theme.vars.accent);
    assert.equal(b.scheme, theme.scheme);
    assert.equal(b.meta, theme.vars.paper);
    seen.add(b.start.shown);
  }
  assert.ok(seen.size > 3, 'the default really varies');
});

test('random never deals the same theme twice running', () => {
  for (let i = 0; i < 40; i++) assert.notEqual(boot(JSON.stringify({pick: 'nord'})).start.shown, 'nord');
  for (let i = 0; i < 20; i++) assert.notEqual(boot(JSON.stringify({id: 'random', pick: 'riso'})).start.shown, 'riso');
});

test('a kept theme, or auto, paints exactly that', () => {
  const nord = boot(JSON.stringify({id: 'nord'}));
  assert.deepEqual([nord.start.choice, nord.start.explicit, nord.start.shown], ['nord', true, 'nord']);
  assert.equal(nord.props['--accent'], resolveTheme('nord').vars.accent);
  assert.equal(nord.scheme, 'dark');
  assert.equal(boot(JSON.stringify({id: 'auto'}), true).start.shown, AUTO.dark);
  assert.equal(boot(JSON.stringify({id: 'auto'}), false).start.shown, AUTO.light);
  // Older saves carried colours too; only the id counts now.
  assert.equal(boot(JSON.stringify({id: 'oat', vars: {paper: '#000000'}})).props['--paper'], resolveTheme('oat').vars.paper);
});

test('broken or hostile storage falls back to the default', () => {
  for (const saved of ['{not json', JSON.stringify({id: 'url(x)', pick: '<script>'}), JSON.stringify('nord'), 'null']) {
    const b = boot(saved);
    assert.equal(b.start.choice, 'random');
    assert.equal(b.start.explicit, false);
    assert.ok(findTheme(b.start.shown));
    assert.ok(Object.keys(b.props).every(key => /^--[a-z-]+$/.test(key)));
  }
});
