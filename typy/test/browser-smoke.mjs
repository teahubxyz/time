// Independent browser acceptance for time#254. No production mutations.
// Local preview intentionally has unavailable API routes; marked tests use mocks.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright');
const base = process.env.TYPY_QA_URL || 'http://127.0.0.1:8788';
const evidence = path.resolve(import.meta.dirname, '../evidence');
await fs.mkdir(evidence, { recursive: true });
const findings = [];
const checks = [];
const errors = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.TYPY_CHROME || '/tmp/typy-browser/chrome-linux64/chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
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
  assert.deepEqual(saved, { advance: 'letter', preview: false });
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
