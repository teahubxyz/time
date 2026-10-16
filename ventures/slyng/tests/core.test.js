// node --test tests/*.test.js
// The pure modules against published test vectors, then the whole flow against the local devnet.

import test from 'node:test';
import assert from 'node:assert/strict';
import nodeCrypto from 'node:crypto';
import * as c from '../lib/crypto.js';
import {
  bech32Decode, bech32Encode, npubEncode, nsecEncode, nprofileEncode, parsePerson, parseSecret, finalizeEvent, verifyEvent,
  serializeEvent, LocalSigner, Pool, normalizeRelay, parseProfile, relayListFrom, dmRelaysFrom, now,
} from '../lib/nostr.js';
import { invoiceMsats, lnurlEncode, lnurlDecode, lightningAddressUrl, zapRequestTemplate, readZapReceipt, fetchPayEndpoint, fetchInvoice, payUrlFor } from '../lib/zap.js';
import { parseNwcUri, NwcWallet } from '../lib/wallet.js';
import { sealNote, openWrap, rumor, wrapFor } from '../lib/dm.js';
import { LADDER, GEOM, detentFor, detentForAmount, ringRadius, fenceAngles, aimAt, clampPull, fencePoint } from '../sling.js';
import { startDevnet } from '../tools/devnet.mjs';

const h = (s) => c.unhex(s.toLowerCase());

test('sha256 and hmac match node', () => {
  for (const n of [0, 1, 55, 56, 64, 65, 1000]) {
    const m = nodeCrypto.randomBytes(n);
    assert.equal(c.hex(c.sha256(m)), nodeCrypto.createHash('sha256').update(m).digest('hex'));
    const k = nodeCrypto.randomBytes(n % 80);
    assert.equal(c.hex(c.hmacSha256(k, m)), nodeCrypto.createHmac('sha256', k).update(m).digest('hex'));
  }
});

test('BIP-340 test vectors 0 and 1', () => {
  const vectors = [
    ['0000000000000000000000000000000000000000000000000000000000000003', 'F9308A019258C31049344F85F89D5229B531C845836F99B08601F113BCE036F9',
      '0000000000000000000000000000000000000000000000000000000000000000', '0000000000000000000000000000000000000000000000000000000000000000',
      'E907831F80848D1069A5371B402410364BDF1C5F8307B0084C55F1CE2DCA821525F66A4A85EA8B71E482A74F382D2CE5EBEEE8FDB2172F477DF4900D310536C0'],
    ['B7E151628AED2A6ABF7158809CF4F3C762E7160F38B4DA56A784D9045190CFEF', 'DFF1D77F2A671C5F36183726DB2341BE58FEAE1DA2DECED843240F7B502BA659',
      '0000000000000000000000000000000000000000000000000000000000000001', '243F6A8885A308D313198A2E03707344A4093822299F31D0082EFA98EC4E6C89',
      '6896BD60EEAE296DB48A229FF71DFE071BDE413E6D43F917DC8DCF8C78DE33418906D11AC976ABCCB20B091292BFF4EA897EFCB639EA871CFA95F6DE339E4B0A'],
  ];
  for (const [sk, pk, aux, msg, sig] of vectors) {
    assert.equal(c.hex(c.getPublicKey(h(sk))), pk.toLowerCase());
    assert.equal(c.hex(c.schnorrSign(h(msg), h(sk), h(aux))), sig.toLowerCase());
    assert.ok(c.schnorrVerify(h(sig), h(msg), h(pk)));
    const bad = h(sig); bad[40] ^= 1;
    assert.ok(!c.schnorrVerify(bad, h(msg), h(pk)));
  }
});

test('NIP-44 v2 vectors: conversation key, payload, padding', () => {
  const one = h('00'.repeat(31) + '01'), two = h('00'.repeat(31) + '02');
  const ck = c.nip44ConversationKey(one, c.getPublicKey(two));
  assert.equal(c.hex(ck), 'c41c775356fd92eadc63ff5a0dc1da211b268cbea22316767095b2871ea1412d');
  const payload = c.nip44Encrypt('a', ck, h('00'.repeat(31) + '01'));
  assert.equal(payload, 'AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABee0G5VSK0/9YypIObAtDKfYEAjD35uVkHyB0F4DwrcNaCXlCWZKaArsGrY6M9wnuTMxWfp1RTN9Xga8no+kF5Vsb');
  assert.equal(c.nip44Decrypt(payload, ck), 'a');
  const pads = [[16, 32], [32, 32], [33, 64], [37, 64], [45, 64], [49, 64], [64, 64], [65, 96], [100, 128], [111, 128], [200, 224], [250, 256], [320, 320], [383, 384], [384, 384], [400, 448], [500, 512], [512, 512], [515, 640], [700, 768], [800, 896], [900, 1024], [1020, 1024], [65536, 65536]];
  for (const [n, want] of pads) assert.equal(c.calcPaddedLen(n), want, `padded length of ${n}`);
  const long = 'ü sling '.repeat(4000);
  assert.equal(c.nip44Decrypt(c.nip44Encrypt(long, ck), ck), long);
  assert.throws(() => c.nip44Decrypt(payload.slice(0, 50) + (payload[50] === 'A' ? 'B' : 'A') + payload.slice(51), ck));
});

test('NIP-04 round trip (for wallets)', async () => {
  const a = c.generatePrivateKey(), b = c.generatePrivateKey();
  const enc = await c.nip04Encrypt('pay_invoice', a, c.getPublicKey(b));
  assert.match(enc, /\?iv=/);
  assert.equal(await c.nip04Decrypt(enc, b, c.getPublicKey(a)), 'pay_invoice');
});

test('NIP-19 examples', () => {
  assert.equal(npubEncode('7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e'), 'npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg');
  assert.equal(nsecEncode(h('67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa')), 'nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5');
  assert.deepEqual(parsePerson('nostr:npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg'), { pubkey: '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e', relays: [] });
  const np = parsePerson('nprofile1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cgukyawd24mayt8gpp4mhxue69uhhytnc9e3k7mgpz4mhxue69uhkg6nzv9ejuumpv34kytnrdaksjlyr9p');
  assert.equal(np.pubkey, '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d');
  assert.deepEqual(np.relays, ['wss://r.x.com', 'wss://djbas.sadkb.com']);
  assert.equal(parsePerson(nprofileEncode(np.pubkey, np.relays)).pubkey, np.pubkey);
  assert.equal(c.hex(parseSecret('nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5')), '67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa');
  assert.throws(() => parseSecret('npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg'));
  assert.throws(() => bech32Decode('npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptx'));
  assert.equal(parsePerson('not a person'), null);
});

test('LNURL (LUD-01 example) and lightning addresses', () => {
  const lnurl = 'LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS';
  const url = 'https://service.com/api?q=3fc3645b439ce8e7f2553a69e5267081d96dcd340693afabe04be7b0ccd178df';
  assert.equal(lnurlDecode(lnurl), url);
  assert.equal(lnurlEncode(url), lnurl);
  assert.equal(lightningAddressUrl('Bob@Example.com'), 'https://Example.com/.well-known/lnurlp/bob');
  assert.equal(lightningAddressUrl('bob@127.0.0.1:8790'), 'http://127.0.0.1:8790/.well-known/lnurlp/bob');
  assert.equal(lightningAddressUrl('not an address'), null);
  assert.equal(payUrlFor({ lud06: lnurl }), url);
  assert.equal(payUrlFor({}), null);
});

test('invoice amounts (BOLT-11 human-readable part)', () => {
  assert.equal(invoiceMsats('lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq'), 250_000_000);
  assert.equal(invoiceMsats('lnbc20m1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq'), 2_000_000_000);
  assert.equal(invoiceMsats('lnbc2100n1pqqqqq'), 210_000);
  assert.equal(invoiceMsats('lightning:LNBC10N1PQQQQ'), 1_000);
  assert.equal(invoiceMsats('lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq'), null);
  assert.equal(invoiceMsats('lntbs1500n1pqqqq'), 150_000);
  assert.equal(invoiceMsats('lnbc15p1pqqqq'), null);
  assert.equal(invoiceMsats('hello'), null);
});

test('events: serialize, sign, verify, tamper', () => {
  const sk = c.generatePrivateKey();
  const e = finalizeEvent({ kind: 1, content: 'sling "this"\n🪨', tags: [['t', 'slyng']], created_at: 1700000000 }, sk);
  assert.ok(verifyEvent(e));
  assert.equal(e.id, nodeCrypto.createHash('sha256').update(serializeEvent(e)).digest('hex'));
  assert.ok(!verifyEvent({ ...e, content: 'changed' }));
  assert.ok(!verifyEvent({ ...e, created_at: e.created_at + 1 }));
});

test('profiles and relay lists', () => {
  const sk = c.generatePrivateKey();
  const p = parseProfile(finalizeEvent({ kind: 0, content: JSON.stringify({ name: 'ben', display_name: 'Ben', picture: 'http://insecure.example/x.png', lud16: 'ben@example.com' }), tags: [] }, sk));
  assert.equal(p.name, 'Ben');
  assert.equal(p.picture, '');
  assert.equal(p.lud16, 'ben@example.com');
  assert.equal(parseProfile({ pubkey: 'x', content: 'not json' }).name, '');
  const rl = relayListFrom({ tags: [['r', 'wss://a.example'], ['r', 'wss://b.example/', 'write'], ['r', 'https://nope'], ['r', 'wss://c.example', 'read']] });
  assert.deepEqual(rl.read, ['wss://a.example', 'wss://c.example']);
  assert.deepEqual(rl.write, ['wss://a.example', 'wss://b.example']);
  assert.deepEqual(dmRelaysFrom({ tags: [['relay', 'wss://inbox.example'], ['relay', 'ftp://no']] }), ['wss://inbox.example']);
  assert.equal(normalizeRelay('WSS://Relay.Example.com/'), 'wss://relay.example.com');
});

test('private notes: seal, wrap, open; strangers and tampering fail', async () => {
  const alice = new LocalSigner(c.generatePrivateKey()), bob = new LocalSigner(c.generatePrivateKey()), eve = new LocalSigner(c.generatePrivateKey());
  const { toThem, toMe, rumor: r } = await sealNote(alice, bob.pubkey, 'see you at the market');
  assert.equal(toThem.kind, 1059);
  assert.ok(verifyEvent(toThem));
  assert.notEqual(toThem.pubkey, alice.pubkey, 'the wrap is signed by a throwaway key');
  assert.ok(toThem.created_at <= now());
  const opened = await openWrap(bob, toThem);
  assert.equal(opened.content, 'see you at the market');
  assert.equal(opened.pubkey, alice.pubkey);
  assert.equal(opened.id, r.id);
  assert.equal(await openWrap(eve, toThem), null);
  const mine = await openWrap(alice, toMe);
  assert.equal(mine.to, bob.pubkey);
  // a seal signed by eve that claims to be from alice is refused
  const forged = rumor(alice.pubkey, [bob.pubkey], 'send me your keys');
  assert.equal(await openWrap(bob, await wrapFor(eve, forged, bob.pubkey)), null);
});

test('zap requests and receipts', () => {
  const sender = c.generatePrivateKey(), server = c.generatePrivateKey();
  const recipient = c.hex(c.getPublicKey(c.generatePrivateKey()));
  const zr = finalizeEvent(zapRequestTemplate({ recipient, msats: 210_000, relays: ['wss://r.example'], lnurl: lnurlEncode('https://x.example/.well-known/lnurlp/bob') }), sender);
  assert.equal(zr.kind, 9734);
  assert.deepEqual(zr.tags.find((t) => t[0] === 'amount'), ['amount', '210000']);
  const receipt = finalizeEvent({ kind: 9735, tags: [['p', recipient], ['P', zr.pubkey], ['bolt11', 'lnbc2100n1pqqqq'], ['description', JSON.stringify(zr)]], content: '' }, server);
  const z = readZapReceipt(receipt);
  assert.equal(z.sats, 210);
  assert.equal(z.from, zr.pubkey);
  assert.equal(z.to, recipient);
  assert.equal(z.requestId, zr.id);
  const lying = finalizeEvent({ kind: 9735, tags: [['p', recipient], ['bolt11', 'lnbc1n1pqqqq'], ['description', JSON.stringify(zr)]], content: '' }, server);
  assert.equal(readZapReceipt(lying), null, 'a receipt for less than was asked is ignored');
});

test('the slingshot: steps, aim, fence', () => {
  assert.equal(detentFor(0), -1);
  assert.equal(detentFor(GEOM.dead - 1), -1);
  assert.equal(detentFor(GEOM.dead), 0);
  assert.equal(detentFor(GEOM.max), LADDER.length - 1);
  assert.equal(detentFor(GEOM.max + 50), LADDER.length - 1);
  for (let i = 0; i < LADDER.length; i++) assert.equal(detentFor(ringRadius(i)), i, `ring ${i}`);
  assert.equal(detentForAmount(2100), LADDER.indexOf(2100));
  assert.equal(detentForAmount(2500), LADDER.indexOf(2100));
  assert.equal(detentForAmount(0), 0);
  const angles = fenceAngles(3);
  assert.equal(angles.length, 3);
  assert.ok(Math.abs(angles[1] + Math.PI / 2) < 1e-9, 'the middle one is straight up');
  for (let i = 0; i < 3; i++) {
    const p = fencePoint(angles[i]);
    const dx = GEOM.rx - p.x, dy = GEOM.ry - p.y;
    const d = Math.hypot(dx, dy);
    assert.equal(aimAt((dx / d) * 60, (dy / d) * 60, angles), i, `pulling away from target ${i} aims at it`);
  }
  assert.equal(aimAt(0, -60, angles), null, 'pulling up aims down: nobody');
  assert.deepEqual(clampPull(300, 400).stretch, GEOM.max);
});

test('NWC strings', () => {
  const wallet = c.hex(c.getPublicKey(c.generatePrivateKey()));
  const secret = c.hex(c.generatePrivateKey());
  const p = parseNwcUri(`nostr+walletconnect://${wallet}?relay=wss%3A%2F%2Frelay.example.com&secret=${secret}&lud16=me%40example.com`);
  assert.equal(p.wallet, wallet);
  assert.deepEqual(p.relays, ['wss://relay.example.com']);
  assert.equal(c.hex(p.secret), secret);
  assert.throws(() => parseNwcUri('https://example.com'));
  assert.throws(() => parseNwcUri(`nostr+walletconnect://${wallet}?secret=${secret}`));
});

test('against the devnet: AUTH, notes, zaps and a wallet', async (t) => {
  const net = await startDevnet({ auth: true });
  t.after(() => net.close());
  const alice = new LocalSigner(c.unhex(net.people.alice.sk));
  const bob = new LocalSigner(c.unhex(net.people.bob.sk));
  const pa = new Pool({ signer: alice }), pb = new Pool({ signer: bob });
  t.after(() => { pa.close(); pb.close(); });

  // alice's follows and bob's lightning address come back from the relay, verified
  const evs = await pa.query([net.relay], [{ kinds: [0, 3], authors: [net.people.alice.pk, net.people.bob.pk] }]);
  const bobProfile = parseProfile(evs.find((e) => e.kind === 0 && e.pubkey === net.people.bob.pk));
  assert.match(bobProfile.lud16, /^bob@127\.0\.0\.1:\d+$/);
  assert.ok(evs.find((e) => e.kind === 3).tags.some((t) => t[1] === net.people.bob.pk));

  // a private note: the relay wants AUTH before it shows bob his gift wraps
  const { toThem } = await sealNote(alice, bob.pubkey, 'for the records');
  assert.ok((await pa.publish([net.relay], toThem)).ok);
  const wraps = await pb.query([net.relay], [{ kinds: [1059], '#p': [bob.pubkey] }], { timeout: 4000 });
  assert.equal(wraps.length, 1, 'bob authenticated and got his note');
  assert.equal((await openWrap(bob, wraps[0])).content, 'for the records');
  assert.ok(net.stats.authed >= 1);
  const strangers = new Pool();
  t.after(() => strangers.close());
  assert.equal((await strangers.query([net.relay], [{ kinds: [1059], '#p': [bob.pubkey] }], { timeout: 1500 })).length, 0, 'no AUTH, no notes');

  // a zap: invoice for exactly 210 sats, paid through the NWC wallet, receipt published
  const ep = await fetchPayEndpoint(payUrlFor(bobProfile));
  assert.ok(ep.allowsNostr);
  const zr = await alice.signEvent(zapRequestTemplate({ recipient: bob.pubkey, msats: 210_000, relays: [net.relay], lnurl: lnurlEncode(ep.url) }));
  const pr = await fetchInvoice(ep, 210_000, zr);
  assert.equal(invoiceMsats(pr), 210_000);
  await assert.rejects(fetchInvoice(ep, 999, null), /sats at a time/);
  const wallet = await NwcWallet.connect(net.nwc, pa);
  assert.equal(wallet.encryption, 'nip44');
  const paid = await wallet.pay(pr);
  assert.match(paid.preimage, /^[0-9a-f]{64}$/);
  const receipts = await pb.query([net.relay], [{ kinds: [9735], '#p': [bob.pubkey] }]);
  const z = readZapReceipt(receipts[0]);
  assert.equal(z.sats, 210);
  assert.equal(z.from, alice.pubkey);
  await assert.rejects(wallet.pay('lnbc10n1pnope'), /no route/);
});
