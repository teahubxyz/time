(() => {
var fe = Object.defineProperty;
var le = (e) => e;
function ye(e, t) {
this[e] = le.bind(null, t);
}
var ue = (e, t) => {
for (var r in t)
fe(e, r, {
get: t[r],
enumerable: !0,
configurable: !0,
set: ye.bind(t, r)
});
};

// ../vendor/scure-base/index.ts
var K = {};
ue(K, {
__TESTS: () => He,
ascii: () => We,
base16: () => Te,
base32: () => ge,
base32crockford: () => me,
base32hex: () => pe,
base32hexnopad: () => be,
base32nopad: () => xe,
base36: () => ve,
base58: () => E,
base58check: () => Se,
base58flickr: () => $e,
base58xmr: () => Ke,
base58xrp: () => Pe,
base64: () => Ce,
base64nopad: () => Be,
base64url: () => Re,
base64urlnopad: () => Ee,
bech32: () => Me,
bech32m: () => Ne,
createBase58check: () => oe,
hex: () => Ge,
utf8: () => Oe
});
/*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) */
var A = (e) => Object.freeze(e());
function X(e) {
return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function x(e) {
if (!X(e))
throw TypeError("Uint8Array expected");
}
function Ae(e, t) {
if (!Array.isArray(t))
return !1;
if (t.length === 0)
return !0;
if (e)
return t.every((r) => typeof r === "string");
else
return t.every((r) => Number.isSafeInteger(r));
}
function _(e) {
if (typeof e !== "function")
throw TypeError("function expected");
return !0;
}
function w(e, t) {
if (typeof t !== "string")
throw TypeError(`${e}: string expected`);
return !0;
}
function R(e, t = "number") {
if (typeof e !== "number")
throw TypeError(`${t}: expected number, got ${typeof e}`);
if (!Number.isSafeInteger(e))
throw RangeError(`${t}: expected safe integer, got ${e}`);
}
function L(e, t) {
if (!Ae(!1, t))
throw TypeError(`${e}: array of numbers expected`);
}
function U(...e) {
let t = (i) => i, r = (i, s) => (c) => i(s(c)), n = e.map((i) => i.encode).reduceRight(r, t), o = e.map((i) => i.decode).reduce(r, t);
return { encode: n, decode: o };
}
function Y(e) {
return _(e), { encode: (t) => t, decode: (t) => e(t) };
}
var he = /* @__PURE__ */ (() => {
let e = [];
for (let t = 0;t < 40; t++)
e.push(2 ** t);
return e;
})();
function M(e, t = e.length) {
let r = Array(t);
for (let n = 0;n < t; n++)
r[n] = e[n];
return r;
}
var N = /* @__PURE__ */ (() => {
try {
let e = /* @__PURE__ */ new TextDecoder;
return e.decode(Uint8Array.of(65, 48, 43, 127)) === "A0+\x7f" ? e : void 0;
} catch (e) {
return;
}
})(), F = 8192;
function V(e) {
let t = e.length;
if (N !== void 0 && t >= 12)
return N.decode(e);
if (t <= F)
return String.fromCharCode.apply(null, e);
let r = "";
for (let n = 0;n < t; n += F)
r += String.fromCharCode.apply(null, e.subarray(n, n + F));
return r;
}
function m(e) {
if (R(e), e <= 0 || e > 8)
throw RangeError("radix2: bits should be in (0..8]");
let t = he[e] - 1;
return {
encode: (r) => {
x(r);
let n = r.length, o = new Uint8Array(Math.ceil(n * 8 / e)), i = 0, s = 0, c = 0;
for (let l = 0;l < n; ) {
if (l + 2 < n)
i = i << 24 | r[l] << 16 | r[l + 1] << 8 | r[l + 2], s += 24, l += 3;
else
i = (i << 8 | r[l]) & 65535, s += 8, l++;
for (;; )
if (s -= e, o[c++] = i >> s & t, s < e)
break;
}
if (s > 0)
o[c] = i << e - s & t;
return o;
},
decode: (r) => {
let n = r.length, o = new Uint8Array(Math.floor(n * e / 8)), i = 0, s = 0, c = 0;
for (let l = 0;l < n; l++) {
i = (i << e | r[l]) & 65535, s += e;
for (;s >= 8; s -= 8)
o[c++] = i >> s - 8 & 255;
}
if (i = i << 8 - s & 255, s >= e)
throw Error("Excess padding");
if (i > 0)
throw Error(`Non-zero padding: ${i}`);
return o;
}
};
}
function p(e, t) {
let r = e.length;
if (r > 128)
throw Error("alphabet: max 128 letters");
let n = new Uint8Array(r), o = new Int8Array(128).fill(-1);
for (let i = 0;i < r; i++) {
let s = e.charCodeAt(i);
if (e.codePointAt(i) !== s || s > 127)
throw Error("alphabet: single-char ASCII letters only");
n[i] = s, o[s] = i;
}
if (t !== void 0)
for (let i of Object.keys(t)) {
let s = i.charCodeAt(0), c = o[t[i].charCodeAt(0)];
if (i.length !== 1 || s > 127 || c === void 0 || c === -1)
throw Error(`alphabet: invalid alias ${i}`);
o[s] = c;
}
return {
encode: (i) => {
let s = new Uint8Array(i.length);
for (let c = 0;c < i.length; c++) {
let l = i[c], g = n[l];
if (g === void 0)
throw Error(`alphabet.encode: invalid digit ${l}`);
s[c] = g;
}
return V(s);
},
decode: (i) => {
w("decode", i);
let s = i.length, c = new Uint8Array(s);
for (let l = 0;l < s; l++) {
let g = i.charCodeAt(l), h = g < 128 ? o[g] : -1;
if (h === -1)
throw Error(`Unknown letter "${i[l]}". Allowed: ${e}`);
c[l] = h;
}
return c;
}
};
}
function k(e, t = "=") {
return R(e), w("padding", t), {
encode(r) {
while (r.length * e % 8)
r += t;
return r;
},
decode(r) {
w("decode", r);
let n = r.length;
if (n * e % 8)
throw Error("padding: invalid length");
for (;n > 0 && r[n - 1] === t; n--)
if ((n - 1) * e % 8 === 0)
throw Error("padding: excess padding");
return r.slice(0, n);
}
};
}
function W(e) {
return _(e), function(...t) {
try {
return e.apply(null, t);
} catch (r) {}
};
}
function J(e, t) {
if (R(e), e <= 0)
throw RangeError(`checksum length must be positive: ${e}`);
_(t);
let r = t;
return {
encode(n) {
x(n);
let o = r(n).slice(0, e), i = new Uint8Array(n.length + e);
return i.set(n), i.set(o, n.length), i;
},
decode(n) {
x(n);
let o = n.slice(0, -e), i = n.slice(-e), s = r(o).slice(0, e);
for (let c = 0;c < e; c++)
if (s[c] !== i[c])
throw Error("Invalid checksum");
return o;
}
};
}
var Te = /* @__PURE__ */ A(() => U(m(4), p("0123456789ABCDEF"))), ge = /* @__PURE__ */ A(() => U(m(5), p("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"), k(5))), xe = /* @__PURE__ */ A(() => U(m(5), p("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"))), pe = /* @__PURE__ */ A(() => U(m(5), p("0123456789ABCDEFGHIJKLMNOPQRSTUV"), k(5))), be = /* @__PURE__ */ A(() => U(m(5), p("0123456789ABCDEFGHIJKLMNOPQRSTUV"))), we = /^[\x00-\x7f]*$/, me = /* @__PURE__ */ A(() => U(m(5), p("0123456789ABCDEFGHJKMNPQRSTVWXYZ"), Y((e) => {
w("base32crockford.decode", e);
let t = e.toUpperCase();
if (e !== t && !we.test(e))
throw Error("base32crockford.decode: ASCII expected");
return t.replace(/O/g, "0").replace(/[IL]/g, "1");
}))), Q = /* @__PURE__ */ (() => typeof Uint8Array.from([]).toBase64 === "function" && typeof Uint8Array.fromBase64 === "function")(), Ue = /[\t\n\f\r ]/, q = (e, t) => {
w("base64", e);
let r = t ? "base64url" : "base64";
if (e.length > 0 && Ue.test(e))
throw Error("invalid base64");
return Uint8Array.fromBase64(e, { alphabet: r, lastChunkHandling: "strict" });
}, Z = /* @__PURE__ */ A(() => U(m(6), p("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"), k(6))), ee = /* @__PURE__ */ A(() => U(m(6), p("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"), k(6))), Ce = /* @__PURE__ */ A(() => Q ? {
encode(e) {
return x(e), e.toBase64();
},
decode(e) {
return q(e, !1);
}
} : Z), Be = /* @__PURE__ */ A(() => U(m(6), p("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"))), Re = /* @__PURE__ */ A(() => Q ? {
encode(e) {
return x(e), e.toBase64({ alphabet: "base64url" });
},
decode(e) {
return q(e, !0);
}
} : ee), Ee = /* @__PURE__ */ A(() => U(m(6), p("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"))), _e = 656356768, ke = 60466176, O = 65536, Fe = 2048, Ie = 4096, re = (e, t) => ({
encode: (r) => {
x(r);
let n = r.length;
if (n === 0)
return new Uint8Array(0);
if (n >= O)
throw Error("invalid length");
let o = 0;
while (o < n - 1 && r[o] === 0)
o++;
let i = Math.ceil(n / 2), s = new Uint16Array(i), c = n & 1;
if (c)
s[0] = r[0];
for (let a = c, d = c;a < n; a += 2, d++)
s[d] = r[a] << 8 | r[a + 1];
let l = [], g = 0;
while (g < i) {
let a = 0;
for (let d = g;d < i; d++) {
let T = a * 65536 + s[d], b = Math.floor(T / t);
if (a = T - b * t, s[d] = b, b === 0 && d === g)
g++;
}
l.push(a);
}
let h = l.length - 1, y = h * 5;
for (let a = l[h];; a = Math.floor(a / e))
if (y++, a < e)
break;
let f = new Uint8Array(o + y), u = f.length - 1;
for (let a = 0;a < h; a++) {
let d = l[a];
for (let T = 0;T < 5; T++)
f[u--] = d % e, d = Math.floor(d / e);
}
for (let a = l[h];u >= o; a = Math.floor(a / e))
f[u--] = a % e;
return f;
},
decode: (r) => {
x(r);
let n = r.length;
if (n === 0)
return new Uint8Array(0);
if (n >= O)
throw Error("invalid length");
let o = 0;
while (o < n - 1 && r[o] === 0)
o++;
let i = new Uint16Array(Math.ceil(n * 6 / 16) + 1), s = 0, c = 0, l = n % 5 || 5;
while (c < n) {
let f = 0, u = 1;
for (let d = c + l;c < d; c++) {
let T = r[c];
if (T >= e)
throw Error(`invalid integer: ${T}`);
f = f * e + T, u *= e;
}
l = 5;
let a = f;
for (let d = 0;d < s; d++) {
let T = i[d] * u + a;
a = Math.floor(T / 65536), i[d] = T - a * 65536;
}
for (;a > 0; a = Math.floor(a / 65536))
i[s++] = a % 65536;
}
let g = s === 0 ? 1 : s * 2 - (i[s - 1] < 256 ? 1 : 0), h = new Uint8Array(o + g), y = h.length - 1;
for (let f = 0;f < s; f++) {
let u = i[f];
if (h[y--] = u & 255, y >= o)
h[y--] = u >> 8;
}
return h;
}
}), ne = (e, t) => {
let r = p(t);
return {
encode(n) {
if (x(n), n.length > Fe)
throw Error("invalid length");
return r.encode(e.encode(n));
},
decode(n) {
if (w("baseN.decode", n), n.length > Ie)
throw Error("invalid length");
return e.decode(r.decode(n));
}
};
}, te = /* @__PURE__ */ re(58, _e), ve = /* @__PURE__ */ A(() => ne(re(36, ke), "0123456789abcdefghijklmnopqrstuvwxyz")), P = (e) => ne(te, e), E = /* @__PURE__ */ A(() => P("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz")), $e = /* @__PURE__ */ A(() => P("123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ")), Pe = /* @__PURE__ */ A(() => P("rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz")), H = [0, 2, 3, 5, 6, 7, 9, 10, 11], Ke = /* @__PURE__ */ A(() => ({
encode(e) {
x(e);
let t = "";
for (let r = 0;r < e.length; r += 8) {
let n = e.subarray(r, r + 8);
t += E.encode(n).padStart(H[n.length], "1");
}
return t;
},
decode(e) {
w("base58xmr.decode", e);
let t = e.length, r = t % 11, n = r === 0 ? 0 : H.indexOf(r);
if (n === -1)
throw Error(`base58xmr: invalid block length ${r}`);
let o = new Uint8Array(Math.floor(t / 11) * 8 + n), i = 0;
for (let s = 0;s < t; s += 11) {
let c = e.slice(s, s + 11), l = c.length === 11 ? 8 : n, g = E.decode(c);
for (let h = 0;h < g.length - l; h++)
if (g[h] !== 0)
throw Error("base58xmr: wrong padding");
for (let h = g.length - l;h < g.length; h++)
o[i++] = g[h];
}
return o;
}
})), oe = (e) => {
_(e);
let t = e;
return U(J(4, (r) => t(t(r))), E);
}, Se = oe, I = /* @__PURE__ */ p("qpzry9x8gf2tvdw0s3jn54khce6mua7l"), De = /^[\x21-\x60\x7b-\x7e]+$/;
function j(e, t) {
for (let r = 0;r < t.length; r++) {
let n = t.charCodeAt(r);
if (n < 33 || n > 126)
throw Error(`${e}: printable ASCII expected`);
}
}
function Le(e) {
let t = e.length, r = new Uint8Array(t);
for (let n = 0;n < t; n++) {
let o = e[n];
if (o < 0 || o >= 32)
throw Error(`alphabet.encode: invalid digit ${o}`);
r[n] = o;
}
return r;
}
var z = [996825010, 642813549, 513874426, 1027748829, 705979059];
function B(e) {
let t = e >> 25, r = (e & 33554431) << 5;
for (let n = 0;n < z.length; n++)
if ((t >> n & 1) === 1)
r ^= z[n];
return r;
}
function G(e, t, r = 1) {
let n = e.length, o = 1;
for (let s = 0;s < n; s++) {
let c = e.charCodeAt(s);
if (c < 33 || c > 126)
throw Error(`Invalid prefix (${e})`);
o = B(o) ^ c >> 5;
}
o = B(o);
for (let s = 0;s < n; s++)
o = B(o) ^ e.charCodeAt(s) & 31;
for (let s of t)
o = B(o) ^ s;
for (let s = 0;s < 6; s++)
o = B(o);
o ^= r;
let i = new Uint8Array(6);
for (let s = 0;s < 6; s++)
i[s] = o >>> 5 * (5 - s) & 31;
return I.encode(i);
}
function ie(e) {
let t = e === "bech32" ? 1 : 734539939, r = m(5), n = (y) => {
x(y);
let f = y.length, u = Array(Math.ceil(f * 8 / 5)), a = 0, d = 0, T = 0;
for (let b = 0;b < f; b++) {
a = a << 8 | y[b], d += 8;
for (;d >= 5; d -= 5)
u[T++] = a >> d - 5 & 31;
}
if (d > 0)
u[T] = a << 5 - d & 31;
return u;
}, o = (y) => {
L("radix2.decode", y);
let f = y.length, u = new Uint8Array(f);
for (let a = 0;a < f; a++) {
let d = y[a];
if (d < 0 || d >= 32)
throw Error(`convertRadix2: invalid word=${d}`);
u[a] = d;
}
return r.decode(u);
}, i = W(o);
function s(y, f, u = 90) {
if (w("bech32.encode prefix", y), u !== !1)
R(u, "limit");
if (X(f))
f = M(f);
L("bech32.encode", f);
let a = y.length;
if (a === 0)
throw TypeError(`Invalid prefix length ${a}`);
let d = a + 7 + f.length;
if (u !== !1 && d > u)
throw TypeError(`Length ${d} exceeds limit ${u}`);
j("bech32.encode prefix", y);
let T = y.toLowerCase(), b = G(T, f, t);
return `${T}1${I.encode(Le(f))}${b}`;
}
function c(y, f = 90) {
if (w("bech32.decode input", y), f !== !1)
R(f, "limit");
let u = y.length;
if (u < 8 || f !== !1 && u > f)
throw TypeError(`invalid string length ${u}, expected (8..${f})`);
let a = y.toLowerCase();
if (y !== a) {
if (!De.test(y))
throw j("bech32.decode input", y), Error("mixed-case string not allowed");
}
let d = a.lastIndexOf("1");
if (d === 0 || d === -1)
throw Error('invalid separator "1"');
let T = a.slice(0, d), b = a.slice(d + 1);
if (b.length < 6)
throw Error("invalid data length");
let S = I.decode(b), D = M(S, S.length - 6), de = G(T, D, t);
if (!b.endsWith(de))
throw Error(`Invalid checksum in ${y}`);
return { prefix: T, words: D };
}
let l = W(c);
function g(y, f = 90) {
let { prefix: u, words: a } = c(y, f);
return {
prefix: u,
words: a,
bytes: o(a)
};
}
function h(y, f) {
return s(y, n(f));
}
return {
encode: s,
decode: c,
encodeFromBytes: h,
decodeToBytes: g,
decodeUnsafe: l,
fromWords: o,
fromWordsUnsafe: i,
toWords: n
};
}
var Me = /* @__PURE__ */ A(() => ie("bech32")), Ne = /* @__PURE__ */ A(() => ie("bech32m")), We = /* @__PURE__ */ A(() => ({
encode(e) {
x(e);
for (let t = 0;t < e.length; t++) {
let r = e[t];
if (r > 127)
throw RangeError(`non-ASCII byte ${r} at ${t}`);
}
return V(e);
},
decode(e) {
if (typeof e !== "string")
throw TypeError("ascii string expected, got " + typeof e);
let t = new Uint8Array(e.length);
for (let r = 0;r < e.length; r++) {
let n = e.charCodeAt(r);
if (n > 127)
throw RangeError(`non-ASCII char "${e[r]}" (${n}) at ${r}`);
t[r] = n;
}
return t;
}
})), se = (e) => {
try {
return encodeURI(e) !== null;
} catch {
return !1;
}
}, ae = /* @__PURE__ */ (() => typeof "".isWellFormed === "function" ? (e) => e.isWellFormed() : se)(), C = (e) => TypeError(`invalid utf8 at byte ${e}`), v = /* @__PURE__ */ A(() => ({
encode(e) {
x(e);
let t = "";
for (let r = 0;r < e.length; ) {
let n = e[r++];
if (n < 128) {
t += String.fromCharCode(n);
continue;
}
if (n < 194 || r >= e.length)
throw C(r - 1);
let o = e[r++];
if ((o & 192) !== 128)
throw C(r - 1);
let i = (n & 31) << 6 | o & 63;
if (n >= 224) {
if (r >= e.length)
throw C(r - 1);
let s = e[r++];
if ((s & 192) !== 128 || n === 224 && o < 160 || n === 237 && o >= 160)
throw C(r - 1);
if (i = (n & 15) << 12 | (o & 63) << 6 | s & 63, n >= 240) {
if (r >= e.length)
throw C(r - 1);
let c = e[r++];
if (n > 244 || (c & 192) !== 128 || n === 240 && o < 144 || n === 244 && o >= 144)
throw C(r - 1);
i = (n & 7) << 18 | (o & 63) << 12 | (s & 63) << 6 | c & 63;
}
}
if (i < 65536)
t += String.fromCharCode(i);
else
i -= 65536, t += String.fromCharCode((i >> 10) + 55296, (i & 1023) + 56320);
}
return t;
},
decode(e) {
if (w("utf8", e), !ae(e))
throw TypeError("utf8 expected well-formed string");
let t = new Uint8Array(e.length * 3), r = 0;
for (let n = 0;n < e.length; n++) {
let o = e.charCodeAt(n);
if (o < 128) {
t[r++] = o;
continue;
}
if (o >= 55296 && o <= 57343) {
let i = e.charCodeAt(++n);
o = 65536 + (o - 55296 << 10) + i - 56320;
}
if (o >= 65536)
t[r++] = o >> 18 | 240, t[r++] = o >> 12 & 63 | 128;
else if (o >= 2048)
t[r++] = o >> 12 | 224;
else
t[r++] = o >> 6 | 192;
if (o >= 2048)
t[r++] = o >> 6 & 63 | 128;
t[r++] = o & 63 | 128;
}
return t.subarray(0, r);
}
})), Oe = /* @__PURE__ */ A(() => {
let e, t, r = {
encode(n) {
return x(n), (t || (t = new TextDecoder("utf-8", { ignoreBOM: !0, fatal: !0 }))).decode(n);
},
decode(n) {
if (w("utf8", n), !ae(n))
throw TypeError("utf8 expected well-formed string");
return (e || (e = /* @__PURE__ */ new TextEncoder)).encode(n);
}
};
return {
encode: typeof TextDecoder === "function" ? r.encode : v.encode,
decode: typeof TextEncoder === "function" ? r.decode : v.decode
};
}), ce = /* @__PURE__ */ A(() => U(m(4), p("0123456789abcdef", { A: "a", B: "b", C: "c", D: "d", E: "e", F: "f" }), Y((e) => {
if (w("hex", e), e.length % 2 !== 0)
throw TypeError(`hex.decode: odd-length string (${e.length})`);
return e;
}))), He = /* @__PURE__ */ A(() => ({
alphabet: p,
base64Fallback: Z,
base64urlFallback: ee,
hexFallback: ce,
radix2: m,
radix58: te,
checksum: J,
utf8Fallback: v,
_isWellFormedShim: se
})), je = /* @__PURE__ */ (() => typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function")(), ze = {
encode(e) {
return x(e), e.toHex();
},
decode(e) {
return w("hex", e), Uint8Array.fromHex(e);
}
}, Ge = /* @__PURE__ */ A(() => je ? ze : ce);

// entry-base.ts
globalThis.__LCB = Object.freeze({ base: K });
})();
