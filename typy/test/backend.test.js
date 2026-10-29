import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import worker from '../src/worker.js';
import { QuotaGate, validateResult } from '../src/store.js';
import { TypingGame } from '../src/game.js';
import { MAX_WORD_LENGTH } from '../src/words.js';
import { dailyPassage, normalizeTopic } from '../src/passages.js';
import { scorePNG } from '../src/og.js';

class KV {
 constructor(){this.data=new Map();}
 async get(key,type){const entry=this.data.get(key);if(!entry)return null;return type==='json'?JSON.parse(entry.value):entry.value;}
 async put(key,value,options={}){this.data.set(key,{value,metadata:options.metadata});}
 async list({prefix,limit=1000,cursor='0'}){const keys=[...this.data].filter(([key])=>key.startsWith(prefix)).sort(([a],[b])=>a.localeCompare(b)).map(([name,v])=>({name,metadata:v.metadata}));const start=+cursor;return{keys:keys.slice(start,start+limit),list_complete:start+limit>=keys.length,cursor:String(start+limit)};}
}
class Storage {
 constructor(){this.data=new Map();this.pending=Promise.resolve();this.alarmAt=null;}
 async get(key){return structuredClone(this.data.get(key));}
 async put(key,value){this.data.set(key,structuredClone(value));}
 async delete(key){for(const k of Array.isArray(key)?key:[key])this.data.delete(k);}
 async setAlarm(at){this.alarmAt=at;}
 async getAlarm(){return this.alarmAt;}
 async list({prefix='',end,limit=1000}={}){return new Map([...this.data].filter(([key])=>key.startsWith(prefix)&&(!end||key<end)).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit));}
 transaction(fn){const next=this.pending.then(()=>fn(this));this.pending=next.catch(()=>{});return next;}
}
const env=()=>({KV:new KV(),QUOTA:{idFromName:name=>name,get:()=>({fetch:async()=>Response.json({ok:true})})},REV:'test'});
const req=(path,init={})=>new Request('https://typy.example'+path,init);
const post=(body,headers={})=>req('/api/results',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://typy.example',...headers},body:JSON.stringify(body)});
function makeRun({words=['calm','clear'],mode='30',duration=30000}={}){
 const game=new TypingGame({words,mode,advance:'space'});let at=0;for(const char of words[0]){game.press(char,at);at+=100;}game.press(' ',at);if(mode==='endless')game.finish(duration);else game.tick(duration);return game.result(duration);
}
const input=()=>({run:makeRun(),source:{kind:'common'},name:'A friend'});

test('result score is recomputed and private extra fields are discarded',()=>{
 const body=input();body.run.stats.wpm=999;body.run.typedContent='do not persist me';body.run.events[0].key='secret';
 const record=validateResult(body);assert.equal(record.run.stats.wpm,2);assert.equal(record.run.stats.accuracy,100);assert.equal(record.run.stats.correctChars,5);assert.equal(record.run.typedContent,undefined);assert.equal(record.run.events[0].key,undefined);
});
test('rejects malformed timing, oversized passages and truncated history',()=>{
 const bad=input();bad.run.events[1].t=-1;assert.throws(()=>validateResult(bad),/replay event/);
 const tooMany=input();tooMany.run.words=Array(301).fill('word');assert.throws(()=>validateResult(tooMany),/1–300/);
 const truncated=input();truncated.run.replayTruncated=true;assert.throws(()=>validateResult(truncated),/too long/);
 const drift=input();drift.run.wordTimings[1].start+=10;assert.throws(()=>validateResult(drift),/consecutive/);
});
test('a 120-second run is a shareable mode and still cannot outlast its clock',async()=>{
 const e=env(),run=makeRun({mode:'120',duration:120000});
 assert.equal(run.durationMs,120000);assert.equal(run.finishedReason,'time');
 const saved=await worker.fetch(post({run,source:{kind:'common'}}),e);assert.equal(saved.status,201);
 const read=await worker.fetch(req('/api/results/'+(await saved.json()).id),e);assert.equal((await read.json()).run.mode,'120');
 const over=structuredClone(run);over.durationMs=130000;over.wordTimings.at(-1).end=130000;
 assert.throws(()=>validateResult({run:over,source:{kind:'common'}}),/exceed their limit/);
});
test('result link round trip stores only explicit sharing data',async()=>{
 const e=env(),saved=await worker.fetch(post(input()),e);assert.equal(saved.status,201);const info=await saved.json();assert.match(info.url,/^\/r\/[a-f0-9]{24}$/);
 const read=await worker.fetch(req('/api/results/'+info.id),e);assert.equal(read.status,200);const value=await read.json();assert.equal(value.run.stats.wpm,2);assert.equal(value.name,'A friend');assert.equal(e.KV.data.size,1);
 const missing=await worker.fetch(req('/api/results/'+'a'.repeat(24)),e);assert.equal(missing.status,404);
});
test('a replay link holds the passage and its timings, nothing else, and opens logged out',async()=>{
 const e=env(),data=input();data.run.typedContent='ne-ver-store-this';data.run.events[0].key='ne-ver-store-this';
 const info=await(await worker.fetch(post(data),e)).json();
 assert.match(info.id,/^[a-f0-9]{24}$/,'a short id');
 assert.equal(e.KV.data.size,1);
 const [[key,entry]]=[...e.KV.data];assert.equal(key,'result:'+info.id);
 const stored=JSON.parse(entry.value);
 assert.deepEqual(Object.keys(stored).sort(),['createdAt','id','name','run','source']);
 assert.deepEqual(Object.keys(stored.run).sort(),['advance','durationMs','events','finishedReason','mode','replayTruncated','stats','version','wordTimings','words']);
 assert.deepEqual(Object.keys(stored.run.events[0]).sort(),['index','t','type']);
 assert.deepEqual(stored.run.words,['calm','clear']);
 assert.ok(stored.run.events.length>=4&&stored.run.wordTimings.length>=1,'keystroke timings are recorded');
 assert.ok(!entry.value.includes('ne-ver-store-this'),'nothing the visitor typed is stored');
 // Logged out: no cookie is set or needed to read the page or its replay.
 for(const path of [info.url,'/race/'+info.id,'/api/results/'+info.id]){
  const response=await worker.fetch(req(path),e);
  assert.equal(response.status,200,path);assert.equal(response.headers.get('Set-Cookie'),null,path);
 }
 const replay=await(await worker.fetch(req('/api/results/'+info.id),e)).json();
 assert.deepEqual(replay.run.events.map(event=>event.type),stored.run.events.map(event=>event.type));
 assert.ok(replay.run.events.every(event=>Number.isFinite(event.t)));
});
test('sharing rejects cross-site origins, wrong content types and invalid JSON',async()=>{
 const e=env();assert.equal((await worker.fetch(post(input(),{Origin:'https://elsewhere.example'}),e)).status,403);
 assert.equal((await worker.fetch(req('/api/results',{method:'POST',headers:{'Content-Type':'text/plain'},body:'no'}),e)).status,415);
 assert.equal((await worker.fetch(req('/api/results',{method:'POST',headers:{'Content-Type':'application/json'},body:'{' }),e)).status,400);
 assert.equal(e.KV.data.size,0);
});
test('daily passage is canonical, changes by date, and only full daily runs can post',()=>{
 const day=new Date().toISOString().slice(0,10),passage=dailyPassage(day);
 assert.equal(passage.words.length,300);assert.deepEqual(passage,dailyPassage(day));assert.notDeepEqual(dailyPassage('2026-10-20').words,dailyPassage('2026-10-21').words);
 const body={run:makeRun({words:passage.words,mode:'60',duration:60000}),source:{kind:'daily',day}};
 assert.equal(validateResult(body).source.day,day);
 const early=structuredClone(body);early.run.mode='30';early.run.durationMs=30000;assert.throws(()=>validateResult(early));
 const altered=structuredClone(body);altered.run.words[2]='tampered';assert.throws(()=>validateResult(altered),/full 60-second/);
});
test('independent daily entries survive concurrent saves without shared-row overwrites',async()=>{
 const e=env(),day=new Date().toISOString().slice(0,10),words=dailyPassage(day).words;
 const run=makeRun({words,mode:'60',duration:60000});
 const responses=await Promise.all(Array.from({length:8},(_,i)=>worker.fetch(post({run,source:{kind:'daily',day},name:'Player '+i}),e)));
 assert.ok(responses.every(r=>r.status===201));
 const response=await worker.fetch(req('/api/board?day='+day),e);assert.equal(response.status,200);const board=await response.json();assert.equal(board.entries.length,8);assert.equal(new Set(board.entries.map(r=>r.id)).size,8);
});
test('cached topics bypass model calls and quota; unavailable generation reports clearly',async()=>{
 const e=env();await e.KV.put('topic:v1:react-hooks',JSON.stringify({kind:'topic',topic:'react-hooks',words:['one','two'],title:'react hooks'}));
 e.QUOTA.get=()=>({fetch:async()=>{throw new Error('should not use quota');}});
 const result=await worker.fetch(req('/api/passage?topic=react-hooks'),e);assert.equal(result.status,200);assert.equal((await result.json()).cached,true);
 const missing=await worker.fetch(req('/api/passage?topic=fano-plane'),e);assert.equal(missing.status,503);assert.equal((await missing.json()).code,'generation_unavailable');
 assert.equal(normalizeTopic(' React Hooks '),'react-hooks');assert.throws(()=>normalizeTopic('make-a-bomb'),/general-audience/);
});
test('topic generation reserves quota, filters output and caches plain prose',async()=>{
 const e=env();e.VENICE_API_KEY='test-only';let calls=0,reservations=0;e.QUOTA.get=()=>({fetch:async()=>{reservations++;return Response.json({ok:true});}});
 const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://api.venice.ai/api/v1/chat/completions');const body=JSON.parse(options.body);assert.equal(body.model,'mistral-small-3-2-24b-instruct');return Response.json({choices:[{message:{content:'The ocean contains a remarkable variety of life. Small plants near the surface use sunlight to grow. Many animals depend on this energy and on the steady movement of water through the open sea.'}}]});};
 try{const a=await worker.fetch(req('/api/passage?topic=ocean-life'),e);assert.equal(a.status,200);assert.ok((await a.json()).words.length>=30);const b=await worker.fetch(req('/api/passage?topic=ocean-life'),e);assert.equal((await b.json()).cached,true);assert.equal(calls,1);assert.equal(reservations,1);}finally{globalThis.fetch=original;}
});
test('provider failure does not save fabricated content or reveal credentials',async()=>{
 const e=env();e.VENICE_API_KEY='never-print-this';const original=globalThis.fetch;globalThis.fetch=async()=>new Response('private provider error',{status:500});
 try{const res=await worker.fetch(req('/api/passage?topic=astronomy'),e);assert.equal(res.status,502);const text=await res.text();assert.ok(!text.includes('private provider'));assert.ok(!text.includes('never-print'));assert.equal(e.KV.data.size,0);}finally{globalThis.fetch=original;}
});
test('quota object reserves a strict global daily ceiling concurrently and persists no raw IP',async()=>{
 const storage=new Storage(),gate=new QuotaGate({storage},{TOPICS_PER_VISITOR:'8',TOPICS_PER_DAY:'2'});
 const ips=['192.0.2.1','192.0.2.2','192.0.2.3'];
 const results=await Promise.all(ips.map(ip=>gate.fetch(new Request('https://quota/take',{method:'POST',body:JSON.stringify({kind:'topic',ip})}))));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,200,429]);assert.equal((await storage.get('counters')).topic,2);
 const persisted=JSON.stringify([...storage.data]);assert.ok(ips.every(ip=>!persisted.includes(ip)));assert.equal((await results.find(r=>r.status===429).json()).code,'daily_global_limit');
});
test('missing quota binding fails closed before saving',async()=>{
 const e=env();delete e.QUOTA;assert.equal((await worker.fetch(req('/api/health'),e)).status,503);
 const res=await worker.fetch(post(input()),e);assert.equal(res.status,503);assert.equal((await res.json()).code,'quota_unavailable');assert.equal(e.KV.data.size,0);
});
test('PNG output is a real 1200x630 image and changes with the score',async()=>{
 const a=await scorePNG(),b=await scorePNG({run:{stats:{wpm:92,accuracy:98.6,bestStreak:21}}});
 assert.deepEqual([...a.slice(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(new DataView(a.buffer,a.byteOffset).getUint32(16),1200);assert.equal(new DataView(a.buffer,a.byteOffset).getUint32(20),630);assert.notDeepEqual(a,b);
 let offset=8,idat=[];while(offset<a.length){const size=new DataView(a.buffer,a.byteOffset+offset).getUint32(0),type=new TextDecoder().decode(a.slice(offset+4,offset+8));if(type==='IDAT')idat.push(a.slice(offset+8,offset+8+size));offset+=size+12;}
 assert.equal(inflateSync(Buffer.concat(idat)).length,1201*630);
});
test('result HTML has result-specific escaped social metadata and strict security headers',async()=>{
 const e=env(),data=input();data.name='\" & <script>';const res=await worker.fetch(post(data),e);const saved=await res.json();const page=await worker.fetch(req(saved.url),e);const html=await page.text();assert.equal(page.status,200);assert.ok(html.includes('/api/og/'+saved.id+'.png'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&amp;'));assert.match(page.headers.get('Content-Security-Policy'),/script-src 'self'/);
 const image=await worker.fetch(req('/api/og/default.png'),e);assert.equal(image.headers.get('Content-Type'),'image/png');
 const bad=await worker.fetch(req('/a/b/c'),e);assert.equal(bad.status,404);
});


test('saved passages round-trip into a race without truncation or Unicode normalization changes',()=>{
 const long=input();long.run.words[1]='x'.repeat(MAX_WORD_LENGTH+1);assert.throws(()=>validateResult(long),error=>error.code==='invalid_passage');
 for(const word of ['can\u2019t','full\u200Bwidth','\uFF21']){const body=input();body.run.words[1]=word;assert.throws(()=>validateResult(body),error=>error.code==='invalid_passage');}
 const accepted=validateResult({run:makeRun({words:['x'.repeat(MAX_WORD_LENGTH),'clear']}),source:{kind:'paste'}});
 const race=new TypingGame({words:accepted.run.words,mode:accepted.run.mode,advance:accepted.run.advance});assert.deepEqual(race.words,accepted.run.words);assert.equal(race.words[0].length,MAX_WORD_LENGTH);
});

test('midnight traffic preserves the pending quota cleanup and rearms expiry for the new day',async()=>{
 const originalNow=Date.now;let now=Date.parse('2026-10-24T23:59:50Z');Date.now=()=>now;
 try{
  const storage=new Storage(),gate=new QuotaGate({storage},{});
  const take=ip=>gate.fetch(new Request('https://quota/take',{method:'POST',body:JSON.stringify({kind:'topic',ip})}));
  assert.equal((await take('192.0.2.1')).status,200);
  const firstAlarm=Date.parse('2026-10-25T00:01:00Z');assert.equal(await storage.getAlarm(),firstAlarm);
  now=Date.parse('2026-10-25T00:00:10Z');assert.equal((await take('192.0.2.2')).status,200);
  assert.equal(await storage.getAlarm(),firstAlarm,'traffic after midnight must not postpone yesterday’s cleanup');
  assert.equal((await storage.list({prefix:'visitor:'})).size,2);
  now=firstAlarm;storage.alarmAt=null;await gate.alarm();
  const retained=await storage.list({prefix:'visitor:'});assert.equal(retained.size,1);assert.ok([...retained.keys()][0].startsWith('visitor:2026-10-25:'));
  assert.equal((await storage.get('counters')).day,'2026-10-25');
  assert.equal(await storage.getAlarm(),Date.parse('2026-10-26T00:01:00Z'),'today’s identities still expire if no further request arrives');
  now=Date.parse('2026-10-26T00:01:00Z');storage.alarmAt=null;await gate.alarm();
  assert.equal((await storage.list({prefix:'visitor:'})).size,0);assert.equal(await storage.get('counters'),undefined);assert.equal(await storage.getAlarm(),null);assert.ok(await storage.get('hmac-secret'));
 }finally{Date.now=originalNow;}
});


test('missing result and race pages retain the app retry UI while the data endpoint stays JSON',async()=>{
 const e=env(),id='b'.repeat(24);
 for(const path of ['/r/'+id,'/race/'+id]){const page=await worker.fetch(req(path),e);assert.equal(page.status,404);assert.match(page.headers.get('Content-Type'),/text\/html/);const html=await page.text();assert.ok(html.includes('<html'));assert.ok(html.includes('/app.js'));}
 const api=await worker.fetch(req('/api/results/'+id),e);assert.equal(api.status,404);assert.match(api.headers.get('Content-Type'),/application\/json/);assert.equal((await api.json()).code,'not_found');
});
