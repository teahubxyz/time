// Nostr for SLYNG: bech32 and NIP-19 names, events (NIP-01), signers (a key in this page, or a NIP-07 extension),
// a small relay pool with NIP-42 AUTH, and NIP-05 lookups. No dependencies.

import {
  utf8, hex, unhex, isHex64, sha256, schnorrSign, schnorrVerify, getPublicKey, isValidPublicKey,
  isValidPrivateKey, nip44ConversationKey, nip44Encrypt, nip44Decrypt,
} from './crypto.js';

export const now = () => Math.floor(Date.now() / 1000);

// ---------------------------------------------------------------------------------------------------- bech32

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values) {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk >>> 0;
}

function hrpExpand(hrp) {
  const out = [];
  for (const ch of hrp) out.push(ch.charCodeAt(0) >>> 5);
  out.push(0);
  for (const ch of hrp) out.push(ch.charCodeAt(0) & 31);
  return out;
}

function convertBits(data, from, to, pad) {
  let acc = 0, bits = 0;
  const out = [];
  const maxv = (1 << to) - 1;
  const maxAcc = (1 << (from + to - 1)) - 1;
  for (const value of data) {
    if (value < 0 || value >> from) throw new Error('bad bech32 data');
    acc = ((acc << from) | value) & maxAcc;
    bits += from;
    while (bits >= to) { bits -= to; out.push((acc >>> bits) & maxv); }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & maxv);
  } else if (bits >= from || ((acc << (to - bits)) & maxv)) {
    throw new Error('bad bech32 padding');
  }
  return out;
}

export function bech32Encode(hrp, bytes) {
  const data = convertBits(bytes, 8, 5, true);
  const values = [...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const pm = polymod(values) ^ 1;
  const check = [0, 1, 2, 3, 4, 5].map((i) => (pm >>> (5 * (5 - i))) & 31);
  return hrp + '1' + [...data, ...check].map((d) => CHARSET[d]).join('');
}

export function bech32Decode(str) {
  if (typeof str !== 'string') throw new Error('not bech32');
  if (str !== str.toLowerCase() && str !== str.toUpperCase()) throw new Error('mixed case');
  str = str.toLowerCase();
  const pos = str.lastIndexOf('1');
  if (pos < 1 || pos + 7 > str.length) throw new Error('not bech32');
  const hrp = str.slice(0, pos);
  const data = [];
  for (const ch of str.slice(pos + 1)) {
    const d = CHARSET.indexOf(ch);
    if (d === -1) throw new Error('bad bech32 character');
    data.push(d);
  }
  if (polymod([...hrpExpand(hrp), ...data]) !== 1) throw new Error('bad bech32 checksum');
  return { hrp, bytes: Uint8Array.from(convertBits(data.slice(0, -6), 5, 8, false)) };
}

// ---------------------------------------------------------------------------------------------------- NIP-19

export const npubEncode = (pubHex) => bech32Encode('npub', unhex(pubHex));
export const nsecEncode = (priv) => bech32Encode('nsec', priv);

function readTlv(bytes) {
  const out = {};
  for (let i = 0; i + 2 <= bytes.length;) {
    const t = bytes[i], l = bytes[i + 1];
    const v = bytes.subarray(i + 2, i + 2 + l);
    if (v.length !== l) throw new Error('bad tlv');
    (out[t] ||= []).push(v);
    i += 2 + l;
  }
  return out;
}

export function nprofileEncode(pubHex, relays = []) {
  const parts = [Uint8Array.of(0, 32), unhex(pubHex)];
  for (const r of relays) { const u = utf8(r); parts.push(Uint8Array.of(1, u.length), u); }
  let n = 0; for (const p of parts) n += p.length;
  const all = new Uint8Array(n); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  return bech32Encode('nprofile', all);
}

// Any way of naming a person: hex, npub, nprofile, or nostr: links to them. NIP-05 names need resolveNip05.
export function parsePerson(input) {
  let s = String(input || '').trim();
  if (s.startsWith('nostr:')) s = s.slice(6);
  if (isHex64(s.toLowerCase())) return { pubkey: s.toLowerCase(), relays: [] };
  if (/^(npub|nprofile)1/i.test(s)) {
    const { hrp, bytes } = bech32Decode(s);
    if (hrp === 'npub' && bytes.length === 32) return { pubkey: hex(bytes), relays: [] };
    if (hrp === 'nprofile') {
      const tlv = readTlv(bytes);
      const pk = tlv[0]?.[0];
      if (!pk || pk.length !== 32) throw new Error('bad nprofile');
      const relays = (tlv[1] || []).map((r) => new TextDecoder().decode(r));
      return { pubkey: hex(pk), relays };
    }
  }
  return null;
}

export function parseSecret(input) {
  const s = String(input || '').trim();
  let bytes = null;
  if (/^nsec1/i.test(s)) {
    const d = bech32Decode(s);
    if (d.hrp === 'nsec') bytes = d.bytes;
  } else if (isHex64(s.toLowerCase())) {
    bytes = unhex(s.toLowerCase());
  }
  if (!bytes || !isValidPrivateKey(bytes)) throw new Error('That is not a nostr secret key (nsec1… or 64 hex characters).');
  return bytes;
}

export const shortNpub = (pubHex) => { const n = npubEncode(pubHex); return n.slice(0, 10) + '…' + n.slice(-4); };

// ---------------------------------------------------------------------------------------------------- events

export function serializeEvent(e) {
  return JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content]);
}

export const eventId = (e) => hex(sha256(utf8(serializeEvent(e))));

export function finalizeEvent(template, priv) {
  const e = {
    kind: template.kind,
    created_at: template.created_at ?? now(),
    tags: template.tags || [],
    content: template.content ?? '',
    pubkey: hex(getPublicKey(priv)),
  };
  e.id = eventId(e);
  e.sig = hex(schnorrSign(unhex(e.id), priv));
  return e;
}

export function verifyEvent(e) {
  try {
    if (!e || !isHex64(e.id) || !isHex64(e.pubkey) || typeof e.sig !== 'string' || e.sig.length !== 128) return false;
    if (!Number.isInteger(e.kind) || !Number.isInteger(e.created_at) || !Array.isArray(e.tags) || typeof e.content !== 'string') return false;
    if (eventId(e) !== e.id) return false;
    return schnorrVerify(unhex(e.sig), unhex(e.id), unhex(e.pubkey));
  } catch {
    return false;
  }
}

export const tagValue = (e, name) => (e.tags || []).find((t) => t[0] === name)?.[1];
export const tagValues = (e, name) => (e.tags || []).filter((t) => t[0] === name).map((t) => t[1]);

// ---------------------------------------------------------------------------------------------------- signers

// A key that lives in this page
export class LocalSigner {
  constructor(priv) {
    if (!isValidPrivateKey(priv)) throw new Error('bad private key');
    this.priv = priv;
    this.pubkey = hex(getPublicKey(priv));
    this.kind = 'local';
    this.keys = new Map();
  }
  async getPublicKey() { return this.pubkey; }
  async signEvent(template) { return finalizeEvent(template, this.priv); }
  conversationKey(pubHex) {
    let k = this.keys.get(pubHex);
    if (!k) { k = nip44ConversationKey(this.priv, unhex(pubHex)); this.keys.set(pubHex, k); }
    return k;
  }
  async nip44Encrypt(pubHex, text) { return nip44Encrypt(text, this.conversationKey(pubHex)); }
  async nip44Decrypt(pubHex, payload) { return nip44Decrypt(payload, this.conversationKey(pubHex)); }
  get canEncrypt() { return true; }
}

// A NIP-07 browser extension (Alby, nos2x, Nostash…): the key never touches this page
export class ExtensionSigner {
  constructor(ext, pubkey) {
    this.ext = ext;
    this.pubkey = pubkey;
    this.kind = 'extension';
  }
  static async connect(ext = globalThis.nostr) {
    if (!ext?.getPublicKey) throw new Error('No nostr extension found in this browser.');
    const pubkey = String(await ext.getPublicKey()).toLowerCase();
    if (!isHex64(pubkey) || !isValidPublicKey(unhex(pubkey))) throw new Error('The extension gave back a key that is not a nostr public key.');
    return new ExtensionSigner(ext, pubkey);
  }
  async getPublicKey() { return this.pubkey; }
  async signEvent(template) {
    const e = await this.ext.signEvent({
      kind: template.kind, created_at: template.created_at ?? now(), tags: template.tags || [],
      content: template.content ?? '',
    });
    if (!verifyEvent(e) || e.pubkey !== this.pubkey) throw new Error('The extension returned an event that does not verify.');
    return e;
  }
  get canEncrypt() { return Boolean(this.ext.nip44?.encrypt && this.ext.nip44?.decrypt); }
  async nip44Encrypt(pubHex, text) {
    if (!this.canEncrypt) throw new Error('This extension cannot encrypt private notes (it has no NIP-44).');
    return this.ext.nip44.encrypt(pubHex, text);
  }
  async nip44Decrypt(pubHex, payload) {
    if (!this.canEncrypt) throw new Error('This extension cannot open private notes (it has no NIP-44).');
    return this.ext.nip44.decrypt(pubHex, payload);
  }
}

// ---------------------------------------------------------------------------------------------------- relays

let subCounter = 0;
const nextSubId = () => 's' + (++subCounter).toString(36) + Math.random().toString(36).slice(2, 6);

export function normalizeRelay(url) {
  try {
    const u = new URL(String(url).trim());
    if (u.protocol !== 'wss:' && u.protocol !== 'ws:') return null;
    u.hash = '';
    let s = u.toString();
    if (s.endsWith('/') && u.pathname === '/') s = s.slice(0, -1);
    return s.toLowerCase();
  } catch {
    return null;
  }
}

// One relay connection. Reconnects on demand; answers AUTH challenges with the pool's signer.
class Relay {
  constructor(url, pool) {
    this.url = url;
    this.pool = pool;
    this.ws = null;
    this.ready = null;
    this.subs = new Map();
    this.pending = new Map();
    this.authed = false;
    this.challenge = null;
    this.waitingAuth = [];
  }

  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(this.url); } catch (err) { reject(err); return; }
      this.ws = ws;
      const timer = setTimeout(() => { reject(new Error('timed out connecting to ' + this.url)); try { ws.close(); } catch {} }, 8000);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve();
        for (const [id, s] of this.subs) this.send(['REQ', id, ...s.filters]);
      };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('could not reach ' + this.url)); };
      ws.onclose = () => {
        clearTimeout(timer);
        this.authed = false;
        for (const [, p] of this.pending) p.resolve({ ok: false, message: 'connection closed' });
        this.pending.clear();
      };
      ws.onmessage = (m) => this.onMessage(m.data);
    });
    this.ready.catch(() => {});
    return this.ready;
  }

  send(msg) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  async onMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!Array.isArray(msg)) return;
    const [type, a, b, c] = msg;
    if (type === 'EVENT') {
      const s = this.subs.get(a);
      if (s && b && typeof b === 'object') s.onevent(b, this.url);
    } else if (type === 'EOSE') {
      this.subs.get(a)?.oneose?.(this.url);
    } else if (type === 'OK') {
      const p = this.pending.get(a);
      if (p) {
        this.pending.delete(a);
        if (!b && String(c || '').startsWith('auth-required') && p.event && !p.retried && this.pool.signer) {
          p.retried = true;
          this.waitingAuth.push(() => this.publish(p.event).then(p.resolve));
          await this.authenticate();
        } else {
          p.resolve({ ok: Boolean(b), message: String(c || '') });
        }
      }
    } else if (type === 'CLOSED') {
      const s = this.subs.get(a);
      if (s && String(b || '').startsWith('auth-required') && this.pool.signer && !s.retried) {
        s.retried = true;
        this.waitingAuth.push(() => this.send(['REQ', a, ...s.filters]));
        await this.authenticate();
      } else if (s) {
        s.oneose?.(this.url);
      }
    } else if (type === 'AUTH' && typeof a === 'string') {
      this.challenge = a;
      if (this.waitingAuth.length) await this.authenticate();
    }
  }

  async authenticate() {
    if (!this.challenge || !this.pool.signer || this.authing) return;
    this.authing = true;
    try {
      const ev = await this.pool.signer.signEvent({
        kind: 22242, tags: [['relay', this.url], ['challenge', this.challenge]], content: '',
      });
      const res = await new Promise((resolve) => {
        const t = setTimeout(() => { this.pending.delete(ev.id); resolve({ ok: false, message: 'auth timed out' }); }, 6000);
        this.pending.set(ev.id, { resolve: (r) => { clearTimeout(t); resolve(r); } });
        this.send(['AUTH', ev]);
      });
      this.authed = res.ok;
      const queued = this.waitingAuth.splice(0);
      if (res.ok) for (const fn of queued) fn();
    } catch {
      this.waitingAuth.length = 0;
    } finally {
      this.authing = false;
    }
  }

  subscribe(filters, handlers) {
    const id = nextSubId();
    this.subs.set(id, { filters, ...handlers });
    this.connect().then(() => {}, () => handlers.oneose?.(this.url));
    if (this.ws?.readyState === 1) this.send(['REQ', id, ...filters]);
    return () => {
      this.subs.delete(id);
      this.send(['CLOSE', id]);
    };
  }

  publish(event) {
    return new Promise((resolve) => {
      const done = (r) => { clearTimeout(t); resolve(r); };
      const t = setTimeout(() => { this.pending.delete(event.id); resolve({ ok: false, message: 'no answer' }); }, 8000);
      this.connect().then(() => {
        this.pending.set(event.id, { resolve: done, event });
        this.send(['EVENT', event]);
      }, (err) => done({ ok: false, message: err.message }));
    });
  }
}

export class Pool {
  constructor({ signer = null, verify = true } = {}) {
    this.relays = new Map();
    this.signer = signer;
    this.verify = verify;
  }
  relay(url) {
    const u = normalizeRelay(url);
    if (!u) return null;
    let r = this.relays.get(u);
    if (!r) { r = new Relay(u, this); this.relays.set(u, r); }
    return r;
  }

  // Subscribe on several relays at once: each event once, verified; oneose after every relay finished (or 6 s)
  subscribe(urls, filters, { onevent, oneose, verify = this.verify } = {}) {
    const seen = new Set();
    const relays = [...new Set(urls.map(normalizeRelay).filter(Boolean))].map((u) => this.relay(u));
    let left = relays.length;
    let eosed = false;
    const finish = () => { if (!eosed) { eosed = true; oneose?.(); } };
    const timer = setTimeout(finish, 6000);
    if (!left) { clearTimeout(timer); setTimeout(finish, 0); }
    const closers = relays.map((r) => r.subscribe(filters, {
      onevent: (e, from) => {
        if (!e?.id || seen.has(e.id)) return;
        seen.add(e.id);
        if (verify && !verifyEvent(e)) return;
        onevent?.(e, from);
      },
      oneose: () => { left -= 1; if (left <= 0) { clearTimeout(timer); finish(); } },
    }));
    return { close: () => { clearTimeout(timer); closers.forEach((c) => c()); } };
  }

  // Everything matching, gathered until every relay says EOSE
  query(urls, filters, { timeout = 6000 } = {}) {
    return new Promise((resolve) => {
      const out = [];
      let sub = null;
      const t = setTimeout(() => { sub?.close(); resolve(out); }, timeout);
      sub = this.subscribe(urls, filters, {
        onevent: (e) => out.push(e),
        oneose: () => { clearTimeout(t); sub?.close(); resolve(out); },
      });
    });
  }

  async publish(urls, event) {
    const relays = [...new Set(urls.map(normalizeRelay).filter(Boolean))].map((u) => this.relay(u));
    const results = await Promise.all(relays.map((r) => r.publish(event).then((res) => ({ url: r.url, ...res }))));
    return { ok: results.some((r) => r.ok), results };
  }

  close() {
    for (const r of this.relays.values()) try { r.ws?.close(); } catch {}
    this.relays.clear();
  }
}

// ---------------------------------------------------------------------------------------------------- profiles

export function parseProfile(e) {
  let p = {};
  try { p = JSON.parse(e.content) || {}; } catch {}
  const str = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : '');
  return {
    pubkey: e.pubkey,
    name: str(p.display_name, 64) || str(p.displayName, 64) || str(p.name, 64),
    handle: str(p.name, 64),
    picture: /^https:\/\//.test(p.picture || '') ? str(p.picture, 500) : '',
    lud16: str(p.lud16, 200),
    lud06: str(p.lud06, 2000),
    nip05: str(p.nip05, 200),
    about: str(p.about, 280),
    created_at: e.created_at,
  };
}

// newest replaceable event per author
export function latestBy(events, key = (e) => e.pubkey) {
  const m = new Map();
  for (const e of events) {
    const k = key(e);
    const cur = m.get(k);
    if (!cur || e.created_at > cur.created_at) m.set(k, e);
  }
  return m;
}

export function relayListFrom(e) {
  const read = [], write = [];
  for (const t of e?.tags || []) {
    if (t[0] !== 'r' || !normalizeRelay(t[1])) continue;
    const u = normalizeRelay(t[1]);
    if (!t[2] || t[2] === 'read') read.push(u);
    if (!t[2] || t[2] === 'write') write.push(u);
  }
  return { read, write };
}

export const dmRelaysFrom = (e) => (e?.tags || []).filter((t) => t[0] === 'relay').map((t) => normalizeRelay(t[1])).filter(Boolean);

// ---------------------------------------------------------------------------------------------------- NIP-05

export async function resolveNip05(name, fetcher = globalThis.fetch) {
  const m = /^([a-z0-9._-]+)@([a-z0-9.-]+\.[a-z]{2,})$/i.exec(String(name || '').trim());
  if (!m) return null;
  const [, local, domain] = m;
  const res = await fetcher(`https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(local.toLowerCase())}`);
  if (!res.ok) throw new Error(`${domain} did not answer for ${local}`);
  const json = await res.json();
  const pk = json?.names?.[local.toLowerCase()] || json?.names?.[local];
  if (!isHex64(String(pk || '').toLowerCase())) throw new Error(`${name} is not a nostr name`);
  const pubkey = pk.toLowerCase();
  const relays = (json.relays?.[pubkey] || []).map(normalizeRelay).filter(Boolean);
  return { pubkey, relays };
}
