import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { THEMES, MODES, AUTO, TOKENS, resolveTheme, findTheme, contrast, mix } from '../public/themes.js';

const pack = id => ({vars: resolveTheme(id).vars, scheme: resolveTheme(id).scheme});

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

function boot(saved, dark = false) {
  const props = {}, page = {meta: null};
  const context = {
    localStorage: {getItem: () => saved},
    matchMedia: () => ({matches: dark}),
    document: {
      documentElement: {style: {setProperty: (key, value) => { props[key] = value; }, colorScheme: ''}},
      querySelector: () => ({setAttribute: (name, value) => { page.meta = value; }})
    }
  };
  return readFile(new URL('../public/boot.js', import.meta.url), 'utf8').then(code => {
    vm.runInNewContext(code, context);
    return {props, meta: page.meta, scheme: context.document.documentElement.style.colorScheme};
  });
}

test('boot.js paints the kept theme before the app loads', async () => {
  const nord = await boot(JSON.stringify({id: 'nord', ...pack('nord')}));
  assert.equal(nord.props['--paper'], resolveTheme('nord').vars.paper);
  assert.equal(nord.props['--accent'], resolveTheme('nord').vars.accent);
  assert.equal(nord.scheme, 'dark');
  assert.equal(nord.meta, resolveTheme('nord').vars.paper);
  const auto = {id: 'auto', light: pack(AUTO.light), dark: pack(AUTO.dark)};
  assert.equal((await boot(JSON.stringify(auto), true)).props['--paper'], resolveTheme(AUTO.dark).vars.paper);
  assert.equal((await boot(JSON.stringify(auto), false)).props['--paper'], resolveTheme(AUTO.light).vars.paper);
});

test('boot.js ignores missing, broken or hostile storage', async () => {
  assert.deepEqual((await boot(null)).props, {});
  assert.deepEqual((await boot('{not json')).props, {});
  const hostile = await boot(JSON.stringify({id: 'x', scheme: 'dark', vars: {paper: 'url(https://example.com)', 'a;b': '#000000', ink: '#ffffff'}}));
  assert.deepEqual(hostile.props, {'--ink': '#ffffff'});
});
