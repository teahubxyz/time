// Optional real-browser regressions for fast typing. Motion stays enabled.
// Start npm start, then run CHROME=/path/to/chrome node test/responsiveness.mjs.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile, mkdir} from 'node:fs/promises';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright' : 'playwright');
const base = (process.env.TYPY_BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const browser = await chromium.launch({executablePath:process.env.CHROME || chromium.executablePath(),headless:true,args:['--no-sandbox']});
const checks = [];
const errors = [];
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference',ignoreHTTPSErrors:process.env.TYPY_IGNORE_HTTPS_ERRORS === '1'});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base + '/');
  await page.locator('#word[data-word]').waitFor();
  const idleMutations = await page.evaluate(async () => {
    let changes = 0;
    const observer = new MutationObserver(rows => { changes += rows.length; });
    observer.observe(document.getElementById('play-panel'), {subtree:true,childList:true,attributes:true,characterData:true});
    await new Promise(resolve => setTimeout(resolve, 400));
    observer.disconnect();
    return changes;
  });
  assert.equal(idleMutations,0,'The ready stage must not continuously redraw itself.');
  checks.push({name:'Ready stage stays still',idleMutations});

  async function paste(text, advance = 'space') {
    await page.locator('[data-mode=endless]').click();
    await page.locator('#settings-open').click();
    await page.locator('#advance-setting').selectOption(advance);
    await page.locator('#settings-done').click();
    await page.locator('#source-open').click();
    await page.locator('#tab-paste').click();
    await page.locator('#paste-input').fill(text);
    await page.locator('#source-paste button[type=submit]').click();
  }

  await paste('calm river');
  await page.evaluate(() => { window.firstLetter = document.querySelector('#word span'); });
  await page.keyboard.type('c');
  assert.equal(await page.evaluate(() => window.firstLetter === document.querySelector('#word span')),true,'A key must update existing letters, not replace the word.');
  assert.equal(await page.locator('#word .correct').count(),1);
  await page.keyboard.type('alm ');
  const transition = await page.evaluate(() => {
    const word = document.getElementById('word'), style = getComputedStyle(word);
    return {word:word.dataset.word,opacity:style.opacity,transform:style.transform,animations:word.getAnimations().length};
  });
  assert.deepEqual(transition,{word:'river',opacity:'1',transform:'none',animations:0},'The next word must be fully readable immediately, with normal motion settings.');
  await page.keyboard.type('r');
  assert.equal(await page.locator('#word .correct').count(),1);
  checks.push({name:'Immediate stationary target and persistent letters',...transition});

  for (const advance of ['space','letter']) {
    await paste('a calm river moves through the city',advance);
    await page.keyboard.type('a calm river moves through the city ',{delay:75});
    assert.equal(await page.locator('#word').getAttribute('data-word'),'a');
    assert.equal(await page.locator('#live-accuracy').textContent(),'100');
    assert.equal(await page.locator('#word .incorrect').count(),0);
    checks.push({name:'Normal spaced typing at 160 WPM input cadence',advance,accuracy:100});
  }

  for (const width of [390,360]) {
    await page.setViewportSize({width,height:844});
    await paste('a'.repeat(64) + ' next','letter');
    const before = await page.evaluate(() => ({viewport:innerWidth,document:document.documentElement.scrollWidth}));
    assert.ok(before.document <= before.viewport + 1);
    await page.locator('#typing-input').fill('a'.repeat(64));
    const after = await page.evaluate(() => ({word:document.getElementById('word').dataset.word,viewport:innerWidth,document:document.documentElement.scrollWidth,opacity:getComputedStyle(document.getElementById('word')).opacity}));
    assert.equal(after.word,'next');
    assert.equal(after.opacity,'1');
    assert.ok(after.document <= after.viewport + 1);
    checks.push({name:'Long phone word and instant transition fit',width,before,after});
  }
  assert.deepEqual(errors,[]);
  const report = {checkedAt:new Date().toISOString(),base,motion:'no-preference',checks,errors};
  await mkdir('evidence',{recursive:true});
  await writeFile('evidence/responsiveness.json',JSON.stringify(report,null,2) + '\n');
  console.log(JSON.stringify(report,null,2));
} finally { await browser.close(); }
