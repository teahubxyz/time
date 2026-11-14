// Independent browser acceptance for time#254. No production mutations.
// Local preview intentionally has unavailable API routes; marked tests use mocks.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { TypingGame } from '../src/game.js';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright' : 'playwright');
const base = process.env.TYPY_QA_URL || 'http://127.0.0.1:8788';
const evidence = path.resolve(import.meta.dirname, '../evidence');
await fs.mkdir(evidence, { recursive: true });
const findings = [];
const checks = [];
const errors = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.TYPY_CHROME || chromium.executablePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await desktop.newPage();
page.on('pageerror', error => errors.push(error.message));
const check = async (name, fn) => {
  try { const detail = await fn(); checks.push({ name, status: 'PASS', detail }); console.log('PASS', name); }
  catch (error) { findings.push({ name, message: error.message }); checks.push({ name, status: 'FAIL', error: error.message }); console.log('FAIL', name, error.message); }
};
async function home(p = page) { await p.goto(base + '/'); await p.locator('#word[data-word]').waitFor(); }
async function paste(text, p = page) {
  await p.locator('#source-open').click();
  await p.locator('#tab-paste').click();
  await p.locator('#paste-input').fill(text);
  await p.locator('#source-paste button[type=submit]').click();
}
async function setting(advance, preview = true, p = page) {
  await p.locator('#settings-open').click();
  await p.locator('#advance-setting').selectOption(advance);
  await p.locator('#preview-setting').setChecked(preview);
  await p.locator('#settings-done').click();
}
async function endlessResult() {
  await page.locator('[data-mode=endless]').click();
  await paste('a b');
  await setting('letter');
  await page.keyboard.type('abab', { delay: 35 });
  await page.keyboard.press('Enter');
  await page.locator('#result-panel').waitFor({ state: 'visible' });
}

await check('desktop ready stage and no horizontal overflow', async () => {
  await home();
  assert.equal(await page.locator('#word').getAttribute('data-word'), 'breathe');
  assert.equal(await page.locator('#run-status').innerText(), 'a fresh start');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.screenshot({ path: path.join(evidence, 'desktop.png'), fullPage: true });
});
await check('first letter starts; mistake highlights; Backspace corrects; Space advances', async () => {
  await page.keyboard.type('b');
  assert.equal(await page.locator('#word .correct').count(), 1);
  assert.equal(await page.locator('#status-dot').evaluate(element => element.classList.contains('active')), true);
  await page.keyboard.type('x');
  assert.equal(await page.locator('#word .incorrect').count(), 1);
  await page.keyboard.press('Backspace');
  assert.equal(await page.locator('#word .incorrect').count(), 0);
  await page.keyboard.type('reathe');
  assert.equal(await page.locator('#word-number').innerText(), '001');
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#word-number').innerText(), '002');
  await page.screenshot({ path: path.join(evidence, 'desktop-playing.png'), fullPage: true });
});
await check('Escape resets a run and settings switch to last-letter advancement', async () => {
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#word-number').innerText(), '001');
  assert.equal(await page.locator('#status-dot').evaluate(element => element.classList.contains('active')), false);
  await setting('letter', false);
  assert.equal(await page.locator('#upcoming').isVisible(), false);
  await page.keyboard.type('breathe');
  assert.equal(await page.locator('#word-number').innerText(), '002');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('typy.settings')));
  assert.deepEqual(saved, { advance: 'letter', preview: false, view: 'word' });
});
await check('custom passage completes 50-word mode with a result card', async () => {
  await page.locator('[data-mode="50"]').click();
  await paste('a b');
  await page.keyboard.type('ab'.repeat(25), { delay: 25 });
  await page.locator('#result-panel').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#result-words').innerText(), '50');
  assert.equal(await page.locator('#result-accuracy').innerText(), '100%');
  assert.equal(await page.locator('#result-streak').innerText(), '50 words');
  assert.equal(await page.locator('#speed-chart path').count() >= 2, true);
  assert.match(await page.locator('#result-note').innerText(), /public/, 'the result card must say a shared replay link is public');
  assert.equal(await page.locator('#again-button').isVisible(), true);
  await page.screenshot({ path: path.join(evidence, 'result.png'), fullPage: true });
});
await check('replay plays and scrubber moves between original words', async () => {
  await page.locator('#replay-button').click();
  await page.locator('#replay-play').click();
  assert.equal(await page.locator('#replay-controls').isVisible(), true);
  await page.locator('#replay-scrubber').evaluate(input => { input.value = '0'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await page.locator('#word .cursor').count(), 1, 'the replay follows the original run with a ghost cursor');
  const first = Number(await page.locator('#word-number').innerText());
  await page.locator('#replay-scrubber').evaluate(input => { input.value = String(Number(input.max) * .8); input.dispatchEvent(new Event('input', { bubbles: true })); });
  const later = Number(await page.locator('#word-number').innerText());
  assert.equal(later > first, true);
  await page.locator('#replay-back').click();
  assert.equal(await page.locator('#result-panel').isVisible(), true);
});
await check('keyboard Enter activates a focused result Replay button', async () => {
  await page.locator('#replay-button').focus();
  await page.keyboard.press('Enter');
  const replayVisible = await page.locator('#replay-controls').isVisible();
  if (!replayVisible) await page.screenshot({ path: path.join(evidence, 'keyboard-replay-bug.png'), fullPage: true });
  assert.equal(replayVisible, true, 'Enter on the focused Replay button restarted the run instead of replaying it.');
});
await check('endless can end with Enter and preserves results on failed sharing', async () => {
  await home();
  await endlessResult();
  assert.equal(await page.locator('#result-words').innerText(), '4');
  await page.locator('#share-button').click();
  await page.locator('#save-result').click();
  await page.locator('#share-error').waitFor({ state: 'visible' });
  assert.equal((await page.locator('#share-error').innerText()).length > 5, true);
  assert.equal(await page.locator('#save-result').isEnabled(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#result-panel').isVisible(), true);
});
await check('keyboard Enter opens a focused settings button during an endless run', async () => {
  await home();
  await page.locator('[data-mode=endless]').click();
  await page.keyboard.type('b');
  await page.locator('#settings-open').focus();
  await page.keyboard.press('Enter');
  const open = await page.locator('#settings-dialog').isVisible();
  if (!open) await page.screenshot({ path: path.join(evidence, 'keyboard-settings-bug.png'), fullPage: true });
  assert.equal(open, true, 'Enter on the focused settings button finished the endless run instead of opening settings.');
  await page.keyboard.press('Escape');
});
await check('ramp mode shows its target pace and dims the word when it gets ahead', async () => {
  await home();
  await page.evaluate(() => localStorage.setItem('typy.lastAverage', '30'));
  await home();
  await page.locator('[data-mode=tempo]').click();
  await paste('elephant giraffe');
  assert.equal(await page.locator('#tempo-track').isVisible(), true);
  await page.keyboard.type('e');
  assert.equal(await page.locator('#time-label').innerText(), 'beat pace');
  assert.equal(Number(await page.locator('#live-time').innerText()) > 0, true);
  await page.locator('#word.behind').waitFor({ timeout: 8000 });
  assert.match(await page.locator('#tempo-caption').innerText(), /pace is ahead/);
  await page.keyboard.type('lephant');
  assert.equal(await page.locator('#word.behind').count(), 0, 'catching the pace lifts the dimming');
  await page.evaluate(() => localStorage.removeItem('typy.lastAverage'));
});
await check('unavailable topic API presents a friendly error and common-word recovery', async () => {
  await page.goto(base + '/react-hooks');
  await page.locator('#load-actions').waitFor({ state: 'visible' });
  assert.equal((await page.locator('#load-description').innerText()).length > 5, true);
  await page.locator('#load-common').click();
  assert.equal(await page.locator('#word').getAttribute('data-word'), 'breathe');
});
await check('daily route locks to 60 seconds (mock API response)', async () => {
  await page.route('**/api/daily', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ day: '2026-10-24', words: ['a', 'b', 'c'] }) }));
  await page.goto(base + '/daily');
  await page.locator('#word[data-word="a"]').waitFor();
  assert.equal(await page.locator('[data-mode="60"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-mode="30"]').isDisabled(), true);
  assert.equal(await page.locator('#footer-board').isVisible(), true);
  await page.unroute('**/api/daily');
});
await check('pasted markup is rendered as inert text', async () => {
  await home();
  await paste('<img src=x onerror=globalThis.typyInjected=1> safe');
  assert.equal(await page.locator('#word').getAttribute('data-word'), '<img');
  assert.equal(await page.locator('#word img').count(), 0);
  assert.equal(await page.evaluate(() => globalThis.typyInjected), undefined);
});

await check('themes: Alt+T opens the picker, arrows preview, Esc puts back, Enter keeps across a reload', async () => {
  await page.evaluate(() => localStorage.setItem('typy.theme', JSON.stringify({ id: 'typy' })));
  await home();
  const paper = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--paper').trim());
  const start = await paper();
  await page.keyboard.press('Alt+KeyT');
  await page.locator('#theme-dialog[open]').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.theme), 'typy');
  await page.keyboard.press('ArrowRight');
  assert.notEqual(await paper(), start, 'moving to another theme previews it');
  await page.keyboard.press('Escape');
  await page.locator('#theme-dialog').waitFor({ state: 'hidden' });
  assert.equal(await paper(), start, 'Esc puts the kept theme back');
  await page.locator('#theme-open').click();
  await page.locator('#theme-search').fill('nord');
  await page.keyboard.press('Enter');
  assert.equal(await paper(), '#2e3440');
  assert.equal(await page.locator('#theme-name').innerText(), 'nord');
  await page.reload();
  await page.locator('#word[data-word]').waitFor();
  assert.equal(await paper(), '#2e3440', 'the kept theme survives a reload');
  await page.evaluate(() => localStorage.removeItem('typy.theme'));
  await home();
  assert.match(await page.locator('#theme-name').innerText(), /^random · /, 'with nothing kept, a random theme is dealt');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('typy.theme')).id), undefined, 'the default is not saved as a choice');
});

await check('music: silent until the note button, then letters, words and replays play; Alt+M and a reload keep the choice', async () => {
  const listening = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await listening.addInitScript(() => {
    window.__audio = { contexts: 0, oscillators: 0 };
    const create = BaseAudioContext.prototype.createOscillator;
    BaseAudioContext.prototype.createOscillator = function (...args) { window.__audio.oscillators++; return create.apply(this, args); };
    const Native = window.AudioContext;
    window.AudioContext = class extends Native { constructor(...args) { super(...args); window.__audio.contexts++; } };
  });
  const p = await listening.newPage();
  p.on('pageerror', error => errors.push(error.message));
  const heard = () => p.evaluate(() => ({ ...window.__audio }));
  await home(p);
  assert.equal(await p.locator('#music-toggle').getAttribute('aria-pressed'), 'false');
  await p.keyboard.type('bre');
  assert.deepEqual(await heard(), { contexts: 0, oscillators: 0 }, 'no audio at all while music is off');
  await p.locator('#music-toggle').click();
  assert.equal(await p.locator('#music-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal(await p.evaluate(() => localStorage.getItem('typy.music')), 'true');
  const hello = (await heard()).oscillators;
  assert.ok(hello > 0, 'turning music on plays a chord');
  await p.keyboard.type('athe ');
  const played = (await heard()).oscillators;
  assert.ok(played > hello, 'letters and the next word play');
  await p.keyboard.press('Alt+KeyM');
  assert.equal(await p.locator('#music-toggle').getAttribute('aria-pressed'), 'false');
  assert.equal(await p.evaluate(() => localStorage.getItem('typy.music')), 'false');
  await p.keyboard.type('xyz');
  assert.equal((await heard()).oscillators, played, 'nothing plays after Alt+M turns music off');
  await p.keyboard.press('Alt+KeyM');
  await p.locator('[data-mode=endless]').click();
  for (let i = 0; i < 2; i++) await p.keyboard.type(await p.locator('#word').getAttribute('data-word') + ' ', { delay: 60 });
  await p.keyboard.press('Enter');
  await p.locator('#result-panel').waitFor();
  const beforeReplay = (await heard()).oscillators;
  await p.locator('#replay-button').click();
  await p.waitForTimeout(900);
  assert.ok((await heard()).oscillators > beforeReplay, 'a replay plays its run back as music');
  await p.reload();
  await p.locator('#word[data-word]').waitFor();
  assert.equal(await p.locator('#music-toggle').getAttribute('aria-pressed'), 'true', 'the choice survives a reload');
  assert.equal((await heard()).contexts, 0, 'audio waits for a gesture after a reload');
  await listening.close();
});

await check('a shared race shows its verdict and plays both runs back on one clock (mock API)', async () => {
  const words = ['steady', 'hands', 'make', 'light', 'work', 'of', 'long', 'days'];
  const record = gap => {
    const game = new TypingGame({ words, mode: 'endless' });
    let t = 1000;
    for (const word of words.slice(0, 6)) { for (const char of word) { t += gap; game.press(char, t); } t += gap; game.press(' ', t); }
    game.finish(t + 20);
    return game.result(t + 20);
  };
  const ghostId = 'b'.repeat(24), raceId = 'a'.repeat(24);
  const rival = { id: ghostId, run: record(120), source: { kind: 'common' }, name: 'juno' };
  const racer = { id: raceId, run: record(90), source: { kind: 'common' }, name: 'mira', raceOf: ghostId };
  const watching = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const p = await watching.newPage();
  p.on('pageerror', error => errors.push(error.message));
  await p.route('**/api/results/*', route => {
    const id = new URL(route.request().url()).pathname.split('/').pop();
    const body = id === raceId ? racer : id === ghostId ? rival : null;
    return route.fulfill({ status: body ? 200 : 404, contentType: 'application/json', body: JSON.stringify(body || { error: 'not found' }) });
  });
  await p.goto(base + '/r/' + raceId);
  await p.locator('#race-outcome').waitFor();
  assert.equal(await p.locator('#result-title').innerText(), 'mira beat juno.');
  assert.match(await p.locator('#race-verdict').innerText(), /^won by [0-9]+ wpm$/);
  assert.equal(await p.locator('#replay-label').innerText(), 'watch the race');
  await p.locator('#replay-button').click();
  await p.locator('#race-duel').waitFor();
  assert.equal(await p.locator('#duel-them-name').innerText(), 'juno');
  assert.equal(await p.locator('#duel-you-name').innerText(), 'mira');
  assert.equal(await p.locator('#ghost-lane').isHidden(), true, 'two equal lanes replace the small ghost lane');
  const sizes = await p.evaluate(() => ['duel-you-words', 'duel-them-words'].map(id => getComputedStyle(document.getElementById(id)).fontSize));
  assert.equal(sizes[0], sizes[1], 'both runs show at the same size');
  assert.equal(await p.locator('#race-chart path.race-line').count(), 2, 'the timeline draws both runs');
  assert.equal(await p.locator('#race-you-label').innerText(), 'mira');
  assert.equal(await p.locator('#run-status').innerText(), 'the race, replayed');
  const length = Number(await p.locator('#replay-scrubber').getAttribute('max'));
  assert.equal(length, Math.max(racer.run.durationMs, rival.run.durationMs), 'the replay runs until the slower run is over');
  await p.locator('#replay-scrubber').fill(String(length));
  await p.locator('#replay-scrubber').dispatchEvent('input');
  assert.match(await p.locator('#duel-them-pace').innerText(), /^done · [0-9]+ wpm$/);
  assert.match(await p.locator('#duel-you-pace').innerText(), /^done · [0-9]+ wpm$/);
  assert.equal(await p.locator('#race-them').innerText(), '6');
  assert.equal(await p.locator('#race-playhead').getAttribute('transform'), 'translate(900.0 0)');
  const chart = await p.locator('#race-chart').boundingBox();
  await p.mouse.click(chart.x + chart.width / 2, chart.y + chart.height / 2);
  const middle = Number(await p.locator('#replay-scrubber').inputValue());
  assert.ok(Math.abs(middle - length / 2) <= length * 0.05, 'clicking the timeline seeks to that moment: ' + middle + ' of ' + length);
  assert.equal((await p.locator('#duel-them-pace').innerText()).startsWith('done'), false, 'halfway through, the ghost is still racing');
  await watching.close();
});

await check('line view: lines wrap to the stage, the cursor rides the current line, and a finished line moves up', async () => {
  const lineContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const p = await lineContext.newPage();
  p.on('pageerror', error => errors.push(error.message));
  await home(p);
  await p.locator('#settings-open').click();
  await p.locator('#view-setting').selectOption('line');
  await p.locator('#settings-done').click();
  await p.locator('#line-view').waitFor();
  const first = (await p.locator('#line-current').innerText()).trim();
  assert.ok(first.startsWith('breathe '), 'the first line starts with the first word: ' + first);
  assert.ok(first.split(' ').length >= 4, 'a desktop line holds several words');
  assert.equal(await p.locator('#line-current .cursor').count(), 1);
  for (let i = 0; i < 30 && (await p.locator('#line-prev').innerText()).trim() !== first; i++) {
    await p.keyboard.type(await p.locator('#word').getAttribute('data-word') + ' ');
  }
  assert.equal((await p.locator('#line-prev').innerText()).trim(), first, 'the finished line moves up and fades');
  await p.keyboard.press('Alt+KeyL');
  assert.equal(await p.locator('#line-view').isHidden(), true, 'Alt+L switches back to word by word');
  await p.keyboard.press('Alt+KeyL');
  assert.equal(JSON.parse(await p.evaluate(() => localStorage.getItem('typy.settings'))).view, 'line');
  await lineContext.close();
});

await check('line view keeps a long pasted word inside a phone', async () => {
  const narrow = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
  const p = await narrow.newPage();
  p.on('pageerror', error => errors.push(error.message));
  await p.addInitScript(() => localStorage.setItem('typy.settings', JSON.stringify({ view: 'line' })));
  await p.goto(base + '/');
  await p.locator('#line-view').waitFor();
  await paste('pneumonoultramicroscopicsilicovolcanoconiosis' + 'x'.repeat(19) + ' and then a few more words', p);
  await p.waitForFunction(() => document.getElementById('word').dataset.word.startsWith('pneumono'));
  const fit = await p.evaluate(() => {
    const row = document.getElementById('line-current');
    return { doc: document.documentElement.scrollWidth, view: innerWidth, scroll: row.scrollWidth, client: row.clientWidth };
  });
  assert.ok(fit.doc <= fit.view + 1 && fit.scroll <= fit.client + 2, 'the long word fits: ' + JSON.stringify(fit));
  await narrow.close();
});

await check('coach: runs teach it, the report finds the slippy key, a drill leans on it, and forget clears it', async () => {
  const coachContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const p = await coachContext.newPage();
  p.on('pageerror', error => errors.push(error.message));
  await home(p);
  await p.locator('#footer-coach').click();
  await p.locator('#coach-empty').waitFor();
  assert.equal(await p.locator('#coach-drill-label').innerText(), 'start with a quick check');
  await p.keyboard.press('Escape');
  await p.locator('[data-mode=endless]').click();
  await paste('bob big band bring bread back about baby above table cabin habit', p);
  for (let i = 0; i < 24; i++) {
    const word = await p.locator('#word').getAttribute('data-word');
    for (const char of word) {
      if (char === 'b') { await p.keyboard.type('v'); await p.keyboard.press('Backspace'); }
      await p.keyboard.type(char);
    }
    await p.keyboard.type(' ');
  }
  await p.keyboard.press('Enter');
  await p.locator('#result-panel').waitFor();
  await p.locator('#coach-from-result').click();
  await p.locator('#coach-dialog[open]').waitFor();
  assert.equal(await p.locator('#coach-empty').isHidden(), true);
  assert.equal(await p.locator('.coach-key').count(), 26);
  assert.match(await p.locator('#coach-weak').innerText(), /^b/);
  assert.match(await p.locator('#coach-facts').innerText(), /b → v/);
  await p.locator('#coach-drill').click();
  assert.equal(await p.locator('#source-label').innerText(), 'weak-key drill');
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('typy.coach')));
  assert.ok(saved.keys.b.miss >= 20, 'the slips were counted: ' + JSON.stringify(saved.keys.b));
  await p.locator('#footer-coach').click();
  await p.locator('#coach-forget').click();
  await p.locator('#coach-empty').waitFor();
  await coachContext.close();
});

await check('coach: before it knows your weak keys, its button fills the gaps, then checks every key', async () => {
  const keys = {};
  for (const key of 'qwertyuiopasdfghjklzxcvbnm') keys[key] = { n: 30, miss: 1, ms: 3900, timed: 30 };
  const seed = all => JSON.stringify({ version: 1, keys: all ? keys : Object.fromEntries(Object.entries(keys).slice(0, 20)), pairs: {}, slips: {}, runs: [{ day: '2026-11-13', wpm: 60, accuracy: 97, within: 130, start: 280, evenness: 0.8, samples: 60 }] });
  for (const [all, button, label] of [[false, 'fill the gaps', 'filling the gaps'], [true, 'take a quick check', 'a quick check']]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await context.addInitScript(value => localStorage.setItem('typy.coach', value), seed(all));
    const p = await context.newPage();
    p.on('pageerror', error => errors.push(error.message));
    await home(p);
    await p.locator('#footer-coach').click();
    await p.locator('#coach-dialog[open]').waitFor();
    assert.equal(await p.locator('#coach-drill-label').innerText(), button);
    assert.equal(await p.locator('#coach-gaps').isHidden(), true);
    await p.locator('#coach-drill').click();
    assert.equal(await p.locator('#source-label').innerText(), label);
    await context.close();
  }
});

await check('jam: free typing plays, Esc shows the stats, playback types it again, and a shared jam opens sealed (mock API)', async () => {
  const listening = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await listening.addInitScript(() => {
    window.__audio = { oscillators: 0 };
    const create = BaseAudioContext.prototype.createOscillator;
    BaseAudioContext.prototype.createOscillator = function (...args) { window.__audio.oscillators++; return create.apply(this, args); };
  });
  const p = await listening.newPage();
  p.on('pageerror', error => errors.push(error.message));
  const text = 'hi there. ' + String.fromCharCode(10) + 'ok';
  await home(p);
  await p.locator('#jam-option').click();
  await p.locator('#jam-panel').waitFor();
  assert.equal(new URL(p.url()).pathname, '/jam');
  assert.equal(await p.locator('#jam-option').getAttribute('aria-pressed'), 'true');
  assert.equal(await p.locator('[data-mode][aria-pressed=true]').count(), 0);
  assert.equal(await p.locator('#source-open').isHidden(), true);
  assert.equal(await p.locator('#music-toggle').getAttribute('aria-pressed'), 'true', 'a jam plays even with music off');
  await p.keyboard.type('hi there. ', { delay: 40 });
  await p.keyboard.press('Enter');
  await p.keyboard.type('ok', { delay: 40 });
  assert.equal(await p.locator('#jam-text').textContent(), text);
  assert.ok(await p.evaluate(() => window.__audio.oscillators) > 0, 'letters and spaces play');
  assert.notEqual(await p.locator('#jam-chord').innerText(), '');
  await p.keyboard.press('Escape');
  await p.locator('#jam-result').waitFor();
  assert.equal(await p.locator('#jam-notes').innerText(), '10');
  assert.equal(await p.locator('#jam-chords').innerText(), '4');
  assert.equal(await p.locator('#jam-words').textContent(), text);
  assert.equal(await p.locator('#jam-roll rect.roll-note').count(), 10);
  await p.locator('#jam-play').click();
  await p.locator('#jam-panel.playing').waitFor();
  await p.locator('#jam-result:not([hidden])').waitFor({ timeout: 10000 });
  let posted = null;
  const id = 'abcdefabcdefabcdefabcdef';
  await p.route('**/api/jams', route => { posted = JSON.parse(route.request().postData()); return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id, url: '/j/' + id }) }); });
  await p.locator('#jam-share').click();
  await p.locator('#share-name').fill('bun');
  await p.locator('#save-result').click();
  await p.locator('#share-ready').waitFor();
  assert.equal(await p.locator('#share-url').inputValue(), base + '/j/' + id);
  assert.equal(posted.jam.version, 1);
  assert.equal(posted.jam.keys.map(([, key]) => key).join('|'), 'h|i| |t|h|e|r|e|.| |Enter|o|k');
  assert.equal(posted.name, 'bun');
  await p.route('**/api/jams/' + id, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id, kind: 'jam', name: 'bun', jam: posted.jam, stats: {} }) }));
  await p.goto(base + '/j/' + id);
  await p.locator('#jam-result.sealed').waitFor();
  assert.equal(await p.locator('#jam-title').innerText(), 'bun made you a tune.');
  assert.equal(await p.locator('#jam-words').isHidden(), true, 'the words wait for play');
  await p.locator('#jam-play').click();
  await p.locator('#jam-result:not(.sealed):not([hidden])').waitFor({ timeout: 10000 });
  assert.equal(await p.locator('#jam-title').innerText(), 'bun’s tune.');
  assert.equal(await p.locator('#jam-again').textContent(), 'jam back ↗');
  await listening.close();
});

await check('after a run the coach leaves notes, history keeps runs and jams to reopen, and the mode line explains tempo', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const p = await context.newPage();
  p.on('pageerror', error => errors.push(error.message));
  await home(p);
  assert.match(await p.locator('#mode-how').innerText(), /first letter starts the clock/);
  await p.locator('[data-mode=tempo]').click();
  assert.match(await p.locator('#mode-how').innerText(), /finish each word before its beat/);
  await p.locator('[data-mode=endless]').click();
  for (let i = 0; i < 12; i++) await p.keyboard.type(await p.locator('#word').getAttribute('data-word') + ' ', { delay: 30 });
  await p.keyboard.press('Enter');
  await p.locator('#result-panel').waitFor();
  await p.locator('#coach-notes').waitFor();
  assert.ok(await p.locator('.coach-note').count() >= 1, 'the coach says something after every run');
  assert.match(await p.locator('#coach-next').innerText(), /^next run: [0-9]+ wpm at 96%\+$/);
  const wpm = await p.locator('#result-wpm').innerText();
  await p.locator('#jam-option').click();
  await p.locator('#jam-panel').waitFor();
  await p.keyboard.type('la di da', { delay: 30 });
  await p.keyboard.press('Escape');
  await p.locator('#jam-result').waitFor();
  await p.locator('#footer-history').click();
  await p.locator('#history-dialog[open]').waitFor();
  assert.equal(await p.locator('.history-row').count(), 2);
  assert.match(await p.locator('.history-row.jam .history-detail').innerText(), /la di da/);
  await p.locator('.history-row.run').click();
  await p.locator('#result-panel').waitFor();
  assert.equal(await p.locator('#result-wpm').innerText(), wpm);
  assert.equal(await p.locator('#coach-notes').isVisible(), true, 'a reopened run keeps its notes');
  await p.reload();
  await p.locator('#word[data-word]').waitFor();
  await p.locator('#footer-history').click();
  await p.locator('.history-row.jam').click();
  await p.locator('#jam-result').waitFor();
  assert.match(await p.locator('#jam-words').textContent(), /la di da/, 'history survives a reload');
  await context.close();
});

const mobile = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
const phone = await mobile.newPage();
phone.on('pageerror', error => errors.push(error.message));
await check('phone layout fits, exposes a large input, and handles native input events', async () => {
  await home(phone);
  const viewport = await phone.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.equal(viewport.scrollWidth <= viewport.width + 1, true);
  const bounds = await phone.locator('#typing-input').boundingBox();
  assert.equal(bounds.height >= 44 && bounds.width > 250, true);
  await phone.locator('#typing-input').tap();
  await phone.locator('#typing-input').fill('b');
  assert.equal(await phone.locator('#word .correct').count(), 1);
  await phone.screenshot({ path: path.join(evidence, 'phone.png'), fullPage: true });
  return viewport;
});
await check('every run mode stays reachable inside the phone toolbar', async () => {
  const modes = phone.locator('[data-mode]');
  assert.equal(await modes.count(), 6);
  const bounds = await phone.locator('#mode-switch').boundingBox();
  assert.equal(bounds.x >= 0 && bounds.x + bounds.width <= 391, true, 'the mode switch must not run off the phone: ' + JSON.stringify(bounds));
  for (let index = 0; index < 6; index++) {
    const button = await modes.nth(index).boundingBox();
    assert.equal(button.x >= 0 && button.x + button.width <= 391, true, 'mode ' + index + ' is off-screen');
    assert.equal(button.height >= 28, true, 'mode ' + index + ' is too short to tap');
  }
  await phone.locator('[data-mode="120"]').tap();
  assert.equal(await phone.locator('#live-time').innerText(), '120');
  await phone.locator('[data-mode="30"]').tap();
});
await check('jam fits a phone and takes native input', async () => {
  await phone.goto(base + '/jam');
  await phone.locator('#jam-panel').waitFor();
  const option = await phone.locator('#jam-option').boundingBox();
  assert.equal(option.x >= 0 && option.x + option.width <= 391, true, 'the jam option stays on screen');
  await phone.locator('#jam-input').tap();
  await phone.locator('#jam-input').fill('la la');
  assert.equal(await phone.locator('#jam-text').textContent(), 'la la');
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await phone.locator('#jam-done').tap();
  await phone.locator('#jam-result').waitFor();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await home(phone);
});
await check('reduced motion leaves the beat rail and the word still', async () => {
  await phone.locator('[data-mode=tempo]').tap();
  await phone.locator('#typing-input').tap();
  await phone.locator('#typing-input').fill('b');
  const rail = () => phone.locator('#tempo-progress').evaluate(element => getComputedStyle(element).transform);
  const first = await rail();
  await phone.waitForTimeout(120);
  // Reduced motion steps the rail in tenths, so two frames 120ms apart are
  // either identical or a whole step apart, never a continuous slide.
  const scale = value => Number((value.match(/matrix\(([-0-9.]+)/) || [, '1'])[1]);
  const step = Math.abs(scale(first) - scale(await rail()));
  assert.equal(step === 0 || Math.abs(step - 0.1) < 0.001, true, 'the rail slid instead of stepping: ' + step);
  assert.deepEqual(await phone.locator('#word').evaluate(element => ({
    animations: element.getAnimations().length,
    transition: getComputedStyle(element).transitionDuration
  })), { animations: 0, transition: '0s' });
  await phone.locator('[data-mode="30"]').tap();
});
await check('phone dialogs fit and controls remain accessible', async () => {
  await phone.locator('#settings-open').tap();
  const box = await phone.locator('#settings-dialog').boundingBox();
  assert.equal(box.x >= 0 && box.x + box.width <= 391, true);
  assert.equal(box.y >= 0 && box.y + box.height <= 845, true);
  await phone.locator('#settings-done').tap();
});
await check('phone long pasted words remain inside the viewport', async () => {
  await paste('pneumonoultramicroscopicsilicovolcanoconiosis' + 'x'.repeat(19) + ' next', phone);
  const dimensions = await phone.locator('#word').evaluate(element => ({
    width: element.getBoundingClientRect().width,
    scrollWidth: element.scrollWidth,
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right,
    windowWidth: innerWidth,
    documentWidth: document.documentElement.scrollWidth
  }));
  await phone.screenshot({ path: path.join(evidence, 'phone-long-word.png'), fullPage: true });
  assert.equal(dimensions.scrollWidth <= dimensions.width + 2 && dimensions.documentWidth <= dimensions.windowWidth + 1, true,
    'A legal 64-character pasted word overflows the phone stage: ' + JSON.stringify(dimensions));
});
await check('outgoing long words do not enlarge the phone layout with normal motion', async () => {
  const animatedContext = await browser.newContext({ ...devices['iPhone 13'] });
  const animated = await animatedContext.newPage();
  await home(animated);
  await setting('letter', true, animated);
  await paste('a'.repeat(64) + ' next', animated);
  await animated.locator('#typing-input').fill('a'.repeat(64));
  for (const delay of [25, 225]) {
    await animated.waitForTimeout(delay);
    const dimensions = await animated.evaluate(() => ({
      word: document.getElementById('word').dataset.word,
      viewport: innerWidth, document: document.documentElement.scrollWidth
    }));
    assert.equal(dimensions.word, 'next');
    assert.equal(dimensions.viewport, 390);
    assert.equal(dimensions.document, 390);
  }
  await animatedContext.close();
});
await check('no uncaught browser script errors', async () => assert.deepEqual(errors, []));
await browser.close();
const result = { timestamp: new Date().toISOString(), target: base, browser: 'Chrome 156 / Playwright', checks, findings, errors };
await fs.writeFile(path.join(evidence, 'browser-results.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ passed: checks.filter(item => item.status === 'PASS').length, failed: findings.length, evidence }));
process.exitCode = findings.length ? 1 : 0;
