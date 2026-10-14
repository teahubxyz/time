(() => {
// shim:@noble/hashes/sha2.js
var Fe = globalThis.__LCH.sha2;
if (!Fe)
throw Error("lineage: __LCH.sha2 missing");
var { _SHA224: Br, _SHA256: Pr, _SHA384: vr, _SHA512: Ur, _SHA512_224: Sr, _SHA512_256: Cr, sha224: Or, sha256: Wt, sha384: Fr, sha512: be, sha512_224: _r, sha512_256: Ir } = Fe;

// shim:@noble/hashes/utils.js
var _e = globalThis.__LCH.utils;
if (!_e)
throw Error("lineage: __LCH.utils missing");
var { abool: Nr, abytes: Nt, aexists: qr, ahash: Ie, anumber: qt, aoutput: Kr, asyncLoop: kr, byteSwap: Hr, byteSwap32: Mr, bytesToHex: Xt, checkOpts: Lr, clean: Zr, concatBytes: pe, copyBytes: jr, createHasher: zr, createView: Vr, hexToBytes: Gt, isBytes: De, isLE: Yr, kdfInputToBytes: Wr, nextTick: Xr, oidNist: Gr, randomBytes: Kt, rotl: $r, rotr: Qr, swap32IfBE: Jr, swap8IfBE: ti, u32: ei, u8: ni, utf8ToBytes: ri, validateObject: ii } = _e;

// ../vendor/noble-curves/src/utils.ts
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function Qt(t, e, r = () => {}) {
if (!Array.isArray(t))
throw TypeError(`"${e}" expected array, got type=${typeof t}`);
for (let n = 0;n < t.length; n++)
r(t[n], `${e}[${n}]`);
return t;
}
var I = (t, e, r) => Nt(t, e, r), Te = qt;
function qe(t, e = "") {
if (typeof t !== "string") {
let r = e && `"${e}" `;
throw TypeError(r + "expected string, got type=" + typeof t);
}
return t;
}
function mt(t, e = "object") {
if (t === null || typeof t !== "object" || Array.isArray(t))
throw TypeError(e === "object" ? "expected valid options object" : `"${e}" expected object, got type=${typeof t}`);
return t;
}
function Rt(t, e) {
if (typeof t !== "function")
throw TypeError(`"${e}" is invalid: expected function, got ${typeof t}`);
return t;
}
var kt = Xt, ot = (...t) => pe(...t), St = (t) => Gt(t), At = De, yt = (t) => Kt(t), $t = /* @__PURE__ */ BigInt(0), Ne = /* @__PURE__ */ BigInt(1), Hn = (t) => t ? `"${t}" ` : "";
function st(t, e = "") {
if (typeof t !== "boolean")
throw TypeError(Hn(e) + "expected boolean, got type=" + typeof t);
return t;
}
function Jt(t) {
if (typeof t === "bigint") {
if (!ht(t))
throw RangeError("positive bigint expected, got " + t);
} else
Te(t);
return t;
}
function gt(t, e = "") {
if (typeof t !== "number") {
let r = e && `"${e}" `;
throw TypeError(r + "expected number, got type=" + typeof t);
}
if (!Number.isSafeInteger(t)) {
let r = e && `"${e}" `;
throw RangeError(r + "expected safe integer, got " + t);
}
}
function Ht(t) {
let e = Jt(t).toString(16);
return e.length & 1 ? "0" + e : e;
}
function Ke(t) {
if (typeof t !== "string")
throw TypeError("hex string expected, got " + typeof t);
return t === "" ? $t : BigInt("0x" + t);
}
function ct(t) {
return Ke(Xt(t));
}
function dt(t) {
return Ke(Xt(ut(Nt(t)).reverse()));
}
function te(t, e) {
if (qt(e), e === 0)
throw Error("zero output length is invalid");
t = Jt(t);
let r = e * 2, n = t.toString(16);
if (n.length > r)
throw RangeError("number is too large");
return Gt(n.padStart(r, "0"));
}
function Mt(t, e) {
return te(t, e).reverse();
}
function ut(t) {
return Uint8Array.from(I(t));
}
function ke(t) {
if (typeof t !== "string")
throw TypeError("ascii string expected, got " + typeof t);
return Uint8Array.from(t, (e, r) => {
let n = e.charCodeAt(0);
if (e.length !== 1 || n > 127)
throw RangeError(`string contains non-ASCII character "${t[r]}" with code ${n} at position ${r}`);
return n;
});
}
function ht(t) {
return typeof t === "bigint" && $t <= t;
}
function me(t, e, r) {
return ht(t) && ht(e) && ht(r) && e <= t && t < r;
}
function lt(t, e, r, n) {
if (!me(e, r, n))
throw RangeError("expected valid " + t + ": " + r + " <= n < " + n + ", got " + e);
}
function Ct(t) {
if (t < $t)
throw Error("expected non-negative bigint, got " + t);
return t === $t ? 0 : t.toString(2).length;
}
var Lt = (t) => (gt(t, "n"), (Ne << BigInt(t)) - Ne);
function He(t, e, r) {
if (qt(t, "hashLen"), qt(e, "qByteLen"), typeof r !== "function")
throw TypeError("hmacFn must be a function");
let n = (S) => new Uint8Array(S), i = Uint8Array.of(), o = Uint8Array.of(0), a = Uint8Array.of(1), d = 1000, c = n(t), u = n(t), g = 0, m = () => {
c.fill(1), u.fill(0), g = 0;
}, E = (...S) => r(u, ot(c, ...S)), p = (S = i) => {
if (u = E(o, S), c = E(), S.length === 0)
return;
u = E(a, S), c = E();
}, C = () => {
if (g++ >= d)
throw Error("drbg: tried max amount of iterations");
let S = 0, O = [];
while (S < e) {
c = E();
let y = c.slice();
O.push(y), S += c.length;
}
return ot(...O);
};
return (S, O) => {
m(), p(S);
let y = void 0;
while ((y = O(C())) === void 0)
p();
return m(), y;
};
}
function it(t, e = {}, r = {}, n = "object") {
mt(t, n), mt(e, "fields"), mt(r, "optFields");
function i(a, d, c) {
let u = n === "object" ? `param "${String(a)}"` : `"${n}.${String(a)}"`, g = t[a];
if (!Object.hasOwn(t, a) && (c ? g !== void 0 : d !== "function"))
throw TypeError(`${u} is invalid: expected own property`);
if (c && g === void 0)
return;
let m = typeof g;
if (m !== d || g === null)
throw TypeError(`${u} is invalid: expected ${d}, got ${m}`);
}
let o = (a, d) => Object.entries(a).forEach(([c, u]) => i(c, u, d));
o(e, !1), o(r, !0);
}

// ../vendor/noble-curves/src/abstract/modular.ts
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
var nt = /* @__PURE__ */ BigInt(0), M = /* @__PURE__ */ BigInt(1), Et = /* @__PURE__ */ BigInt(2), Ze = /* @__PURE__ */ BigInt(3), Ae = /* @__PURE__ */ BigInt(4), je = /* @__PURE__ */ BigInt(5), Mn = /* @__PURE__ */ BigInt(7), ze = /* @__PURE__ */ BigInt(8), Ln = /* @__PURE__ */ BigInt(9), Zn = /* @__PURE__ */ BigInt(15), Ve = /* @__PURE__ */ BigInt(16), jn = /* @__PURE__ */ BigInt("0x10000000000000000");
function L(t, e) {
if (e <= nt)
throw Error("mod: expected positive modulus, got " + e);
let r = t % e;
return r >= nt ? r : e + r;
}
function Ye(t, e, r) {
if (r <= M)
throw Error("pow: expected modulus > 1, got " + r);
if (typeof e !== "bigint")
throw TypeError("invalid exponent: expected bigint, got " + typeof e);
if (e < nt)
throw Error("invalid exponent, negatives unsupported");
if (e === nt)
return M;
if (e === M)
return t;
let n = t % r;
if (n < nt)
n += r;
if (e < jn) {
let d = M;
while (e > nt) {
if (e & M)
d = d * n % r;
n = n * n % r, e >>= M;
}
return d;
}
let i = [];
while (e > nt)
i.push(Number(e & Zn)), e >>= Ae;
let o = Array(16);
o[0] = M, o[1] = n;
for (let d = 2;d < 16; d++)
o[d] = o[d - 1] * n % r;
let a = o[i[i.length - 1]];
for (let d = i.length - 2;d >= 0; d--) {
a = a * a % r, a = a * a % r, a = a * a % r, a = a * a % r;
let c = i[d];
if (c !== 0)
a = a * o[c] % r;
}
return a;
}
function Y(t, e, r) {
if (r <= M)
throw Error("pow2: expected modulus > 1, got " + r);
if (e < nt)
throw Error("pow2: expected non-negative exponent, got " + e);
let n = t;
while (e-- > nt)
n *= n, n %= r;
return n;
}
function Me(t, e) {
if (t === nt)
throw Error("invert: expected non-zero number");
if (e <= M)
throw Error("invert: expected modulus > 1, got " + e);
let r = L(t, e), n = e, i = nt, o = M;
while (r !== nt) {
let d = n / r, c = n - r * d, u = i - o * d;
n = r, r = c, i = o, o = u;
}
if (n !== M)
throw Error("invert: does not exist");
return L(i, e);
}
function We(t, e) {
if (e <= M)
throw Error("invertCt: expected prime modulus > 1, got " + e);
let r = L(t, e);
if (r === nt)
throw Error("invertCt: expected non-zero number");
let n = Ye(r, e - Et, e);
if (L(r * n, e) !== M)
throw Error("invertCt: does not exist");
return n;
}
function Ee(t, e, r) {
let n = t;
if (!n.eql(n.sqr(e), r))
throw Error("Cannot find square root");
}
function we(t, e) {
if ((t & M) === nt)
throw Error(e + ": expected odd modulus, got " + t);
}
function Xe(t, e) {
let r = t, n = (r.ORDER + M) / Ae, i = r.pow(e, n);
return Ee(r, i, e), i;
}
function zn(t, e) {
let r = t, n = (r.ORDER - je) / ze, i = r.mul(e, Et), o = r.pow(i, n), a = r.mul(e, o), d = r.mul(r.mul(a, Et), o), c = r.mul(a, r.sub(d, r.ONE));
return Ee(r, c, e), c;
}
function Vn(t) {
let e = Ft(t), r = Ge(t), n = r(e, e.neg(e.ONE)), i = r(e, n), o = r(e, e.neg(n)), a = (t + Mn) / Ve;
return (d, c) => {
let u = d, g = u.pow(c, a), m = u.mul(g, n), E = u.mul(g, i), p = u.mul(g, o), C = u.eql(u.sqr(m), c), T = u.eql(u.sqr(E), c);
g = u.cmov(g, m, C), m = u.cmov(p, E, T);
let S = u.eql(u.sqr(m), c), O = u.cmov(g, m, S);
return Ee(u, O, c), O;
};
}
function Ge(t) {
if (t < Ze)
throw Error("sqrt is not defined for small field");
we(t, "tonelliShanks");
let e = t - M, r = 0;
while (e % Et === nt)
e /= Et, r++;
let n = Et, i = Ft(t);
while (Zt(i, n) === 1)
if (n++ > 1000)
throw Error("Cannot find square root: probably non-prime P");
if (r === 1)
return Xe;
let o = i.pow(n, e), a = (e + M) / Et;
return function(c, u) {
let g = c;
if (g.is0(u))
return u;
if (Zt(g, u) !== 1)
throw Error("Cannot find square root");
let m = r, E = g.mul(g.ONE, o), p = g.pow(u, e), C = g.pow(u, a);
while (!g.eql(p, g.ONE)) {
if (g.is0(p))
throw Error("Cannot find square root: probably non-prime P");
let T = 1, S = g.sqr(p);
while (!g.eql(S, g.ONE))
if (T++, S = g.sqr(S), T === m)
throw Error("Cannot find square root");
let O = M << BigInt(m - T - 1), y = g.pow(E, O);
m = T, E = g.sqr(y), p = g.mul(p, E), C = g.mul(C, y);
}
return C;
};
}
function Yn(t) {
if (we(t, "Fp.sqrt"), t % Ae === Ze)
return Xe;
if (t % ze === je)
return zn;
if (t % Ve === Ln)
return Vn(t);
return Ge(t);
}
var $e = (t, e) => (L(t, e) & M) === M, Wn = [
"create",
"isValid",
"is0",
"neg",
"inv",
"sqrt",
"sqr",
"eql",
"add",
"sub",
"mul",
"pow",
"div",
"addN",
"subN",
"mulN",
"sqrN"
];
function Ot(t) {
if (mt(t, "field"), typeof t.ORDER !== "bigint")
throw TypeError('param "ORDER" is invalid: expected bigint, got ' + typeof t.ORDER);
gt(t.BYTES, "BYTES"), gt(t.BITS, "BITS");
for (let e of Wn)
Rt(t[e], "field." + e);
if (t.BYTES < 1 || t.BITS < 1)
throw Error("invalid field: expected BYTES/BITS > 0");
if (t.ORDER <= M)
throw Error("invalid field: expected ORDER > 1, got " + t.ORDER);
return t;
}
function ee(t, e, r = !1) {
Ot(t), Qt(e, "nums"), st(r, "passZero");
let n = t, i = Array(e.length).fill(r ? n.ZERO : void 0), o = e.reduce((d, c, u) => {
if (n.is0(c))
return d;
return i[u] = d, n.mul(d, c);
}, n.ONE), a = n.inv(o);
return e.reduceRight((d, c, u) => {
if (n.is0(c))
return d;
return i[u] = n.mul(d, i[u]), n.mul(d, c);
}, a), i;
}
function Zt(t, e) {
Ot(t);
let r = t;
we(r.ORDER, "FpLegendre");
let n = (r.ORDER - M) / Et, i = r.pow(e, n), o = r.eql(i, r.ONE), a = r.eql(i, r.ZERO), d = r.eql(i, r.neg(r.ONE));
if (!o && !a && !d)
throw Error("invalid Legendre symbol result");
return o ? 1 : a ? 0 : -1;
}
function Xn(t, e) {
if (e !== void 0)
Te(e);
if (t <= nt)
throw Error("invalid n length: expected positive n, got " + t);
if (e !== void 0 && e < 1)
throw Error("invalid n length: expected positive bit length, got " + e);
let r = Ct(t);
if (e !== void 0 && e < r)
throw Error(`invalid n length: expected nBitLength (${e}) >= bitLen(n) (${r})`);
let n = e !== void 0 ? e : r, i = Math.ceil(n / 8);
return { nBitLength: n, nByteLength: i };
}
var Le = /* @__PURE__ */ new WeakMap;

class he {
ORDER;
BITS;
BYTES;
isLE;
ZERO = nt;
ONE = M;
_lengths;
_mod;
constructor(t, e = {}) {
if (t <= M)
throw Error("invalid field: expected ORDER > 1, got " + t);
let r = void 0;
if (this.isLE = !1, e != null && typeof e === "object") {
if (typeof e.BITS === "number")
r = e.BITS;
if (typeof e.sqrt === "function")
Object.defineProperty(this, "sqrt", { value: e.sqrt, enumerable: !0 });
if (typeof e.isLE === "boolean")
this.isLE = e.isLE;
if (e.allowedLengths)
this._lengths = Object.freeze(e.allowedLengths.slice());
if (typeof e.modFromBytes === "boolean")
this._mod = e.modFromBytes;
}
let { nBitLength: n, nByteLength: i } = Xn(t, r);
if (i > 2048)
throw Error("invalid field: expected ORDER of <= 2048 bytes");
this.ORDER = t, this.BITS = n, this.BYTES = i, Object.freeze(this);
}
create(t) {
return L(t, this.ORDER);
}
isValid(t) {
if (typeof t !== "bigint")
throw TypeError("invalid field element: expected bigint, got " + typeof t);
return nt <= t && t < this.ORDER;
}
is0(t) {
return t === nt;
}
isValidNot0(t) {
return !this.is0(t) && this.isValid(t);
}
isOdd(t) {
return (t & M) === M;
}
neg(t) {
return L(-t, this.ORDER);
}
eql(t, e) {
return t === e;
}
sqr(t) {
return L(t * t, this.ORDER);
}
add(t, e) {
return L(t + e, this.ORDER);
}
sub(t, e) {
return L(t - e, this.ORDER);
}
mul(t, e) {
return L(t * e, this.ORDER);
}
pow(t, e) {
return Ye(t, e, this.ORDER);
}
div(t, e) {
return L(t * Me(e, this.ORDER), this.ORDER);
}
sqrN(t) {
return t * t;
}
addN(t, e) {
return t + e;
}
subN(t, e) {
return t - e;
}
mulN(t, e) {
return t * e;
}
inv(t) {
return Me(t, this.ORDER);
}
sqrt(t) {
let e = Le.get(this);
if (!e)
Le.set(this, e = Yn(this.ORDER));
return e(this, t);
}
toBytes(t) {
return this.isLE ? Mt(t, this.BYTES) : te(t, this.BYTES);
}
fromBytes(t, e = !1) {
I(t);
let { _lengths: r, BYTES: n, isLE: i, ORDER: o, _mod: a } = this;
if (r) {
if (t.length < 1 || !r.includes(t.length) || t.length > n)
throw Error("Field.fromBytes: expected " + r + " bytes, got " + t.length);
let c = new Uint8Array(n);
c.set(t, i ? 0 : c.length - t.length), t = c;
}
if (t.length !== n)
throw Error("Field.fromBytes: expected " + n + " bytes, got " + t.length);
let d = i ? dt(t) : ct(t);
if (a)
d = L(d, o);
if (!e) {
if (!this.isValid(d))
throw Error("invalid field element: outside of range 0..ORDER");
}
return d;
}
invertBatch(t) {
return ee(this, t, !0);
}
cmov(t, e, r) {
return st(r, "condition"), r ? e : t;
}
}
function Ft(t, e = {}) {
return Object.freeze(he.prototype), new he(t, e);
}
function Qe(t) {
if (typeof t !== "bigint")
throw Error("field order must be bigint");
if (t <= M)
throw Error("field order must be greater than 1");
let e = Ct(t - M);
return Math.ceil(e / 8);
}
function ne(t) {
let e = Qe(t);
return e + Math.ceil(e / 2);
}
function jt(t, e, r = !1) {
I(t);
let n = t.length, i = Qe(e), o = Math.max(ne(e), 16);
if (n < o || n > 1024)
throw Error("expected " + o + "-1024 bytes of input, got " + n);
let a = r ? dt(t) : ct(t), d = L(a, e - M) + M;
return r ? Mt(d, i) : te(d, i);
}

// ../vendor/noble-curves/src/abstract/curve.ts
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
var Be = /* @__PURE__ */ BigInt(0), zt = /* @__PURE__ */ BigInt(1), Gn = /* @__PURE__ */ BigInt(4), xe = 16, Je = 128, $n = 5, tn = /* @__PURE__ */ (() => 2147483648)();
function wt(t) {
let e = t;
if (typeof e !== "function")
throw TypeError('"Point" expected constructor, got type=' + typeof t);
Rt(e.fromAffine, "Point.fromAffine"), Rt(e.fromBytes, "Point.fromBytes"), Rt(e.fromHex, "Point.fromHex"), mt(e.BASE, "Point.BASE"), mt(e.ZERO, "Point.ZERO"), Ot(e.Fp), Ot(e.Fn);
}
function re(t, e) {
wt(t), nn(e, t);
let r = ee(t.Fp, e.map((n) => n.Z));
return e.map((n, i) => t.fromAffine(n.toAffine(r[i])));
}
function Qn(t, e, r = 1) {
if (!Number.isSafeInteger(t) || t < r || t > e)
throw Error("invalid window size, expected [" + r + ".." + e + "], got W=" + t);
}
function Jn(t, e) {
let r = t * (4 * e + 128);
if (r > tn)
throw Error("invalid window size: table would need ~" + Math.ceil(r / 1048576) + " MiB, max " + tn / 1048576 + " MiB");
}
function Pe(t, e) {
if (t === void 0)
return;
Rt(t, "randomBytes");
try {
let r = t(e);
if (!At(r) || r.length !== e)
return;
} catch {
return;
}
return t;
}
function nn(t, e) {
Qt(t, "points"), t.forEach((r, n) => {
if (!(r instanceof e))
throw Error("invalid point at index " + n);
});
}
function tr(t, e, r) {
if (!Array.isArray(t))
throw Error("array of scalars expected");
t.forEach((n, i) => {
if (!(r === void 0 ? e.isValid(n) : ht(n) && n < r))
throw Error("invalid scalar at index " + i);
});
}
var rn = /* @__PURE__ */ new WeakMap;
function Re(t) {
return rn.get(t) || 1;
}
function er(t, e) {
let r = t.double(), n = [t];
for (let i = 1;i < e; i++)
n.push(n[i - 1].add(r));
return n;
}
function nr(t, e) {
let r = 2 ** e, n = r / 2, i = BigInt(r - 1), o = [];
while (t > Be) {
let a = 0;
if (t & zt) {
if (a = Number(t & i), a >= n)
a -= r;
t -= BigInt(a);
}
o.push(a), t >>= zt;
}
return o;
}
function rr(t, e, r) {
let n = 2 ** e, i = n / 2, o = BigInt(n - 1), a = BigInt(e), d = [];
for (let c = 0;c < r; c++) {
let u = Number(t & o);
if (t >>= a, u > i)
u -= n, t += zt;
d.push(u);
}
if (t !== Be)
throw Error("invalid wnaf");
return d;
}
function ir(t, e, r) {
let n = 0;
for (let o of r)
n = Math.max(n, o.length);
let i = t;
for (let o = n - 1;o >= 0; o--) {
if (o !== n - 1)
i = i.double();
for (let a = 0;a < r.length; a++) {
let d = r[a][o];
if (d) {
let c = e[a][Math.abs(d) - 1 >> 1];
i = i.add(d < 0 ? c.negate() : c);
}
}
}
return i;
}

class Vt {
Point;
BASE;
ZERO;
randomBytes;
wnafPrecomputes = /* @__PURE__ */ new WeakMap;
baseCanBeBlinded;
bits;
constructor(t, e) {
wt(t), this.randomBytes = Pe(e, xe), this.Point = t, this.BASE = t.BASE, this.ZERO = t.ZERO, this.bits = t.Fn.BITS;
}
buildWnafTable(t, e, r) {
let n = Math.ceil(r / e) + 1, i = 2 ** (e - 1), o = [], a = t;
for (let d = 0;d < n; d++) {
let c = a;
for (let u = 0;u < i; u++)
o.push(c), c = c.add(a);
a = o[o.length - 1].double();
}
return { W: e, bits: r, windows: n, comp: o };
}
wnafCachedCT(t, e) {
let { W: r, windows: n, comp: i } = t, o = 2 ** (r - 1), a = rr(e, r, n), d = this.ZERO, c = this.BASE;
for (let u = 0;u < n; u++) {
let g = a[u], m = u * o, E = Math.abs(g) - 1, p = i[m];
for (let T = 1;T < o; T++)
p = T === E ? i[m + T] : p;
let C = p.negate();
if (g === 0)
c = c.add(i[m]);
else
d = d.add(g < 0 ? C : p);
}
return { p: d, f: c };
}
getWnafPrecomputes(t, e, r, n) {
let i = this.wnafPrecomputes.get(e), o = i?.find((a) => a.W === t && a.bits === r);
if (!o) {
if (o = this.buildWnafTable(e, t, r), typeof n === "function")
o = { ...o, comp: n(o.comp) };
if (!i)
i = [], this.wnafPrecomputes.set(e, i);
i.push(o);
}
return o;
}
assertPoint(t) {
if (!(t instanceof this.Point))
throw TypeError('"point" expected Point instance, got type=' + typeof t);
}
validateMulInput(t, e) {
if (this.assertPoint(t), !me(e, zt, this.Point.Fn.ORDER))
throw Error("invalid scalar");
}
runCT(t, e, r, n) {
let i = Re(t);
if (i === 1)
return this.fixedWindowCT(t, e, r);
return this.wnafCachedCT(this.getWnafPrecomputes(i, t, r, n), e);
}
mulCT(t, e, r) {
return this.validateMulInput(t, e), this.runCT(t, e, this.bits, r);
}
mulCTBlinded(t, e, r) {
if (this.validateMulInput(t, e), this.randomBytes === void 0)
throw Error("randomBytes is required for scalar blinding");
let n = this.Point.Fn.BITS + Je, i = this.randomBytes(xe);
if (!At(i) || i.length !== xe)
throw Error("randomBytes returned invalid byte array");
i[0] = i[0] & 63 | 128;
let o = e + ct(i) * this.Point.Fn.ORDER;
return this.runCT(t, o, n, r);
}
fixedWindowCT(t, e, r) {
let n = $n, i = 1 << n, o = Lt(n), a = Array(i);
a[0] = this.ZERO;
for (let u = 1;u < i; u++)
a[u] = a[u - 1].add(t);
let d = Math.ceil(r / n), c = this.ZERO;
for (let u = d - 1;u >= 0; u--) {
if (u !== d - 1)
for (let E = 0;E < n; E++)
c = c.double();
let g = Number(e >> BigInt(u * n) & o), m = a[0];
for (let E = 1;E < i; E++)
m = E === g ? a[E] : m;
c = c.add(m);
}
return { p: c, f: c };
}
shouldBlind(t, e) {
if (this.randomBytes === void 0)
return !1;
if (e === zt)
return !0;
if (t !== this.BASE)
return !1;
if (this.baseCanBeBlinded === void 0)
this.baseCanBeBlinded = this.mulUnsafe(this.BASE, this.Point.Fn.ORDER).is0();
return this.baseCanBeBlinded;
}
mulSecret(t, e, r, n) {
return this.shouldBlind(t, r) ? this.mulCTBlinded(t, e, n) : this.mulCT(t, e, n);
}
mulUnsafe(t, e, r) {
if (this.assertPoint(t), !ht(e))
throw Error("invalid scalar");
let n = Re(t);
if (n === 1 || e >= this.Point.Fn.ORDER)
return ie(this.Point, [t], [e], !0);
let i = this.getWnafPrecomputes(n, t, this.bits, r);
return this.wnafCachedCT(i, e).p;
}
setWindowSize(t, e) {
this.assertPoint(t), Qn(e, this.bits);
let r = Math.ceil((this.bits + Je) / e) + 1;
Jn(r * 2 ** (e - 1), this.Point.Fp.BYTES), rn.set(t, e), this.wnafPrecomputes.delete(t);
}
hasWindowSize(t) {
return Re(t) !== 1;
}
}
function ie(t, e, r, n = !1) {
if (wt(t), nn(e, t), st(n, "allowOversized"), tr(r, t.Fn, n ? t.Fn.ORDER ** Gn : void 0), e.length !== r.length)
throw Error("arrays of points and scalars must have equal length");
let i = e.map((a) => er(a, 4)), o = r.map((a) => nr(a, 4));
return ir(t.ZERO, i, o);
}
function en(t, e, r) {
if (e) {
if (e.ORDER !== t)
throw Error("Field.ORDER must match order: Fp == p, Fn == n");
return Ot(e), e;
} else
return Ft(t, { isLE: r });
}
function oe(t, e, r = {}, n) {
if (t !== "weierstrass" && t !== "edwards")
throw Error('expected curve type "weierstrass" or "edwards"');
if (n === void 0)
n = t === "edwards";
if (!e || typeof e !== "object")
throw Error(`expected valid ${t} CURVE object`);
it(r);
for (let c of ["p", "n", "h"]) {
let u = e[c];
if (!(ht(u) && u !== Be))
throw Error(`CURVE.${c} must be positive bigint`);
}
let i = en(e.p, r.Fp, n), o = en(e.n, r.Fn, n), d = ["Gx", "Gy", "a", t === "weierstrass" ? "b" : "d"];
for (let c of d)
if (!i.isValid(e[c]))
throw Error(`CURVE.${c} must be valid field element of CURVE.Fp`);
return e = Object.freeze(Object.assign({}, e)), { CURVE: e, Fp: i, Fn: o };
}
function xt(t, e) {
return function(n) {
let i = t(n);
return { secretKey: i, publicKey: e(i) };
};
}

// shim:@noble/hashes/hmac.js
var on = globalThis.__LCH.hmac;
if (!on)
throw Error("lineage: __LCH.hmac missing");
var { _HMAC: yi, hmac: sn } = on;

// ../vendor/noble-curves/src/abstract/der.ts
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
var or = /* @__PURE__ */ BigInt(0);

class an extends Error {
constructor(t = "") {
super(t);
}
}
var bt = {
Err: an,
_tlv: {
encode: (t, e) => {
let { Err: r } = bt;
if (gt(t, "tag"), t < 0 || t > 255)
throw new r("tlv.encode: wrong tag");
if (qe(e, "data"), e.length & 1)
throw new r("tlv.encode: unpadded data");
let n = e.length / 2, i = Ht(n);
if (i.length / 2 & 128)
throw new r("tlv.encode: long form length too big");
let o = n > 127 ? Ht(i.length / 2 | 128) : "";
return Ht(t) + o + i + e;
},
decode(t, e) {
let { Err: r } = bt;
e = I(e, void 0, "DER data");
let n = 0;
if (t < 0 || t > 255)
throw new r("tlv.decode: wrong tag");
if (e.length < 2 || e[n++] !== t)
throw new r("tlv.decode: wrong tlv");
let i = e[n++], o = !!(i & 128), a = 0;
if (!o)
a = i;
else {
let c = i & 127;
if (!c)
throw new r("tlv.decode(long): indefinite length not supported");
if (c > 4)
throw new r("tlv.decode(long): byte length is too big");
let u = e.subarray(n, n + c);
if (u.length !== c)
throw new r("tlv.decode: length bytes not complete");
if (u[0] === 0)
throw new r("tlv.decode(long): zero leftmost byte");
for (let g of u)
a = a << 8 | g;
if (n += c, a < 128)
throw new r("tlv.decode(long): not minimal encoding");
}
let d = e.subarray(n, n + a);
if (d.length !== a)
throw new r("tlv.decode: wrong value length");
return { v: d, l: e.subarray(n + a) };
}
},
_int: {
encode(t) {
let { Err: e } = bt;
if (Jt(t), t < or)
throw new e("integer: negative integers are not allowed");
let r = Ht(t);
if (Number.parseInt(r[0], 16) & 8)
r = "00" + r;
if (r.length & 1)
throw new e("unexpected DER parsing assertion: unpadded hex");
return r;
},
decode(t) {
let { Err: e } = bt;
if (t.length < 1)
throw new e("invalid signature integer: empty");
if (t[0] & 128)
throw new e("invalid signature integer: negative");
if (t.length > 1 && t[0] === 0 && !(t[1] & 128))
throw new e("invalid signature integer: unnecessary leading zero");
return ct(t);
}
},
toSig(t, e) {
let { Err: r, _int: n, _tlv: i } = bt;
if (e !== void 0) {
if (gt(e, "maxScalarBytes"), e < 1)
throw new r("invalid signature: maxScalarBytes must be positive");
}
let o = I(t, void 0, "signature"), { v: a, l: d } = i.decode(48, o);
if (d.length)
throw new r("invalid signature: left bytes after parsing");
let { v: c, l: u } = i.decode(2, a), { v: g, l: m } = i.decode(2, u);
if (m.length)
throw new r("invalid signature: left bytes after parsing");
if (e !== void 0 && (c.length > e || g.length > e))
throw new r("invalid signature: integer too large");
return { r: n.decode(c), s: n.decode(g) };
},
hexFromSig(t) {
let { _tlv: e, _int: r } = bt;
it(t, { r: "bigint", s: "bigint" }, {}, "sig");
let n = e.encode(2, r.encode(t.r)), i = e.encode(2, r.encode(t.s)), o = n + i;
return e.encode(48, o);
}
}, se = /* @__PURE__ */ (() => (Object.freeze(bt._tlv), Object.freeze(bt._int), Object.freeze(bt)))();

// ../vendor/noble-curves/src/abstract/weierstrass.ts
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
var cn = (t, e) => (t + (t >= 0 ? e : -e) / fn) / e;
function sr(t, e, r) {
lt("scalar", t, pt, r);
let [[n, i], [o, a]] = e, d = cn(a * t, r), c = cn(-i * t, r), u = t - d * n - c * o, g = -d * i - c * a, m = u < pt, E = g < pt;
if (m)
u = -u;
if (E)
g = -g;
let p = Lt(Math.ceil(Ct(r) / 2)) + Bt;
if (u < pt || u >= p || g < pt || g >= p)
throw Error("splitScalar (endomorphism): failed for k");
return { k1neg: m, k1: u, k2neg: E, k2: g };
}
function Se(t) {
if (!["compact", "recovered", "der"].includes(t))
throw Error('Signature format must be "compact", "recovered", or "der"');
return t;
}
function ve(t, e) {
it(t);
let r = {};
for (let n of Object.keys(e))
r[n] = t[n] === void 0 ? e[n] : t[n];
if (st(r.lowS, "lowS"), st(r.prehash, "prehash"), r.format !== void 0)
Se(r.format);
return r;
}
var pt = /* @__PURE__ */ BigInt(0), Bt = /* @__PURE__ */ BigInt(1), fn = /* @__PURE__ */ BigInt(2), Ue = /* @__PURE__ */ BigInt(3), ar = /* @__PURE__ */ BigInt(4);
function dn(t, e = {}) {
let r = oe("weierstrass", t, e), { Fp: n, Fn: i, CURVE: o } = r, { h: a, n: d } = o;
it(e, {}, {
allowInfinityPoint: "boolean",
clearCofactor: "function",
isTorsionFree: "function",
fromBytes: "function",
toBytes: "function",
endo: "object",
randomBytes: "function"
});
let {
endo: c,
allowInfinityPoint: u,
clearCofactor: g,
isTorsionFree: m,
fromBytes: E,
toBytes: p
} = e, C = e.randomBytes === void 0 ? yt : e.randomBytes;
if (c) {
if (!n.is0(o.a) || typeof c.beta !== "bigint" || !Array.isArray(c.basises))
throw Error('invalid endo: expected "beta": bigint and "basises": array');
}
let T = c ? {
beta: c.beta,
basises: c.basises.map((s) => [...s])
} : void 0, S = ln(n, i);
function O() {
if (!n.isOdd)
throw Error("compression is not supported: Field does not have .isOdd()");
}
function y(s, f, l) {
if (f.is0()) {
if (!u)
throw Error("bad point: ZERO");
return Uint8Array.of(0);
}
let { x: b, y: A } = f.toAffine(), R = n.toBytes(b);
if (st(l, "isCompressed"), l) {
O();
let P = !n.isOdd(A);
return ot(un(P), R);
} else
return ot(Uint8Array.of(4), R, n.toBytes(A));
}
function U(s) {
I(s, void 0, "Point");
let { publicKey: f, publicKeyUncompressed: l } = S, b = s.length, A = s[0], R = s.subarray(1);
if (u && b === 1 && A === 0)
return { x: n.ZERO, y: n.ZERO };
if (b === f && (A === 2 || A === 3)) {
let P = n.fromBytes(R);
if (!n.isValid(P))
throw Error("bad point: is not on curve, wrong x");
let v = k(P), _;
try {
_ = n.sqrt(v);
} catch (V) {
let J = V instanceof Error ? ": " + V.message : "";
throw Error("bad point: is not on curve, sqrt error" + J);
}
O();
let D = n.isOdd(_);
if ((A & 1) === 1 !== D)
_ = n.neg(_);
return { x: P, y: _ };
} else if (b === l && A === 4) {
let P = n.BYTES, v = n.fromBytes(R.subarray(0, P)), _ = n.fromBytes(R.subarray(P, P * 2));
if (!N(v, _))
throw Error("bad point: is not on curve");
return { x: v, y: _ };
} else
throw Error(`bad point: got length ${b}, expected compressed=${f} or uncompressed=${l}`);
}
let B = p === void 0 ? y : p, H = E === void 0 ? U : E, K = n.mul(o.b, Ue), Z = n.is0(o.a) ? (s) => n.ZERO : (s) => n.mul(o.a, s);
function k(s) {
let f = n.sqr(s), l = n.mul(f, s);
return n.add(n.add(l, n.mul(s, o.a)), o.b);
}
function N(s, f) {
let l = n.sqr(f), b = k(s);
return n.eql(l, b);
}
if (!N(o.Gx, o.Gy))
throw Error("bad curve params: generator point");
let q = n.mul(n.pow(o.a, Ue), ar), W = n.mul(n.sqr(o.b), BigInt(27));
if (n.is0(n.add(q, W)))
throw Error("bad curve params: a or b");
function G(s, f, l = !1) {
if (!n.isValid(f) || l && n.is0(f))
throw Error(`bad point coordinate ${s}`);
return typeof f === "object" && f !== null ? n.create(f) : f;
}
function Q(s) {
if (!(s instanceof h))
throw Error("Weierstrass Point expected");
}
function w(s) {
if (!T || !T.basises)
throw Error("no endo");
return sr(s, T.basises, i.ORDER);
}
function F(s, f, l, b) {
if (!i.isValid(b))
throw RangeError("invalid scalar: out of range");
if (T) {
let { k1neg: A, k1: R, k2neg: P, k2: v } = w(b), _ = new h(n.mul(l.X, T.beta), l.Y, l.Z);
s.push(A ? l.negate() : l, P ? _.negate() : _), f.push(R, v);
} else
s.push(l), f.push(b);
}
let x = /* @__PURE__ */ new WeakSet;

class h {
static BASE = new h(o.Gx, o.Gy, n.ONE);
static ZERO = new h(n.ZERO, n.ONE, n.ZERO);
static Fp = n;
static Fn = i;
X;
Y;
Z;
constructor(s, f, l) {
this.X = G("x", s), this.Y = G("y", f, !0), this.Z = G("z", l), Object.freeze(this);
}
static CURVE() {
return o;
}
static fromAffine(s) {
let { x: f, y: l } = s || {};
if (!s || !n.isValid(f) || !n.isValid(l))
throw Error("invalid affine point");
if (s instanceof h)
throw Error("projective point not allowed");
if (n.is0(f) && n.is0(l))
return h.ZERO;
return new h(f, l, n.ONE);
}
static fromBytes(s) {
let f = h.fromAffine(H(I(s, void 0, "point")));
return f.assertValidity(), f;
}
static fromHex(s) {
return h.fromBytes(St(s));
}
get x() {
return this.toAffine().x;
}
get y() {
return this.toAffine().y;
}
precompute(s = 6, f = !0) {
if (j.setWindowSize(this, s), !f)
this.multiply(Ue);
return this;
}
assertValidity() {
let s = this;
if (s.is0()) {
if (u && n.is0(s.X) && n.eql(s.Y, n.ONE) && n.is0(s.Z))
return;
throw Error("bad point: ZERO");
}
if (x.has(s))
return;
let { x: f, y: l } = s.toAffine();
if (!n.isValid(f) || !n.isValid(l))
throw Error("bad point: x or y not field elements");
if (!N(f, l))
throw Error("bad point: equation left != right");
if (!s.isTorsionFree())
throw Error("bad point: not in prime-order subgroup");
x.add(s);
}
hasEvenY() {
let { y: s } = this.toAffine();
if (!n.isOdd)
throw Error("Field doesn't support isOdd");
return !n.isOdd(s);
}
equals(s) {
Q(s);
let { X: f, Y: l, Z: b } = this, { X: A, Y: R, Z: P } = s, v = n.eql(n.mul(f, P), n.mul(A, b)), _ = n.eql(n.mul(l, P), n.mul(R, b));
return v && _;
}
negate() {
return new h(this.X, n.neg(this.Y), this.Z);
}
double() {
let { X: s, Y: f, Z: l } = this, { ZERO: b, ZERO: A, ZERO: R } = n, P = n.mul(s, s), v = n.mul(f, f), _ = n.mul(l, l), D = n.mul(s, f);
return D = n.add(D, D), R = n.mul(s, l), R = n.add(R, R), b = Z(R), A = n.mul(K, _), A = n.add(b, A), b = n.sub(v, A), A = n.add(v, A), A = n.mul(b, A), b = n.mul(D, b), R = n.mul(K, R), _ = Z(_), D = n.sub(P, _), D = Z(D), D = n.add(D, R), R = n.add(P, P), P = n.add(R, P), P = n.add(P, _), P = n.mul(P, D), A = n.add(A, P), _ = n.mul(f, l), _ = n.add(_, _), P = n.mul(_, D), b = n.sub(b, P), R = n.mul(_, v), R = n.add(R, R), R = n.add(R, R), new h(b, A, R);
}
add(s) {
Q(s);
let { X: f, Y: l, Z: b } = this, { X: A, Y: R, Z: P } = s, { ZERO: v, ZERO: _, ZERO: D } = n, X = n.mul(f, A), V = n.mul(l, R), J = n.mul(b, P), rt = n.add(f, l), tt = n.add(A, R);
rt = n.mul(rt, tt), tt = n.add(X, V), rt = n.sub(rt, tt), tt = n.add(f, b);
let et = n.add(A, P);
return tt = n.mul(tt, et), et = n.add(X, J), tt = n.sub(tt, et), et = n.add(l, b), v = n.add(R, P), et = n.mul(et, v), v = n.add(V, J), et = n.sub(et, v), D = Z(tt), v = n.mul(K, J), D = n.add(v, D), v = n.sub(V, D), D = n.add(V, D), _ = n.mul(v, D), V = n.add(X, X), V = n.add(V, X), J = Z(J), tt = n.mul(K, tt), V = n.add(V, J), J = n.sub(X, J), J = Z(J), tt = n.add(tt, J), X = n.mul(V, tt), _ = n.add(_, X), X = n.mul(et, tt), v = n.mul(rt, v), v = n.sub(v, X), X = n.mul(rt, V), D = n.mul(et, D), D = n.add(D, X), new h(v, _, D);
}
subtract(s) {
return Q(s), this.add(s.negate());
}
is0() {
return this.equals(h.ZERO);
}
multiply(s) {
if (!i.isValidNot0(s))
throw RangeError("invalid scalar: out of range");
let { p: f, f: l } = j.mulSecret(this, s, a, z);
return z([f, l])[0];
}
multiplyUnsafe(s) {
let f = this, l = s;
if (!i.isValid(l))
throw RangeError("invalid scalar: out of range");
if (l === pt || f.is0())
return h.ZERO;
if (l === Bt)
return f;
if (j.hasWindowSize(this))
return j.mulUnsafe(f, l, z);
let b = [], A = [];
return F(b, A, f, l), ie(h, b, A);
}
mulAddUnsafe(s, f, l) {
Q(f);
let b = [], A = [];
return F(b, A, this, s), F(b, A, f, l), ie(h, b, A);
}
toAffine(s) {
let f = this, l = s;
if (l != null && !n.isValid(l))
throw RangeError('"invertedZ" expected valid field element');
let { X: b, Y: A, Z: R } = f;
if (n.eql(R, n.ONE))
return { x: b, y: A };
let P = f.is0();
if (l == null)
l = P ? n.ONE : n.inv(R);
let v = n.mul(b, l), _ = n.mul(A, l), D = n.mul(R, l);
if (P)
return { x: n.ZERO, y: n.ZERO };
if (!n.eql(D, n.ONE))
throw Error("invZ was invalid");
return { x: v, y: _ };
}
isTorsionFree() {
if (a === Bt)
return !0;
if (m)
return m(h, this);
return j.mulUnsafe(this, d).is0();
}
clearCofactor() {
if (a === Bt)
return this;
if (g)
return g(h, this);
return this.multiplyUnsafe(a);
}
isSmallOrder() {
if (a === Bt)
return this.is0();
return this.clearCofactor().is0();
}
toBytes(s = !0) {
return st(s, "isCompressed"), this.assertValidity(), B(h, this, s);
}
toHex(s = !0) {
return kt(this.toBytes(s));
}
toString() {
return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
}
}
let z = (s) => re(h, s), j = new Vt(h, C);
if (j.bits >= 6)
h.BASE.precompute(6);
return Object.freeze(h.prototype), Object.freeze(h), h;
}
function un(t) {
return Uint8Array.of(t ? 2 : 3);
}
function ln(t, e) {
return {
secretKey: e.BYTES,
publicKey: 1 + t.BYTES,
publicKeyUncompressed: 1 + 2 * t.BYTES,
publicKeyHasPrefix: !0,
signature: 2 * e.BYTES
};
}
function cr(t, e = {}) {
wt(t);
let { Fn: r } = t, n = e.randomBytes === void 0 ? yt : e.randomBytes, i = Object.assign(ln(t.Fp, r), {
seed: Math.max(ne(r.ORDER), 16)
});
function o(p) {
try {
let C = r.fromBytes(p);
return r.isValidNot0(C);
} catch (C) {
return !1;
}
}
function a(p, C) {
let { publicKey: T, publicKeyUncompressed: S } = i;
try {
let O = p.length;
if (C === !0 && O !== T)
return !1;
if (C === !1 && O !== S)
return !1;
return !t.fromBytes(p).is0();
} catch (O) {
return !1;
}
}
function d(p) {
return p = p === void 0 ? n(i.seed) : p, jt(I(p, i.seed, "seed"), r.ORDER);
}
function c(p, C = !0) {
return t.BASE.multiply(r.fromBytes(p)).toBytes(C);
}
function u(p) {
let { secretKey: C, publicKey: T, publicKeyUncompressed: S } = i, O = r._lengths;
if (!At(p))
return;
let y = I(p, void 0, "key").length, U = y === T || y === S, B = y === C || !!O?.includes(y);
if (U && B)
return;
return U;
}
function g(p, C, T = !0) {
if (u(p) === !0)
throw Error("first arg must be private key");
if (u(C) === !1)
throw Error("second arg must be public key");
let S = r.fromBytes(p), O = t.fromBytes(C);
if (O.is0())
throw Error("invalid public key: point at infinity");
return O.multiply(S).toBytes(T);
}
let m = {
isValidSecretKey: o,
isValidPublicKey: a,
randomSecretKey: d
}, E = xt(d, c);
return Object.freeze(m), Object.freeze(i), Object.freeze({ getPublicKey: c, getSharedSecret: g, keygen: E, Point: t, utils: m, lengths: i });
}
function yn(t, e, r = {}) {
wt(t);
let n = e;
Ie(n), it(r, {}, {
hmac: "function",
lowS: "boolean",
randomBytes: "function",
bits2int: "function",
bits2int_modN: "function"
});
let i = Object.assign({}, r), o = i.randomBytes === void 0 ? yt : i.randomBytes, a = i.hmac === void 0 ? (s, f) => sn(n, s, f) : i.hmac, { Fp: d, Fn: c } = t, { ORDER: u, BITS: g } = c, m = ne(u), E = Pe(o, m), { keygen: p, getPublicKey: C, getSharedSecret: T, utils: S, lengths: O } = cr(t, i), y = {
prehash: !0,
lowS: typeof i.lowS === "boolean" ? i.lowS : !0,
format: "compact",
extraEntropy: !1
}, U = u * fn + Bt < d.ORDER;
function B(s) {
let f = u >> Bt;
return s > f;
}
function H(s, f) {
if (!c.isValidNot0(f))
throw Error(`invalid signature ${s}: out of range 1..Point.Fn.ORDER`);
return f;
}
function K() {
if (!d.isOdd)
throw Error("Field doesn't support isOdd");
}
function Z(s, f, l) {
return K(), (s === l ? 0 : 2) | Number(d.isOdd(f));
}
function k() {
if (U)
throw Error('"recovered" sig type is not supported for cofactor >2 curves');
}
function N(s, f) {
Se(f);
let l = O.signature, b = f === "compact" ? l : f === "recovered" ? l + 1 : void 0;
return I(s, b);
}

class q {
r;
s;
recovery;
constructor(s, f, l) {
if (this.r = H("r", s), this.s = H("s", f), l != null) {
if (k(), ![0, 1, 2, 3].includes(l))
throw Error("invalid recovery id");
this.recovery = l;
}
Object.freeze(this);
}
static fromBytes(s, f = y.format) {
N(s, f);
let l;
if (f === "der") {
if (s.length > 2 * c.BYTES + 16)
throw new se.Err("invalid signature: DER signature too long");
let { r: P, s: v } = se.toSig(I(s), c.BYTES + 1);
return new q(P, v);
}
if (f === "recovered")
l = s[0], f = "compact", s = s.subarray(1);
let b = O.signature / 2, A = s.subarray(0, b), R = s.subarray(b, b * 2);
return new q(c.fromBytes(A), c.fromBytes(R), l);
}
static fromHex(s, f) {
return this.fromBytes(St(s), f);
}
assertRecovery() {
let { recovery: s } = this;
if (s == null)
throw Error("invalid recovery id: must be present");
return s;
}
addRecoveryBit(s) {
return new q(this.r, this.s, s);
}
recoverPublicKey(s) {
let { r: f, s: l } = this, b = this.assertRecovery(), A = b === 2 || b === 3 ? f + u : f;
if (!d.isValid(A))
throw Error("invalid recovery id: sig.r+curve.n != R.x");
let R = d.toBytes(A), P = t.fromBytes(ot(un((b & 1) === 0), R)), v = c.inv(A), _ = G(I(s, void 0, "msgHash")), D = c.create(-_ * v), X = c.create(l * v), V = t.BASE.mulAddUnsafe(D, P, X);
if (V.is0())
throw Error("invalid recovery: point at infinify");
return V.assertValidity(), V;
}
hasHighS() {
return B(this.s);
}
toBytes(s = y.format) {
if (Se(s), s === "der")
return St(se.hexFromSig(this));
let { r: f, s: l } = this, b = c.toBytes(f), A = c.toBytes(l);
if (s === "recovered")
return k(), ot(Uint8Array.of(this.assertRecovery()), b, A);
return ot(b, A);
}
toHex(s) {
return kt(this.toBytes(s));
}
}
Object.freeze(q.prototype), Object.freeze(q);
let W = i.bits2int === void 0 ? function(f) {
if (f.length > 8192)
throw Error("input is too large");
let l = ct(f), b = f.length * 8 - g;
return b > 0 ? l >> BigInt(b) : l;
} : i.bits2int, G = i.bits2int_modN === void 0 ? function(f) {
return c.create(W(f));
} : i.bits2int_modN, Q = Lt(g);
function w(s) {
return lt("num < 2^" + g, s, pt, Q), c.toBytes(s);
}
function F(s, f) {
return I(s, void 0, "message"), f ? I(n(s), void 0, "prehashed message") : s;
}
function x(s, f, l) {
let { lowS: b, prehash: A, extraEntropy: R } = ve(l, y);
s = F(s, A);
let P = G(s), v = c.fromBytes(f);
if (!c.isValidNot0(v))
throw Error("invalid private key");
let _ = [w(v), w(P)];
if (R != null && R !== !1) {
let J = R === !0 ? o(O.secretKey) : R;
_.push(I(J, void 0, "extraEntropy"));
}
let D = ot(..._), X = P;
function V(J) {
let rt = W(J);
if (!c.isValidNot0(rt))
return;
let tt = t.BASE.multiply(rt).toAffine(), et = c.create(tt.x);
if (et === pt)
return;
let at;
if (E !== void 0) {
let Tt = ct(jt(E(m), u)), qn = c.inv(c.mul(Tt, rt)), Kn = c.mul(Tt, X), kn = c.mul(Tt, v);
at = c.create(qn * c.create(Kn + kn * et));
} else {
let Tt = We(rt, u);
at = c.create(Tt * c.create(X + et * v));
}
if (at === pt)
return;
let Ut = Z(tt.x, tt.y, et), Dt = at;
if (b && B(at))
Dt = c.neg(at), Ut ^= 1;
return new q(et, Dt, U ? void 0 : Ut);
}
return { seed: D, k2sig: V };
}
function h(s, f, l = {}) {
let { seed: b, k2sig: A } = x(s, f, l);
return He(n.outputLen, c.BYTES, a)(b, A).toBytes(l.format);
}
function z(s, f, l, b = {}) {
let { lowS: A, prehash: R, format: P } = ve(b, y);
if (l = I(l, void 0, "publicKey"), f = F(f, R), !At(s)) {
let v = s instanceof q ? ", use sig.toBytes()" : "";
throw Error("verify expects Uint8Array signature" + v);
}
N(s, P);
try {
let v = q.fromBytes(s, P), _ = t.fromBytes(l);
if (_.is0())
return !1;
if (A && v.hasHighS())
return !1;
let { r: D, s: X } = v, V = G(f), J = c.inv(X), rt = c.create(V * J), tt = c.create(D * J), et = t.BASE.mulAddUnsafe(rt, _, tt);
if (et.is0())
return !1;
let at = et.toAffine();
if (c.create(at.x) !== D)
return !1;
if (P === "recovered" && v.recovery !== Z(at.x, at.y, D))
return !1;
return !0;
} catch (v) {
return !1;
}
}
function j(s, f, l = {}) {
let { prehash: b } = ve(l, y);
return f = F(f, b), q.fromBytes(s, "recovered").recoverPublicKey(f).toBytes();
}
return Object.freeze({
keygen: p,
getPublicKey: C,
getSharedSecret: T,
utils: S,
lengths: O,
Point: t,
sign: h,
verify: z,
recoverPublicKey: j,
Signature: q,
hash: n
});
}

// ../vendor/noble-curves/src/secp256k1.ts
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
var ce = {
p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
h: BigInt(1),
a: BigInt(0),
b: BigInt(7),
Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
}, fr = {
beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
basises: [
[BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
[BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
]
}, dr = /* @__PURE__ */ BigInt(0), gn = /* @__PURE__ */ BigInt(2);
function ur(t) {
let e = ce.p, r = BigInt(3), n = BigInt(6), i = BigInt(11), o = BigInt(22), a = BigInt(23), d = BigInt(44), c = BigInt(88), u = t * t * t % e, g = u * u * t % e, m = Y(g, r, e) * g % e, E = Y(m, r, e) * g % e, p = Y(E, gn, e) * u % e, C = Y(p, i, e) * p % e, T = Y(C, o, e) * C % e, S = Y(T, d, e) * T % e, O = Y(S, c, e) * S % e, y = Y(O, d, e) * T % e, U = Y(y, r, e) * g % e, B = Y(U, a, e) * C % e, H = Y(B, n, e) * u % e, K = Y(H, gn, e);
if (!It.eql(It.sqr(K), t))
throw Error("Cannot find square root");
return K;
}
var It = /* @__PURE__ */ Ft(ce.p, { sqrt: ur }), Pt = /* @__PURE__ */ dn(ce, {
Fp: It,
endo: fr
}), Tn = /* @__PURE__ */ yn(Pt, Wt), bn = Object.create(null);
function ae(t, ...e) {
let r = bn[t];
if (r === void 0) {
let n = Wt(ke(t));
r = ot(n, n), bn[t] = r;
}
return Wt(ot(r, ...e));
}
var mn = (t) => t.toBytes(!0).slice(1), hn = ({ x: t }) => It.toBytes(t), fe = (t) => !It.isOdd(t);
function An(t) {
let { Fn: e, BASE: r } = Pt, n = e.fromBytes(I(t, 32, "secretKey")), o = r.multiply(n).toAffine();
return { scalar: fe(o.y) ? n : e.neg(n), bytes: hn(o) };
}
function En(t) {
let e = It;
if (!e.isValidNot0(t))
throw Error("invalid x: Fail if x ≥ p");
let r = e.sqr(t), n = e.add(e.mulN(r, t), BigInt(7)), i = e.sqrt(n);
if (!fe(i))
i = e.neg(i);
let o = Pt.fromAffine({ x: t, y: i });
return o.assertValidity(), o;
}
var _t = ct;
function wn(...t) {
return Pt.Fn.create(_t(ae("BIP0340/challenge", ...t)));
}
function pn(t) {
return An(t).bytes;
}
function lr(t, e, r = Kt(32)) {
let { Fn: n, BASE: i } = Pt, o = ut(I(t, void 0, "message")), { bytes: a, scalar: d } = An(e), c = I(r, 32, "auxRand"), u = n.toBytes(d ^ _t(ae("BIP0340/aux", c))), g = ae("BIP0340/nonce", u, a, o), m = n.create(_t(g));
if (m === dr)
throw Error("sign failed: k is zero");
let p = i.multiply(m).toAffine(), C = fe(p.y) ? m : n.neg(m), T = hn(p), S = wn(T, a, o), O = new Uint8Array(64);
if (O.set(T, 0), O.set(n.toBytes(n.create(C + S * d)), 32), !xn(O, o, a))
throw Error("sign: Invalid signature produced");
return O;
}
function xn(t, e, r) {
let { Fp: n, Fn: i, BASE: o } = Pt, a = I(t, 64, "signature"), d = I(e, void 0, "message"), c = I(r, 32, "publicKey");
try {
let u = En(_t(c)), g = a.subarray(0, 32), m = _t(g);
if (!n.isValidNot0(m))
return !1;
let E = _t(a.subarray(32, 64));
if (!i.isValidNot0(E))
return !1;
let p = wn(g, mn(u), d), C = o.mulAddUnsafe(E, u, i.neg(p)), { x: T, y: S } = C.toAffine();
if (C.is0() || !fe(S) || !n.eql(T, m))
return !1;
return !0;
} catch (u) {
return !1;
}
}
var Rn = /* @__PURE__ */ (() => {
let r = (n) => (n = n === void 0 ? Kt(48) : n, jt(I(n, 48, "seed"), ce.n));
return Object.freeze({
keygen: xt(r, pn),
getPublicKey: pn,
sign: lr,
verify: xn,
Point: Pt,
utils: Object.freeze({
randomSecretKey: r,
taggedHash: ae,
lift_x: En,
pointToBytes: mn
}),
lengths: Object.freeze({
secretKey: 32,
publicKey: 32,
publicKeyHasPrefix: !1,
signature: 64,
seed: 48
})
});
})();

// ../vendor/noble-curves/src/abstract/edwards.ts
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
var de = /* @__PURE__ */ BigInt(0), ue = /* @__PURE__ */ BigInt(1), le = /* @__PURE__ */ BigInt(2), yr = /* @__PURE__ */ BigInt(4), Bn = /* @__PURE__ */ BigInt(8);
function gr(t, e, r, n) {
let i = t.sqr(r), o = t.sqr(n), a = t.add(t.mul(e.a, i), o), d = t.add(t.ONE, t.mul(e.d, t.mul(i, o)));
return t.eql(a, d);
}
function Pn(t, e = {}) {
it(e, {}, {}, "extraOpts");
let r = e, n = oe("edwards", t, r, r.FpFnLE), { Fp: i, Fn: o } = n, a = n.CURVE, { h: d } = a;
if (Zt(i, a.a) !== 1)
throw Error("edwards: CURVE.a must be a square in Fp for complete addition formulas");
if (Zt(i, a.d) !== -1)
throw Error("edwards: CURVE.d must be a non-square in Fp for complete addition formulas");
it(r, {}, { uvRatio: "function", randomBytes: "function" });
let c = r.randomBytes === void 0 ? yt : r.randomBytes, u = le << BigInt(i.BYTES * 8) - ue;
function g(y) {
if (!i.isOdd)
throw Error("Field does not have .isOdd()");
return i.isOdd(y);
}
let m = r.uvRatio === void 0 ? (y, U) => {
try {
return { isValid: !0, value: i.sqrt(i.div(y, U)) };
} catch (B) {
return { isValid: !1, value: de };
}
} : r.uvRatio;
if (!gr(i, a, a.Gx, a.Gy))
throw Error("bad curve params: generator point");
let E = i.eql(a.a, i.neg(i.ONE)) ? (y) => i.neg(y) : i.eql(a.a, i.ONE) ? (y) => y : (y) => i.mul(a.a, y);
function p(y, U, B = !1) {
let H = B ? ue : de;
return lt("coordinate " + y, U, H, u), U;
}
function C(y) {
if (!(y instanceof T))
throw Error("EdwardsPoint expected");
}

class T {
static BASE = new T(a.Gx, a.Gy, i.ONE, i.mul(a.Gx, a.Gy));
static ZERO = new T(i.ZERO, i.ONE, i.ONE, i.ZERO);
static Fp = i;
static Fn = o;
X;
Y;
Z;
T;
constructor(y, U, B, H) {
this.X = p("x", y), this.Y = p("y", U), this.Z = p("z", B, !0), this.T = p("t", H), Object.freeze(this);
}
static CURVE() {
return a;
}
static fromAffine(y) {
if (y instanceof T)
throw Error("extended point not allowed");
let { x: U, y: B } = y || {};
return p("x", U), p("y", B), new T(U, B, i.ONE, i.mul(U, B));
}
static fromBytes(y, U = !1) {
let B = i.BYTES, { a: H, d: K } = a;
y = ut(I(y, B, "point")), st(U, "zip215");
let Z = ut(y), k = y[B - 1];
Z[B - 1] = k & -129;
let N = dt(Z), q = U ? u : i.ORDER;
lt("point.y", N, de, q);
let W = i.sqr(N), G = i.sub(W, i.ONE), Q = i.sub(i.mulN(K, W), H), { isValid: w, value: F } = m(G, Q);
if (!w)
throw Error("bad point: invalid y coordinate");
let x = g(F), h = (k & 128) !== 0;
if (!U && i.is0(F) && h)
throw Error("bad point: x=0 and x_0=1");
if (h !== x)
F = i.neg(F);
return T.fromAffine({ x: F, y: N });
}
static fromHex(y, U = !1) {
return T.fromBytes(St(y), U);
}
get x() {
return this.toAffine().x;
}
get y() {
return this.toAffine().y;
}
precompute(y = 6, U = !0) {
if (O.setWindowSize(this, y), !U)
this.multiply(le);
return this;
}
assertValidity() {
let y = this, { a: U, d: B } = a;
if (y.is0())
throw Error("bad point: ZERO");
let { X: H, Y: K, Z, T: k } = y, N = i.sqr(H), q = i.sqr(K), W = i.sqr(Z), G = i.sqr(W), Q = i.mul(N, U), w = i.mul(i.add(Q, q), W), F = i.add(G, i.mul(B, i.mul(N, q)));
if (!i.eql(w, F))
throw Error("bad point: equation left != right (1)");
let x = i.mul(H, K), h = i.mul(Z, k);
if (!i.eql(x, h))
throw Error("bad point: equation left != right (2)");
}
equals(y) {
C(y);
let { X: U, Y: B, Z: H } = this, { X: K, Y: Z, Z: k } = y, N = i.mul(U, k), q = i.mul(K, H), W = i.mul(B, k), G = i.mul(Z, H);
return i.eql(N, q) && i.eql(W, G);
}
is0() {
return this.equals(T.ZERO);
}
negate() {
return new T(i.neg(this.X), this.Y, this.Z, i.neg(this.T));
}
double() {
let { X: y, Y: U, Z: B } = this, H = i.sqr(y), K = i.sqr(U), Z = i.mul(i.sqr(B), le), k = E(H), N = i.addN(y, U), q = i.sub(i.subN(i.sqr(N), H), K), W = i.addN(k, K), G = i.subN(W, Z), Q = i.subN(k, K), w = i.mul(q, G), F = i.mul(W, Q), x = i.mul(q, Q), h = i.mul(G, W);
return new T(w, F, h, x);
}
add(y) {
C(y);
let { d: U } = a, { X: B, Y: H, Z: K, T: Z } = this, { X: k, Y: N, Z: q, T: W } = y, G = i.mul(B, k), Q = i.mul(H, N), w = i.mul(i.mulN(Z, U), W), F = i.mul(K, q), x = i.sub(i.subN(i.mulN(i.addN(B, H), i.addN(k, N)), G), Q), h = i.subN(F, w), z = i.addN(F, w), j = i.sub(Q, E(G)), s = i.mul(x, h), f = i.mul(z, j), l = i.mul(x, j), b = i.mul(h, z);
return new T(s, f, b, l);
}
subtract(y) {
return C(y), this.add(y.negate());
}
multiply(y) {
if (!o.isValidNot0(y))
throw RangeError("invalid scalar: expected 1 <= sc < curve.n");
let { p: U, f: B } = O.mulSecret(this, y, d, S);
return S([U, B])[0];
}
multiplyUnsafe(y) {
if (!o.isValid(y))
throw RangeError("invalid scalar: expected 0 <= sc < curve.n");
if (y === de)
return T.ZERO;
if (this.is0() || y === ue)
return this;
return O.mulUnsafe(this, y, S);
}
isSmallOrder() {
return this.clearCofactor().is0();
}
isTorsionFree() {
return O.mulUnsafe(this, a.n).is0();
}
toAffine(y) {
let U = this, B = y;
if (B != null && typeof B !== "bigint")
throw TypeError('"invertedZ" expected bigint, got type=' + typeof B);
let { X: H, Y: K, Z } = U, k = U.is0();
if (B == null)
B = k ? i.create(Bn) : i.inv(Z);
let N = i.mul(H, B), q = i.mul(K, B), W = i.mul(Z, B);
if (k)
return { x: i.ZERO, y: i.ONE };
if (!i.eql(W, i.ONE))
throw Error("invZ was invalid");
return { x: N, y: q };
}
clearCofactor() {
if (d === ue)
return this;
if (d === le)
return this.double();
if (d === yr)
return this.double().double();
if (d === Bn)
return this.double().double().double();
return this.multiplyUnsafe(d);
}
toBytes() {
let { x: y, y: U } = this.toAffine(), B = i.toBytes(U);
return B[B.length - 1] |= g(y) ? 128 : 0, B;
}
toHex() {
return kt(this.toBytes());
}
toString() {
return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
}
}
let S = (y) => re(T, y), O = new Vt(T, c);
if (O.bits >= 6)
T.BASE.precompute(6);
return Object.freeze(T.prototype), Object.freeze(T), T;
}
function vn(t, e, r = {}) {
if (wt(t), typeof e !== "function")
throw Error('"hash" function param is required');
let n = e, i = r;
it(i, {}, {
adjustScalarBytes: "function",
randomBytes: "function",
domain: "function",
prehash: "function",
zip215: "boolean",
mapToCurve: "function",
toMontgomery: "function",
toMontgomerySecret: "function"
});
let { prehash: o } = i, { BASE: a, Fp: d, Fn: c } = t, u = n.outputLen, g = 2 * d.BYTES;
if (u !== void 0) {
if (gt(u, "hash.outputLen"), u !== g)
throw Error(`hash.outputLen must be ${g}, got ${u}`);
}
let m = i.randomBytes === void 0 ? yt : i.randomBytes, { toMontgomery: E, toMontgomerySecret: p } = i, C = i.adjustScalarBytes === void 0 ? (w) => w : i.adjustScalarBytes, T = i.domain === void 0 ? (w, F, x) => {
if (st(x, "phflag"), F.length || x)
throw Error("Contexts/pre-hash are not supported");
return w;
} : i.domain;
function S(w) {
return c.create(dt(w));
}
function O(w) {
let F = N.secretKey;
I(w, N.secretKey, "secretKey");
let x = I(n(w), 2 * F, "hashedSecretKey"), h = C(x.slice(0, F)), z = x.slice(F, 2 * F), j = S(h);
return { head: h, prefix: z, scalar: j };
}
function y(w) {
let { head: F, prefix: x, scalar: h } = O(w), z = a.multiply(h), j = z.toBytes();
return { head: F, prefix: x, scalar: h, point: z, pointBytes: j };
}
function U(w) {
return y(w).pointBytes;
}
function B(w = Uint8Array.of(), ...F) {
let x = ot(...F);
return S(n(T(x, I(w, void 0, "context"), !!o)));
}
function H(w, F, x = {}) {
if (it(x, {}, {}, "options"), w = ut(I(w, void 0, "message")), o)
w = o(w);
let { prefix: h, scalar: z, pointBytes: j } = y(F), s = B(x.context, h, w), f = a.multiply(s).toBytes(), l = B(x.context, f, j, w), b = c.create(s + l * z);
if (!c.isValid(b))
throw Error("sign failed: invalid s");
let A = ot(f, c.toBytes(b));
return I(A, N.signature, "result");
}
let K = {
zip215: i.zip215
};
function Z(w, F, x, h = K) {
it(h);
let { context: z } = h, j = h.zip215 === void 0 ? !!K.zip215 : h.zip215, s = N.signature;
if (w = I(w, s, "signature"), F = I(F, void 0, "message"), x = I(x, N.publicKey, "publicKey"), j !== void 0)
st(j, "zip215");
if (o)
F = o(F);
let f = s / 2, l = w.subarray(0, f), b = dt(w.subarray(f, s)), A, R, P;
try {
A = t.fromBytes(x, j), R = t.fromBytes(l, j), P = a.multiplyUnsafe(b);
} catch (D) {
return !1;
}
if (!j && A.isSmallOrder())
return !1;
let v = B(z, l, x, F);
return R.add(A.multiplyUnsafe(v)).subtract(P).clearCofactor().is0();
}
let k = d.BYTES, N = {
secretKey: k,
publicKey: k,
signature: 2 * k,
seed: k
};
function q(w) {
return w = w === void 0 ? m(N.seed) : w, I(w, N.seed, "seed");
}
function W(w) {
return At(w) && w.length === N.secretKey;
}
function G(w, F) {
try {
return !!t.fromBytes(w, F === void 0 ? K.zip215 : F);
} catch (x) {
return !1;
}
}
let Q = {
getExtendedPublicKey: y,
randomSecretKey: q,
isValidSecretKey: W,
isValidPublicKey: G,
toMontgomery(w) {
if (E === void 0)
throw Error("Montgomery conversion is not supported for this curve");
return E(t.fromBytes(w));
},
toMontgomerySecret(w) {
if (p === void 0)
throw Error("Montgomery conversion is not supported for this curve");
return p(w);
}
};
return Object.freeze(N), Object.freeze(Q), Object.freeze({
keygen: xt(q, U),
getPublicKey: U,
sign: H,
verify: Z,
utils: Q,
Point: t,
lengths: N
});
}

// ../vendor/noble-curves/src/abstract/montgomery.ts
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
var vt = /* @__PURE__ */ BigInt(0), ft = /* @__PURE__ */ BigInt(1), ye = /* @__PURE__ */ BigInt(2);
function Un(t, e) {
return t + e - (e >> ft << ft);
}
function br(t) {
let e = BigInt(6) * t;
return (r, n, i) => {
let o = n + i, d = ((e + i - n) * r + n) % t;
return { x_2: d, x_3: o - d };
};
}
function pr(t) {
return it(t, {
P: "bigint",
type: "string",
adjustScalarBytes: "function",
powPminus2: "function"
}, {
randomBytes: "function",
scalarMultBase: "function"
}), Object.freeze({ ...t });
}
function Sn(t) {
let e = pr(t), { P: r, type: n, adjustScalarBytes: i, powPminus2: o, randomBytes: a } = e, d = e.scalarMultBase, c = n === "x25519";
if (!c && n !== "x448")
throw Error("invalid type");
let u = a === void 0 ? yt : a, g = c ? 255 : 448, m = br(r), E = c ? 32 : 56, p = c ? BigInt(9) : BigInt(5), C = c ? BigInt(121665) : BigInt(39081), T = c ? ye ** BigInt(254) : ye ** BigInt(447), S = c ? BigInt(8) * (ye ** BigInt(251) - ft) : BigInt(4) * (ye ** BigInt(445) - ft), O = T + S + ft, y = (x) => L(x, r), U = B(p);
function B(x) {
return Mt(y(x), E);
}
function H(x) {
let h = ut(I(x, E, "uCoordinate"));
if (c)
h[31] &= 127;
return y(dt(h));
}
function K(x) {
return dt(i(ut(I(x, E, "scalar"))));
}
let Z = new Set(c ? [
vt,
ft,
r - ft,
BigInt("325606250916557431795983626356110631294008115727848805560023387167927233504"),
BigInt("39382357235489614581723060781553021112529911719440698176882885853963445705823")
] : [vt, ft, r - ft]);
function k(x, h) {
let z = H(h);
if (Z.has(z))
throw Error("invalid private or public key received");
let j = G(z, K(x));
if (j === vt)
throw Error("invalid private or public key received");
return B(j);
}
function N(x) {
if (d === void 0)
return k(x, U);
let h = K(x);
lt("scalar", h, T, O);
let z = y(d(h));
if (z === vt)
throw Error("invalid private or public key received");
return B(z);
}
let q = N, W = k;
function G(x, h) {
lt("u", x, vt, r), lt("scalar", h, T, O);
let z = h, j = x, s = ft, f = vt, l = x, b = ft, A = z ^ z >> ft;
for (let v = BigInt(g - 1);v >= vt; v--) {
let _ = Un(r, A >> v);
({ x_2: s, x_3: l } = m(_, s, l)), { x_2: f, x_3: b } = m(_, f, b);
let D = s + f, X = y(D * D), V = s - f, J = y(V * V), rt = X - J, tt = l + b, et = l - b, at = y(et * D), Ut = y(tt * V), Dt = at + Ut, Tt = at - Ut;
l = y(Dt * Dt), b = y(j * y(Tt * Tt)), s = y(X * J), f = y(rt * (X + y(C * rt)));
}
let R = Un(r, z);
({ x_2: s, x_3: l } = m(R, s, l)), { x_2: f, x_3: b } = m(R, f, b);
let P = o(f);
return y(s * P);
}
let Q = {
secretKey: E,
publicKey: E,
seed: E
}, w = (x) => (x = x === void 0 ? u(E) : x, I(x, Q.seed, "seed"), x), F = { randomSecretKey: w };
return Object.freeze(Q), Object.freeze(F), Object.freeze({
keygen: xt(w, q),
getSharedSecret: W,
getPublicKey: q,
scalarMult: k,
scalarMultBase: N,
utils: F,
GuBytes: U.slice(),
lengths: Q
});
}

// ../vendor/noble-curves/src/ed25519.ts
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
var Cn = /* @__PURE__ */ BigInt(0), Ce = /* @__PURE__ */ BigInt(1), On = /* @__PURE__ */ BigInt(2), Tr = /* @__PURE__ */ BigInt(3), mr = /* @__PURE__ */ BigInt(5), hr = /* @__PURE__ */ BigInt(8), ge = /* @__PURE__ */ BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed"), Ar = /* @__PURE__ */ (() => ({
p: ge,
n: BigInt("0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed"),
h: hr,
a: BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffec"),
d: BigInt("0x52036cee2b6ffe738cc740797779e89800700a4d4141d8ab75eb4dca135978a3"),
Gx: BigInt("0x216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51a"),
Gy: BigInt("0x6666666666666666666666666666666666666666666666666666666666666658")
}))();
function In(t) {
let e = BigInt(10), r = BigInt(20), n = BigInt(40), i = BigInt(80), o = ge, d = t * t % o * t % o, c = Y(d, On, o) * d % o, u = Y(c, Ce, o) * t % o, g = Y(u, mr, o) * u % o, m = Y(g, e, o) * g % o, E = Y(m, r, o) * m % o, p = Y(E, n, o) * E % o, C = Y(p, i, o) * p % o, T = Y(C, i, o) * p % o, S = Y(T, e, o) * g % o;
return { pow_p_5_8: Y(S, On, o) * t % o, b2: d };
}
function Oe(t) {
return t[0] &= 248, t[31] &= 127, t[31] |= 64, t;
}
var Fn = /* @__PURE__ */ BigInt("19681161376707505956807079304988542015446066515923890162744021073123829784752");
function Er(t, e) {
let r = ge, n = L(e * e * e, r), i = L(n * n * e, r), o = In(t * i).pow_p_5_8, a = L(t * n * o, r), d = L(e * a * a, r), c = a, u = L(a * Fn, r), g = d === t, m = d === L(-t, r), E = d === L(-t * Fn, r);
if (g)
a = c;
if (m || E)
a = u;
if ($e(a, r))
a = L(-a, r);
return { isValid: g || m, value: a };
}
var Yt = /* @__PURE__ */ Pn(Ar, { uvRatio: Er }), _n = /* @__PURE__ */ (() => Yt.Fp)();
function wr(t) {
let { y: e } = t;
return _n.toBytes(_n.div(Ce + e, Ce - e));
}
function xr(t) {
let e = Yt.Fp.BYTES;
return Nt(t, e), Oe(be(t.subarray(0, e))).subarray(0, e);
}
function Rr(t) {
return vn(Yt, be, Object.assign({ adjustScalarBytes: Oe, toMontgomery: wr, toMontgomerySecret: xr, zip215: !0 }, t));
}
var Dn = /* @__PURE__ */ Rr({});
var Nn = /* @__PURE__ */ (() => {
let t = ge, e = (r) => {
let { pow_p_5_8: n, b2: i } = In(r);
return L(Y(n, Tr, t) * i, t);
};
return Sn({
P: t,
type: "x25519",
powPminus2: e,
adjustScalarBytes: Oe,
scalarMultBase: (r) => {
let n = L(r, Yt.Fn.ORDER);
if (n === Cn)
return Cn;
let i = Yt.BASE.multiply(n);
return L((i.Z + i.Y) * e(L(i.Z - i.Y, t)), t);
}
});
})();

// entry-curves.ts
globalThis.__LCC = Object.freeze({ secp256k1: Object.freeze({ secp256k1: Tn, schnorr: Rn }), ed25519: Object.freeze({ ed25519: Dn, x25519: Nn }) });
})();
