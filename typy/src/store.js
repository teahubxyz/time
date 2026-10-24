import { summarizeRun, MODES } from './game.js';
import { dailyPassage, normalizeTopic } from './passages.js';
import { MAX_WORD_LENGTH, normalizePassage } from './words.js';

export class ApiError extends Error {
  constructor(status, message, code = 'request_failed', retryAfter) {
    super(message); this.status = status; this.code = code; this.retryAfter = retryAfter;
  }
}
const encoder = new TextEncoder();
const cleanName = value => typeof value === 'string' ? value.normalize('NFKC').replace(/[<>\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) : '';
const finite = (value, low, high) => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
const integer = (value, low, high) => Number.isInteger(value) && value >= low && value <= high;
const quotaLimit = (value, fallback) => Number.isInteger(Number(value)) && Number(value) >= 0 ? Math.min(Number(value), 100000) : fallback;
export const validId = id => /^[a-f0-9]{24}$/.test(id);
export const today = () => new Date(Date.now()).toISOString().slice(0, 10);
export function requireKV(env) {
  if (!env.KV?.get || !env.KV?.put) throw new ApiError(503, 'Saving is temporarily unavailable. Your run is still on this device.', 'storage_unavailable');
  return env.KV;
}
export async function readJSON(kv, key) {
  const value = await kv.get(key, 'json');
  if (typeof value === 'string') { try { return JSON.parse(value); } catch { return null; } }
  return value;
}

/** One account-wide object reserves spend before a provider call. No raw IP is persisted. */
export class QuotaGate {
  constructor(state, env = {}) {
    this.state = state; this.env = env; this.alarmQueue = Promise.resolve();
    const init = async () => {
      let secret = await state.storage.get('hmac-secret');
      if (!secret) { secret = crypto.randomUUID() + crypto.randomUUID(); await state.storage.put('hmac-secret', secret); }
      this.key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    };
    this.ready = state.blockConcurrencyWhile ? state.blockConcurrencyWhile(init) : init();
  }
  async fetch(request) {
    await this.ready;
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405 });
    let input; try { input = await request.json(); } catch { return Response.json({ error: 'Invalid quota request.' }, { status: 400 }); }
    const kind = input.kind;
    if (!['topic', 'save'].includes(kind)) return Response.json({ error: 'Invalid quota kind.' }, { status: 400 });
    const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
    const identity = String(input.ip || 'unknown').slice(0, 100);
    const digest = await crypto.subtle.sign('HMAC', this.key, encoder.encode(`${day}:${identity}`));
    const visitor = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    const perVisitor = kind === 'topic' ? quotaLimit(this.env.TOPICS_PER_VISITOR, 8) : quotaLimit(this.env.SAVES_PER_VISITOR, 30);
    const globalMax = kind === 'topic' ? quotaLimit(this.env.TOPICS_PER_DAY, 80) : quotaLimit(this.env.SAVES_PER_DAY, 2000);
    const retryDay = Math.max(1, Math.ceil((Date.parse(day) + 86400000 - now) / 1000));
    const outcome = await this.state.storage.transaction(async tx => {
      let state = await tx.get('counters');
      if (!state || state.day !== day) state = { day, topic: 0, save: 0 };
      const visitorKey = `visitor:${day}:${visitor}`;
      const row = await tx.get(visitorKey) || { topic: 0, save: 0, lastTopic: 0, lastSave: 0 };
      const lastKey = kind === 'topic' ? 'lastTopic' : 'lastSave';
      const spacing = kind === 'topic' ? 8000 : 1000;
      if (state[kind] >= globalMax) return { error: kind === 'topic' ? 'Today’s topic-generation allowance has been used. Cached topics and daily runs still work.' : 'Saving has reached today’s limit. Please try again tomorrow.', code: 'daily_global_limit', retry: retryDay };
      if (row[kind] >= perVisitor) return { error: kind === 'topic' ? 'You’ve used today’s new-topic allowance. Try a cached topic, the daily passage, or your own text.' : 'You’ve reached today’s save limit. Your run remains on this device.', code: 'daily_visitor_limit', retry: retryDay };
      if (row[lastKey] && now - row[lastKey] < spacing) return { error: 'Please wait a moment and try again.', code: 'too_many_requests', retry: Math.ceil((spacing - now + row[lastKey]) / 1000) };
      row[kind]++; row[lastKey] = now; state[kind]++;
      await tx.put('counters', state);
      await tx.put(visitorKey, row);
      return { ok: true };
    });
    await this.armEarlier(Date.parse(day) + 86460000);
    return Response.json(outcome, { status: outcome.ok ? 200 : 429, headers: outcome.retry ? { 'Retry-After': String(outcome.retry) } : {} });
  }
  armEarlier(at) {
    // Serialize the read/set pair, so concurrent requests cannot move an already
    // scheduled midnight cleanup into the following day.
    const task = this.alarmQueue.then(async () => {
      if (!this.state.storage.setAlarm) return;
      const existing = this.state.storage.getAlarm ? await this.state.storage.getAlarm() : null;
      if (existing === null || existing === undefined || existing > at) await this.state.storage.setAlarm(at);
    });
    this.alarmQueue = task.catch(() => {});
    return task;
  }
  async alarm() {
    const day = today();
    await this.state.storage.transaction(async tx => {
      const counters = await tx.get('counters');
      if (counters && counters.day < day) await tx.delete('counters');
    });
    // Expire daily HMAC identities; each small row avoids a large combined value.
    if (this.state.storage.list) {
      const cutoff = `visitor:${day}:`;
      for (;;) {
        const rows = await this.state.storage.list({ prefix: 'visitor:', end: cutoff, limit: 128 });
        const keys = [...rows.keys()].filter(key => key < cutoff).slice(0, 128);
        if (!keys.length) break;
        await this.state.storage.delete(keys);
      }
      // A request just after midnight can create today's rows before this old
      // alarm fires. They still need an expiry even if no more requests arrive.
      const currentRows = await this.state.storage.list({ prefix: `visitor:${day}:`, limit: 1 });
      if (currentRows.size) await this.armEarlier(Date.parse(day) + 86460000);
    }
  }
}

export async function reserveQuota(request, env, kind) {
  if (!env.QUOTA?.idFromName || !env.QUOTA?.get) throw new ApiError(503, 'This service is temporarily unavailable. Please try again shortly.', 'quota_unavailable');
  // Cloudflare supplies this header at the edge; it is only sent to the internal
  // quota object for a daily HMAC and is never written to KV or durable storage.
  const ip = request.headers.get('CF-Connecting-IP') || 'local-development';
  const response = await env.QUOTA.get(env.QUOTA.idFromName('typy-global')).fetch('https://quota/take', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, ip })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status === 429 ? 429 : 503, body.error || 'Please try again shortly.', body.code || 'quota_unavailable', Number(response.headers.get('Retry-After')) || undefined);
  }
}

export function validateResult(input) {
  if (!input || typeof input !== 'object' || !input.run || typeof input.run !== 'object') throw new ApiError(400, 'A completed run is required.', 'invalid_run');
  const raw = input.run;
  if (raw.replayTruncated) throw new ApiError(413, 'This endless run is too long to publish a complete replay. Start a new run to share it.', 'replay_too_long');
  if (raw.version !== 1 || !MODES.includes(raw.mode) || !['space', 'letter'].includes(raw.advance)) throw new ApiError(400, 'Unsupported run format.', 'invalid_run');
  if (!finite(raw.durationMs, 1, 86400000)) throw new ApiError(400, 'Invalid run duration.', 'invalid_run');
  if (!Array.isArray(raw.words) || raw.words.length < 1 || raw.words.length > 300 || raw.words.some(word => typeof word !== 'string' || !word.length || Array.from(word).length > MAX_WORD_LENGTH || /[\s\u0000-\u001f\u007f<>]/u.test(word))) throw new ApiError(400, 'The passage must contain 1–300 plain-text words.', 'invalid_passage');
  const normalizedWords = normalizePassage(raw.words.join(' '));
  if (normalizedWords.length !== raw.words.length || normalizedWords.some((word, index) => word !== raw.words[index])) throw new ApiError(400, 'Passage words must match the game’s normalized text.', 'invalid_passage');
  if (!Array.isArray(raw.events) || raw.events.length < 1 || raw.events.length > 30000 || !Array.isArray(raw.wordTimings) || raw.wordTimings.length < 1 || raw.wordTimings.length > 6000) throw new ApiError(400, 'Invalid replay length.', 'invalid_run');
  let lastTime = 0, lastIndex = 0;
  const events = raw.events.map(event => {
    if (!event || !finite(event.t, lastTime, raw.durationMs + 1) || !integer(event.index, lastIndex, 5999) || !['hit', 'miss', 'backspace', 'advance', 'beat'].includes(event.type)) throw new ApiError(400, 'Invalid replay event.', 'invalid_run');
    if (event.index > lastIndex + 1) throw new ApiError(400, 'Replay words must be consecutive.', 'invalid_run');
    lastTime = event.t; lastIndex = event.index;
    return { t: event.t, type: event.type, index: event.index };
  });
  let end = 0;
  const wordTimings = raw.wordTimings.map((timing, index) => {
    if (!timing || timing.index !== index || !finite(timing.start, end, raw.durationMs + 1) || !finite(timing.end, timing.start, raw.durationMs + 1) || typeof timing.completed !== 'boolean' || !integer(timing.errors, 0, 30000)) throw new ApiError(400, 'Invalid word timing.', 'invalid_run');
    if (index && timing.start !== end) throw new ApiError(400, 'Word timings must be consecutive.', 'invalid_run');
    if (timing.missed && (raw.mode !== 'tempo' || timing.completed)) throw new ApiError(400, 'Invalid missed beat.', 'invalid_run');
    if (!timing.completed && !timing.missed && index !== raw.wordTimings.length - 1) throw new ApiError(400, 'Only the final word can be unfinished.', 'invalid_run');
    if (timing.typedEnd !== undefined && !finite(timing.typedEnd, timing.start, timing.end)) throw new ApiError(400, 'Invalid typing time.', 'invalid_run');
    end = timing.end;
    const clean = { index, start: timing.start, end: timing.end, completed: timing.completed, errors: timing.errors };
    if (timing.typedEnd !== undefined) clean.typedEnd = timing.typedEnd;
    if (timing.missed === true) clean.missed = true;
    return clean;
  });
  if (wordTimings[0].start !== 0 || Math.abs(end - raw.durationMs) > 1 || events.some(event => !wordTimings[event.index] || event.t < wordTimings[event.index].start || event.t > wordTimings[event.index].end + 1)) throw new ApiError(400, 'Replay does not match its duration.', 'invalid_run');
  if (['30','60'].includes(raw.mode) && raw.durationMs > Number(raw.mode) * 1000 + 1) throw new ApiError(400, 'Timed runs cannot exceed their limit.', 'invalid_run');
  const run = { version: 1, mode: raw.mode, advance: raw.advance, words: raw.words.slice(), durationMs: raw.durationMs, finishedReason: ['time','words','misses','manual','stopped'].includes(raw.finishedReason) ? raw.finishedReason : 'manual', events, wordTimings, replayTruncated: false };
  run.stats = summarizeRun(run);
  if (!run.stats.keystrokes || run.stats.wpm > 1000) throw new ApiError(400, 'This replay cannot be scored.', 'invalid_run');
  const sourceInput = input.source || {};
  const source = { kind: ['common', 'paste', 'topic', 'daily'].includes(sourceInput.kind) ? sourceInput.kind : 'common' };
  if (source.kind === 'topic') source.topic = normalizeTopic(sourceInput.topic);
  if (source.kind === 'daily') {
    const day = sourceInput.day;
    if (day !== today()) throw new ApiError(400, 'Only today’s daily run can join the daily board.', 'daily_expired');
    const expected = dailyPassage(day).words;
    if (run.mode !== '60' || Math.abs(run.durationMs - 60000) > 1 || run.finishedReason !== 'time' || JSON.stringify(run.words) !== JSON.stringify(expected)) throw new ApiError(400, 'Daily scores require the full 60-second daily passage.', 'invalid_daily');
    source.day = day;
  }
  return { run, source, name: cleanName(input.name) };
}

export async function saveResult(request, env, input) {
  const value = validateResult(input), kv = requireKV(env);
  await reserveQuota(request, env, 'save');
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  const record = { id, ...value, createdAt: new Date().toISOString() };
  await kv.put(`result:${id}`, JSON.stringify(record));
  let boardPublished = false;
  if (value.source.kind === 'daily') {
    const row = { id, name: value.name || 'Anonymous', ...value.run.stats, createdAt: record.createdAt };
    try {
      await kv.put(`board:${value.source.day}:${id}`, JSON.stringify(row), { expirationTtl: 86400 * 32, metadata: { id, name: row.name, wpm: row.wpm, accuracy: row.accuracy, bestStreak: row.bestStreak, createdAt: row.createdAt } });
      boardPublished = true;
    } catch { /* The durable result remains shareable; the client sees the board status. */ }
  }
  return { id, url: `/r/${id}`, raceUrl: `/race/${id}`, boardPublished };
}
export async function getResult(env, id) {
  if (!validId(id)) throw new ApiError(404, 'This run could not be found.', 'not_found');
  const result = await readJSON(requireKV(env), `result:${id}`);
  if (!result) throw new ApiError(404, 'This run could not be found. A new link can take a moment to appear.', 'not_found');
  return result;
}
export async function leaderboard(env, day = today()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || day > today()) throw new ApiError(400, 'Choose a valid daily date.', 'invalid_day');
  const kv = requireKV(env), entries = [];
  let cursor;
  do {
    const page = await kv.list({ prefix: `board:${day}:`, limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const key of page.keys || []) {
      const value = key.metadata || await readJSON(kv, key.name);
      if (value && Number.isFinite(value.wpm)) entries.push({ id: value.id, name: value.name || 'Anonymous', wpm: value.wpm, accuracy: value.accuracy, bestStreak: value.bestStreak, createdAt: value.createdAt });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && entries.length < 2000);
  entries.sort((a,b) => b.wpm - a.wpm || b.accuracy - a.accuracy || String(a.createdAt).localeCompare(String(b.createdAt)));
  return { day, entries: entries.slice(0, 50), total: entries.length };
}
