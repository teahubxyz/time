// Optional browser acceptance against the real Worker, never an API mock.
// Start npm start first. Set TYPY_BASE_URL to verify a deployment.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile, mkdir} from 'node:fs/promises';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright' : 'playwright');
const base = (process.env.TYPY_BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const browser = await chromium.launch({executablePath:process.env.CHROME || chromium.executablePath(),headless:true,args:['--no-sandbox']});
const errors = [];
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base + '/');
  await page.locator('#word[data-word]').waitFor();
  await page.locator('[data-mode=endless]').click();
  await page.locator('#source-open').click();
  await page.locator('#tab-paste').click();
  const words = 'one quiet morning the river moves through the city with a gentle rhythm'.split(' ');
  await page.locator('#paste-input').fill(words.join(' '));
  await page.locator('#source-paste button[type=submit]').click();
  for (const word of words.slice(0,8)) await page.keyboard.type(word + ' ',{delay:35});
  await page.locator('#finish-run').click();
  await page.locator('#result-panel').waitFor({state:'visible'});
  const score = await page.locator('#result-wpm').textContent();
  await page.locator('#share-button').click();
  await page.locator('#share-name').fill('typy check');
  await page.locator('#save-result').click();
  await page.locator('#share-ready').waitFor({state:'visible'});
  const resultUrl = await page.locator('#share-url').inputValue();
  const resultResponse = await page.request.get(resultUrl.replace('/r/','/api/results/'));
  assert.equal(resultResponse.status(),200);
  const saved = await resultResponse.json();
  assert.deepEqual(saved.run.words,words);
  assert.equal(saved.run.stats.completedWords,8);
  assert.equal(saved.run.stats.accuracy,100);
  assert.equal(String(Math.round(saved.run.stats.wpm)),score);
  assert.ok(saved.run.events.every(event=>Object.keys(event).sort().join(',') === 'index,t,type'));
  await page.goto(resultUrl);
  await page.locator('#result-panel').waitFor({state:'visible'});
  const og = await page.locator('meta[property="og:image"]').getAttribute('content');
  const imageResponse = await page.request.get(og);
  const imageBytes = await imageResponse.body();
  assert.equal(imageResponse.status(),200);
  assert.equal(imageBytes.readUInt32BE(16),1200);
  assert.equal(imageBytes.readUInt32BE(20),630);
  assert.ok(imageBytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
  await page.locator('#replay-button').click();
  await page.locator('#replay-controls').waitFor({state:'visible'});
  await page.locator('#replay-play').click();
  const midpoint = Math.floor(saved.run.durationMs / 20) * 10;
  await page.locator('#replay-scrubber').fill(String(midpoint));
  await page.locator('#replay-scrubber').dispatchEvent('input');
  const replayWord = await page.locator('#word').getAttribute('data-word');
  assert.ok(words.includes(replayWord));
  await page.locator('#replay-back').click();
  await page.locator('#race-button').click();
  await page.locator('#ghost-race').waitFor({state:'visible'});
  assert.ok(page.url().includes('/race/'));
  assert.equal(await page.locator('#word').getAttribute('data-word'),words[0]);
  const health = await (await page.request.get(base + '/api/health')).json();
  assert.equal(health.ok,true);
  const daily1 = await (await page.request.get(base + '/api/daily')).json();
  const daily2 = await (await page.request.get(base + '/api/daily')).json();
  assert.deepEqual(daily1.words,daily2.words);
  assert.equal(daily1.words.length,300);
  assert.deepEqual(errors,[]);
  const report = {
    checkedAt:new Date().toISOString(),base,health,score,resultUrl,
    storedWords:saved.run.words.length,storedEvents:saved.run.events.length,
    replayWord,raceUrl:page.url(),ghostVisible:true,
    og:{status:imageResponse.status(),bytes:imageBytes.length,width:1200,height:630},
    dailySame:true,dailyWords:daily1.words.length,errors
  };
  await mkdir('evidence',{recursive:true});
  const name = base.includes('127.0.0.1') ? 'local' : 'live';
  await writeFile('evidence/' + name + '-integration.json',JSON.stringify(report,null,2) + '\n');
  await writeFile('evidence/' + name + '-result.png',imageBytes);
  console.log(JSON.stringify(report,null,2));
} finally { await browser.close(); }
