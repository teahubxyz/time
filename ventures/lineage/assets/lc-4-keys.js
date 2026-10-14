(() => {
// shim:@noble/curves/secp256k1.js
var H = globalThis.__LCC.secp256k1;
if (!H)
throw Error("lineage: __LCC.secp256k1 missing");
var { secp256k1: u, schnorr: z } = H;

// shim:@noble/hashes/hmac.js
var j = globalThis.__LCH.hmac;
if (!j)
throw Error("lineage: __LCH.hmac missing");
var { _HMAC: _e, hmac: K } = j;

// shim:@noble/hashes/legacy.js
var B = globalThis.__LCH.legacy;
if (!B)
throw Error("lineage: __LCH.legacy missing");
var { _MD5: Ae, _RIPEMD160: Ee, _SHA1: Ue, md5: Ce, ripemd160: w, sha1: Te } = B;

// shim:@noble/hashes/sha2.js
var S = globalThis.__LCH.sha2;
if (!S)
throw Error("lineage: __LCH.sha2 missing");
var { _SHA224: ze, _SHA256: je, _SHA384: Be, _SHA512: Se, _SHA512_224: Le, _SHA512_256: De, sha224: qe, sha256: d, sha384: Re, sha512: y, sha512_224: Ne, sha512_256: Ve } = S;

// shim:@noble/hashes/utils.js
var L = globalThis.__LCH.utils;
if (!L)
throw Error("lineage: __LCH.utils missing");
var { abool: Fe, abytes: l, aexists: Oe, ahash: Me, anumber: D, aoutput: Pe, asyncLoop: $e, byteSwap: Je, byteSwap32: We, bytesToHex: q, checkOpts: Xe, clean: Ze, concatBytes: f, copyBytes: Ge, createHasher: Qe, createView: v, hexToBytes: R, isBytes: Ye, isLE: er, kdfInputToBytes: rr, nextTick: tr, oidNist: ir, randomBytes: k, rotl: ar, rotr: nr, swap32IfBE: or, swap8IfBE: sr, u32: lr, u8: cr, utf8ToBytes: N, validateObject: ur } = L;

// shim:@scure/base
var V = globalThis.__LCB.base;
if (!V)
throw Error("lineage: __LCB.base missing");
var { __TESTS: pr, ascii: hr, base16: mr, base32: yr, base32crockford: fr, base32hex: gr, base32hexnopad: br, base32nopad: wr, base36: vr, base58: kr, base58check: xr, base58flickr: _r, base58xmr: Kr, base58xrp: Ar, base64: I, base64nopad: Er, base64url: Ur, base64urlnopad: Cr, bech32: F, bech32m: Tr, createBase58check: x, hex: Hr, utf8: zr } = V;

// ../vendor/scure-bip32/index.ts
/*! scure-bip32 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) */
var b = /* @__PURE__ */ (() => u.Point)(), g = /* @__PURE__ */ (() => b.Fn)(), A = /* @__PURE__ */ x(d), ue = /* @__PURE__ */ (() => Uint8Array.from("Bitcoin seed".split(""), (e) => e.charCodeAt(0)))(), E = { private: 76066276, public: 76067358 }, _ = 2147483648, U = 255, de = (e) => w(d(e)), pe = (e) => v(e).getUint32(0, !1), p = (e, r = "number") => {
if (typeof e !== "number")
throw TypeError(`"${r}" expected number, got type=${typeof e}`);
if (!Number.isSafeInteger(e) || e < 0 || e > 4294967295)
throw RangeError(`"${r}" expected integer in range 0..2**32-1, got ${e}`);
let t = new Uint8Array(4);
return v(t).setUint32(0, e, !1), t;
}, C = (e, r = "versions") => {
if (!(typeof e === "object" && e !== null))
throw Error("versions must be an object");
return p(e.private, `${r}.private`), p(e.public, `${r}.public`), e;
};

class h {
get fingerprint() {
if (!this._pubHash)
throw Error("No publicKey set!");
return pe(this._pubHash);
}
get identifier() {
return this._pubHash ? Uint8Array.from(this._pubHash) : void 0;
}
get pubKeyHash() {
return this._pubHash ? Uint8Array.from(this._pubHash) : void 0;
}
get privateKey() {
return this._privateKey ? Uint8Array.from(this._privateKey) : null;
}
get publicKey() {
return this._publicKey ? Uint8Array.from(this._publicKey) : null;
}
get chainCode() {
return this._chainCode ? Uint8Array.from(this._chainCode) : null;
}
get privateExtendedKey() {
let e = this._privateKey;
if (!e)
throw Error("No private key");
return A.encode(this.serialize(this.versions.private, f(Uint8Array.of(0), e)));
}
get publicExtendedKey() {
if (!this._publicKey)
throw Error("No public key");
return A.encode(this.serialize(this.versions.public, this._publicKey));
}
static fromMasterSeed(e, r = E) {
if (l(e), r = C(r), 8 * e.length < 128 || 8 * e.length > 512)
throw RangeError("HDKey: seed length must be between 128 and 512 bits; 256 bits is advised, got " + e.length);
let t = K(y, ue, e), i = t.slice(0, 32), a = t.slice(32);
return new h({ versions: r, chainCode: a, privateKey: i });
}
static fromExtendedKey(e, r = E) {
r = C(r);
let t = A.decode(e);
if (t.length !== 78)
throw Error(`HDKey: invalid extended key length: expected 78 bytes, got ${t.length}`);
let i = v(t), a = i.getUint32(0, !1), n = {
versions: r,
depth: t[4],
parentFingerprint: i.getUint32(5, !1),
index: i.getUint32(9, !1),
chainCode: t.slice(13, 45)
}, o = t.slice(45), c = o[0] === 0;
if (a !== r[c ? "private" : "public"])
throw Error("Version mismatch");
if (c)
return new h({ ...n, privateKey: o.slice(1) });
else
return new h({ ...n, publicKey: o });
}
static fromJSON(e) {
return h.fromExtendedKey("xpriv" in e ? e.xpriv : e.xpub);
}
versions;
depth = 0;
index = 0;
parentFingerprint = 0;
_chainCode = null;
_privateKey;
_publicKey;
_pubHash;
constructor(e) {
if (!e || typeof e !== "object")
throw Error("HDKey.constructor must not be called directly");
let r = e.depth ?? 0, t = e.index ?? 0, i = e.parentFingerprint ?? 0;
if (!Number.isSafeInteger(r) || r < 0 || r > U)
throw RangeError("HDKey: depth must be an integer in range 0..255");
if (p(t, "index"), p(i, "parentFingerprint"), r === 0 && (t !== 0 || i !== 0))
throw Error("HDKey: zero depth with non-zero index/parent fingerprint");
if (this.versions = e.versions ? C(e.versions) : E, this.depth = r, e.chainCode)
l(e.chainCode, 32);
if (this._chainCode = e.chainCode ? Uint8Array.from(e.chainCode) : null, this.index = t, this.parentFingerprint = i, e.publicKey && e.privateKey)
throw Error("HDKey: publicKey and privateKey at same time.");
if (e.privateKey) {
if (!u.utils.isValidSecretKey(e.privateKey))
throw Error("Invalid private key");
this._privateKey = Uint8Array.from(e.privateKey), this._publicKey = u.getPublicKey(this._privateKey, !0);
} else if (e.publicKey)
this._publicKey = b.fromBytes(e.publicKey).toBytes(!0);
else
throw Error("HDKey: no public or private key provided");
this._pubHash = de(this._publicKey);
}
derive(e) {
if (!/^[mM]'?/.test(e))
throw Error('Path must start with "m" or "M"');
if (/^[mM]'?$/.test(e))
return this;
let r = e.replace(/^[mM]'?\//, "").split("/");
if (r.length > U - this.depth)
throw Error("HDKey: path exceeds the serializable depth 255");
let t = this;
for (let i of r) {
let a = /^(\d+)('?)$/.exec(i), n = a && a[1];
if (!a || a.length !== 3 || typeof n !== "string")
throw Error("invalid child index: " + i);
let o = +n;
if (!Number.isSafeInteger(o) || o >= _)
throw Error("Invalid index");
if (a[2] === "'")
o += _;
t = t.deriveChild(o);
}
return t;
}
deriveChild(e) {
return this._deriveChild(e);
}
_deriveChild(e, r) {
if (!this._publicKey || !this._chainCode)
throw Error("No publicKey or chainCode set");
let t = p(e, "index");
if (e >= _) {
let s = this._privateKey;
if (!s)
throw Error("Could not derive hardened child key");
t = f(Uint8Array.of(0), s, t);
} else
t = f(this._publicKey, t);
let i = r || K(y, this._chainCode, t);
l(i, 64);
let a = i.slice(0, 32), n = i.slice(32), o = {
versions: this.versions,
chainCode: n,
depth: this.depth + 1,
parentFingerprint: this.fingerprint,
index: e
};
if (o.depth > U)
throw Error("HDKey: depth exceeds the serializable value 255");
let c = () => {
let s = this._privateKey ? 4294967295 : _ - 1;
if (e >= s)
throw Error(`HDKey: cannot retry child derivation at index ${e}`);
return this.deriveChild(e + 1);
}, m = g.fromBytes(a, !0);
if (!g.isValid(m))
return c();
if (this._privateKey) {
let s = g.create(g.fromBytes(this._privateKey) + m);
if (!g.isValidNot0(s))
return c();
o.privateKey = g.toBytes(s);
} else {
let s = b.fromBytes(this._publicKey), T = m === 0n ? s : s.add(b.BASE.multiply(m));
if (T.equals(b.ZERO))
return c();
o.publicKey = T.toBytes(!0);
}
return new h(o);
}
sign(e) {
if (!this._privateKey)
throw Error("No privateKey set!");
return l(e, 32), u.sign(e, this._privateKey, { prehash: !1 });
}
verify(e, r) {
if (l(e, 32), l(r, 64), !this._publicKey)
throw Error("No publicKey set!");
return u.verify(r, e, this._publicKey, { prehash: !1 });
}
wipePrivateData() {
if (this._privateKey)
this._privateKey.fill(0), this._privateKey = void 0;
return this;
}
toJSON() {
return this.toPrivateJSON();
}
toPrivateJSON() {
return {
xpriv: this.privateExtendedKey,
xpub: this.publicExtendedKey
};
}
serialize(e, r) {
if (!this._chainCode)
throw Error("No chainCode set");
return l(r, 33), f(p(e, "version"), new Uint8Array([this.depth]), p(this.parentFingerprint, "parentFingerprint"), p(this.index, "index"), this._chainCode, r);
}
}

// shim:@noble/hashes/pbkdf2.js
var O = globalThis.__LCH.pbkdf2;
if (!O)
throw Error("lineage: __LCH.pbkdf2 missing");
var { pbkdf2: he, pbkdf2Async: M } = O;

// shim:@noble/hashes/webcrypto.js
var P = globalThis.__LCH.webcrypto;
if (!P)
throw Error("lineage: __LCH.webcrypto missing");
var { hkdf: Ir, hmac: Fr, pbkdf2: me, sha256: Or, sha384: Mr, sha512: ye } = P;

// ../vendor/scure-bip39/src/index.ts
/*! scure-bip39 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) */
var fe = (e) => e[0] === "あいこくしん";
function J(e) {
for (let r = 0;r < e.length; r++) {
let t = e.charCodeAt(r);
if (t >= 55296 && t <= 56319) {
if (r + 1 >= e.length)
return !1;
let i = e.charCodeAt(++r);
if (i < 56320 || i > 57343)
return !1;
} else if (t >= 56320 && t <= 57343)
return !1;
}
return !0;
}
function W(e) {
if (typeof e !== "string")
throw TypeError("invalid mnemonic type: " + typeof e);
if (!J(e))
throw TypeError("expected well-formed Unicode string");
return e.normalize("NFKD");
}
function X(e) {
let r = W(e), t = r.split(" ");
if (![12, 15, 18, 21, 24].includes(t.length))
throw Error("Invalid mnemonic");
return { nfkd: r, words: t };
}
function Z(e) {
if (l(e), ![16, 20, 24, 28, 32].includes(e.length))
throw RangeError("invalid entropy length");
}
function G(e, r = 128) {
if (D(r), r % 32 !== 0 || r > 256)
throw RangeError("Invalid entropy");
return ve(k(r / 8), e);
}
var Q = (e) => {
let r = 8 - e.length / 4;
return d(e)[0] >> r << r;
};
function Y(e) {
if (!Array.isArray(e) || e.length !== 2048 || typeof e[0] !== "string")
throw TypeError("Wordlist: expected array of 2048 strings");
e.forEach((r) => {
if (typeof r !== "string")
throw TypeError("wordlist: non-string element: " + r);
if (!J(r))
throw TypeError("wordlist: expected well-formed Unicode string");
});
}
function ge(e, r) {
Y(r);
let t = new Uint8Array(e.length + 1);
t.set(e), t[e.length] = Q(e);
let i = [], a = 0, n = 0;
for (let o of t)
if (a = a << 8 | o, n += 8, n >= 11)
n -= 11, i.push(r[a >>> n & 2047]), a &= (1 << n) - 1;
return i;
}
function be(e, r) {
Y(r);
let t = e.length / 3 * 4, i = new Uint8Array(t + 1), a = 0, n = 0, o = 0;
for (let m of e) {
let s = r.indexOf(m);
if (s === -1)
throw Error("Unknown word: " + m);
a = a << 11 | s, n += 11;
while (n >= 8)
n -= 8, i[o++] = a >>> n & 255;
a &= (1 << n) - 1;
}
if (n > 0)
i[o] = a << 8 - n;
let c = i.subarray(0, t);
if (i[t] !== Q(c))
throw Error("Invalid checksum");
return Uint8Array.from(c);
}
function we(e, r) {
let { words: t } = X(e), i = be(t, r);
return Z(i), i;
}
function ve(e, r) {
return Z(e), ge(e, r).join(fe(r) ? "　" : " ");
}
function ee(e, r) {
try {
we(e, r);
} catch (t) {
return !1;
}
return !0;
}
var ke = (e) => {
if (typeof e !== "string")
throw TypeError("invalid passphrase type: " + typeof e);
return W("mnemonic" + e);
};
function re(e, r = "") {
return M(y, X(e).nfkd, ke(r), {
c: 2048,
dkLen: 64
});
}

// ../vendor/scure-bip39/src/wordlists/english.ts
var te = /* @__PURE__ */ Object.freeze(`abandon
ability
able
about
above
absent
absorb
abstract
absurd
abuse
access
accident
account
accuse
achieve
acid
acoustic
acquire
across
act
action
actor
actress
actual
adapt
add
addict
address
adjust
admit
adult
advance
advice
aerobic
affair
afford
afraid
again
age
agent
agree
ahead
aim
air
airport
aisle
alarm
album
alcohol
alert
alien
all
alley
allow
almost
alone
alpha
already
also
alter
always
amateur
amazing
among
amount
amused
analyst
anchor
ancient
anger
angle
angry
animal
ankle
announce
annual
another
answer
antenna
antique
anxiety
any
apart
apology
appear
apple
approve
april
arch
arctic
area
arena
argue
arm
armed
armor
army
around
arrange
arrest
arrive
arrow
art
artefact
artist
artwork
ask
aspect
assault
asset
assist
assume
asthma
athlete
atom
attack
attend
attitude
attract
auction
audit
august
aunt
author
auto
autumn
average
avocado
avoid
awake
aware
away
awesome
awful
awkward
axis
baby
bachelor
bacon
badge
bag
balance
balcony
ball
bamboo
banana
banner
bar
barely
bargain
barrel
base
basic
basket
battle
beach
bean
beauty
because
become
beef
before
begin
behave
behind
believe
below
belt
bench
benefit
best
betray
better
between
beyond
bicycle
bid
bike
bind
biology
bird
birth
bitter
black
blade
blame
blanket
blast
bleak
bless
blind
blood
blossom
blouse
blue
blur
blush
board
boat
body
boil
bomb
bone
bonus
book
boost
border
boring
borrow
boss
bottom
bounce
box
boy
bracket
brain
brand
brass
brave
bread
breeze
brick
bridge
brief
bright
bring
brisk
broccoli
broken
bronze
broom
brother
brown
brush
bubble
buddy
budget
buffalo
build
bulb
bulk
bullet
bundle
bunker
burden
burger
burst
bus
business
busy
butter
buyer
buzz
cabbage
cabin
cable
cactus
cage
cake
call
calm
camera
camp
can
canal
cancel
candy
cannon
canoe
canvas
canyon
capable
capital
captain
car
carbon
card
cargo
carpet
carry
cart
case
cash
casino
castle
casual
cat
catalog
catch
category
cattle
caught
cause
caution
cave
ceiling
celery
cement
census
century
cereal
certain
chair
chalk
champion
change
chaos
chapter
charge
chase
chat
cheap
check
cheese
chef
cherry
chest
chicken
chief
child
chimney
choice
choose
chronic
chuckle
chunk
churn
cigar
cinnamon
circle
citizen
city
civil
claim
clap
clarify
claw
clay
clean
clerk
clever
click
client
cliff
climb
clinic
clip
clock
clog
close
cloth
cloud
clown
club
clump
cluster
clutch
coach
coast
coconut
code
coffee
coil
coin
collect
color
column
combine
come
comfort
comic
common
company
concert
conduct
confirm
congress
connect
consider
control
convince
cook
cool
copper
copy
coral
core
corn
correct
cost
cotton
couch
country
couple
course
cousin
cover
coyote
crack
cradle
craft
cram
crane
crash
crater
crawl
crazy
cream
credit
creek
crew
cricket
crime
crisp
critic
crop
cross
crouch
crowd
crucial
cruel
cruise
crumble
crunch
crush
cry
crystal
cube
culture
cup
cupboard
curious
current
curtain
curve
cushion
custom
cute
cycle
dad
damage
damp
dance
danger
daring
dash
daughter
dawn
day
deal
debate
debris
decade
december
decide
decline
decorate
decrease
deer
defense
define
defy
degree
delay
deliver
demand
demise
denial
dentist
deny
depart
depend
deposit
depth
deputy
derive
describe
desert
design
desk
despair
destroy
detail
detect
develop
device
devote
diagram
dial
diamond
diary
dice
diesel
diet
differ
digital
dignity
dilemma
dinner
dinosaur
direct
dirt
disagree
discover
disease
dish
dismiss
disorder
display
distance
divert
divide
divorce
dizzy
doctor
document
dog
doll
dolphin
domain
donate
donkey
donor
door
dose
double
dove
draft
dragon
drama
drastic
draw
dream
dress
drift
drill
drink
drip
drive
drop
drum
dry
duck
dumb
dune
during
dust
dutch
duty
dwarf
dynamic
eager
eagle
early
earn
earth
easily
east
easy
echo
ecology
economy
edge
edit
educate
effort
egg
eight
either
elbow
elder
electric
elegant
element
elephant
elevator
elite
else
embark
embody
embrace
emerge
emotion
employ
empower
empty
enable
enact
end
endless
endorse
enemy
energy
enforce
engage
engine
enhance
enjoy
enlist
enough
enrich
enroll
ensure
enter
entire
entry
envelope
episode
equal
equip
era
erase
erode
erosion
error
erupt
escape
essay
essence
estate
eternal
ethics
evidence
evil
evoke
evolve
exact
example
excess
exchange
excite
exclude
excuse
execute
exercise
exhaust
exhibit
exile
exist
exit
exotic
expand
expect
expire
explain
expose
express
extend
extra
eye
eyebrow
fabric
face
faculty
fade
faint
faith
fall
false
fame
family
famous
fan
fancy
fantasy
farm
fashion
fat
fatal
father
fatigue
fault
favorite
feature
february
federal
fee
feed
feel
female
fence
festival
fetch
fever
few
fiber
fiction
field
figure
file
film
filter
final
find
fine
finger
finish
fire
firm
first
fiscal
fish
fit
fitness
fix
flag
flame
flash
flat
flavor
flee
flight
flip
float
flock
floor
flower
fluid
flush
fly
foam
focus
fog
foil
fold
follow
food
foot
force
forest
forget
fork
fortune
forum
forward
fossil
foster
found
fox
fragile
frame
frequent
fresh
friend
fringe
frog
front
frost
frown
frozen
fruit
fuel
fun
funny
furnace
fury
future
gadget
gain
galaxy
gallery
game
gap
garage
garbage
garden
garlic
garment
gas
gasp
gate
gather
gauge
gaze
general
genius
genre
gentle
genuine
gesture
ghost
giant
gift
giggle
ginger
giraffe
girl
give
glad
glance
glare
glass
glide
glimpse
globe
gloom
glory
glove
glow
glue
goat
goddess
gold
good
goose
gorilla
gospel
gossip
govern
gown
grab
grace
grain
grant
grape
grass
gravity
great
green
grid
grief
grit
grocery
group
grow
grunt
guard
guess
guide
guilt
guitar
gun
gym
habit
hair
half
hammer
hamster
hand
happy
harbor
hard
harsh
harvest
hat
have
hawk
hazard
head
health
heart
heavy
hedgehog
height
hello
helmet
help
hen
hero
hidden
high
hill
hint
hip
hire
history
hobby
hockey
hold
hole
holiday
hollow
home
honey
hood
hope
horn
horror
horse
hospital
host
hotel
hour
hover
hub
huge
human
humble
humor
hundred
hungry
hunt
hurdle
hurry
hurt
husband
hybrid
ice
icon
idea
identify
idle
ignore
ill
illegal
illness
image
imitate
immense
immune
impact
impose
improve
impulse
inch
include
income
increase
index
indicate
indoor
industry
infant
inflict
inform
inhale
inherit
initial
inject
injury
inmate
inner
innocent
input
inquiry
insane
insect
inside
inspire
install
intact
interest
into
invest
invite
involve
iron
island
isolate
issue
item
ivory
jacket
jaguar
jar
jazz
jealous
jeans
jelly
jewel
job
join
joke
journey
joy
judge
juice
jump
jungle
junior
junk
just
kangaroo
keen
keep
ketchup
key
kick
kid
kidney
kind
kingdom
kiss
kit
kitchen
kite
kitten
kiwi
knee
knife
knock
know
lab
label
labor
ladder
lady
lake
lamp
language
laptop
large
later
latin
laugh
laundry
lava
law
lawn
lawsuit
layer
lazy
leader
leaf
learn
leave
lecture
left
leg
legal
legend
leisure
lemon
lend
length
lens
leopard
lesson
letter
level
liar
liberty
library
license
life
lift
light
like
limb
limit
link
lion
liquid
list
little
live
lizard
load
loan
lobster
local
lock
logic
lonely
long
loop
lottery
loud
lounge
love
loyal
lucky
luggage
lumber
lunar
lunch
luxury
lyrics
machine
mad
magic
magnet
maid
mail
main
major
make
mammal
man
manage
mandate
mango
mansion
manual
maple
marble
march
margin
marine
market
marriage
mask
mass
master
match
material
math
matrix
matter
maximum
maze
meadow
mean
measure
meat
mechanic
medal
media
melody
melt
member
memory
mention
menu
mercy
merge
merit
merry
mesh
message
metal
method
middle
midnight
milk
million
mimic
mind
minimum
minor
minute
miracle
mirror
misery
miss
mistake
mix
mixed
mixture
mobile
model
modify
mom
moment
monitor
monkey
monster
month
moon
moral
more
morning
mosquito
mother
motion
motor
mountain
mouse
move
movie
much
muffin
mule
multiply
muscle
museum
mushroom
music
must
mutual
myself
mystery
myth
naive
name
napkin
narrow
nasty
nation
nature
near
neck
need
negative
neglect
neither
nephew
nerve
nest
net
network
neutral
never
news
next
nice
night
noble
noise
nominee
noodle
normal
north
nose
notable
note
nothing
notice
novel
now
nuclear
number
nurse
nut
oak
obey
object
oblige
obscure
observe
obtain
obvious
occur
ocean
october
odor
off
offer
office
often
oil
okay
old
olive
olympic
omit
once
one
onion
online
only
open
opera
opinion
oppose
option
orange
orbit
orchard
order
ordinary
organ
orient
original
orphan
ostrich
other
outdoor
outer
output
outside
oval
oven
over
own
owner
oxygen
oyster
ozone
pact
paddle
page
pair
palace
palm
panda
panel
panic
panther
paper
parade
parent
park
parrot
party
pass
patch
path
patient
patrol
pattern
pause
pave
payment
peace
peanut
pear
peasant
pelican
pen
penalty
pencil
people
pepper
perfect
permit
person
pet
phone
photo
phrase
physical
piano
picnic
picture
piece
pig
pigeon
pill
pilot
pink
pioneer
pipe
pistol
pitch
pizza
place
planet
plastic
plate
play
please
pledge
pluck
plug
plunge
poem
poet
point
polar
pole
police
pond
pony
pool
popular
portion
position
possible
post
potato
pottery
poverty
powder
power
practice
praise
predict
prefer
prepare
present
pretty
prevent
price
pride
primary
print
priority
prison
private
prize
problem
process
produce
profit
program
project
promote
proof
property
prosper
protect
proud
provide
public
pudding
pull
pulp
pulse
pumpkin
punch
pupil
puppy
purchase
purity
purpose
purse
push
put
puzzle
pyramid
quality
quantum
quarter
question
quick
quit
quiz
quote
rabbit
raccoon
race
rack
radar
radio
rail
rain
raise
rally
ramp
ranch
random
range
rapid
rare
rate
rather
raven
raw
razor
ready
real
reason
rebel
rebuild
recall
receive
recipe
record
recycle
reduce
reflect
reform
refuse
region
regret
regular
reject
relax
release
relief
rely
remain
remember
remind
remove
render
renew
rent
reopen
repair
repeat
replace
report
require
rescue
resemble
resist
resource
response
result
retire
retreat
return
reunion
reveal
review
reward
rhythm
rib
ribbon
rice
rich
ride
ridge
rifle
right
rigid
ring
riot
ripple
risk
ritual
rival
river
road
roast
robot
robust
rocket
romance
roof
rookie
room
rose
rotate
rough
round
route
royal
rubber
rude
rug
rule
run
runway
rural
sad
saddle
sadness
safe
sail
salad
salmon
salon
salt
salute
same
sample
sand
satisfy
satoshi
sauce
sausage
save
say
scale
scan
scare
scatter
scene
scheme
school
science
scissors
scorpion
scout
scrap
screen
script
scrub
sea
search
season
seat
second
secret
section
security
seed
seek
segment
select
sell
seminar
senior
sense
sentence
series
service
session
settle
setup
seven
shadow
shaft
shallow
share
shed
shell
sheriff
shield
shift
shine
ship
shiver
shock
shoe
shoot
shop
short
shoulder
shove
shrimp
shrug
shuffle
shy
sibling
sick
side
siege
sight
sign
silent
silk
silly
silver
similar
simple
since
sing
siren
sister
situate
six
size
skate
sketch
ski
skill
skin
skirt
skull
slab
slam
sleep
slender
slice
slide
slight
slim
slogan
slot
slow
slush
small
smart
smile
smoke
smooth
snack
snake
snap
sniff
snow
soap
soccer
social
sock
soda
soft
solar
soldier
solid
solution
solve
someone
song
soon
sorry
sort
soul
sound
soup
source
south
space
spare
spatial
spawn
speak
special
speed
spell
spend
sphere
spice
spider
spike
spin
spirit
split
spoil
sponsor
spoon
sport
spot
spray
spread
spring
spy
square
squeeze
squirrel
stable
stadium
staff
stage
stairs
stamp
stand
start
state
stay
steak
steel
stem
step
stereo
stick
still
sting
stock
stomach
stone
stool
story
stove
strategy
street
strike
strong
struggle
student
stuff
stumble
style
subject
submit
subway
success
such
sudden
suffer
sugar
suggest
suit
summer
sun
sunny
sunset
super
supply
supreme
sure
surface
surge
surprise
surround
survey
suspect
sustain
swallow
swamp
swap
swarm
swear
sweet
swift
swim
swing
switch
sword
symbol
symptom
syrup
system
table
tackle
tag
tail
talent
talk
tank
tape
target
task
taste
tattoo
taxi
teach
team
tell
ten
tenant
tennis
tent
term
test
text
thank
that
theme
then
theory
there
they
thing
this
thought
three
thrive
throw
thumb
thunder
ticket
tide
tiger
tilt
timber
time
tiny
tip
tired
tissue
title
toast
tobacco
today
toddler
toe
together
toilet
token
tomato
tomorrow
tone
tongue
tonight
tool
tooth
top
topic
topple
torch
tornado
tortoise
toss
total
tourist
toward
tower
town
toy
track
trade
traffic
tragic
train
transfer
trap
trash
travel
tray
treat
tree
trend
trial
tribe
trick
trigger
trim
trip
trophy
trouble
truck
true
truly
trumpet
trust
truth
try
tube
tuition
tumble
tuna
tunnel
turkey
turn
turtle
twelve
twenty
twice
twin
twist
two
type
typical
ugly
umbrella
unable
unaware
uncle
uncover
under
undo
unfair
unfold
unhappy
uniform
unique
unit
universe
unknown
unlock
until
unusual
unveil
update
upgrade
uphold
upon
upper
upset
urban
urge
usage
use
used
useful
useless
usual
utility
vacant
vacuum
vague
valid
valley
valve
van
vanish
vapor
various
vast
vault
vehicle
velvet
vendor
venture
venue
verb
verify
version
very
vessel
veteran
viable
vibrant
vicious
victory
video
view
village
vintage
violin
virtual
virus
visa
visit
visual
vital
vivid
vocal
voice
void
volcano
volume
vote
voyage
wage
wagon
wait
walk
wall
walnut
want
warfare
warm
warrior
wash
wasp
waste
water
wave
way
wealth
weapon
wear
weasel
weather
web
wedding
weekend
weird
welcome
west
wet
whale
what
wheat
wheel
when
where
whip
whisper
wide
width
wife
wild
will
win
window
wine
wing
wink
winner
winter
wire
wisdom
wise
wish
witness
wolf
woman
wonder
wood
wool
word
work
world
worry
worth
wrap
wreck
wrestle
wrist
write
wrong
yard
year
yellow
you
young
youth
zebra
zero
zone
zoo`.split(`
`));

// shim:@noble/curves/ed25519.js
var ie = globalThis.__LCC.ed25519;
if (!ie)
throw Error("lineage: __LCC.ed25519 missing");
var { ed25519: ae, x25519: ne } = ie;

// shim:@noble/hashes/sha3.js
var oe = globalThis.__LCH.sha3;
if (!oe)
throw Error("lineage: __LCH.sha3 missing");
var { Keccak: Yr, keccakP: et, keccak_224: rt, keccak_256: se, keccak_384: tt, keccak_512: it, sha3_224: at, sha3_256: nt, sha3_384: ot, sha3_512: st, shake128: lt, shake128_32: ct, shake256: ut, shake256_64: dt } = oe;

// shim:@noble/hashes/hkdf.js
var le = globalThis.__LCH.hkdf;
if (!le)
throw Error("lineage: __LCH.hkdf missing");
var { expand: ht, extract: mt, hkdf: ce } = le;

// entry-keys.ts
globalThis.LC = Object.freeze({
HDKey: h,
generateMnemonic: G,
mnemonicToSeed: re,
validateMnemonic: ee,
wordlist: te,
secp256k1: u,
schnorr: z,
ed25519: ae,
x25519: ne,
sha256: d,
sha512: y,
ripemd160: w,
keccak_256: se,
hkdf: ce,
bytesToHex: q,
hexToBytes: R,
utf8ToBytes: N,
concatBytes: f,
randomBytes: k,
bech32: F,
base64: I,
base58check: x(d)
});
})();
