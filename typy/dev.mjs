import { createServer } from 'node:http';
import worker, { QuotaGate } from './src/worker.js';

class MemoryKV {
  constructor() { this.values = new Map(); }
  async get(key, options) {
    const item = this.values.get(key);
    if (!item || item.expiration && item.expiration < Date.now()) { this.values.delete(key); return null; }
    const type = typeof options === 'string' ? options : options?.type;
    return type === 'json' ? JSON.parse(item.value) : item.value;
  }
  async put(key, value, options = {}) {
    this.values.set(key, {value:String(value),metadata:options.metadata,expiration:options.expirationTtl ? Date.now() + options.expirationTtl * 1000 : null});
  }
  async delete(key) { this.values.delete(key); }
  async list({prefix = '', limit = 1000, cursor = ''} = {}) {
    const items = [...this.values.entries()].filter(([key, value]) => key.startsWith(prefix) && (!value.expiration || value.expiration > Date.now())).sort(([a],[b]) => a.localeCompare(b));
    const start = Number(cursor) || 0;
    return {keys:items.slice(start,start+limit).map(([name,value]) => ({name,metadata:value.metadata})),list_complete:start+limit >= items.length,cursor:start+limit < items.length ? String(start+limit) : ''};
  }
}

class MemoryObjectStorage {
  constructor() { this.values = new Map(); this.queue = Promise.resolve(); }
  async get(key) { return this.values.get(key); }
  async put(key, value) { if (typeof key === 'object') { for (const [k,v] of Object.entries(key)) this.values.set(k,v); } else this.values.set(key,value); }
  async delete(key) { if (Array.isArray(key)) key.forEach(item => this.values.delete(item)); else this.values.delete(key); }
  async deleteAll() { this.values.clear(); }
  async setAlarm() {}
  async getAlarm() { return null; }
  async list({prefix = ''} = {}) { return new Map([...this.values].filter(([key]) => key.startsWith(prefix))); }
  transaction(fn) {
    const result = this.queue.then(() => fn(this));
    this.queue = result.catch(() => {});
    return result;
  }
}

const env = {
  REV:'local', SOURCE_SHA:'local',
  KV:new MemoryKV(),
  VENICE_API_KEY:process.env.VENICE_API_KEY || '',
  TOPIC_MODEL:process.env.TOPIC_MODEL || 'mistral-small-3-2-24b-instruct',
  TOPICS_PER_VISITOR:'8', TOPICS_PER_DAY:'80',
  SAVES_PER_VISITOR:'30', SAVES_PER_DAY:'2000',
};
const storage = new MemoryObjectStorage();
const gate = new QuotaGate({storage,blockConcurrencyWhile:fn=>fn()},env);
env.QUOTA = {idFromName:name=>name,get:()=>({fetch:(input,init)=>gate.fetch(new Request(input,init))})};

const port = Number(process.env.PORT || 8787);
createServer(async (request,response) => {
  try {
    const chunks = [];
    let length = 0;
    for await (const chunk of request) {
      length += chunk.length;
      if (length > 2_000_000) { response.writeHead(413); response.end('Payload too large'); return; }
      chunks.push(chunk);
    }
    const body = chunks.length && !['GET','HEAD'].includes(request.method) ? Buffer.concat(chunks) : undefined;
    const headers = {...request.headers,'cf-connecting-ip':'127.0.0.1'};
    const result = await worker.fetch(new Request('http://' + request.headers.host + request.url, {method:request.method,headers,body}),env,{waitUntil:promise=>promise.catch(()=>{})});
    response.writeHead(result.status,Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch(error) {
    console.error('Local request failed:',error.message);
    response.writeHead(500,{'Content-Type':'application/json'});
    response.end(JSON.stringify({error:'Local server error.'}));
  }
}).listen(port,'127.0.0.1',()=>console.log('typy on http://127.0.0.1:' + port + ' (ephemeral local storage)'));
