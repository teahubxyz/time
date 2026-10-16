// The cryptography SLYNG needs, with no dependencies: SHA-256, HMAC, HKDF, secp256k1 (BIP-340 Schnorr signatures
// and ECDH), ChaCha20, and NIP-44 v2 encryption. Pure functions over Uint8Array, usable in the browser and in Node.
//
// The curve arithmetic uses BigInt and is not constant-time. It signs the occasional event in a browser tab; for a
// key that holds real weight, sign with a nostr extension instead (SLYNG prefers one when it finds one).

const te = new TextEncoder();
const td = new TextDecoder('utf-8', { fatal: true });

export const utf8 = (s) => te.encode(s);
export const fromUtf8 = (b) => td.decode(b);

export function concat(...parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function hex(bytes) {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

export function unhex(s) {
  if (typeof s !== 'string' || s.length % 2 || /[^0-9a-f]/i.test(s)) throw new Error('not hex');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export const isHex64 = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);

export function randomBytes(n) {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function base64(bytes) {
  let s = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    s += B64[n >> 18] + B64[(n >> 12) & 63] + '==';
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
  }
  return s;
}

export function unbase64(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.length % 4) throw new Error('not base64');
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((s.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const n = (B64.indexOf(s[i]) << 18) | (B64.indexOf(s[i + 1]) << 12) |
      ((s[i + 2] === '=' ? 0 : B64.indexOf(s[i + 2])) << 6) | (s[i + 3] === '=' ? 0 : B64.indexOf(s[i + 3]));
    if (o < out.length) out[o++] = n >> 16;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- SHA-256

const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256(msg) {
  const len = msg.length;
  const total = ((len + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(len / 0x20000000));
  dv.setUint32(total - 4, (len << 3) >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], b = W[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K256[i] + W[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i]);
  return out;
}

export function hmacSha256(key, msg) {
  const k = new Uint8Array(64);
  k.set(key.length > 64 ? sha256(key) : key);
  const inner = new Uint8Array(64 + msg.length);
  const outer = new Uint8Array(96);
  for (let i = 0; i < 64; i++) { inner[i] = k[i] ^ 0x36; outer[i] = k[i] ^ 0x5c; }
  inner.set(msg, 64);
  outer.set(sha256(inner), 64);
  return sha256(outer);
}

export const hkdfExtract = (salt, ikm) => hmacSha256(salt, ikm);

export function hkdfExpand(prk, info, length) {
  if (length > 255 * 32) throw new Error('hkdf length');
  const out = new Uint8Array(length);
  let prev = new Uint8Array(0);
  for (let i = 1, pos = 0; pos < length; i++, pos += 32) {
    prev = hmacSha256(prk, concat(prev, info, Uint8Array.of(i)));
    out.set(prev.subarray(0, Math.min(32, length - pos)), pos);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- secp256k1

const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
export const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

const mod = (a, m = P) => { const r = a % m; return r >= 0n ? r : r + m; };

function inv(a, m = P) {
  let r0 = mod(a, m), r1 = m, s0 = 1n, s1 = 0n;
  while (r1 !== 0n) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  if (r0 !== 1n) throw new Error('not invertible');
  return mod(s0, m);
}

function powMod(b, e, m = P) {
  let r = 1n;
  b = mod(b, m);
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
}

const INF = { X: 0n, Y: 1n, Z: 0n };

function dbl(p) {
  if (p.Z === 0n || p.Y === 0n) return INF;
  const A = (p.X * p.X) % P;
  const B = (p.Y * p.Y) % P;
  const C = (B * B) % P;
  const xb = p.X + B;
  const D = mod(2n * (xb * xb - A - C));
  const E = (3n * A) % P;
  const F = (E * E) % P;
  const X3 = mod(F - 2n * D);
  const Y3 = mod(E * (D - X3) - 8n * C);
  const Z3 = (2n * p.Y * p.Z) % P;
  return { X: X3, Y: Y3, Z: Z3 };
}

function add(p, q) {
  if (p.Z === 0n) return q;
  if (q.Z === 0n) return p;
  const Z1Z1 = (p.Z * p.Z) % P;
  const Z2Z2 = (q.Z * q.Z) % P;
  const U1 = (p.X * Z2Z2) % P;
  const U2 = (q.X * Z1Z1) % P;
  const S1 = (((p.Y * q.Z) % P) * Z2Z2) % P;
  const S2 = (((q.Y * p.Z) % P) * Z1Z1) % P;
  if (U1 === U2) return S1 === S2 ? dbl(p) : INF;
  const H = mod(U2 - U1);
  const R = mod(S2 - S1);
  const H2 = (H * H) % P;
  const H3 = (H * H2) % P;
  const U1H2 = (U1 * H2) % P;
  const X3 = mod(R * R - H3 - 2n * U1H2);
  const Y3 = mod(R * (U1H2 - X3) - S1 * H3);
  const Z3 = (((H * p.Z) % P) * q.Z) % P;
  return { X: X3, Y: Y3, Z: Z3 };
}

const neg = (p) => (p.Z === 0n ? p : { X: p.X, Y: mod(-p.Y), Z: p.Z });

function affine(p) {
  if (p.Z === 0n) return null;
  const zi = inv(p.Z);
  const zi2 = (zi * zi) % P;
  return { x: (p.X * zi2) % P, y: (((p.Y * zi2) % P) * zi) % P };
}

// k·p with a 4-bit window: 64 windows of 4 doublings and one addition
function mul(p, k) {
  k = mod(k, N);
  if (k === 0n || p.Z === 0n) return INF;
  const table = [INF, p];
  for (let i = 2; i < 16; i++) table.push(add(table[i - 1], p));
  let r = INF;
  for (let shift = 252n; shift >= 0n; shift -= 4n) {
    r = dbl(dbl(dbl(dbl(r))));
    const nib = Number((k >> shift) & 15n);
    if (nib) r = add(r, table[nib]);
  }
  return r;
}

// Many points to Z = 1 with one inversion (Montgomery's trick)
function normalizeAll(points) {
  const zs = points.map((p) => (p.Z === 0n ? 1n : p.Z));
  const prefix = new Array(zs.length);
  let acc = 1n;
  for (let i = 0; i < zs.length; i++) { prefix[i] = acc; acc = (acc * zs[i]) % P; }
  let invAcc = inv(acc);
  const out = new Array(points.length);
  for (let i = zs.length - 1; i >= 0; i--) {
    const zi = (invAcc * prefix[i]) % P;
    invAcc = (invAcc * zs[i]) % P;
    const p = points[i];
    if (p.Z === 0n) { out[i] = INF; continue; }
    const zi2 = (zi * zi) % P;
    out[i] = { X: (p.X * zi2) % P, Y: (((p.Y * zi2) % P) * zi) % P, Z: 1n };
  }
  return out;
}

// G multiples, precomputed once: GT[w][j] = j·16^w·G, so k·G is 64 additions and no doublings
let GT = null;
function gTable() {
  if (GT) return GT;
  const flat = [];
  let base = { X: GX, Y: GY, Z: 1n };
  for (let w = 0; w < 64; w++) {
    const row = [INF, base];
    for (let j = 2; j < 16; j++) row.push(add(row[j - 1], base));
    flat.push(...row);
    base = dbl(dbl(dbl(dbl(base))));
  }
  const norm = normalizeAll(flat);
  GT = [];
  for (let w = 0; w < 64; w++) GT.push(norm.slice(w * 16, w * 16 + 16));
  return GT;
}

function mulG(k) {
  k = mod(k, N);
  if (k === 0n) return INF;
  const T = gTable();
  let r = INF;
  for (let w = 0; w < 64; w++) {
    const nib = Number((k >> BigInt(w * 4)) & 15n);
    if (nib) r = add(r, T[w][nib]);
  }
  return r;
}

export const bytesToBig = (b) => (b.length ? BigInt('0x' + hex(b)) : 0n);
export const bigToBytes = (n) => unhex(n.toString(16).padStart(64, '0'));

function liftX(x) {
  if (x >= P) return null;
  const c = mod(x * x * x + 7n);
  const y = powMod(c, (P + 1n) / 4n);
  if ((y * y) % P !== c) return null;
  return { X: x, Y: (y & 1n) === 0n ? y : P - y, Z: 1n };
}

function privToBig(priv) {
  const d = bytesToBig(priv);
  if (priv.length !== 32 || d <= 0n || d >= N) throw new Error('bad private key');
  return d;
}

export function isValidPrivateKey(priv) {
  try { privToBig(priv); return true; } catch { return false; }
}

export function generatePrivateKey() {
  for (;;) {
    const k = randomBytes(32);
    if (isValidPrivateKey(k)) return k;
  }
}

// x-only public key (32 bytes), as nostr uses
export function getPublicKey(priv) {
  return bigToBytes(affine(mulG(privToBig(priv))).x);
}

export function isValidPublicKey(pub) {
  return pub.length === 32 && liftX(bytesToBig(pub)) !== null;
}

function taggedHash(tag, ...msgs) {
  const t = sha256(utf8(tag));
  return sha256(concat(t, t, ...msgs));
}

export function schnorrSign(msg, priv, aux = randomBytes(32)) {
  const d0 = privToBig(priv);
  const Pt = affine(mulG(d0));
  const d = (Pt.y & 1n) === 0n ? d0 : N - d0;
  const px = bigToBytes(Pt.x);
  const ta = taggedHash('BIP0340/aux', aux);
  const t = bigToBytes(d).map((b, i) => b ^ ta[i]);
  const k0 = mod(bytesToBig(taggedHash('BIP0340/nonce', t, px, msg)), N);
  if (k0 === 0n) throw new Error('nonce is zero');
  const R = affine(mulG(k0));
  const k = (R.y & 1n) === 0n ? k0 : N - k0;
  const rx = bigToBytes(R.x);
  const e = mod(bytesToBig(taggedHash('BIP0340/challenge', rx, px, msg)), N);
  const sig = concat(rx, bigToBytes(mod(k + e * d, N)));
  if (!schnorrVerify(sig, msg, px)) throw new Error('signature did not verify');
  return sig;
}

export function schnorrVerify(sig, msg, pub) {
  try {
    if (sig.length !== 64 || pub.length !== 32) return false;
    const Pt = liftX(bytesToBig(pub));
    if (!Pt) return false;
    const r = bytesToBig(sig.subarray(0, 32));
    const s = bytesToBig(sig.subarray(32, 64));
    if (r >= P || s >= N) return false;
    const e = mod(bytesToBig(taggedHash('BIP0340/challenge', sig.subarray(0, 32), pub, msg)), N);
    const R = affine(add(mulG(s), neg(mul(Pt, e))));
    if (!R || (R.y & 1n) !== 0n) return false;
    return R.x === r;
  } catch {
    return false;
  }
}

// ECDH as NIP-04 and NIP-44 use it: the unhashed x coordinate of priv·pub
export function sharedX(priv, pubX) {
  const Pt = liftX(bytesToBig(pubX));
  if (!Pt) throw new Error('bad public key');
  return bigToBytes(affine(mul(Pt, privToBig(priv))).x);
}

// ---------------------------------------------------------------------------------------------------- ChaCha20

function rotl(v, c) { return (v << c) | (v >>> (32 - c)); }

function quarter(s, a, b, c, d) {
  s[a] = (s[a] + s[b]) | 0; s[d] = rotl(s[d] ^ s[a], 16);
  s[c] = (s[c] + s[d]) | 0; s[b] = rotl(s[b] ^ s[c], 12);
  s[a] = (s[a] + s[b]) | 0; s[d] = rotl(s[d] ^ s[a], 8);
  s[c] = (s[c] + s[d]) | 0; s[b] = rotl(s[b] ^ s[c], 7);
}

// RFC 8439 ChaCha20: 32-byte key, 12-byte nonce, 32-bit block counter
export function chacha20(key, nonce, data, counter = 0) {
  if (key.length !== 32 || nonce.length !== 12) throw new Error('chacha20 key or nonce');
  const kv = new DataView(key.buffer, key.byteOffset, 32);
  const nv = new DataView(nonce.buffer, nonce.byteOffset, 12);
  const init = new Int32Array(16);
  init[0] = 0x61707865; init[1] = 0x3320646e; init[2] = 0x79622d32; init[3] = 0x6b206574;
  for (let i = 0; i < 8; i++) init[4 + i] = kv.getUint32(i * 4, true);
  for (let i = 0; i < 3; i++) init[13 + i] = nv.getUint32(i * 4, true);
  const out = new Uint8Array(data.length);
  const s = new Int32Array(16);
  const block = new Uint8Array(64);
  const bv = new DataView(block.buffer);
  for (let off = 0; off < data.length; off += 64) {
    init[12] = counter++;
    s.set(init);
    for (let i = 0; i < 10; i++) {
      quarter(s, 0, 4, 8, 12); quarter(s, 1, 5, 9, 13); quarter(s, 2, 6, 10, 14); quarter(s, 3, 7, 11, 15);
      quarter(s, 0, 5, 10, 15); quarter(s, 1, 6, 11, 12); quarter(s, 2, 7, 8, 13); quarter(s, 3, 4, 9, 14);
    }
    for (let i = 0; i < 16; i++) bv.setUint32(i * 4, (s[i] + init[i]) | 0, true);
    const n = Math.min(64, data.length - off);
    for (let i = 0; i < n; i++) out[off + i] = data[off + i] ^ block[i];
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- NIP-44 v2

export function nip44ConversationKey(priv, pubX) {
  return hkdfExtract(utf8('nip44-v2'), sharedX(priv, pubX));
}

export function calcPaddedLen(len) {
  if (len < 1) throw new Error('empty message');
  if (len <= 32) return 32;
  const nextPower = 2 ** (Math.floor(Math.log2(len - 1)) + 1);
  const chunk = nextPower <= 256 ? 32 : nextPower / 8;
  return chunk * (Math.floor((len - 1) / chunk) + 1);
}

function messageKeys(conversationKey, nonce) {
  const k = hkdfExpand(conversationKey, nonce, 76);
  return { chachaKey: k.subarray(0, 32), chachaNonce: k.subarray(32, 44), hmacKey: k.subarray(44, 76) };
}

function pad(text) {
  const u = utf8(text);
  if (u.length < 1 || u.length > 65535) throw new Error('message must be 1 to 65535 bytes');
  const out = new Uint8Array(2 + calcPaddedLen(u.length));
  out[0] = u.length >> 8;
  out[1] = u.length & 255;
  out.set(u, 2);
  return out;
}

function unpad(padded) {
  const len = (padded[0] << 8) | padded[1];
  if (len < 1 || padded.length !== 2 + calcPaddedLen(len)) throw new Error('bad padding');
  return fromUtf8(padded.subarray(2, 2 + len));
}

export function nip44Encrypt(text, conversationKey, nonce = randomBytes(32)) {
  const { chachaKey, chachaNonce, hmacKey } = messageKeys(conversationKey, nonce);
  const ct = chacha20(chachaKey, chachaNonce, pad(text));
  const mac = hmacSha256(hmacKey, concat(nonce, ct));
  return base64(concat(Uint8Array.of(2), nonce, ct, mac));
}

export function nip44Decrypt(payload, conversationKey) {
  if (typeof payload !== 'string' || payload.startsWith('#')) throw new Error('unsupported encryption version');
  if (payload.length < 132 || payload.length > 87472) throw new Error('bad payload size');
  const data = unbase64(payload);
  if (data.length < 99 || data.length > 65603) throw new Error('bad payload size');
  if (data[0] !== 2) throw new Error('unsupported encryption version');
  const nonce = data.subarray(1, 33);
  const ct = data.subarray(33, data.length - 32);
  const mac = data.subarray(data.length - 32);
  const { chachaKey, chachaNonce, hmacKey } = messageKeys(conversationKey, nonce);
  if (!equalBytes(hmacSha256(hmacKey, concat(nonce, ct)), mac)) throw new Error('bad mac');
  return unpad(chacha20(chachaKey, chachaNonce, ct));
}

// ---------------------------------------------------------------------------------------------------- NIP-04 (for wallets)

// AES-256-CBC with the raw ECDH x as key. Only Nostr Wallet Connect still needs it, for wallets without NIP-44.
async function aesKey(priv, pubX, usage) {
  return globalThis.crypto.subtle.importKey('raw', sharedX(priv, pubX), { name: 'AES-CBC' }, false, [usage]);
}

export async function nip04Encrypt(text, priv, pubX, iv = randomBytes(16)) {
  const key = await aesKey(priv, pubX, 'encrypt');
  const ct = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, utf8(text)));
  return base64(ct) + '?iv=' + base64(iv);
}

export async function nip04Decrypt(payload, priv, pubX) {
  const [ct, ivPart] = String(payload).split('?iv=');
  if (!ivPart) throw new Error('not a NIP-04 payload');
  const key = await aesKey(priv, pubX, 'decrypt');
  const pt = await globalThis.crypto.subtle.decrypt({ name: 'AES-CBC', iv: unbase64(ivPart) }, key, unbase64(ct));
  return fromUtf8(new Uint8Array(pt));
}
