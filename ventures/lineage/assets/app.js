(() => {
'use strict';
const L = window.LC;
const te = new TextEncoder();
const hex = L.bytesToHex;
const b64 = L.base64.encode;
const SALT = te.encode('lineage/v0');
const ZPUB = { private: 0x04b2430c, public: 0x04b24746 };
const LEAVES = ['ssh', 'git', 'dkim', 'wg'];
const NODE_LEAVES = ['ssh-ca', 'mtls', 'noise'];
const LEAF_DESC = { ssh: 'shell access, certified by the CA', git: 'commit signing', dkim: 'mail signing', wg: 'WireGuard peer key' };
const NODE_DESC = { 'ssh-ca': 'SSH certificate authority', mtls: 'TLS identity between nodes', noise: 'Headscale noise key' };
const VEC = {
  bip84: {
    m: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    btc: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
    zpub: 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs',
    eth: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
    note: 'Loaded the BIP-84 test mnemonic. The ✓ marks in the tree mean the derived address, zpub and Ethereum address match the published values.'
  },
  nip06: {
    m: 'leader monkey parrot ring guide accident before fence cannon height naive bean',
    npub: 'npub1zutzeysacnf9rru6zqwmxd54mud0k44tst6l70ja5mhv8jjumytsd2x7nu',
    note: 'Loaded the first NIP-06 test mnemonic. The ✓ on the org identity means its npub matches the one in the NIP.'
  }
};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = (s, fb) => (s || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || fb;
const dom = (s, fb) => (s || '').toLowerCase().replace(/[^a-z0-9.-]+/g, '').replace(/^[.-]+|[.-]+$/g, '').slice(0, 63) || fb;
const short = (s, a = 10, b = 6) => (s.length > a + b + 1 ? s.slice(0, a) + '…' + s.slice(-b) : s);
const trunc = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow = () => matchMedia('(max-width: 960px)').matches;
const letter = (i) => (i <= 26 ? 'agent-' + String.fromCharCode(96 + i) : 'agent-' + i);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ---------- key material ---------- */
const leafKey = (ikm, info) => L.hkdf(L.sha256, ikm, SALT, te.encode(info), 32);
const clamp = (k) => { const c = Uint8Array.from(k); c[0] &= 248; c[31] &= 127; c[31] |= 64; return c; };
const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
const sshStr = (bytes) => L.concatBytes(u32(bytes.length), bytes);
const sshBlob = (pub) => L.concatBytes(sshStr(te.encode('ssh-ed25519')), sshStr(pub));
const sshLine = (pub, comment) => 'ssh-ed25519 ' + b64(sshBlob(pub)) + (comment ? ' ' + comment : '');
const sshFp = (pub) => 'SHA256:' + b64(L.sha256(sshBlob(pub))).replace(/=+$/, '');
function opensshPriv(seed, pub, comment) {
  const check = L.sha256(seed).slice(0, 4);
  let priv = L.concatBytes(check, check, sshStr(te.encode('ssh-ed25519')), sshStr(pub), sshStr(L.concatBytes(seed, pub)), sshStr(te.encode(comment)));
  const pad = new Uint8Array((8 - (priv.length % 8)) % 8).map((_, i) => i + 1);
  priv = L.concatBytes(priv, pad);
  const body = L.concatBytes(te.encode('openssh-key-v1\0'), sshStr(te.encode('none')), sshStr(te.encode('none')), sshStr(new Uint8Array(0)), u32(1), sshStr(sshBlob(pub)), sshStr(priv));
  return '-----BEGIN OPENSSH PRIVATE KEY-----\n' + b64(body).match(/.{1,70}/g).join('\n') + '\n-----END OPENSSH PRIVATE KEY-----\n';
}
const pem = (label, bytes) => '-----BEGIN ' + label + '-----\n' + b64(bytes).match(/.{1,64}/g).join('\n') + '\n-----END ' + label + '-----\n';
const SPKI_ED = L.hexToBytes('302a300506032b6570032100');
const PKCS8_ED = L.hexToBytes('302e020100300506032b657004220420');
function ethAddress(priv) {
  const a = hex(L.keccak_256(L.secp256k1.getPublicKey(priv, false).slice(1)).slice(-20));
  const h = hex(L.keccak_256(te.encode(a)));
  let o = '0x';
  for (let i = 0; i < 40; i++) o += parseInt(h[i], 16) >= 8 ? a[i].toUpperCase() : a[i];
  return o;
}
const p2wpkh = (pub) => L.bech32.encode('bc', [0, ...L.bech32.toWords(L.ripemd160(L.sha256(pub)))]);
const wif = (priv) => L.base58check.encode(L.concatBytes(Uint8Array.of(0x80), priv, Uint8Array.of(1)));
const npubOf = (pk) => L.bech32.encode('npub', L.bech32.toWords(pk));
const nsecOf = (sk) => L.bech32.encode('nsec', L.bech32.toWords(sk));

const sigCache = new Map();
function signEvent(sk, created_at, kind, tags, content) {
  const pubkey = hex(L.schnorr.getPublicKey(sk));
  const idb = L.sha256(te.encode(JSON.stringify([0, pubkey, created_at, kind, tags, content])));
  const id = hex(idb);
  let sig = sigCache.get(id);
  if (!sig) { sig = hex(L.schnorr.sign(idb, sk)); sigCache.set(id, sig); }
  return { id, pubkey, created_at, kind, tags, content, sig };
}
function verifyEvent(e) {
  const id = hex(L.sha256(te.encode(JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content]))));
  try { return id === e.id && L.schnorr.verify(L.hexToBytes(e.sig), L.hexToBytes(e.id), L.hexToBytes(e.pubkey)); } catch { return false; }
}
const fmtEvent = (e) => '{\n  "id": "' + e.id + '",\n  "pubkey": "' + e.pubkey + '",\n  "created_at": ' + e.created_at + ',\n  "kind": ' + e.kind +
  ',\n  "tags": [\n' + e.tags.map((t) => '    ' + JSON.stringify(t)).join(',\n') + '\n  ],\n  "content": ' + JSON.stringify(e.content) + ',\n  "sig": "' + e.sig + '"\n}';

/* ---------- state ---------- */
const S = {
  mnemonic: '', passphrase: '', seed: null, root: null,
  org: 'lineage', domain: 'lineage.llc',
  agents: [{ i: 1, name: 'agent-a', revoked: false, revokedAt: null }, { i: 2, name: 'agent-b', revoked: false, revokedAt: null }],
  open: new Set(['a1', 'node']), sel: 'org', reveal: false, hideWords: false, ex: 'nostr',
  ts: Math.floor(Date.now() / 1000)
};
let D = null;
let seedToken = 0;
const copyMap = new Map();

function nostrAt(i) {
  const k = S.root.derive("m/44'/1237'/" + i + "'/0/0");
  const sk = k.privateKey, pk = L.schnorr.getPublicKey(sk);
  return { i, path: "m/44'/1237'/" + i + "'/0/0", sk, pk, hex: hex(pk), npub: npubOf(pk), nsec: nsecOf(sk) };
}
function deriveAgent(i) {
  const n = nostrAt(i), lv = {};
  for (const lf of ['ssh', 'git', 'dkim']) { const seed = leafKey(n.sk, lf); lv[lf] = { info: lf, seed, pub: L.ed25519.getPublicKey(seed) }; }
  const wg = clamp(leafKey(n.sk, 'wg'));
  lv.wg = { info: 'wg', priv: wg, pub: L.x25519.getPublicKey(wg) };
  return { ...n, leaves: lv };
}
function deriveAll() {
  const r = S.root;
  const eth = r.derive("m/44'/60'/0'/0/0");
  const btc = r.derive("m/84'/0'/0'/0/0");
  const acct = L.HDKey.fromMasterSeed(S.seed, ZPUB).derive("m/84'/0'/0'");
  const ca = leafKey(S.seed, 'node/ssh-ca'), mt = leafKey(S.seed, 'node/mtls'), no = clamp(leafKey(S.seed, 'node/noise'));
  return {
    fp: r.fingerprint.toString(16).padStart(8, '0'),
    eth: { priv: eth.privateKey, pub: eth.publicKey, addr: ethAddress(eth.privateKey) },
    btc: { priv: btc.privateKey, pub: btc.publicKey, addr: p2wpkh(btc.publicKey), zpub: acct.publicExtendedKey },
    org: nostrAt(0),
    agents: new Map(S.agents.map((a) => [a.i, deriveAgent(a.i)])),
    node: {
      'ssh-ca': { info: 'node/ssh-ca', seed: ca, pub: L.ed25519.getPublicKey(ca) },
      mtls: { info: 'node/mtls', seed: mt, pub: L.ed25519.getPublicKey(mt) },
      noise: { info: 'node/noise', priv: no, pub: L.x25519.getPublicKey(no) }
    }
  };
}

const agentOf = (i) => S.agents.find((a) => a.i === i);
const handle = (a) => a.name + '@' + S.domain;
const urn = (...parts) => ['urn:lineage', S.org, ...parts].join(':');
const nextIndex = () => S.agents.reduce((m, a) => Math.max(m, a.i), 0) + 1;
function birthOf(a) {
  const d = D.agents.get(a.i);
  return signEvent(D.org.sk, S.ts, 30078, [['d', 'lineage/birth/' + a.i], ['p', d.hex], ['path', d.path], ['name', a.name], ['nip05', handle(a)]], '');
}
function keyringOf(a) {
  const d = D.agents.get(a.i), lv = d.leaves;
  return signEvent(d.sk, S.ts, 30078, [
    ['d', 'lineage/keyring/v0'], ['p', D.org.hex, '', 'parent'],
    ['key', 'ssh', sshLine(lv.ssh.pub, handle(a))], ['key', 'git', sshLine(lv.git.pub, handle(a))],
    ['key', 'dkim', 'v=DKIM1; k=ed25519; p=' + b64(lv.dkim.pub)], ['key', 'wg', b64(lv.wg.pub)]
  ], '');
}
function revocationOf(a) {
  return signEvent(D.org.sk, a.revokedAt || S.ts, 5, [['a', '30078:' + D.org.hex + ':lineage/birth/' + a.i], ['k', '30078']], 'revoked');
}
function vector() {
  if (S.passphrase) return null;
  for (const k of Object.keys(VEC)) if (VEC[k].m === S.mnemonic) return k;
  return null;
}
function vecOk(node) {
  const v = vector();
  if (v === 'bip84' && node === 'btc') return D.btc.addr === VEC.bip84.btc && D.btc.zpub === VEC.bip84.zpub;
  if (v === 'bip84' && node === 'eth') return D.eth.addr === VEC.bip84.eth;
  if (v === 'nip06' && node === 'org') return D.org.npub === VEC.nip06.npub;
  return null;
}

/* ---------- seed ---------- */
async function setMnemonic(m, pass, note, syncPass = true) {
  const token = ++seedToken;
  const seed = await L.mnemonicToSeed(m, pass);
  if (token !== seedToken) return;
  S.mnemonic = m; S.passphrase = pass; S.seed = seed; S.root = L.HDKey.fromMasterSeed(seed);
  if (syncPass) $('#pass').value = pass;
  sigCache.clear();
  D = deriveAll();
  if (note !== undefined) $('#status').textContent = note;
  render();
}

/* ---------- rendering ---------- */
function renderWords() {
  const words = S.mnemonic.split(' ');
  $('#words').innerHTML = words.map((w, i) => '<li><span class="n">' + String(i + 1).padStart(2, '0') + '</span><span class="w">' + (S.hideWords ? '•••••' : esc(w)) + '</span></li>').join('');
  $('#seed-sub').textContent = 'BIP-39 · ' + words.length + ' words' + (S.passphrase ? ' + passphrase' : '');
  $('#hide').setAttribute('aria-pressed', String(S.hideWords));
  $('#hide').textContent = S.hideWords ? 'Show words' : 'Hide words';
}

function leafShort(d, lf) {
  const lv = d.leaves[lf];
  if (lf === 'ssh' || lf === 'git') return trunc(sshFp(lv.pub), 13);
  if (lf === 'dkim') return 'p=' + trunc(b64(lv.pub), 8);
  return trunc(b64(lv.pub), 10);
}
function nodeShort(lf) {
  const n = D.node[lf];
  if (lf === 'noise') return 'mkey:' + trunc(hex(n.pub), 6);
  if (lf === 'mtls') return trunc(b64(n.pub), 10);
  return trunc(sshFp(n.pub), 13);
}
function rows() {
  const out = [];
  out.push({ id: 'seed', g: '', p: 'org seed  ', l: '(' + S.org + ' LLC, held via the Otoco NFT)', v: 'fp ' + D.fp });
  out.push({ id: 'eth', g: '├─ ', p: "m/44'/60'".padEnd(13), l: 'ETH key that owns the NFT = legal control', v: short(D.eth.addr, 6, 4), ok: vecOk('eth') });
  out.push({ id: 'btc', g: '├─ ', p: "m/84'/0'".padEnd(13), l: 'BTC treasury', v: short(D.btc.addr, 7, 4), ok: vecOk('btc') });
  out.push({ id: 'org', g: '├─ ', p: "m/44'/1237'".padEnd(13), l: 'nostr: org identity (the well-known handle)', v: short(D.org.npub, 9, 4), ok: vecOk('org') });
  for (const a of S.agents) {
    const d = D.agents.get(a.i), id = 'a' + a.i, exp = S.open.has(id);
    out.push({ id, g: '│   ├─ ', p: 'i=' + a.i + '  ', l: a.name + (a.revoked ? '  revoked' : '  → ssh/git/dkim/wg leaves'), v: short(d.npub, 9, 4), tog: true, exp, rev: a.revoked });
    if (exp) LEAVES.forEach((lf, k) => out.push({ id: id + '.' + lf, g: '│   │   ' + (k === LEAVES.length - 1 ? '└─ ' : '├─ '), p: lf.padEnd(6), l: LEAF_DESC[lf], v: leafShort(d, lf), rev: a.revoked }));
  }
  out.push({ id: 'add', g: '│   └─ ', p: '+ ', l: 'derive i=' + nextIndex(), add: true });
  const nexp = S.open.has('node');
  out.push({ id: 'node', g: '└─ ', p: 'hkdf ', l: 'leaves for the node itself (TLS, Headscale, CA)', tog: true, exp: nexp });
  if (nexp) NODE_LEAVES.forEach((lf, k) => out.push({ id: 'node.' + lf, g: '    ' + (k === NODE_LEAVES.length - 1 ? '└─ ' : '├─ '), p: lf.padEnd(7), l: NODE_DESC[lf], v: nodeShort(lf) }));
  return out;
}
function rowHtml(r) {
  const on = r.id === S.sel;
  const cls = ['row', on && 'on', r.rev && 'rev', r.add && 'add'].filter(Boolean).join(' ');
  const tick = r.ok === true ? ' <span class="tick">✓<span class="sr"> matches the test vector</span></span>'
    : r.ok === false ? ' <span class="tick bad">✗<span class="sr"> does not match the test vector</span></span>' : '';
  const label = r.add ? 'Derive the next agent, i=' + nextIndex() : '';
  return '<div class="' + cls + '"><button type="button" class="sel" data-id="' + r.id + '"' + (r.add ? ' aria-label="' + label + '"' : ' aria-pressed="' + on + '"') + '>' +
    '<span class="g" aria-hidden="true">' + esc(r.g) + '</span><span class="p">' + esc(r.p) + '</span><span class="l">' + esc(r.l) + tick + '</span>' +
    (r.v ? '<span class="v">' + esc(r.v) + '</span>' : '') + '</button>' +
    (r.tog ? '<button type="button" class="tog" data-tog="' + r.id + '" aria-expanded="' + r.exp + '" aria-label="' + (r.exp ? 'Collapse' : 'Expand') + ' ' + esc(r.id === 'node' ? 'node leaves' : 'leaves of ' + agentOf(+r.id.slice(1)).name) + '">[' + (r.exp ? '−' : '+') + ']</button>' : '') +
    '</div>';
}
function renderTree() { $('#tree').innerHTML = rows().map(rowHtml).join(''); }

/* inspector building blocks */
let kc = 0;
function C(text, prefix = 'k') { const id = prefix + ++kc; copyMap.set(id, text); return id; }
function clearKeys(prefix) { for (const k of [...copyMap.keys()]) if (k.startsWith(prefix)) copyMap.delete(k); }
const field = (label, value) => { const id = C(value); return '<div class="f"><dt>' + esc(label) + '</dt><dd id="' + id + '">' + esc(value) + '</dd><button type="button" class="cp" data-k="' + id + '" aria-label="Copy ' + esc(label) + '">Copy</button></div>'; };
const fieldS = (label, value) => '<div class="f"><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>';
const fields = (...f) => '<dl class="fl">' + f.join('') + '</dl>';
const code = (label, text, extra = '', prefix = 'k') => { const id = C(text, prefix); return '<div class="code"><div class="code-h"><span>' + esc(label) + extra + '</span><button type="button" class="cp" data-k="' + id + '" aria-label="Copy ' + esc(label) + '">Copy</button></div><pre id="' + id + '">' + esc(text) + '</pre></div>'; };
const head = (eyebrow, title, desc, chips) => '<div class="ih"><p class="eyebrow">' + esc(eyebrow) + '</p><h3 class="it">' + esc(title) + '</h3><p class="idesc">' + desc + '</p>' + (chips ? '<div class="chips">' + chips + '</div>' : '') + '</div>';
const secret = (inner) => '<div class="secret"><div class="hz"><span class="hz-l">Secret · stays in this tab</span><button type="button" class="btn sm" id="reveal" aria-expanded="' + S.reveal + '">' + (S.reveal ? 'Hide' : 'Reveal') + '</button></div>' + (S.reveal ? '<div class="sb">' + inner() + '</div>' : '') + '</div>';
const body = (...parts) => '<div class="ib">' + parts.join('') + '</div>';
const verified = (e) => verifyEvent(e) ? ' · <span class="ok">✓ signature verifies</span>' : ' · signature fails';
function vecChip(node) {
  const r = vecOk(node);
  if (r === null) return '';
  const name = node === 'org' ? 'NIP-06' : node === 'btc' ? 'BIP-84' : 'known';
  return r ? '<span class="chip ok">✓ ' + name + ' test vector</span>' : '<span class="chip bad">✗ test vector mismatch</span>';
}
const deriv = (ikm, info) => 'HKDF-SHA256(' + ikm + ', salt "lineage/v0", info "' + info + '")';

function inspect(id) {
  const dm = S.domain;
  if (id === 'seed') {
    const n = S.mnemonic.split(' ').length;
    return ['seed', head('Root · BIP-39 + BIP-32', 'org seed',
      'Every key in the tree comes from these ' + n + ' words' + (S.passphrase ? ' and the passphrase' : '') + '. Whoever holds them is the organization, so for real money or legal weight the root should be a threshold key (FROST or multisig), not one mnemonic.') +
      body(fields(field('master fingerprint (BIP-32)', D.fp), fieldS('passphrase', S.passphrase ? 'set' : 'none'), field('URN', urn())),
        secret(() => fields(field('mnemonic', S.mnemonic), field('BIP-39 seed (hex)', hex(S.seed)))))];
  }
  if (id === 'eth') {
    return ["m/44'/60'", head('Legal control · Ethereum', "m/44'/60'/0'/0/0",
      'This address holds the Otoco NFT, and the NFT is the LLC. Moving the NFT moves control of the company, so this key should sign almost nothing and sit behind the threshold root.', vecChip('eth')) +
      body(fields(field('address (EIP-55)', D.eth.addr), field('public key (compressed)', hex(D.eth.pub)), field('URN', urn('legal'))),
        secret(() => fields(field('private key', '0x' + hex(D.eth.priv)))))];
  }
  if (id === 'btc') {
    return ["m/84'/0'", head('Treasury · Bitcoin', "m/84'/0'/0'/0/0",
      "Native segwit (BIP-84), the branch supertestnet's vanilla-js-browser-wallet uses. Give the account zpub to a watch-only wallet to see balances; spending still needs the seed.", vecChip('btc')) +
      body(fields(field('first receive address', D.btc.addr), field("account zpub (m/84'/0'/0')", D.btc.zpub), field('public key', hex(D.btc.pub)), field('URN', urn('treasury'))),
        secret(() => fields(field('private key (WIF)', wif(D.btc.priv)))))];
  }
  if (id === 'org') {
    const o = D.org;
    return ['org identity', head('Identity · Nostr (NIP-06 account 0)', '_@' + dm,
      "The organization's public face, on the path supertestnet's vanilla-js-nostr uses. Its NIP-05 name is <code>_</code>, which clients show as just <code>" + esc(dm) + '</code>. It signs every agent\'s birth certificate.', vecChip('org')) +
      body(fields(field('npub', o.npub), field('public key (hex)', o.hex), field('path', o.path), field('NIP-05', '_@' + dm), field('URN', urn())),
        secret(() => fields(field('nsec', o.nsec), field('private key (hex)', hex(o.sk)))))];
  }
  if (/^a\d+$/.test(id)) {
    const a = agentOf(+id.slice(1)), d = D.agents.get(a.i);
    const birth = birthOf(a), ring = keyringOf(a);
    const chips = a.revoked ? '<span class="chip bad">Revoked</span>' : '<span class="chip ok">Vouched for by the org</span>';
    return [a.name, head('Agent i=' + a.i + ' · Nostr (NIP-06 account ' + a.i + ')', handle(a),
      "A hardened child: its key reveals nothing about the org or its siblings, and its public key alone can't show whose child it is, so the org signs a birth certificate. The agent's machine holds this key and derives its own leaves; the org seed never goes there.", chips) +
      body(fields(
          '<div class="f"><dt><label for="aname">name (NIP-05 and mail)</label></dt><dd><input id="aname" type="text" value="' + esc(a.name) + '" spellcheck="false" autocomplete="off" autocapitalize="off"></dd></div>',
          field('npub', d.npub), field('public key (hex)', d.hex), field('path', d.path), field('NIP-05 · mailr address', handle(a)), field('URN', urn(a.name))),
        code('Birth certificate · kind 30078 · signed by the org', fmtEvent(birth), verified(birth)),
        code('Keyring · kind 30078 · signed by the agent', fmtEvent(ring), verified(ring)),
        a.revoked ? code('Revocation · kind 5 (NIP-09) · signed by the org', fmtEvent(revocationOf(a)), verified(revocationOf(a))) : '',
        '<div class="acts"><button type="button" class="btn" id="revoke">' + (a.revoked ? 'Restore' : 'Revoke') + '</button><p>' +
          (a.revoked ? "Derivation can't be undone, so the keys still exist. Revoking means the org stops vouching: the name leaves nostr.json and no certificate gets renewed." : 'Revoking removes the name from nostr.json and signs a deletion request for the birth certificate. Index ' + a.i + ' is never reused.') + '</p></div>',
        secret(() => fields(field('nsec', d.nsec), field('private key (hex)', hex(d.sk)))))];
  }
  const m = /^a(\d+)\.(ssh|git|dkim|wg)$/.exec(id);
  if (m) {
    const a = agentOf(+m[1]), d = D.agents.get(a.i), lf = m[2], lv = d.leaves[lf];
    const title = a.name + ' / ' + lf, src = deriv(a.name + "'s nostr key", lf);
    if (lf === 'ssh' || lf === 'git') {
      const line = sshLine(lv.pub, handle(a));
      const isSsh = lf === 'ssh';
      return [title, head(isSsh ? 'Leaf · SSH (Ed25519)' : 'Leaf · Git signing (Ed25519)', title,
        isSsh ? 'Shell access. Servers trust the lineage CA, so giving an agent a rank means signing this key into a certificate; nothing gets pasted into authorized_keys.'
          : "Commit signing with an SSH key, which Git supports from 2.34. Load the private key into ssh-agent and Git signs with it; a forge or a reviewer checks commits against the allowed_signers line.") +
        body(fields(fieldS('derived as', src), field('fingerprint', sshFp(lv.pub)), field('public key', line), field('URN', urn(a.name, lf))),
          isSsh ? code('Certify it on the CA host', 'ssh-keygen -s lineage_ca -I ' + handle(a) + ' -n very -V +52w ' + a.name + '_ssh.pub')
            : code('git config', 'git config gpg.format ssh\ngit config user.signingkey "key::' + line + '"\ngit config commit.gpgsign true') + code('allowed_signers', handle(a) + ' namespaces="git" ' + line),
          secret(() => code('OpenSSH private key', opensshPriv(lv.seed, lv.pub, handle(a)))))];
    }
    if (lf === 'dkim') {
      const rec = 'v=DKIM1; k=ed25519; p=' + b64(lv.pub);
      return [title, head('Leaf · DKIM (Ed25519, RFC 8463)', title,
        'Signs mail sent as ' + esc(handle(a)) + '. RFC 8463 recommends signing with an RSA key as well, since not every receiver checks Ed25519 yet.') +
        body(fields(fieldS('derived as', src), field('selector', a.name + '._domainkey.' + dm), field('TXT value', rec), field('URN', urn(a.name, lf))),
          code('DNS record', a.name + '._domainkey.' + dm + '. IN TXT "' + rec + '"'),
          secret(() => fields(field('Ed25519 private key (base64)', b64(lv.seed)))))];
    }
    return [title, head('Leaf · WireGuard (X25519)', title,
      "The agent's key for plain WireGuard peers. Tailscale clients make their own node keys, so on a Headscale tailnet the agent joins by signing in with its npub instead, and its rank picks its ACL group.") +
      body(fields(fieldS('derived as', src + ', clamped'), field('public key', b64(lv.pub)), field('URN', urn(a.name, lf))),
        code('Peer entry', '[Peer]\n# ' + handle(a) + '\nPublicKey = ' + b64(lv.pub)),
        secret(() => code('Interface entry', '[Interface]\nPrivateKey = ' + b64(lv.priv))))];
  }
  if (id === 'node') {
    const n = D.node;
    return ['node', head('Node · HKDF from the seed', 'the node itself',
      'Keys for the machine that runs the directory, relays, mail and git. Derive them during the key ceremony and install them on the node; the node never sees the seed.') +
      body(fields(field('ssh-ca fingerprint', sshFp(n['ssh-ca'].pub)), field('mtls public key (base64)', b64(n.mtls.pub)), field('noise public key', 'mkey:' + hex(n.noise.pub))))];
  }
  const nm = /^node\.(ssh-ca|mtls|noise)$/.exec(id);
  if (nm) {
    const lf = nm[1], n = D.node[lf], title = 'node / ' + lf, src = deriv('BIP-39 seed', 'node/' + lf);
    if (lf === 'ssh-ca') {
      const line = sshLine(n.pub, 'lineage-ca@' + dm);
      return [title, head('Node leaf · SSH certificate authority', title,
        "Servers trust this one key. Rank becomes a certificate principal: sign an agent's ssh key with <code>-n very</code> to promote it, and stop renewing the certificate to demote it.") +
        body(fields(fieldS('derived as', src), field('fingerprint', sshFp(n.pub)), field('CA public key', line), field('URN', urn('node', lf))),
          code('sshd_config', 'TrustedUserCAKeys /etc/ssh/lineage_ca.pub\nAuthorizedPrincipalsFile /etc/ssh/principals/%u'),
          code('/etc/ssh/principals/agent', 'very'),
          secret(() => code('OpenSSH private key', opensshPriv(n.seed, n.pub, 'lineage-ca@' + dm))))];
    }
    if (lf === 'mtls') {
      return [title, head('Node leaf · TLS between nodes (Ed25519)', title,
        "Identity for traffic between your own nodes, where both ends can pin the key. Public HTTPS stays with Caddy and its ACME certificates, because public certificate authorities don't issue Ed25519 certificates.") +
        body(fields(fieldS('derived as', src), field('public key (base64)', b64(n.pub)), field('URN', urn('node', lf))),
          code('Public key (PEM)', pem('PUBLIC KEY', L.concatBytes(SPKI_ED, n.pub))),
          secret(() => code('Private key (PKCS#8 PEM)', pem('PRIVATE KEY', L.concatBytes(PKCS8_ED, n.seed)))))];
    }
    return [title, head('Node leaf · Headscale noise key (X25519)', title,
      "Headscale's control-plane key for the Noise protocol. Deriving it means a rebuilt control server comes back with the same identity.") +
      body(fields(fieldS('derived as', src + ', clamped'), field('public key', 'mkey:' + hex(n.pub)), field('URN', urn('node', lf))),
        code('config.yaml', 'noise:\n  private_key_path: /var/lib/headscale/noise_private.key'),
        secret(() => code('noise_private.key', 'privkey:' + hex(n.priv))))];
  }
  return ['', ''];
}
function renderInspector() {
  clearKeys('k');
  const [sub, html] = inspect(S.sel);
  $('#insp').innerHTML = html;
  $('#insp-sub').textContent = sub;
}

/* publish */
function renderExports() {
  clearKeys('x');
  ['nostr', 'lineage', 'spec'].forEach((t) => $('#ex-' + t).setAttribute('aria-selected', String(S.ex === t)));
  $('#ex').setAttribute('aria-labelledby', 'ex-' + S.ex);
  const live = S.agents.filter((a) => !a.revoked), gone = S.agents.filter((a) => a.revoked);
  let html = '';
  if (S.ex === 'nostr') {
    const names = { _: D.org.hex };
    live.forEach((a) => { names[a.name] = D.agents.get(a.i).hex; });
    html = '<p class="ex-note">Serve this at <code>https://' + esc(S.domain) + '/.well-known/nostr.json</code> (NIP-05). Revoked agents drop out.</p>' +
      code('/.well-known/nostr.json', JSON.stringify({ names }, null, 2), '', 'x');
  } else if (S.ex === 'lineage') {
    const doc = {
      lineage: 'v0',
      org: { name: S.org, domain: S.domain, pubkey: D.org.hex, legal: { chain: 'ethereum', address: D.eth.addr } },
      agents: live.map((a) => { const d = D.agents.get(a.i); return { name: a.name, i: a.i, path: d.path, pubkey: d.hex, nip05: handle(a), birth: birthOf(a).id, keyring: keyringOf(a).id }; }),
      revoked: gone.map((a) => ({ i: a.i, pubkey: D.agents.get(a.i).hex, revocation: revocationOf(a).id })),
      node: { ssh_ca: sshLine(D.node['ssh-ca'].pub, 'lineage-ca@' + S.domain), mtls: b64(D.node.mtls.pub), noise: 'mkey:' + hex(D.node.noise.pub) }
    };
    html = '<p class="ex-note">Proposed <code>/.well-known/lineage.json</code>: the public half of the tree. Enough to resolve names, trust certificates and verify events, and nothing that can spend or sign.</p>' +
      code('/.well-known/lineage.json', JSON.stringify(doc, null, 2), '', 'x');
  } else {
    html = '<p class="ex-note">The derivation rules this page runs. Change a rule here and every key above changes with it.</p>' + code('spec v0 (draft)', SPEC, '', 'x');
  }
  $('#ex').innerHTML = html;
}
const SPEC = [
  'LINEAGE KEY TREE · spec v0 (draft)',
  '',
  'seed        BIP-39 mnemonic (+ optional passphrase) -> 64-byte seed',
  'root        BIP-32 master key from the seed (secp256k1)',
  '',
  "legal       m/44'/60'/0'/0/0      Ethereum key; holds the entity NFT",
  "treasury    m/84'/0'/0'/0/n       BIP-84 P2WPKH; watch-only via the zpub of m/84'/0'/0'",
  "org         m/44'/1237'/0'/0/0    NIP-06 account 0; NIP-05 name \"_\"",
  "agent i     m/44'/1237'/i'/0/0    NIP-06 account i, i >= 1; indices are never reused",
  '',
  'leaf        HKDF-SHA256(IKM = parent secret, salt = "lineage/v0", info = label) -> 32 bytes',
  '            Ed25519 leaves use the bytes as the seed; X25519 leaves clamp them',
  '',
  '  agent leaves   IKM = the agent\'s nostr secret key',
  '    ssh          Ed25519   OpenSSH user key, certified by node/ssh-ca',
  '    git          Ed25519   SSH commit signing (gpg.format ssh)',
  '    dkim         Ed25519   DKIM k=ed25519 (RFC 8463), selector <name>._domainkey',
  '    wg           X25519    WireGuard peer key',
  '',
  '  node leaves    IKM = the 64-byte BIP-39 seed',
  '    node/ssh-ca  Ed25519   SSH user certificate authority',
  '    node/mtls    Ed25519   node-to-node TLS identity',
  '    node/noise   X25519    Headscale noise key (privkey: / mkey: hex)',
  '',
  'events      kind 30078 (NIP-78, addressable)',
  '  birth     signed by the org     d = "lineage/birth/<i>", p = agent pubkey, path, name, nip05',
  '  keyring   signed by the agent   d = "lineage/keyring/v0", p = org pubkey, key = [label, public form]',
  '  revoke    kind 5 (NIP-09), signed by the org, a = "30078:<org pubkey>:lineage/birth/<i>"',
  '',
  'why births  hardened children can\'t be linked to their parent from public keys,',
  '            so the parent signs the link',
  '',
  'names       urn:lineage:<org>[:<agent>[:<leaf>]]',
  '            <agent>@<domain> is both the NIP-05 name and the mailr address'
].join('\n');

function render() {
  if (!D) return;
  renderWords(); renderTree(); renderInspector(); renderExports();
}
function focusRow(id) { const b = document.querySelector('.sel[data-id="' + id + '"]'); if (b) b.focus({ preventScroll: true }); }

/* ---------- interactions ---------- */
function select(id, opts = {}) {
  if (!D) return;
  S.sel = id; S.reveal = false;
  if (/^a\d+$/.test(id) || id === 'node') S.open.add(id);
  render();
  if (opts.focus) focusRow(id);
  if (opts.scroll && narrow()) $('#insp-blk').scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
}
function toggle(id) {
  if (S.open.has(id)) { S.open.delete(id); if (S.sel.startsWith(id + '.')) S.sel = id; } else S.open.add(id);
  render();
  const t = document.querySelector('[data-tog="' + id + '"]'); if (t) t.focus({ preventScroll: true });
}
function addAgent() {
  const i = nextIndex();
  const taken = new Set(S.agents.map((a) => a.name));
  let name = letter(i); if (taken.has(name)) name = 'agent-' + i;
  S.agents.push({ i, name, revoked: false, revokedAt: null });
  D.agents.set(i, deriveAgent(i));
  select('a' + i, { focus: true });
  $('#status').textContent = 'Derived agent i=' + i + ' at m/44\'/1237\'/' + i + "'/0/0.";
}
$('#tree').addEventListener('click', (e) => {
  const t = e.target.closest('[data-tog]'); if (t) { toggle(t.dataset.tog); return; }
  const s = e.target.closest('.sel'); if (!s) return;
  if (s.dataset.id === 'add') { addAgent(); return; }
  select(s.dataset.id, { focus: true, scroll: true });
});
$('#tree').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const btns = [...document.querySelectorAll('#tree .sel')];
  const i = btns.indexOf(document.activeElement); if (i < 0) return;
  e.preventDefault();
  const n = btns[Math.max(0, Math.min(btns.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
  if (n.dataset.id === 'add') { n.focus(); return; }
  select(n.dataset.id, { focus: true });
});
$('#insp').addEventListener('click', (e) => {
  if (e.target.closest('#reveal')) { S.reveal = !S.reveal; renderInspector(); const r = $('#reveal'); if (r) r.focus({ preventScroll: true }); return; }
  if (e.target.closest('#revoke')) {
    const a = agentOf(+S.sel.slice(1)); if (!a) return;
    a.revoked = !a.revoked; a.revokedAt = a.revoked ? Math.floor(Date.now() / 1000) : null;
    render(); const r = $('#revoke'); if (r) r.focus({ preventScroll: true });
  }
});
$('#insp').addEventListener('change', (e) => {
  if (e.target.id !== 'aname') return;
  const a = agentOf(+S.sel.slice(1)); if (!a) return;
  let name = slug(e.target.value, a.name);
  if (S.agents.some((o) => o !== a && o.name === name)) name = name + '-' + a.i;
  a.name = name; render();
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('.cp'); if (!b) return;
  const k = b.dataset.k, text = copyMap.get(k); if (text == null) return;
  const done = (msg) => { b.textContent = msg; b.classList.add('done'); setTimeout(() => { b.textContent = 'Copy'; b.classList.remove('done'); }, 1400); };
  try {
    navigator.clipboard.writeText(text).then(() => done('Copied'), () => fallback());
  } catch { fallback(); }
  function fallback() {
    const el = document.getElementById(k);
    if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    done('Selected');
  }
});
['nostr', 'lineage', 'spec'].forEach((t) => $('#ex-' + t).addEventListener('click', () => { S.ex = t; renderExports(); }));
$('.tabs').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const order = ['nostr', 'lineage', 'spec'], i = order.indexOf(S.ex);
  S.ex = order[(i + (e.key === 'ArrowRight' ? 1 : 2)) % 3]; renderExports(); $('#ex-' + S.ex).focus();
});

$('#new').addEventListener('click', () => setMnemonic(L.generateMnemonic(L.wordlist, 128), '', 'New 12-word seed, generated in this tab.'));
$('#vector').addEventListener('change', (e) => { const v = VEC[e.target.value]; e.target.value = ''; if (v) setMnemonic(v.m, '', v.note); });
$('#enter').addEventListener('click', () => { $('#entry').hidden = false; $('#seed-ctl').hidden = true; $('#mn-msg').textContent = ''; $('#mn-in').value = ''; $('#mn-in').focus(); });
function closeEntry() { $('#entry').hidden = true; $('#seed-ctl').hidden = false; $('#mn-in').value = ''; }
$('#mn-cancel').addEventListener('click', () => { closeEntry(); $('#enter').focus(); });
$('#mn-use').addEventListener('click', () => {
  const m = $('#mn-in').value.toLowerCase().trim().split(/\s+/).join(' ');
  const n = m ? m.split(' ').length : 0;
  if (n !== 12 && n !== 24) { $('#mn-msg').textContent = 'Enter 12 or 24 words; this has ' + n + '.'; return; }
  if (!L.validateMnemonic(m, L.wordlist)) { $('#mn-msg').textContent = "These words don't form a valid BIP-39 phrase. Check spelling and order; the last word carries a checksum."; return; }
  closeEntry(); setMnemonic(m, $('#pass').value, 'Using your ' + n + ' words.');
});
$('#hide').addEventListener('click', () => { S.hideWords = !S.hideWords; renderWords(); });
$('#pass').addEventListener('input', debounce(() => { if (S.mnemonic) setMnemonic(S.mnemonic, $('#pass').value, $('#pass').value ? 'Passphrase applied: every key changed.' : 'Passphrase cleared.', false); }, 350));
$('#org').addEventListener('input', debounce(() => { S.org = slug($('#org').value, 'lineage'); render(); }, 250));
$('#domain').addEventListener('input', debounce(() => { S.domain = dom($('#domain').value, 'lineage.llc'); render(); }, 250));

/* theme */
const root = document.documentElement;
const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
const syncThemeBtn = () => { $('#theme').textContent = isDark() ? 'Light' : 'Dark'; $('#theme').setAttribute('aria-label', 'Switch to ' + (isDark() ? 'light' : 'dark') + ' theme'); };
try { const t = localStorage.getItem('lineage-theme'); if (t === 'dark' || t === 'light') root.dataset.theme = t; } catch {}
$('#theme').addEventListener('click', () => {
  root.dataset.theme = isDark() ? 'light' : 'dark';
  try { localStorage.setItem('lineage-theme', root.dataset.theme); } catch {}
  syncThemeBtn();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeBtn);
syncThemeBtn();

setMnemonic(L.generateMnemonic(L.wordlist, 128), '');
})();
