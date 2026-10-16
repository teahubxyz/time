// A tiny nostr network on localhost, for the tests: a relay (NIP-01, optional NIP-42 AUTH), a lightning address
// server that hands out zap invoices and publishes receipts when they're "paid", and a Nostr Wallet Connect wallet.
// No dependencies; the WebSocket server is the bare RFC 6455 handshake and frames.
//
//   node tools/devnet.mjs [--auth]      prints one JSON line with the relay, servers and test keys, then serves

import http from 'node:http';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { finalizeEvent, verifyEvent, now, npubEncode } from '../lib/nostr.js';
import { generatePrivateKey, hex, getPublicKey, nip04Decrypt, nip04Encrypt, nip44ConversationKey, nip44Decrypt, nip44Encrypt, unhex } from '../lib/crypto.js';
import { invoiceMsats } from '../lib/zap.js';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function frame(text, op = 0x1) {
  const data = Buffer.from(text);
  let head;
  if (data.length < 126) head = Buffer.from([0x80 | op, data.length]);
  else if (data.length < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(data.length, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(data.length), 2); }
  return Buffer.concat([head, data]);
}

function acceptWebSockets(server, onConnection) {
  server.sockets = new Set();
  server.on('upgrade', (req, socket) => {
    server.sockets.add(socket);
    socket.on('close', () => server.sockets.delete(socket));
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    let buf = Buffer.alloc(0);
    let parts = [];
    let open = true;
    const conn = {
      send: (text) => { if (open) socket.write(frame(text)); },
      close: () => { if (open) { open = false; try { socket.end(Buffer.from([0x88, 0])); } catch {} } },
      onmessage: null,
      onclose: null,
    };
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        if (buf.length < 2) return;
        const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
        let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        const m = masked ? 4 : 0;
        if (buf.length < off + m + len) return;
        const payload = Buffer.from(buf.subarray(off + m, off + m + len));
        if (masked) { const mask = buf.subarray(off, off + 4); for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3]; }
        buf = buf.subarray(off + m + len);
        if (op === 0x8) { conn.close(); socket.destroy(); return; }
        if (op === 0x9) { socket.write(frame(payload.toString(), 0xa)); continue; }
        if (op === 0x1 || op === 0x0) {
          parts.push(payload);
          if (fin) { const text = Buffer.concat(parts).toString('utf8'); parts = []; conn.onmessage?.(text); }
        }
      }
    });
    socket.on('close', () => { open = false; conn.onclose?.(); });
    socket.on('error', () => { open = false; });
    onConnection(conn, req);
  });
}

export function matches(f, e) {
  if (f.ids && !f.ids.includes(e.id)) return false;
  if (f.authors && !f.authors.includes(e.pubkey)) return false;
  if (f.kinds && !f.kinds.includes(e.kind)) return false;
  if (f.since && e.created_at < f.since) return false;
  if (f.until && e.created_at > f.until) return false;
  for (const [k, vals] of Object.entries(f)) {
    if (k.length === 2 && k[0] === '#' && Array.isArray(vals)) {
      if (!e.tags.some((t) => t[0] === k[1] && vals.includes(t[1]))) return false;
    }
  }
  return true;
}

const isReplaceable = (k) => k === 0 || k === 3 || (k >= 10000 && k < 20000);
const isEphemeral = (k) => k >= 20000 && k < 30000;

export async function startDevnet({ auth = false, port = 0, lnPort = 0 } = {}) {
  const events = [];
  const subs = new Set();
  const lnKey = generatePrivateKey();
  const lnPub = hex(getPublicKey(lnKey));
  const walletKey = generatePrivateKey();
  const walletPub = hex(getPublicKey(walletKey));
  const walletClient = generatePrivateKey();
  const invoices = new Map();
  const stats = { published: 0, authed: 0, paid: 0, rejected: 0 };

  function store(e) {
    if (isEphemeral(e.kind)) return;
    if (isReplaceable(e.kind)) {
      const i = events.findIndex((x) => x.pubkey === e.pubkey && x.kind === e.kind);
      if (i >= 0) { if (events[i].created_at > e.created_at) return; events.splice(i, 1); }
    }
    if (!events.some((x) => x.id === e.id)) events.push(e);
  }

  function broadcast(e) {
    for (const s of subs) if (s.filters.some((f) => matches(f, e)) && s.allowed(e)) s.conn.send(JSON.stringify(['EVENT', s.id, e]));
  }

  function accept(e) {
    stats.published += 1;
    store(e);
    broadcast(e);
    walletBot(e);
  }

  // ---- the relay
  const relayServer = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/nostr+json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ name: 'slyng devnet', supported_nips: [1, 11, 42] }));
  });
  acceptWebSockets(relayServer, (conn) => {
    const challenge = crypto.randomBytes(8).toString('hex');
    let authedAs = null;
    const mine = new Map();
    const private1059 = (e) => !auth || e.kind !== 1059 || (authedAs && e.tags.some((t) => t[0] === 'p' && t[1] === authedAs));
    if (auth) conn.send(JSON.stringify(['AUTH', challenge]));
    conn.onmessage = (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      const [type, a, ...rest] = msg;
      if (type === 'EVENT') {
        const e = a;
        if (!verifyEvent(e)) { stats.rejected += 1; conn.send(JSON.stringify(['OK', e?.id || '', false, 'invalid: bad signature'])); return; }
        conn.send(JSON.stringify(['OK', e.id, true, '']));
        accept(e);
      } else if (type === 'REQ') {
        const filters = rest.filter((f) => f && typeof f === 'object');
        if (auth && !authedAs && filters.some((f) => f.kinds?.includes(1059))) {
          conn.send(JSON.stringify(['CLOSED', a, 'auth-required: private notes need AUTH']));
          return;
        }
        const s = { id: a, filters, conn, allowed: private1059 };
        mine.set(a, s);
        subs.add(s);
        const sent = new Set();
        for (const f of filters) {
          const hits = events.filter((e) => matches(f, e) && private1059(e)).sort((x, y) => y.created_at - x.created_at).slice(0, f.limit || 500);
          for (const e of hits) if (!sent.has(e.id)) { sent.add(e.id); conn.send(JSON.stringify(['EVENT', a, e])); }
        }
        conn.send(JSON.stringify(['EOSE', a]));
      } else if (type === 'CLOSE') {
        const s = mine.get(a);
        if (s) { subs.delete(s); mine.delete(a); }
      } else if (type === 'AUTH') {
        const e = a;
        const ok = verifyEvent(e) && e.kind === 22242 && e.tags.some((t) => t[0] === 'challenge' && t[1] === challenge)
          && Math.abs(e.created_at - now()) < 600;
        if (ok) { authedAs = e.pubkey; stats.authed += 1; }
        conn.send(JSON.stringify(['OK', e?.id || '', ok, ok ? '' : 'auth-required: bad auth']));
      }
    };
    conn.onclose = () => { for (const s of mine.values()) subs.delete(s); mine.clear(); };
  });

  await new Promise((r) => relayServer.listen(port, '127.0.0.1', r));
  const relayUrl = `ws://127.0.0.1:${relayServer.address().port}`;

  // ---- the lightning address server (LUD-06 / LUD-16 with NIP-57 zaps)
  function settle(pr) {
    const inv = invoices.get(pr);
    if (!inv) return null;
    if (!inv.paid) {
      inv.paid = true;
      stats.paid += 1;
      if (inv.zapRequest) {
        const zr = inv.zapRequest;
        const tags = [['p', zr.tags.find((t) => t[0] === 'p')[1]], ['P', zr.pubkey], ['bolt11', pr], ['description', JSON.stringify(zr)], ['preimage', inv.preimage]];
        const e = zr.tags.find((t) => t[0] === 'e');
        if (e) tags.push(['e', e[1]]);
        accept(finalizeEvent({ kind: 9735, created_at: now(), tags, content: '' }, lnKey));
      }
    }
    return inv.preimage;
  }

  const lnServer = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const json = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }); res.end(); return; }
    let m = /^\/\.well-known\/lnurlp\/([a-z0-9._-]+)$/.exec(u.pathname);
    if (m) {
      json(200, {
        tag: 'payRequest', callback: `${lnBase}/lnurlp/callback/${m[1]}`, minSendable: 1000, maxSendable: 100_000_000,
        metadata: JSON.stringify([['text/plain', `sats for ${m[1]}`]]), allowsNostr: true, nostrPubkey: lnPub, commentAllowed: 0,
      });
      return;
    }
    m = /^\/lnurlp\/callback\/([a-z0-9._-]+)$/.exec(u.pathname);
    if (m) {
      const amount = Number(u.searchParams.get('amount'));
      if (!amount || amount % 1000) { json(200, { status: 'ERROR', reason: 'amount must be whole sats' }); return; }
      let zapRequest = null;
      const raw = u.searchParams.get('nostr');
      if (raw) {
        try { zapRequest = JSON.parse(raw); } catch {}
        const amt = zapRequest?.tags?.find((t) => t[0] === 'amount')?.[1];
        if (!zapRequest || zapRequest.kind !== 9734 || !verifyEvent(zapRequest) || (amt && Number(amt) !== amount)) {
          json(200, { status: 'ERROR', reason: 'bad zap request' });
          return;
        }
      }
      const tail = Array.from(crypto.randomBytes(40), (b) => 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'[b & 31]).join('');
      const pr = `lnbc${amount / 100}n1p${tail}`;
      invoices.set(pr, { amount, zapRequest, paid: false, preimage: crypto.randomBytes(32).toString('hex'), name: m[1] });
      json(200, { pr, routes: [] });
      return;
    }
    if (u.pathname === '/settle') {
      const preimage = settle(u.searchParams.get('pr'));
      json(preimage ? 200 : 404, preimage ? { preimage } : { error: 'no such invoice' });
      return;
    }
    if (u.pathname === '/stats') { json(200, { ...stats, events: events.length }); return; }
    json(404, { error: 'not found' });
  });
  await new Promise((r) => lnServer.listen(lnPort, '127.0.0.1', r));
  const lnHost = `127.0.0.1:${lnServer.address().port}`;
  const lnBase = `http://${lnHost}`;

  // ---- the Nostr Wallet Connect wallet: pays our own invoices, answers in NIP-44 or NIP-04 as asked
  async function walletBot(e) {
    if (e.kind !== 23194 || !e.tags.some((t) => t[0] === 'p' && t[1] === walletPub)) return;
    const nip44 = e.tags.some((t) => t[0] === 'encryption' && t[1] === 'nip44_v2');
    const ck = nip44ConversationKey(walletKey, unhex(e.pubkey));
    let req;
    try {
      req = JSON.parse(nip44 ? nip44Decrypt(e.content, ck) : await nip04Decrypt(e.content, walletKey, unhex(e.pubkey)));
    } catch { return; }
    let body;
    if (req.method === 'pay_invoice') {
      const preimage = settle(req.params?.invoice);
      body = preimage ? { result_type: 'pay_invoice', result: { preimage } } : { result_type: 'pay_invoice', error: { code: 'PAYMENT_FAILED', message: 'no route to that invoice' } };
    } else {
      body = { result_type: req.method, error: { code: 'NOT_IMPLEMENTED', message: 'not here' } };
    }
    const text = JSON.stringify(body);
    const content = nip44 ? nip44Encrypt(text, ck) : await nip04Encrypt(text, walletKey, unhex(e.pubkey));
    const tags = [['p', e.pubkey], ['e', e.id]];
    if (nip44) tags.push(['encryption', 'nip44_v2']);
    accept(finalizeEvent({ kind: 23195, created_at: now(), tags, content }, walletKey));
  }
  accept(finalizeEvent({ kind: 13194, created_at: now(), tags: [['encryption', 'nip44_v2 nip04']], content: 'pay_invoice' }, walletKey));

  // ---- people: alice follows bob (who takes sats) and carol (notes only)
  const people = {};
  for (const [name, lud16] of [['alice', ''], ['bob', `bob@${lnHost}`], ['carol', '']]) {
    const sk = generatePrivateKey();
    people[name] = { sk: hex(sk), pk: hex(getPublicKey(sk)), npub: npubEncode(hex(getPublicKey(sk))) };
    accept(finalizeEvent({ kind: 0, content: JSON.stringify({ name, ...(lud16 ? { lud16 } : {}) }), tags: [] }, sk));
    accept(finalizeEvent({ kind: 10050, content: '', tags: [['relay', relayUrl]] }, sk));
  }
  accept(finalizeEvent({ kind: 3, content: '', tags: [['p', people.bob.pk], ['p', people.carol.pk]] }, unhex(people.alice.sk)));

  const nwc = `nostr+walletconnect://${walletPub}?relay=${encodeURIComponent(relayUrl)}&secret=${hex(walletClient)}`;
  return {
    relay: relayUrl, ln: lnBase, nwc, people, stats, events,
    close: () => {
      for (const sock of relayServer.sockets) sock.destroy();
      relayServer.closeAllConnections?.();
      lnServer.closeAllConnections?.();
      return Promise.all([new Promise((r) => relayServer.close(r)), new Promise((r) => lnServer.close(r))]);
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const net = await startDevnet({ auth: process.argv.includes('--auth') });
  const { close, stats, events, ...out } = net;
  console.log(JSON.stringify(out));
  process.on('SIGTERM', () => process.exit(0));
}
