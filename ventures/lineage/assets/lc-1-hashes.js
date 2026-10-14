(() => {
var Ee = Object.defineProperty;
var Be = (t) => t;
function Se(t, e) {
this[t] = Be.bind(null, e);
}
var O = (t, e) => {
for (var r in e)
Ee(t, r, {
get: e[r],
enumerable: !0,
configurable: !0,
set: Se.bind(e, r)
});
};

// ../vendor/noble-hashes/src/sha2.ts
var Dt = {};
O(Dt, {
_SHA224: () => Et,
_SHA256: () => Ot,
_SHA384: () => St,
_SHA512: () => Bt,
_SHA512_224: () => Ft,
_SHA512_256: () => vt,
sha224: () => ze,
sha256: () => Ze,
sha384: () => er,
sha512: () => tr,
sha512_224: () => nr,
sha512_256: () => rr
});

// ../vendor/noble-hashes/src/_u64.ts
var at = /* @__PURE__ */ (() => BigInt(4294967295))(), Qt = /* @__PURE__ */ BigInt(32);
function Fe(t, e = !1) {
if (e)
return { h: Number(t & at), l: Number(t >> Qt & at) };
return { h: Number(t >> Qt & at) | 0, l: Number(t & at) | 0 };
}
function ct(t, e = !1) {
let r = t.length, n = new Uint32Array(r), s = new Uint32Array(r);
for (let o = 0;o < r; o++) {
let { h: i, l: a } = Fe(t[o], e);
[n[o], s[o]] = [i, a];
}
return [n, s];
}
var ve = (t) => t / 4294967296 | 0, De = (t) => t >>> 0;
function Zt(t, e, r, n) {
let s = ve(r), o = De(r);
t.setUint32(e, n ? o : s, n), t.setUint32(e + 4, n ? s : o, n);
}
var Ht = (t, e, r) => t >>> r, Ut = (t, e, r) => t << 32 - r | e >>> r, j = (t, e, r) => t >>> r | e << 32 - r, X = (t, e, r) => t << 32 - r | e >>> r, z = (t, e, r) => t << 64 - r | e >>> r - 32, tt = (t, e, r) => t >>> r - 32 | e << 64 - r;
function k(t, e, r, n) {
let s = (e >>> 0) + (n >>> 0);
return { h: t + r + (s / 4294967296 | 0) | 0, l: s | 0 };
}
var zt = (t, e, r) => (t >>> 0) + (e >>> 0) + (r >>> 0), te = (t, e, r, n) => e + r + n + (t / 4294967296 | 0) | 0, ee = (t, e, r, n) => (t >>> 0) + (e >>> 0) + (r >>> 0) + (n >>> 0), re = (t, e, r, n, s) => e + r + n + s + (t / 4294967296 | 0) | 0, ne = (t, e, r, n, s) => (t >>> 0) + (e >>> 0) + (r >>> 0) + (n >>> 0) + (s >>> 0), oe = (t, e, r, n, s, o) => e + r + n + s + o + (t / 4294967296 | 0) | 0;

// ../vendor/noble-hashes/src/utils.ts
var Ct = {};
O(Ct, {
abool: () => Rt,
abytes: () => m,
aexists: () => _,
ahash: () => w,
anumber: () => A,
aoutput: () => G,
asyncLoop: () => Lt,
byteSwap: () => _t,
byteSwap32: () => ae,
bytesToHex: () => je,
checkOpts: () => E,
clean: () => b,
concatBytes: () => Ge,
copyBytes: () => J,
createHasher: () => g,
createView: () => N,
hexToBytes: () => Xe,
isBytes: () => wt,
isLE: () => kt,
kdfInputToBytes: () => V,
nextTick: () => ue,
oidNist: () => T,
randomBytes: () => $e,
rotl: () => L,
rotr: () => U,
swap32IfBE: () => ht,
swap8IfBE: () => Pe,
u32: () => ft,
u8: () => Me,
utf8ToBytes: () => de,
validateObject: () => Ne
});
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function wt(t) {
return t instanceof Uint8Array || ArrayBuffer.isView(t) && t.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in t && t.BYTES_PER_ELEMENT === 1;
}
var dt = (t) => t ? `"${t}" ` : "";
function A(t, e = "") {
if (typeof t !== "number")
throw TypeError(dt(e) + "expected number, got " + typeof t);
if (!Number.isSafeInteger(t) || t < 0)
throw RangeError(dt(e) + "expected integer >= 0, got " + t);
return t;
}
function Rt(t, e = "") {
if (typeof t !== "boolean")
throw TypeError(dt(e) + "expected boolean, got type=" + typeof t);
return t;
}
function m(t, e, r = "") {
if (wt(t) && (e === void 0 || t.length === e))
return t;
if (e !== void 0)
A(e, "length");
let n = wt(t), s = e !== void 0 ? ` of length ${e}` : "", o = n ? `length=${t.length}` : `type=${typeof t}`, i = dt(r) + "expected Uint8Array" + s + ", got " + o;
if (!n)
throw TypeError(i);
throw RangeError(i);
}
function J(t) {
return Uint8Array.from(m(t));
}
function w(t) {
if (typeof t !== "function" || typeof t.create !== "function")
throw TypeError("expected hash wrapped by utils.createHasher");
if (A(t.outputLen), A(t.blockLen), t.outputLen < 1 || t.blockLen < 1)
throw Error("hash blockLen / outputLen must be >= 1");
}
var ut = (t, e) => {
if (t === null || typeof t !== "object" || Array.isArray(t))
throw TypeError((e === "object" ? "" : `"${e}" `) + "expected object, got type=" + typeof t);
}, se = (t, e) => {
ut(t, e);
let r = Object.getPrototypeOf(t);
if (r !== Object.prototype && r !== null)
throw TypeError(`"${e}" expected plain object`);
if (Object.hasOwn(t, "__proto__"))
throw TypeError(`"${e}.__proto__" is not allowed`);
};
function _(t, e = !0) {
if (t.destroyed)
throw Error("hash was destroyed");
if (e && t.finished)
throw Error("digest() was already called");
}
function G(t, e) {
m(t, void 0, "output");
let r = e.outputLen;
if (!(t.length >= r))
throw RangeError('"output" expected length >= ' + r);
}
function Me(t) {
return new Uint8Array(t.buffer, t.byteOffset, t.byteLength);
}
function ft(t) {
return new Uint32Array(t.buffer, t.byteOffset, Math.floor(t.byteLength / 4));
}
function b(...t) {
for (let e = 0;e < t.length; e++)
t[e].fill(0);
}
function N(t) {
return new DataView(t.buffer, t.byteOffset, t.byteLength);
}
function U(t, e) {
return t << 32 - e | t >>> e;
}
function L(t, e) {
return t << e | t >>> 32 - e >>> 0;
}
var kt = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
function _t(t) {
return t << 24 & 4278190080 | t << 8 & 16711680 | t >>> 8 & 65280 | t >>> 24 & 255;
}
var Pe = kt ? (t) => t : (t) => _t(t) >>> 0;
function ae(t) {
for (let e = 0;e < t.length; e++)
t[e] = _t(t[e]);
return t;
}
var ht = kt ? (t) => t : ae, ce = /* @__PURE__ */ (() => typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function")(), We = /* @__PURE__ */ Array.from({ length: 256 }, (t, e) => e.toString(16).padStart(2, "0"));
function je(t) {
if (m(t), ce)
return t.toHex();
let e = "";
for (let r = 0;r < t.length; r++)
e += We[t[r]];
return e;
}
function ie(t) {
return t >= 48 && t <= 57 ? t - 48 : t >= 65 && t <= 70 ? t - 55 : t >= 97 && t <= 102 ? t - 87 : void 0;
}
function Xe(t) {
if (typeof t !== "string")
throw TypeError("hex string expected, got " + typeof t);
if (ce)
try {
return Uint8Array.fromHex(t);
} catch (s) {
if (s instanceof SyntaxError)
throw RangeError(s.message);
throw s;
}
let e = t.length, r = e / 2;
if (e % 2)
throw RangeError("hex string expected, got unpadded hex of length " + e);
let n = new Uint8Array(r);
for (let s = 0, o = 0;s < r; s++, o += 2) {
let i = ie(t.charCodeAt(o)), a = ie(t.charCodeAt(o + 1));
if (i === void 0 || a === void 0) {
let u = t[o] + t[o + 1];
throw RangeError('hex string expected, got non-hex character "' + u + '" at index ' + o);
}
n[s] = i * 16 + a;
}
return n;
}
function ue(t) {
let e = globalThis;
if (typeof e.scheduler?.yield === "function") {
let r = e.scheduler.yield();
if (t)
r.catch(t);
return r;
}
return new Promise((r) => e.setTimeout(r, 0));
}
async function Lt(t, e, r, n) {
if (A(t, "iters"), A(e, "tick"), typeof r !== "function")
throw TypeError("callback must be a function");
let s = Date.now();
for (let o = 0;o < t; o++) {
r(o);
let i = Date.now() - s;
if (i >= 0 && i < e)
continue;
await ue(n), s = Date.now();
}
}
function de(t) {
if (typeof t !== "string")
throw TypeError("string expected");
let e = (/* @__PURE__ */ new TextEncoder()).encode(t);
try {
return new Uint8Array(e);
} finally {
b(e);
}
}
function V(t, e = "") {
if (typeof t === "string")
return de(t);
return m(t, void 0, e);
}
function Ge(...t) {
let e = 0;
for (let n = 0;n < t.length; n++) {
let s = t[n];
m(s), e += s.length;
}
let r = new Uint8Array(e);
for (let n = 0, s = 0;n < t.length; n++) {
let o = t[n];
r.set(o, s), s += o.length;
}
return r;
}
var Ne = (t, e = {}, r = {}, n = "object") => {
ut(t, n), ut(e, "fields"), ut(r, "optFields");
function s(i, a, u) {
let d = n === "object" ? `param "${String(i)}"` : `"${n}.${String(i)}"`, c = t[i];
if (!Object.hasOwn(t, i) && (u ? c !== void 0 : a !== "function"))
throw TypeError(`${d} is invalid: expected own property`);
if (u && c === void 0)
return;
let f = typeof c;
if (f !== a || c === null)
throw TypeError(`${d} is invalid: expected ${a}, got ${f}`);
}
let o = (i, a) => Object.entries(i).forEach(([u, d]) => s(u, d, a));
o(e, !1), o(r, !0);
};
function E(t, e, r = "opts") {
if (se(t, "defaults"), e !== void 0)
se(e, r);
return Object.assign(Object.create(null), t, e);
}
function g(t, e = {}) {
if (typeof t !== "function")
throw TypeError('"hashCons" expected function, got type=' + typeof t);
e = E({}, e, "info");
let r = (s, o) => t(o).update(s).digest(), n = t(void 0);
return r.outputLen = n.outputLen, r.blockLen = n.blockLen, r.canXOF = n.canXOF, r.create = (s) => t(s), Object.assign(r, e), Object.freeze(r);
}
function $e(t = 32) {
A(t, "bytesLength");
let e = typeof globalThis === "object" ? globalThis.crypto : null;
if (typeof e?.getRandomValues !== "function")
throw Error("crypto.getRandomValues must be defined");
if (t > 65536)
throw RangeError(`"bytesLength" expected <= 65536, got ${t}`);
return e.getRandomValues(new Uint8Array(t));
}
var T = (t) => ({
oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, t])
});

// ../vendor/noble-hashes/src/_md.ts
function q(t, e, r) {
return t & e ^ ~t & r;
}
function bt(t, e, r) {
return t & e ^ t & r ^ e & r;
}

class B {
blockLen;
outputLen;
canXOF = !1;
padOffset;
isLE;
buffer;
view;
finished = !1;
length = 0;
pos = 0;
destroyed = !1;
constructor(t, e, r, n) {
this.blockLen = t, this.outputLen = e, this.padOffset = r, this.isLE = n, this.buffer = new Uint8Array(t), this.view = N(this.buffer);
}
update(t) {
_(this), m(t);
let { view: e, buffer: r, blockLen: n } = this, s = t.length, o = !1;
for (let i = 0;i < s; ) {
let a = Math.min(n - this.pos, s - i);
if (a === n) {
let u = N(t);
for (;n <= s - i; i += n)
this.process(u, i);
o = !0;
continue;
}
if (r.set(i === 0 && a === s ? t : t.subarray(i, i + a), this.pos), this.pos += a, i += a, this.pos === n)
this.process(e, 0), this.pos = 0, o = !0;
}
if (this.length += t.length, o)
this.roundClean();
return this;
}
digestInto(t) {
_(this), G(t, this), this.finished = !0;
let { buffer: e, view: r, blockLen: n, isLE: s } = this, { pos: o } = this;
if (e[o++] = 128, e.fill(0, o), this.padOffset > n - o)
this.process(r, 0), e.fill(0);
Zt(r, n - 8, this.length * 8, s), this.process(r, 0), this.roundClean();
let i = t === e ? r : N(t), a = this.outputLen, u = a / 4, d = this.get();
if (a % 4 || u > d.length)
throw Error("invalid outputLen");
for (let c = 0;c < u; c++)
i.setUint32(4 * c, d[c], s);
}
digest() {
let { buffer: t, outputLen: e } = this;
this.digestInto(t);
let r = t.slice(0, e);
return this.destroy(), r;
}
_cloneIntoMeta(t) {
let { buffer: e, length: r, finished: n, destroyed: s, pos: o } = this;
if (t.destroyed = s, t.finished = n, t.length = r, t.pos = o, o)
t.buffer.set(e);
return t;
}
clone() {
return this._cloneInto();
}
}
var fe = /* @__PURE__ */ Uint32Array.from([
1779033703,
3144134277,
1013904242,
2773480762,
1359893119,
2600822924,
528734635,
1541459225
]), he = /* @__PURE__ */ Uint32Array.from([
3238371032,
914150663,
812702999,
4144912697,
4290775857,
1750603025,
1694076839,
3204075428
]), be = /* @__PURE__ */ Uint32Array.from([
3418070365,
3238371032,
1654270250,
914150663,
2438529370,
812702999,
355462360,
4144912697,
1731405415,
4290775857,
2394180231,
1750603025,
3675008525,
1694076839,
1203062813,
3204075428
]), pe = /* @__PURE__ */ Uint32Array.from([
1779033703,
4089235720,
3144134277,
2227873595,
1013904242,
4271175723,
2773480762,
1595750129,
1359893119,
2917565137,
2600822924,
725511199,
528734635,
4215389547,
1541459225,
327033209
]);

// ../vendor/noble-hashes/src/sha2.ts
var Ve = /* @__PURE__ */ Uint32Array.from([
1116352408,
1899447441,
3049323471,
3921009573,
961987163,
1508970993,
2453635748,
2870763221,
3624381080,
310598401,
607225278,
1426881987,
1925078388,
2162078206,
2614888103,
3248222580,
3835390401,
4022224774,
264347078,
604807628,
770255983,
1249150122,
1555081692,
1996064986,
2554220882,
2821834349,
2952996808,
3210313671,
3336571891,
3584528711,
113926993,
338241895,
666307205,
773529912,
1294757372,
1396182291,
1695183700,
1986661051,
2177026350,
2456956037,
2730485921,
2820302411,
3259730800,
3345764771,
3516065817,
3600352804,
4094571909,
275423344,
430227734,
506948616,
659060556,
883997877,
958139571,
1322822218,
1537002063,
1747873779,
1955562222,
2024104815,
2227730452,
2361852424,
2428436474,
2756734187,
3204031479,
3329325298
]), S = /* @__PURE__ */ new Uint32Array(64);

class It extends B {
A = 0;
B = 0;
C = 0;
D = 0;
E = 0;
F = 0;
G = 0;
H = 0;
constructor(t, e) {
super(64, t, 8, !1);
this.A = e[0] | 0, this.B = e[1] | 0, this.C = e[2] | 0, this.D = e[3] | 0, this.E = e[4] | 0, this.F = e[5] | 0, this.G = e[6] | 0, this.H = e[7] | 0;
}
get() {
let { A: t, B: e, C: r, D: n, E: s, F: o, G: i, H: a } = this;
return [t, e, r, n, s, o, i, a];
}
set(t, e, r, n, s, o, i, a) {
this.A = t | 0, this.B = e | 0, this.C = r | 0, this.D = n | 0, this.E = s | 0, this.F = o | 0, this.G = i | 0, this.H = a | 0;
}
_cloneInto(t) {
return (t ||= new this.constructor).set(...this.get()), this._cloneIntoMeta(t);
}
process(t, e) {
for (let c = 0;c < 16; c++, e += 4)
S[c] = t.getUint32(e, !1);
for (let c = 16;c < 64; c++) {
let f = S[c - 15], h = S[c - 2], p = U(f, 7) ^ U(f, 18) ^ f >>> 3, x = U(h, 17) ^ U(h, 19) ^ h >>> 10;
S[c] = x + S[c - 7] + p + S[c - 16] | 0;
}
let { A: r, B: n, C: s, D: o, E: i, F: a, G: u, H: d } = this;
for (let c = 0;c < 64; c++) {
let f = U(i, 6) ^ U(i, 11) ^ U(i, 25), h = d + f + q(i, a, u) + Ve[c] + S[c] | 0, x = (U(r, 2) ^ U(r, 13) ^ U(r, 22)) + bt(r, n, s) | 0;
d = u, u = a, a = i, i = o + h | 0, o = s, s = n, n = r, r = h + x | 0;
}
r = r + this.A | 0, n = n + this.B | 0, s = s + this.C | 0, o = o + this.D | 0, i = i + this.E | 0, a = a + this.F | 0, u = u + this.G | 0, d = d + this.H | 0, this.set(r, n, s, o, i, a, u, d);
}
roundClean() {
b(S);
}
destroy() {
this.destroyed = !0, this.set(0, 0, 0, 0, 0, 0, 0, 0), b(this.buffer);
}
}

class Ot extends It {
constructor() {
super(32, fe);
}
}

class Et extends It {
constructor() {
super(28, he);
}
}
var ye = /* @__PURE__ */ (() => ct([
"0x428a2f98d728ae22",
"0x7137449123ef65cd",
"0xb5c0fbcfec4d3b2f",
"0xe9b5dba58189dbbc",
"0x3956c25bf348b538",
"0x59f111f1b605d019",
"0x923f82a4af194f9b",
"0xab1c5ed5da6d8118",
"0xd807aa98a3030242",
"0x12835b0145706fbe",
"0x243185be4ee4b28c",
"0x550c7dc3d5ffb4e2",
"0x72be5d74f27b896f",
"0x80deb1fe3b1696b1",
"0x9bdc06a725c71235",
"0xc19bf174cf692694",
"0xe49b69c19ef14ad2",
"0xefbe4786384f25e3",
"0x0fc19dc68b8cd5b5",
"0x240ca1cc77ac9c65",
"0x2de92c6f592b0275",
"0x4a7484aa6ea6e483",
"0x5cb0a9dcbd41fbd4",
"0x76f988da831153b5",
"0x983e5152ee66dfab",
"0xa831c66d2db43210",
"0xb00327c898fb213f",
"0xbf597fc7beef0ee4",
"0xc6e00bf33da88fc2",
"0xd5a79147930aa725",
"0x06ca6351e003826f",
"0x142929670a0e6e70",
"0x27b70a8546d22ffc",
"0x2e1b21385c26c926",
"0x4d2c6dfc5ac42aed",
"0x53380d139d95b3df",
"0x650a73548baf63de",
"0x766a0abb3c77b2a8",
"0x81c2c92e47edaee6",
"0x92722c851482353b",
"0xa2bfe8a14cf10364",
"0xa81a664bbc423001",
"0xc24b8b70d0f89791",
"0xc76c51a30654be30",
"0xd192e819d6ef5218",
"0xd69906245565a910",
"0xf40e35855771202a",
"0x106aa07032bbd1b8",
"0x19a4c116b8d2d0c8",
"0x1e376c085141ab53",
"0x2748774cdf8eeb99",
"0x34b0bcb5e19b48a8",
"0x391c0cb3c5c95a63",
"0x4ed8aa4ae3418acb",
"0x5b9cca4f7763e373",
"0x682e6ff3d6b2b8a3",
"0x748f82ee5defb2fc",
"0x78a5636f43172f60",
"0x84c87814a1f0ab72",
"0x8cc702081a6439ec",
"0x90befffa23631e28",
"0xa4506cebde82bde9",
"0xbef9a3f7b2c67915",
"0xc67178f2e372532b",
"0xca273eceea26619c",
"0xd186b8c721c0c207",
"0xeada7dd6cde0eb1e",
"0xf57d4f7fee6ed178",
"0x06f067aa72176fba",
"0x0a637dc5a2c898a6",
"0x113f9804bef90dae",
"0x1b710b35131c471b",
"0x28db77f523047d84",
"0x32caab7b40c72493",
"0x3c9ebe0a15c9bebc",
"0x431d67c49c100d4c",
"0x4cc5d4becb3e42b6",
"0x597f299cfc657e2a",
"0x5fcb6fab3ad6faec",
"0x6c44198c4a475817"
].map((t) => BigInt(t))))(), Ye = /* @__PURE__ */ (() => ye[0])(), Je = /* @__PURE__ */ (() => ye[1])(), F = /* @__PURE__ */ new Uint32Array(80), v = /* @__PURE__ */ new Uint32Array(80);

class et extends B {
Ah = 0;
Al = 0;
Bh = 0;
Bl = 0;
Ch = 0;
Cl = 0;
Dh = 0;
Dl = 0;
Eh = 0;
El = 0;
Fh = 0;
Fl = 0;
Gh = 0;
Gl = 0;
Hh = 0;
Hl = 0;
constructor(t, e) {
super(128, t, 16, !1);
this.Ah = e[0] | 0, this.Al = e[1] | 0, this.Bh = e[2] | 0, this.Bl = e[3] | 0, this.Ch = e[4] | 0, this.Cl = e[5] | 0, this.Dh = e[6] | 0, this.Dl = e[7] | 0, this.Eh = e[8] | 0, this.El = e[9] | 0, this.Fh = e[10] | 0, this.Fl = e[11] | 0, this.Gh = e[12] | 0, this.Gl = e[13] | 0, this.Hh = e[14] | 0, this.Hl = e[15] | 0;
}
get() {
let { Ah: t, Al: e, Bh: r, Bl: n, Ch: s, Cl: o, Dh: i, Dl: a, Eh: u, El: d, Fh: c, Fl: f, Gh: h, Gl: p, Hh: x, Hl: H } = this;
return [t, e, r, n, s, o, i, a, u, d, c, f, h, p, x, H];
}
set(t, e, r, n, s, o, i, a, u, d, c, f, h, p, x, H) {
this.Ah = t | 0, this.Al = e | 0, this.Bh = r | 0, this.Bl = n | 0, this.Ch = s | 0, this.Cl = o | 0, this.Dh = i | 0, this.Dl = a | 0, this.Eh = u | 0, this.El = d | 0, this.Fh = c | 0, this.Fl = f | 0, this.Gh = h | 0, this.Gl = p | 0, this.Hh = x | 0, this.Hl = H | 0;
}
_cloneInto(t) {
return (t ||= new this.constructor).set(...this.get()), this._cloneIntoMeta(t);
}
process(t, e) {
for (let y = 0;y < 16; y++, e += 4)
F[y] = t.getUint32(e), v[y] = t.getUint32(e += 4);
for (let y = 16;y < 80; y++) {
let R = F[y - 15] | 0, l = v[y - 15] | 0, W = j(R, l, 1) ^ j(R, l, 8) ^ Ht(R, l, 7), lt = X(R, l, 1) ^ X(R, l, 8) ^ Ut(R, l, 7), C = F[y - 2] | 0, I = v[y - 2] | 0, st = j(C, I, 19) ^ z(C, I, 61) ^ Ht(C, I, 6), Tt = X(C, I, 19) ^ tt(C, I, 61) ^ Ut(C, I, 6), it = ee(lt, Tt, v[y - 7], v[y - 16]), gt = re(it, W, st, F[y - 7], F[y - 16]);
F[y] = gt | 0, v[y] = it | 0;
}
let { Ah: r, Al: n, Bh: s, Bl: o, Ch: i, Cl: a, Dh: u, Dl: d, Eh: c, El: f, Fh: h, Fl: p, Gh: x, Gl: H, Hh: M, Hl: P } = this;
for (let y = 0;y < 80; y++) {
let R = j(c, f, 14) ^ j(c, f, 18) ^ z(c, f, 41), l = X(c, f, 14) ^ X(c, f, 18) ^ tt(c, f, 41), W = c & h ^ ~c & x, lt = f & p ^ ~f & H, C = ne(P, l, lt, Je[y], v[y]), I = oe(C, M, R, W, Ye[y], F[y]), st = C | 0, Tt = j(r, n, 28) ^ z(r, n, 34) ^ z(r, n, 39), it = X(r, n, 28) ^ tt(r, n, 34) ^ tt(r, n, 39), gt = r & s ^ r & i ^ s & i, Oe = n & o ^ n & a ^ o & a;
M = x | 0, P = H | 0, x = h | 0, H = p | 0, h = c | 0, p = f | 0, { h: c, l: f } = k(u | 0, d | 0, I | 0, st | 0), u = i | 0, d = a | 0, i = s | 0, a = o | 0, s = r | 0, o = n | 0;
let qt = zt(st, it, Oe);
r = te(qt, I, Tt, gt), n = qt | 0;
}
({ h: r, l: n } = k(this.Ah | 0, this.Al | 0, r | 0, n | 0)), { h: s, l: o } = k(this.Bh | 0, this.Bl | 0, s | 0, o | 0), { h: i, l: a } = k(this.Ch | 0, this.Cl | 0, i | 0, a | 0), { h: u, l: d } = k(this.Dh | 0, this.Dl | 0, u | 0, d | 0), { h: c, l: f } = k(this.Eh | 0, this.El | 0, c | 0, f | 0), { h, l: p } = k(this.Fh | 0, this.Fl | 0, h | 0, p | 0), { h: x, l: H } = k(this.Gh | 0, this.Gl | 0, x | 0, H | 0), { h: M, l: P } = k(this.Hh | 0, this.Hl | 0, M | 0, P | 0), this.set(r, n, s, o, i, a, u, d, c, f, h, p, x, H, M, P);
}
roundClean() {
b(F, v);
}
destroy() {
this.destroyed = !0, b(this.buffer), this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
}
}

class Bt extends et {
constructor() {
super(64, pe);
}
}

class St extends et {
constructor() {
super(48, be);
}
}
var qe = /* @__PURE__ */ Uint32Array.from([
2352822216,
424955298,
1944164710,
2312950998,
502970286,
855612546,
1738396948,
1479516111,
258812777,
2077511080,
2011393907,
79989058,
1067287976,
1780299464,
286451373,
2446758561
]), Qe = /* @__PURE__ */ Uint32Array.from([
573645204,
4230739756,
2673172387,
3360449730,
596883563,
1867755857,
2520282905,
1497426621,
2519219938,
2827943907,
3193839141,
1401305490,
721525244,
746961066,
246885852,
2177182882
]);

class Ft extends et {
constructor() {
super(28, qe);
}
}

class vt extends et {
constructor() {
super(32, Qe);
}
}
var Ze = /* @__PURE__ */ g(() => new Ot, /* @__PURE__ */ T(1)), ze = /* @__PURE__ */ g(() => new Et, /* @__PURE__ */ T(4)), tr = /* @__PURE__ */ g(() => new Bt, /* @__PURE__ */ T(3)), er = /* @__PURE__ */ g(() => new St, /* @__PURE__ */ T(2)), rr = /* @__PURE__ */ g(() => new vt, /* @__PURE__ */ T(6)), nr = /* @__PURE__ */ g(() => new Ft, /* @__PURE__ */ T(5));

// ../vendor/noble-hashes/src/hmac.ts
var Kt = {};
O(Kt, {
_HMAC: () => pt,
hmac: () => Y
});
class pt {
oHash;
iHash;
blockLen;
outputLen;
canXOF = !1;
finished = !1;
destroyed = !1;
constructor(t, e) {
if (w(t), m(e, void 0, "key"), this.iHash = t.create(), typeof this.iHash.update !== "function")
throw Error("expected Hash instance");
this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
let r = this.blockLen, n = new Uint8Array(r);
n.set(e.length > r ? t.create().update(e).digest() : e);
for (let s = 0;s < n.length; s++)
n[s] ^= 54;
this.iHash.update(n), this.oHash = t.create();
for (let s = 0;s < n.length; s++)
n[s] ^= 106;
this.oHash.update(n), b(n);
}
update(t) {
return _(this), this.iHash.update(t), this;
}
digestInto(t) {
_(this), G(t, this), this.finished = !0;
let e = t.subarray(0, this.outputLen);
this.iHash.digestInto(e), this.oHash.update(e), this.oHash.digestInto(e), this.destroy();
}
digest() {
let t = new Uint8Array(this.oHash.outputLen);
return this.digestInto(t), t;
}
_cloneInto(t) {
t ||= Object.create(Object.getPrototypeOf(this), {});
let { oHash: e, iHash: r, finished: n, destroyed: s, blockLen: o, outputLen: i, canXOF: a } = this;
return t = t, t.finished = n, t.destroyed = s, t.blockLen = o, t.outputLen = i, t.canXOF = a, t.oHash = e._cloneInto(t.oHash), t.iHash = r._cloneInto(t.iHash), t;
}
clone() {
return this._cloneInto();
}
destroy() {
this.destroyed = !0, this.oHash.destroy(), this.iHash.destroy();
}
}
var Y = /* @__PURE__ */ (() => {
let t = (e, r, n) => new pt(e, r).update(n).digest();
return t.create = (e, r) => new pt(e, r), t;
})();

// ../vendor/noble-hashes/src/hkdf.ts
var Mt = {};
O(Mt, {
expand: () => xe,
extract: () => or,
hkdf: () => ir
});
function or(t, e, r) {
if (w(t), r === void 0)
r = new Uint8Array(t.outputLen);
return Y(t, r, e);
}
var rt = /* @__PURE__ */ Uint8Array.of(0), sr = /* @__PURE__ */ Uint8Array.of();
function xe(t, e, r, n = 32, s) {
w(t), A(n, "length"), m(e, void 0, "prk");
let o = t.outputLen;
if (e.length < o)
throw Error('"prk" must be at least HashLen octets');
if (n > 255 * o)
throw Error("Length must be <= 255*HashLen");
let i = Math.ceil(n / o);
if (r === void 0)
r = sr;
else
m(r, void 0, "info");
if (!i) {
if (s)
b(e);
return new Uint8Array;
}
let a = s && i === 1 ? e : new Uint8Array(i * o), { iHash: u, oHash: d } = Y.create(t, e), c = s ? e : new Uint8Array(o), f = i > 1 ? s?.iHash || t.create() : void 0;
for (let p = 0;p < i - 1; p++) {
rt[0] = p + 1;
let x = u._cloneInto(f);
if (p)
x.update(c);
x.update(r).update(rt).digestInto(c), d._cloneInto(f).update(c).digestInto(c), a.set(c, o * p);
}
if (rt[0] = i, i > 1)
u.update(c);
if (u.update(r).update(rt).digestInto(c), d.update(c).digestInto(c), a.set(c, o * (i - 1)), u.destroy(), d.destroy(), f?.destroy(), c !== a)
b(c);
if (b(rt), n === a.length)
return a;
let h = a.slice(0, n);
return b(a), h;
}
var ir = (t, e, r, n, s) => {
if (w(t), r === void 0)
r = new Uint8Array(t.outputLen);
let o = Y.create(t, r).update(e);
return xe(t, o.digest(), n, s, o);
};

// ../vendor/noble-hashes/src/pbkdf2.ts
var Pt = {};
O(Pt, {
pbkdf2: () => cr,
pbkdf2Async: () => ur
});
function Ae(t, e, r, n) {
w(t);
let s = E({ dkLen: 32, asyncTick: 10 }, n), { c: o, dkLen: i, asyncTick: a } = s;
if (A(o, "c"), A(i, "dkLen"), A(a, "asyncTick"), o < 1)
throw Error('"c" (iterations) must be >= 1');
if (i < 1)
throw Error('"dkLen" must be >= 1');
if (i > 4294967295 * t.outputLen)
throw Error("derived key too long");
let u = V(e, "password");
try {
let d = V(r, "salt");
try {
let c = new Uint8Array(i), { iHash: f, oHash: h, outputLen: p } = Y.create(t, u), x = new Uint8Array(p), H = ar(f, h, d, x);
return { c: o, dkLen: i, asyncTick: a, DK: c, outputLen: p, eng: H };
} finally {
if (typeof r === "string")
b(d);
}
} finally {
if (typeof e === "string")
b(u);
}
}
function ar(t, e, r, n) {
let s = new Uint8Array(4), o = N(s), i = t._cloneInto().update(r), a = e._cloneInto(), u = t._cloneInto, d = e._cloneInto;
return {
u1: (c, f) => {
o.setInt32(0, c, !1), i._cloneInto(a).update(s).digestInto(n), e._cloneInto(a).update(n).digestInto(n), f.set(n.subarray(0, f.length));
},
rounds: (c, f) => {
for (let h = 1;h < c; h++) {
u.call(t, a).update(n).digestInto(n), d.call(e, a).update(n).digestInto(n);
for (let p = 0;p < f.length; p++)
f[p] ^= n[p];
}
},
output: (c) => (t.destroy(), e.destroy(), i.destroy(), a.destroy(), b(n), c)
};
}
function cr(t, e, r, n) {
let { c: s, dkLen: o, DK: i, outputLen: a, eng: u } = Ae(t, e, r, n);
for (let d = 1, c = 0;c < o; d++, c += a) {
let f = i.subarray(c, c + a);
u.u1(d, f), u.rounds(s, f);
}
return u.output(i);
}
async function ur(t, e, r, n) {
let { c: s, dkLen: o, asyncTick: i, DK: a, outputLen: u, eng: d } = Ae(t, e, r, n), c = () => {
d.output(a), b(a);
};
for (let f = 1, h = 0;h < o; f++, h += u) {
let p = a.subarray(h, h + u);
d.u1(f, p), await Lt(s - 1, i, () => {
d.rounds(2, p);
}, c);
}
return d.output(a);
}

// ../vendor/noble-hashes/src/legacy.ts
var Nt = {};
O(Nt, {
_MD5: () => Xt,
_RIPEMD160: () => Gt,
_SHA1: () => jt,
md5: () => pr,
ripemd160: () => gr,
sha1: () => dr
});
var Q = /* @__PURE__ */ Uint32Array.from([
1732584193,
4023233417,
2562383102,
271733878,
3285377520
]), D = /* @__PURE__ */ new Uint32Array(80);

class jt extends B {
A = Q[0] | 0;
B = Q[1] | 0;
C = Q[2] | 0;
D = Q[3] | 0;
E = Q[4] | 0;
constructor() {
super(64, 20, 8, !1);
}
get() {
let { A: t, B: e, C: r, D: n, E: s } = this;
return [t, e, r, n, s];
}
set(t, e, r, n, s) {
this.A = t | 0, this.B = e | 0, this.C = r | 0, this.D = n | 0, this.E = s | 0;
}
_cloneInto(t) {
return (t ||= new this.constructor).set(...this.get()), this._cloneIntoMeta(t);
}
process(t, e) {
for (let a = 0;a < 16; a++, e += 4)
D[a] = t.getUint32(e, !1);
for (let a = 16;a < 80; a++)
D[a] = L(D[a - 3] ^ D[a - 8] ^ D[a - 14] ^ D[a - 16], 1);
let { A: r, B: n, C: s, D: o, E: i } = this;
for (let a = 0;a < 80; a++) {
let u, d;
if (a < 20)
u = q(n, s, o), d = 1518500249;
else if (a < 40)
u = n ^ s ^ o, d = 1859775393;
else if (a < 60)
u = bt(n, s, o), d = 2400959708;
else
u = n ^ s ^ o, d = 3395469782;
let c = L(r, 5) + u + i + d + D[a] | 0;
i = o, o = s, s = L(n, 30), n = r, r = c;
}
r = r + this.A | 0, n = n + this.B | 0, s = s + this.C | 0, o = o + this.D | 0, i = i + this.E | 0, this.set(r, n, s, o, i);
}
roundClean() {
b(D);
}
destroy() {
this.destroyed = !0, this.set(0, 0, 0, 0, 0), b(this.buffer);
}
}
var dr = /* @__PURE__ */ g(() => new jt), fr = /* @__PURE__ */ Math.pow(2, 32), hr = /* @__PURE__ */ Array.from({ length: 64 }, (t, e) => Math.floor(fr * Math.abs(Math.sin(e + 1)))), yt = /* @__PURE__ */ Q.slice(0, 4), Wt = /* @__PURE__ */ new Uint32Array(16), br = /* @__PURE__ */ (() => {
let t = [
[7, 12, 17, 22],
[5, 9, 14, 20],
[4, 11, 16, 23],
[6, 10, 15, 21]
];
return Uint8Array.from({ length: 64 }, (e, r) => t[Math.floor(r / 16)][r % 4]);
})();

class Xt extends B {
A = yt[0] | 0;
B = yt[1] | 0;
C = yt[2] | 0;
D = yt[3] | 0;
constructor() {
super(64, 16, 8, !0);
}
get() {
let { A: t, B: e, C: r, D: n } = this;
return [t, e, r, n];
}
set(t, e, r, n) {
this.A = t | 0, this.B = e | 0, this.C = r | 0, this.D = n | 0;
}
_cloneInto(t) {
return (t ||= new this.constructor).set(...this.get()), this._cloneIntoMeta(t);
}
process(t, e) {
for (let i = 0;i < 16; i++, e += 4)
Wt[i] = t.getUint32(e, !0);
let { A: r, B: n, C: s, D: o } = this;
for (let i = 0;i < 64; i++) {
let a, u;
if (i < 16)
a = q(n, s, o), u = i;
else if (i < 32)
a = q(o, n, s), u = (5 * i + 1) % 16;
else if (i < 48)
a = n ^ s ^ o, u = (3 * i + 5) % 16;
else
a = s ^ (n | ~o), u = 7 * i % 16;
a = a + r + hr[i] + Wt[u], r = o, o = s, s = n, n = n + L(a, br[i]);
}
r = r + this.A | 0, n = n + this.B | 0, s = s + this.C | 0, o = o + this.D | 0, this.set(r, n, s, o);
}
roundClean() {
b(Wt);
}
destroy() {
this.destroyed = !0, this.set(0, 0, 0, 0), b(this.buffer);
}
}
var pr = /* @__PURE__ */ g(() => new Xt), yr = /* @__PURE__ */ Uint8Array.from([
7,
4,
13,
1,
10,
6,
15,
3,
12,
0,
9,
5,
2,
14,
11,
8
]), le = /* @__PURE__ */ (() => Uint8Array.from(Array(16).fill(0).map((t, e) => e)))(), xr = /* @__PURE__ */ (() => le.map((t) => (9 * t + 5) % 16))(), Te = /* @__PURE__ */ (() => {
let r = [[le], [xr]];
for (let n = 0;n < 4; n++)
for (let s of r)
s.push(s[n].map((o) => yr[o]));
return r;
})(), ge = /* @__PURE__ */ (() => Te[0])(), He = /* @__PURE__ */ (() => Te[1])(), Ue = /* @__PURE__ */ [
[11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
[12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
[13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
[14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
[15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5]
].map((t) => Uint8Array.from(t)), Ar = /* @__PURE__ */ ge.map((t, e) => t.map((r) => Ue[e][r])), mr = /* @__PURE__ */ He.map((t, e) => t.map((r) => Ue[e][r])), lr = /* @__PURE__ */ Uint32Array.from([
0,
1518500249,
1859775393,
2400959708,
2840853838
]), Tr = /* @__PURE__ */ Uint32Array.from([
1352829926,
1548603684,
1836072691,
2053994217,
0
]);
function me(t, e, r, n) {
if (t === 0)
return e ^ r ^ n;
if (t === 1)
return e & r | ~e & n;
if (t === 2)
return (e | ~r) ^ n;
if (t === 3)
return e & n | r & ~n;
return e ^ (r | ~n);
}
var xt = /* @__PURE__ */ new Uint32Array(16);

class Gt extends B {
h0 = 1732584193;
h1 = -271733879;
h2 = -1732584194;
h3 = 271733878;
h4 = -1009589776;
constructor() {
super(64, 20, 8, !0);
}
get() {
let { h0: t, h1: e, h2: r, h3: n, h4: s } = this;
return [t, e, r, n, s];
}
set(t, e, r, n, s) {
this.h0 = t | 0, this.h1 = e | 0, this.h2 = r | 0, this.h3 = n | 0, this.h4 = s | 0;
}
_cloneInto(t) {
return (t ||= new this.constructor).set(...this.get()), this._cloneIntoMeta(t);
}
process(t, e) {
for (let h = 0;h < 16; h++, e += 4)
xt[h] = t.getUint32(e, !0);
let r = this.h0 | 0, n = r, s = this.h1 | 0, o = s, i = this.h2 | 0, a = i, u = this.h3 | 0, d = u, c = this.h4 | 0, f = c;
for (let h = 0;h < 5; h++) {
let p = 4 - h, x = lr[h], H = Tr[h], M = ge[h], P = He[h], y = Ar[h], R = mr[h];
for (let l = 0;l < 16; l++) {
let W = L(r + me(h, s, i, u) + xt[M[l]] + x, y[l]) + c | 0;
r = c, c = u, u = L(i, 10) | 0, i = s, s = W;
}
for (let l = 0;l < 16; l++) {
let W = L(n + me(p, o, a, d) + xt[P[l]] + H, R[l]) + f | 0;
n = f, f = d, d = L(a, 10) | 0, a = o, o = W;
}
}
this.set(this.h1 + i + d | 0, this.h2 + u + f | 0, this.h3 + c + n | 0, this.h4 + r + o | 0, this.h0 + s + a | 0);
}
roundClean() {
b(xt);
}
destroy() {
this.destroyed = !0, b(this.buffer), this.set(0, 0, 0, 0, 0);
}
}
var gr = /* @__PURE__ */ g(() => new Gt);

// ../vendor/noble-hashes/src/sha3.ts
var $t = {};
O($t, {
Keccak: () => ot,
keccakP: () => Ie,
keccak_224: () => Dr,
keccak_256: () => Kr,
keccak_384: () => Mr,
keccak_512: () => Pr,
sha3_224: () => Br,
sha3_256: () => Sr,
sha3_384: () => Fr,
sha3_512: () => vr,
shake128: () => Wr,
shake128_32: () => Xr,
shake256: () => jr,
shake256_64: () => Gr
});
var Hr = BigInt(0), nt = BigInt(1), Ur = BigInt(2), wr = BigInt(7), Rr = BigInt(256), kr = BigInt(113), ke = [], _e = [], Le = [];
for (let t = 0, e = nt, r = 1, n = 0;t < 24; t++) {
[r, n] = [n, (2 * r + 3 * n) % 5], ke.push(2 * (5 * n + r)), _e.push((t + 1) * (t + 2) / 2 % 64);
let s = Hr;
for (let o = 0;o < 7; o++)
if (e = (e << nt ^ (e >> wr) * kr) % Rr, e & Ur)
s ^= nt << (nt << BigInt(o)) - nt;
Le.push(s);
}
var Ce = ct(Le, !0), _r = Ce[0], Lr = Ce[1], Cr = (t, e, r) => t << r | e >>> 32 - r, Ir = (t, e, r) => e << r | t >>> 32 - r, Or = (t, e, r) => e << r - 32 | t >>> 64 - r, Er = (t, e, r) => t << r - 32 | e >>> 64 - r, we = (t, e, r) => r > 32 ? Or(t, e, r) : Cr(t, e, r), Re = (t, e, r) => r > 32 ? Er(t, e, r) : Ir(t, e, r), Z = new Uint32Array(10);
function Ie(t, e = 24) {
if (!(t instanceof Uint32Array))
throw TypeError('"s" expected Uint32Array(50), got type=' + typeof t);
if (t.length !== 50)
throw RangeError('"s" expected Uint32Array(50), got length=' + t.length);
if (A(e, "rounds"), e < 1 || e > 24)
throw Error('"rounds" expected integer 1..24');
for (let r = 24 - e;r < 24; r++) {
for (let o = 0;o < 10; o++)
Z[o] = t[o] ^ t[o + 10] ^ t[o + 20] ^ t[o + 30] ^ t[o + 40];
for (let o = 0;o < 10; o += 2) {
let i = (o + 8) % 10, a = (o + 2) % 10, u = Z[a], d = Z[a + 1], c = we(u, d, 1) ^ Z[i], f = Re(u, d, 1) ^ Z[i + 1];
for (let h = 0;h < 50; h += 10)
t[o + h] ^= c, t[o + h + 1] ^= f;
}
let n = t[2], s = t[3];
for (let o = 0;o < 24; o++) {
let i = _e[o], a = we(n, s, i), u = Re(n, s, i), d = ke[o];
n = t[d], s = t[d + 1], t[d] = a, t[d + 1] = u;
}
for (let o = 0;o < 50; o += 10) {
let i = t[o], a = t[o + 1], u = t[o + 2], d = t[o + 3];
t[o] ^= ~t[o + 2] & t[o + 4], t[o + 1] ^= ~t[o + 3] & t[o + 5], t[o + 2] ^= ~t[o + 4] & t[o + 6], t[o + 3] ^= ~t[o + 5] & t[o + 7], t[o + 4] ^= ~t[o + 6] & t[o + 8], t[o + 5] ^= ~t[o + 7] & t[o + 9], t[o + 6] ^= ~t[o + 8] & i, t[o + 7] ^= ~t[o + 9] & a, t[o + 8] ^= ~i & u, t[o + 9] ^= ~a & d;
}
t[0] ^= _r[r], t[1] ^= Lr[r];
}
b(Z);
}

class ot {
state;
pos = 0;
posOut = 0;
finished = !1;
state32;
destroyed = !1;
blockLen;
suffix;
outputLen;
canXOF;
enableXOF = !1;
rounds;
constructor(t, e, r, n = !1, s = 24) {
if (A(t, "blockLen"), A(e, "suffix"), A(s, "rounds"), Rt(n, "enableXOF"), this.blockLen = t, this.suffix = e, this.outputLen = r, this.enableXOF = n, this.canXOF = n, this.rounds = s, A(r, "outputLen"), !(0 < t && t < 200))
throw Error('"blockLen" must be 1..199');
this.state = new Uint8Array(200), this.state32 = ft(this.state);
}
clone() {
return this._cloneInto();
}
keccak() {
ht(this.state32), Ie(this.state32, this.rounds), ht(this.state32), this.posOut = 0, this.pos = 0;
}
update(t) {
_(this), m(t);
let { blockLen: e, state: r, state32: n } = this, s = t.length, o = e % 4 === 0 && t.byteOffset % 4 === 0, i = e / 4, a = o && s >= e ? ft(t) : void 0;
for (let u = 0;u < s; ) {
if (a !== void 0 && this.pos === 0 && u % 4 === 0 && s - u >= e) {
for (let c = 0, f = u / 4;c < i; c++)
n[c] ^= a[f + c];
u += e, this.pos = e, this.keccak();
continue;
}
let d = Math.min(e - this.pos, s - u);
for (let c = 0;c < d; c++)
r[this.pos++] ^= t[u++];
if (this.pos === e)
this.keccak();
}
return this;
}
finish() {
if (this.finished)
return;
this.finished = !0;
let { state: t, suffix: e, pos: r, blockLen: n } = this;
if (t[r] ^= e, (e & 128) !== 0 && r === n - 1)
this.keccak();
t[n - 1] ^= 128, this.keccak();
}
writeInto(t) {
_(this, !1), m(t), this.finish();
let e = this.state, { blockLen: r } = this;
for (let n = 0, s = t.length;n < s; ) {
if (this.posOut >= r)
this.keccak();
let o = Math.min(r - this.posOut, s - n);
t.set(e.subarray(this.posOut, this.posOut + o), n), this.posOut += o, n += o;
}
return t;
}
xofInto(t) {
if (!this.enableXOF)
throw Error("XOF is not enabled");
return this.writeInto(t);
}
xof(t) {
return A(t), this.xofInto(new Uint8Array(t));
}
digestInto(t) {
if (G(t, this), this.finished)
throw Error("digest() was already called");
this.writeInto(t.length === this.outputLen ? t : t.subarray(0, this.outputLen)), this.destroy();
}
digest() {
let t = new Uint8Array(this.outputLen);
return this.digestInto(t), t;
}
destroy() {
this.destroyed = !0, b(this.state);
}
_cloneInto(t) {
let { blockLen: e, suffix: r, outputLen: n, rounds: s, enableXOF: o } = this;
return t ||= new ot(e, r, n, o, s), t.blockLen = e, t.state32.set(this.state32), t.pos = this.pos, t.posOut = this.posOut, t.finished = this.finished, t.rounds = s, t.suffix = r, t.outputLen = n, t.enableXOF = o, t.canXOF = this.canXOF, t.destroyed = this.destroyed, t;
}
}
var K = (t, e, r, n = {}) => g(() => new ot(e, t, r), n), Br = /* @__PURE__ */ K(6, 144, 28, /* @__PURE__ */ T(7)), Sr = /* @__PURE__ */ K(6, 136, 32, /* @__PURE__ */ T(8)), Fr = /* @__PURE__ */ K(6, 104, 48, /* @__PURE__ */ T(9)), vr = /* @__PURE__ */ K(6, 72, 64, /* @__PURE__ */ T(10)), Dr = /* @__PURE__ */ K(1, 144, 28), Kr = /* @__PURE__ */ K(1, 136, 32), Mr = /* @__PURE__ */ K(1, 104, 48), Pr = /* @__PURE__ */ K(1, 72, 64), At = (t, e, r, n = {}) => g((s = {}) => (s = E({}, s), new ot(e, t, s.dkLen === void 0 ? r : s.dkLen, !0)), n), Wr = /* @__PURE__ */ At(31, 168, 16, /* @__PURE__ */ T(11)), jr = /* @__PURE__ */ At(31, 136, 32, /* @__PURE__ */ T(12)), Xr = /* @__PURE__ */ At(31, 168, 32, /* @__PURE__ */ T(11)), Gr = /* @__PURE__ */ At(31, 136, 64, /* @__PURE__ */ T(12));

// ../vendor/noble-hashes/src/webcrypto.ts
var Jt = {};
O(Jt, {
hkdf: () => Jr,
hmac: () => Yr,
pbkdf2: () => qr,
sha256: () => Nr,
sha384: () => $r,
sha512: () => Vr
});
function mt() {
let e = (typeof globalThis === "object" ? globalThis.crypto : null)?.subtle;
if (typeof e === "object" && e != null)
return e;
throw Error("crypto.subtle must be defined");
}
function Vt(t, e, r) {
let n = async (s) => {
m(s);
let o = mt();
return new Uint8Array(await o.digest(t, s));
};
return n.webCryptoName = t, n.outputLen = r, n.blockLen = e, n.create = () => {
throw Error("not implemented");
}, Object.freeze(n);
}
function Yt(t) {
w(t);
let e = t.webCryptoName;
if (typeof e !== "string")
throw Error("non-web hash");
return e;
}
var Nr = /* @__PURE__ */ Vt("SHA-256", 64, 32), $r = /* @__PURE__ */ Vt("SHA-384", 128, 48), Vr = /* @__PURE__ */ Vt("SHA-512", 128, 64), Yr = /* @__PURE__ */ (() => {
let t = async (e, r, n) => {
let s = mt();
m(r, void 0, "key"), m(n, void 0, "message");
let o = Yt(e), i = J(n);
try {
let a = await s.importKey("raw", r, { name: "HMAC", hash: o }, !1, ["sign"]);
return new Uint8Array(await s.sign("HMAC", a, i));
} finally {
b(i);
}
};
return t.create = (e, r) => {
throw Error("not implemented");
}, t;
})();
async function Jr(t, e, r, n, s) {
let o = mt(), i = Yt(t), a = t.outputLen;
if (m(e, void 0, "ikm"), A(s, "length"), s > 255 * a)
throw Error("Length must be <= 255*HashLen");
if (r !== void 0)
m(r, void 0, "salt");
if (n !== void 0)
m(n, void 0, "info");
let u = r === void 0 ? new Uint8Array(0) : J(r), d = n === void 0 ? new Uint8Array(0) : J(n);
try {
let c = await o.importKey("raw", e, "HKDF", !1, ["deriveBits"]), f = { name: "HKDF", hash: i, salt: u, info: d }, h = new Uint8Array(await o.deriveBits(f, c, 8 * s));
if (h.length !== s)
throw b(h), Error("WebCrypto returned an invalid derived key length");
return h;
} finally {
b(u, d);
}
}
async function qr(t, e, r, n) {
let s = mt(), o = Yt(t), i = E({ dkLen: 32 }, n), { c: a, dkLen: u } = i;
if (A(a, "c"), A(u, "dkLen"), a > 2147483647)
throw Error('"c" exceeds WebCrypto backend limit');
if (u < 1)
throw Error('"dkLen" must be >= 1');
if (u >= 536870912)
throw Error("derived key too long");
let d = V(e, "password");
try {
let c = V(r, "salt"), f = typeof r === "string" ? c : J(c);
try {
let h = await s.importKey("raw", d, "PBKDF2", !1, [
"deriveBits"
]), p = { name: "PBKDF2", salt: f, iterations: a, hash: o }, x = new Uint8Array(await s.deriveBits(p, h, 8 * u));
if (x.length !== u)
throw b(x), Error("WebCrypto returned an invalid derived key length");
return x;
} finally {
b(f);
}
} finally {
if (typeof e === "string")
b(d);
}
}

// entry-hashes.ts
globalThis.__LCH = Object.freeze({ sha2: Dt, hmac: Kt, hkdf: Mt, pbkdf2: Pt, legacy: Nt, sha3: $t, utils: Ct, webcrypto: Jt });
})();
