// SLYNG: aim at someone on the fence, pull back for more, let go to send.
// Demo mode until you sign in; then notes go over nostr (NIP-17) and sats as zaps (NIP-57) from your own wallet.

import { Slingshot, LADDER, fmt, detentForAmount } from './sling.js';
import { generatePrivateKey, hex, unhex, isHex64 } from './lib/crypto.js';
import {
  LocalSigner, ExtensionSigner, Pool, parsePerson, parseSecret, nsecEncode, shortNpub, resolveNip05,
  parseProfile, latestBy, relayListFrom, dmRelaysFrom, normalizeRelay, now,
} from './lib/nostr.js';
import { payUrlFor, fetchPayEndpoint, fetchInvoice, zapRequestTemplate, readZapReceipt, lnurlEncode } from './lib/zap.js';
import { WebLNWallet, NwcWallet } from './lib/wallet.js';
import { sealNote, openWrap } from './lib/dm.js';

const $ = (id) => document.getElementById(id);
const area = (get) => ({
  get(k, d = null) { try { const v = get().getItem('slyng.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { get().setItem('slyng.' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { get().removeItem('slyng.' + k); } catch {} },
});
const local = area(() => localStorage);
const session = area(() => sessionStorage);
const uniq = (list) => [...new Set(list.filter(Boolean))];

const qs = new URLSearchParams(location.search);
const override = (qs.get('relays') || '').split(',').map(normalizeRelay).filter(Boolean);
const RELAYS = override.length ? override : ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
const DM_RELAYS = override.length ? override : ['wss://relay.damus.io', 'wss://nos.lol', 'wss://auth.nostr1.com'];
const FLIGHT_LIVE = Math.min(6000, Math.max(300, Number(qs.get('flight')) || 2600));
const FLIGHT_DEMO = 1000;

const DEMO = [
  { label: 'ana', replies: ['caught it. you didn\'t have to', 'ha, right back at you', 'that\'s my coffee sorted'], back: 21 },
  { label: 'ben', replies: ['the records are yours, see you saturday', 'lunch is on me next time'] },
  { label: 'cass', replies: ['got it, thank you', 'see you at the market'] },
  { label: 'dev', replies: ['no lightning address yet, but the note made it'], notesOnly: true },
].map((p) => ({ ...p, id: 'demo:' + p.label, initial: p.label[0].toUpperCase(), canTakeSats: !p.notesOnly, demo: true, n: 0 }));

const S = {
  mode: 'demo',
  signer: null,
  me: null,
  wallet: null,
  pool: new Pool(),
  myRead: [],
  myDm: [],
  people: new Map(),
  follows: [],
  fence: [],
  extra: new Map(),
  caught: [],
  slung: [],
  tab: 'caught',
  demoBalance: 21000,
  flight: null,
  subs: [],
  seenRumors: new Set(),
  seenZaps: new Set(),
  booted: now(),
};

// ---------------------------------------------------------------------------------------------------- the readout

function say(amt, sub = '') {
  $('amt').textContent = amt;
  $('sub').textContent = sub;
}

const noteText = () => $('note').value.trim();

function describe(sats, note) {
  if (!sats) return 'A note';
  return `${fmt(sats)} sats` + (note ? ' and a note' : '');
}

function idleReadout() {
  if (S.flight) return;
  if (!S.fence.length) {
    say('Nobody on the fence', S.mode === 'live' ? 'Change who\'s on the fence to pick someone.' : '');
    return;
  }
  const hint = S.mode === 'demo'
    ? 'Demo: pretend sats. Nothing leaves the page.'
    : !S.wallet ? 'Notes go now. Connect a wallet to sling sats too.' : 'Drag the stone down, away from who you aim at.';
  say('Pull back to sling', hint);
}

function aimReadout({ target, detent, sats }) {
  if (S.flight) return;
  if (detent < 0 || !target) { idleReadout(); return; }
  const note = noteText();
  const to = `to ${target.label}`;
  if (detent === 0) { if (note) say('A note', to); else say('Write a note', 'or pull further for sats'); return; }
  if (!target.canTakeSats) { say('Notes only', `${target.label} has no lightning address yet`); return; }
  say(`${fmt(sats)} sats`, note ? `${to}, with a note` : to);
}

// ---------------------------------------------------------------------------------------------------- the slingshot

let lastDetent = -1;
const sling = new Slingshot($('sling'), {
  onAim(a) {
    if (a.detent !== lastDetent) {
      lastDetent = a.detent;
      if (a.detent >= 0) try { navigator.vibrate?.(6); } catch {}
    }
    aimReadout(a);
  },
  onSlack() { lastDetent = -1; idleReadout(); },
  onRelease(a) { lastDetent = -1; return release(a); },
});

function release({ target, index, detent, sats }) {
  const note = noteText();
  if (!target) return false;
  if (detent === 0 && !note) {
    say('Write a note', 'or pull further for sats');
    $('note').focus({ preventScroll: true });
    return false;
  }
  if (sats > 0 && !target.canTakeSats) {
    say('Notes only', `${target.label} has no lightning address yet, so only notes reach them.`);
    return false;
  }
  if (S.mode === 'demo') {
    if (sats > S.demoBalance) { say('Not enough demo sats', `You have ${fmt(S.demoBalance)} left.`); return false; }
  } else {
    if (sats > 0 && !S.wallet) {
      say('Connect a wallet', 'Sats go from your own wallet. Notes work without one.');
      openWallet();
      return false;
    }
    if (note && !S.signer?.canEncrypt) {
      say('Can\'t seal notes', 'Your nostr extension can\'t encrypt (NIP-44). Sats still work.');
      return false;
    }
  }
  launch({ target, index, sats, note });
  return true;
}

function launch({ target, index, sats, note }) {
  try { navigator.vibrate?.(14); } catch {}
  const f = { target, index, sats, note };
  if (S.mode === 'live' && sats > 0) {
    f.invoice = prepareInvoice(target, sats);
    f.invoice.catch(() => {});
  }
  S.flight = f;
  say(describe(sats, note), `In the air to ${target.label}. Catch it back if you change your mind.`);
  $('flight').hidden = false;
  f.ctl = sling.launch(index, {
    duration: S.mode === 'live' ? FLIGHT_LIVE : FLIGHT_DEMO,
    onLand: () => { $('flight').hidden = true; S.flight = null; landed(f); },
    onBack: () => { $('flight').hidden = true; S.flight = null; say('Caught it back', 'Nothing was sent.'); },
  });
}

function clearNote() {
  $('note').value = '';
  autosize();
  sling.setNoted(false);
  sling.setSuggested(0);
  $('aimed').hidden = true;
}

function landed(f) {
  if (S.mode === 'demo') demoLand(f);
  else liveLand(f);
}

function demoLand(f) {
  clearNote();
  S.demoBalance -= f.sats;
  addEntry('slung', { who: f.target, sats: f.sats, note: f.note, at: now(), status: 'Caught', good: true });
  if (f.sats) sling.float(f.index, '+' + fmt(f.sats));
  say('Slung', `${describe(f.sats, f.note)} to ${f.target.label}. They caught it.`);
  updateChips();
  const p = f.target;
  const reply = p.replies?.[(p.n = (p.n || 0) + 1) % p.replies.length] || 'caught it';
  setTimeout(() => {
    if (S.mode !== 'demo') return;
    const back = p.back && f.sats >= 100 ? p.back : 0;
    if (back) { S.demoBalance += back; updateChips(); }
    addEntry('caught', { who: p, sats: back, note: reply, at: now() });
    toast(`${p.label} slung back ${back ? fmt(back) + ' sats and ' : ''}a note`);
  }, 1400);
}

async function liveLand(f) {
  const entry = addEntry('slung', { who: f.target, sats: f.sats, note: f.note, at: now(), status: f.sats ? 'Paying' : 'Sending' });
  let paid = false;
  try {
    if (f.sats > 0) {
      const { pr, zapRequestId } = await f.invoice;
      entry.zapRequestId = zapRequestId;
      await S.wallet.pay(pr);
      paid = true;
      if (f.note) updateEntry(entry, { status: 'Paid. Sending the note' });
      sling.float(f.index, '+' + fmt(f.sats));
    }
    let inbox = true;
    if (f.note) inbox = (await sendNote(f.target.pubkey, f.note)).hasInbox;
    entry.done = true;
    updateEntry(entry, {
      status: entry.caught ? 'Caught' : inbox ? 'Landed' : 'Landed. They haven\'t set up private notes, so their app may not show it.',
      good: true,
    });
    clearNote();
    say('Slung', `${describe(f.sats, f.note)} to ${f.target.label}.`);
  } catch (err) {
    const reason = String(err?.message || err);
    if (paid) {
      updateEntry(entry, { status: `The sats landed; the note didn't. ${reason}`, bad: true });
      say('Half landed', `The sats reached ${f.target.label}; the note didn't. ${reason}`);
    } else {
      updateEntry(entry, { status: `Didn't land. ${reason}`, bad: true });
      say('Nothing was sent', reason);
    }
  }
}

$('catchback').addEventListener('click', () => S.flight?.ctl?.cancel());

// ---------------------------------------------------------------------------------------------------- nostr, live

const profileTimes = new Map();

async function loadProfiles(pubkeys) {
  const want = uniq(pubkeys).filter(isHex64);
  for (let i = 0; i < want.length; i += 100) {
    const chunk = want.slice(i, i + 100);
    const evs = await S.pool.query(uniq([...RELAYS, ...S.myRead]), [{ kinds: [0], authors: chunk }], { timeout: 6000 });
    for (const [pk, e] of latestBy(evs)) {
      const cur = S.people.get(pk);
      if (!cur || (cur.created_at || 0) <= e.created_at) S.people.set(pk, parseProfile(e));
      profileTimes.set(pk, now());
    }
  }
}

async function freshProfile(pubkey) {
  if (!profileTimes.has(pubkey) || now() - profileTimes.get(pubkey) > 120) await loadProfiles([pubkey]);
  return S.people.get(pubkey) || { pubkey };
}

const relayInfo = new Map();
async function relaysOf(pubkey) {
  const c = relayInfo.get(pubkey);
  if (c && now() - c.t < 600) return c;
  const evs = await S.pool.query(RELAYS, [{ kinds: [10002, 10050], authors: [pubkey] }], { timeout: 5000 });
  const m = latestBy(evs, (e) => e.kind);
  const { read } = relayListFrom(m.get(10002));
  const info = { read, dm: dmRelaysFrom(m.get(10050)), t: now() };
  relayInfo.set(pubkey, info);
  return info;
}

const myDmRelays = () => (S.myDm.length ? S.myDm : DM_RELAYS);

async function prepareInvoice(person, sats) {
  const profile = await freshProfile(person.pubkey);
  const url = payUrlFor(profile);
  if (!url) throw new Error(`${person.label} has no lightning address.`);
  const ep = await fetchPayEndpoint(url);
  const msats = sats * 1000;
  let zr = null;
  if (ep.allowsNostr) {
    const theirs = (await relaysOf(person.pubkey)).read;
    const relays = uniq([...S.myRead, ...RELAYS, ...theirs]).slice(0, 6);
    zr = await S.signer.signEvent(zapRequestTemplate({ recipient: person.pubkey, msats, relays, lnurl: lnurlEncode(url) }));
  }
  const pr = await fetchInvoice(ep, msats, zr);
  return { pr, zapRequestId: zr?.id || null };
}

async function sendNote(pubkey, text) {
  const { rumor, toThem, toMe } = await sealNote(S.signer, pubkey, text);
  S.seenRumors.add(rumor.id);
  const info = await relaysOf(pubkey);
  const targets = info.dm.length ? info.dm : uniq([...info.read, ...DM_RELAYS]);
  const r = await S.pool.publish(targets, toThem);
  if (!r.ok) throw new Error('No relay took the note.');
  if (toMe) S.pool.publish(myDmRelays(), toMe);
  return { hasInbox: info.dm.length > 0 };
}

function personFor(pk) {
  const p = S.people.get(pk) || { pubkey: pk };
  const label = p.name || (p.nip05 ? p.nip05.replace(/^_@/, '') : '') || shortNpub(pk);
  return {
    id: pk, pubkey: pk, label,
    initial: (label.replace(/^[^a-z0-9]+/i, '')[0] || '?').toUpperCase(),
    picture: p.picture || '',
    canTakeSats: Boolean(payUrlFor(p)),
  };
}

async function goLive(signer, { remember = false, how = 'local', quiet = false } = {}) {
  stopLive();
  S.signer = signer;
  S.pool.signer = signer;
  S.mode = 'live';
  S.me = signer.pubkey;
  S.caught = [];
  S.slung = [];
  renderLog();
  const saved = how === 'extension' ? { type: 'extension' } : { type: 'local', sk: hex(signer.priv) };
  local.del('account'); session.del('account');
  (remember ? local : session).set('account', saved);
  updateChips();
  setFence([]);
  say('Finding who you follow', 'Asking the relays.');
  const me = S.me;
  try {
    const evs = await S.pool.query(RELAYS, [{ kinds: [0, 3, 10002, 10050], authors: [me] }], { timeout: 7000 });
    if (S.me !== me) return;
    const m = latestBy(evs, (e) => e.kind);
    if (m.get(0)) S.people.set(me, parseProfile(m.get(0)));
    S.myRead = relayListFrom(m.get(10002)).read;
    S.myDm = dmRelaysFrom(m.get(10050));
    const contacts = m.get(3);
    S.follows = contacts ? uniq(contacts.tags.filter((t) => t[0] === 'p' && isHex64(t[1])).map((t) => t[1])).reverse() : [];
    const pins = (local.get('fence.' + me, []) || []).filter(isHex64);
    await loadProfiles(uniq([...pins, ...S.follows.slice(0, 120)]));
    if (S.me !== me) return;
    let fence = pins;
    if (!fence.length) {
      fence = S.follows.filter((pk) => payUrlFor(S.people.get(pk))).slice(0, 4);
      if (fence.length < 3) fence = uniq([...fence, ...S.follows]).slice(0, 4);
    }
    setFence(fence.map(personFor));
    updateChips();
    if (!S.follows.length && !fence.length) say('Nobody on the fence', 'You don\'t follow anyone yet. Add someone by npub or name@domain.');
    else if (!quiet) toast(`Signed in. ${S.fence.length} on the fence.`);
    startInbox();
    await applyHash();
  } catch (err) {
    say('Couldn\'t reach the relays', String(err?.message || err));
  }
}

function stopLive() {
  for (const s of S.subs) s.close();
  S.subs = [];
  S.signer = null;
  S.pool.signer = null;
  S.me = null;
  S.follows = [];
  S.myRead = [];
  S.myDm = [];
  S.seenRumors.clear();
  S.seenZaps.clear();
}

function goDemo() {
  stopLive();
  local.del('account');
  session.del('account');
  S.mode = 'demo';
  S.caught = [];
  S.slung = [];
  S.demoBalance = 21000;
  setFence(DEMO);
  updateChips();
  renderLog();
  idleReadout();
}

function startInbox() {
  const me = S.me;
  const since = now() - 30 * 86400;
  const fresh = (t) => t >= S.booted - 5;
  S.subs.push(S.pool.subscribe(uniq([...myDmRelays(), ...RELAYS]), [{ kinds: [1059], '#p': [me], since: since - 2 * 86400, limit: 200 }], {
    onevent: async (w) => {
      const r = await openWrap(S.signer, w);
      if (!r || S.me !== me || S.seenRumors.has(r.id)) return;
      S.seenRumors.add(r.id);
      const fromMe = r.pubkey === me;
      const other = fromMe ? r.to : r.pubkey;
      if (!isHex64(other || '')) return;
      await ensureProfile(other);
      addEntry(fromMe ? 'slung' : 'caught', {
        who: personFor(other), sats: 0, note: r.content, at: r.created_at,
        status: fromMe ? 'Landed' : undefined, good: fromMe,
      });
      if (!fromMe && fresh(r.created_at)) toast(`${personFor(other).label} slung you a note`);
    },
  }));
  const zapRelays = uniq([...S.myRead, ...RELAYS]);
  S.subs.push(S.pool.subscribe(zapRelays, [{ kinds: [9735], '#p': [me], since, limit: 100 }], {
    onevent: async (e) => {
      const z = readZapReceipt(e);
      if (!z || z.to !== me || S.me !== me || S.seenZaps.has(z.id)) return;
      S.seenZaps.add(z.id);
      await ensureProfile(z.from);
      addEntry('caught', { who: personFor(z.from), sats: z.sats, note: z.comment, at: z.at });
      if (fresh(z.at)) toast(`${personFor(z.from).label} slung you ${fmt(z.sats)} sats`);
    },
  }));
  S.subs.push(S.pool.subscribe(zapRelays, [{ kinds: [9735], '#P': [me], since, limit: 100 }], {
    onevent: async (e) => {
      const z = readZapReceipt(e);
      if (!z || z.from !== me || S.me !== me || S.seenZaps.has(z.id)) return;
      S.seenZaps.add(z.id);
      const mine = S.slung.find((x) => x.zapRequestId && x.zapRequestId === z.requestId);
      if (mine) {
        mine.caught = true;
        if (mine.done) updateEntry(mine, { status: 'Caught', good: true });
        toast(`${mine.who.label} caught ${fmt(z.sats)} sats`);
        return;
      }
      if (!isHex64(z.to || '')) return;
      await ensureProfile(z.to);
      addEntry('slung', { who: personFor(z.to), sats: z.sats, note: '', at: z.at, status: 'Caught', good: true });
    },
  }));
}

const asking = new Map();
function ensureProfile(pk) {
  if (S.people.has(pk)) return Promise.resolve();
  if (!asking.has(pk)) asking.set(pk, loadProfiles([pk]).catch(() => {}));
  return asking.get(pk);
}

// ---------------------------------------------------------------------------------------------------- the fence

function setFence(people) {
  S.fence = people.slice(0, 5);
  sling.setTargets(S.fence);
  if (S.mode === 'live' && S.me) local.set('fence.' + S.me, S.fence.map((p) => p.pubkey));
  idleReadout();
}

function putOnFence(person) {
  const rest = S.fence.filter((p) => p.id !== person.id);
  setFence([person, ...rest].slice(0, 5));
}

function fencePeople() {
  if (S.mode === 'demo') return DEMO;
  const seen = new Set();
  const list = [];
  for (const pk of [...S.fence.map((p) => p.pubkey), ...S.extra.keys(), ...S.follows]) {
    if (seen.has(pk)) continue;
    seen.add(pk);
    list.push(personFor(pk));
  }
  return list;
}

function openFence() {
  $('fence-q').value = '';
  $('fence-status').textContent = '';
  $('fence-lede').textContent = S.mode === 'demo'
    ? 'In the demo, these four stand on the fence. Sign in to sling to the people you follow.'
    : 'Up to five people stand on the fence at a time. Pick from who you follow, or add anyone by npub or name@domain.';
  $('fence-q').closest('label').hidden = S.mode === 'demo';
  renderFenceList();
  $('fencedlg').showModal();
  if (S.mode === 'live') {
    const missing = S.follows.filter((pk) => !S.people.has(pk)).slice(0, 400);
    if (missing.length) {
      $('fence-status').textContent = 'Loading names';
      loadProfiles(missing).then(() => { $('fence-status').textContent = ''; renderFenceList(); });
    }
  }
}

let searchTimer = 0;
$('fence-q').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(searchFence, 250);
});

async function searchFence() {
  const q = $('fence-q').value.trim();
  $('fence-status').classList.remove('bad');
  let direct = null;
  try { direct = parsePerson(q); } catch {}
  if (!direct && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q)) {
    $('fence-status').textContent = `Looking up ${q}`;
    try { direct = await resolveNip05(q); } catch (err) {
      $('fence-status').textContent = String(err.message || err);
      $('fence-status').classList.add('bad');
    }
  }
  if (direct) {
    S.extra.set(direct.pubkey, true);
    await loadProfiles([direct.pubkey]);
    $('fence-status').textContent = '';
  } else if ($('fence-status').textContent.startsWith('Looking up')) {
    $('fence-status').textContent = '';
  }
  renderFenceList(direct?.pubkey);
}

function face(person) {
  const f = document.createElement('span');
  f.className = 'face';
  f.setAttribute('aria-hidden', 'true');
  f.textContent = person.initial || '?';
  if (person.picture) {
    const img = document.createElement('img');
    img.src = person.picture;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.loading = 'lazy';
    img.onerror = () => img.remove();
    f.textContent = '';
    f.appendChild(img);
  }
  return f;
}

function renderFenceList(first = null) {
  const ul = $('fence-list');
  ul.innerHTML = '';
  const q = $('fence-q').value.trim().toLowerCase();
  let list = fencePeople();
  if (q && !first) {
    list = list.filter((p) => {
      const prof = S.people.get(p.pubkey) || {};
      return [p.label, prof.handle, prof.nip05].some((s) => String(s || '').toLowerCase().includes(q));
    });
  }
  if (first) list.sort((a, b) => (a.pubkey === first ? -1 : b.pubkey === first ? 1 : 0));
  for (const p of list.slice(0, 200)) {
    const li = document.createElement('li');
    li.appendChild(face(p));
    const txt = document.createElement('div');
    const n = document.createElement('div');
    n.className = 'who-name';
    n.textContent = p.label;
    const s = document.createElement('div');
    s.className = 'who-sub';
    const prof = S.people.get(p.pubkey);
    s.textContent = p.demo ? (p.canTakeSats ? 'takes sats and notes' : 'notes only') : (prof?.nip05 || shortNpub(p.pubkey)) + (p.canTakeSats ? '' : ', notes only');
    txt.append(n, s);
    li.appendChild(txt);
    const on = S.fence.some((x) => x.id === p.id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pill small ghost';
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? 'On the fence' : 'Put on the fence';
    b.disabled = S.mode === 'demo';
    b.addEventListener('click', () => {
      const isOn = S.fence.some((x) => x.id === p.id);
      if (isOn) setFence(S.fence.filter((x) => x.id !== p.id));
      else if (S.fence.length >= 5) {
        $('fence-status').textContent = 'The fence holds five. Take someone off first.';
        return;
      } else setFence([...S.fence, p]);
      $('fence-status').textContent = '';
      renderFenceList(first);
    });
    li.appendChild(b);
    ul.appendChild(li);
  }
  if (!list.length) {
    const li = document.createElement('li');
    li.textContent = q ? 'Nobody by that name among who you follow. Paste their npub or name@domain.' : 'You don\'t follow anyone yet.';
    ul.appendChild(li);
  }
}

$('fence').addEventListener('click', openFence);
$('fence-done').addEventListener('click', () => $('fencedlg').close());

// ---------------------------------------------------------------------------------------------------- the log

function ago(t) {
  const d = now() - t;
  if (d < 45) return 'just now';
  if (d < 3600) return Math.round(d / 60) + ' min';
  if (d < 86400) return Math.round(d / 3600) + ' h';
  return new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function addEntry(list, e) {
  S[list].push(e);
  renderLog();
  return e;
}

function updateEntry(e, patch) {
  Object.assign(e, patch);
  if (patch.good) e.bad = false;
  renderLog();
}

function renderLog() {
  for (const list of ['caught', 'slung']) {
    const ol = $(list);
    ol.innerHTML = '';
    const items = [...S[list]].sort((a, b) => b.at - a.at).slice(0, 100);
    for (const e of items) {
      const li = document.createElement('li');
      li.className = 'entry';
      li.appendChild(face(e.who));
      const body = document.createElement('div');
      const top = document.createElement('div');
      top.className = 'entry-top';
      const what = document.createElement('span');
      what.className = 'entry-what';
      const name = document.createElement('b');
      name.textContent = e.who.label;
      const amount = e.sats ? `${fmt(e.sats)} sats` : 'a note';
      if (list === 'caught') what.append(name, ` slung you ${amount}`);
      else what.append('You slung ', name, ` ${e.sats ? amount + (e.note ? ' and a note' : '') : 'a note'}`);
      const when = document.createElement('span');
      when.className = 'entry-when';
      when.textContent = ago(e.at);
      top.append(what, when);
      body.appendChild(top);
      if (e.note) {
        const n = document.createElement('p');
        n.className = 'entry-note';
        n.textContent = e.note;
        body.appendChild(n);
      }
      if (e.status) {
        const s = document.createElement('span');
        s.className = 'entry-status' + (e.bad ? ' bad' : e.good ? ' good' : '');
        s.textContent = e.status;
        body.appendChild(s);
      }
      if (list === 'caught' && !S.fence.some((p) => p.id === e.who.id)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'linkish aim-back';
        b.textContent = 'Sling one back';
        b.addEventListener('click', () => {
          putOnFence(e.who);
          renderLog();
          $('sling').scrollIntoView({ behavior: 'smooth', block: 'center' });
          $('sling').focus({ preventScroll: true });
        });
        body.appendChild(b);
      }
      li.appendChild(body);
      ol.appendChild(li);
    }
  }
  $('n-caught').textContent = S.caught.length ? String(S.caught.length) : '';
  $('n-slung').textContent = S.slung.length ? String(S.slung.length) : '';
  const current = S[S.tab];
  $('log-empty').textContent = current.length ? '' : S.tab === 'caught'
    ? (S.mode === 'demo' ? 'Nothing caught yet. Sling something; in the demo, people sling back.' : 'Nothing caught yet. Notes and sats people sling you show up here.')
    : 'Nothing slung yet.';
}

for (const t of ['caught', 'slung']) {
  $('t-' + t).addEventListener('click', () => {
    S.tab = t;
    for (const u of ['caught', 'slung']) {
      $('t-' + u).setAttribute('aria-selected', String(u === t));
      $(u).hidden = u !== t;
    }
    renderLog();
  });
}

// ---------------------------------------------------------------------------------------------------- account and wallet

function updateChips() {
  const a = $('account'), w = $('wallet');
  if (S.mode === 'live') {
    const p = S.people.get(S.me);
    a.textContent = p?.name || shortNpub(S.me);
    a.classList.add('live');
    w.textContent = S.wallet ? S.wallet.label : 'Connect a wallet';
    w.classList.toggle('live', Boolean(S.wallet));
  } else {
    a.textContent = 'Sign in';
    a.classList.remove('live');
    w.textContent = `${fmt(S.demoBalance)} demo sats`;
    w.classList.remove('live');
  }
}

function accStatus(msg, bad = false) {
  $('acc-status').textContent = msg;
  $('acc-status').classList.toggle('bad', bad);
}

function openAccount() {
  accStatus('');
  const live = S.mode === 'live';
  $('acc-out').hidden = live;
  $('acc-in').hidden = !live;
  $('acc-h').textContent = live ? 'Signed in' : 'Sling for real';
  if (live) {
    const p = S.people.get(S.me);
    $('acc-who').textContent = `You're ${p?.name ? p.name + ', ' : ''}${shortNpub(S.me)}.`;
    $('acc-how').textContent = S.signer.kind === 'extension'
      ? 'Your nostr extension signs for you.'
      : (local.get('account') ? 'Your key is remembered in this browser.' : 'Your key is kept for this tab only.');
    $('acc-show').hidden = S.signer.kind !== 'local';
  } else {
    const has = Boolean(globalThis.nostr);
    $('acc-ext').disabled = !has;
    $('acc-ext-note').textContent = has
      ? 'Alby, nos2x and others. Your key stays in the extension.'
      : 'No nostr extension in this browser. Alby or nos2x adds one.';
  }
  $('accountdlg').showModal();
}

async function signInWith(make, how) {
  accStatus('Signing in');
  try {
    const signer = await make();
    $('accountdlg').close();
    await goLive(signer, { remember: $('acc-remember').checked, how });
    return signer;
  } catch (err) {
    accStatus(String(err?.message || err), true);
    return null;
  }
}

$('account').addEventListener('click', openAccount);
$('acc-close').addEventListener('click', () => $('accountdlg').close());
$('acc-ext').addEventListener('click', () => signInWith(() => ExtensionSigner.connect(), 'extension'));
$('acc-new').addEventListener('click', async () => {
  const priv = generatePrivateKey();
  const signer = await signInWith(async () => new LocalSigner(priv), 'local');
  if (signer) showKey(priv);
});
$('acc-paste').addEventListener('click', () => signInWith(async () => new LocalSigner(parseSecret($('acc-nsec').value)), 'local'));
$('acc-out-btn').addEventListener('click', () => { $('accountdlg').close(); goDemo(); toast('Signed out. Back to the demo.'); });
$('acc-show').addEventListener('click', () => { if (S.signer?.priv) { $('accountdlg').close(); showKey(S.signer.priv); } });

function showKey(priv) {
  $('key-nsec').textContent = nsecEncode(priv);
  $('keydlg').showModal();
}
$('key-copy').addEventListener('click', () => copy($('key-nsec').textContent, 'Key copied. Keep it somewhere private.'));

function walStatus(msg, bad = false) {
  $('wal-status').textContent = msg;
  $('wal-status').classList.toggle('bad', bad);
}

function openWallet() {
  walStatus(S.mode === 'demo' ? 'You\'re in the demo, so the sats are pretend until you sign in.' : '');
  $('wal-out').hidden = Boolean(S.wallet);
  $('wal-in').hidden = !S.wallet;
  if (S.wallet) $('wal-which').textContent = `Connected: ${S.wallet.label} (${S.wallet.kind === 'nwc' ? 'Nostr Wallet Connect' : 'browser wallet'}).`;
  const has = Boolean(globalThis.webln);
  $('wal-webln').disabled = !has;
  $('wal-webln-note').textContent = has ? 'A lightning extension, such as Alby.' : 'No lightning extension in this browser. Alby adds one.';
  $('walletdlg').showModal();
}

function useWallet(w, saved, remember) {
  S.wallet = w;
  local.del('wallet'); session.del('wallet');
  (remember ? local : session).set('wallet', saved);
  updateChips();
  idleReadout();
}

$('wallet').addEventListener('click', openWallet);
$('wal-close').addEventListener('click', () => $('walletdlg').close());
$('wal-webln').addEventListener('click', async () => {
  walStatus('Connecting');
  try {
    useWallet(await WebLNWallet.connect(), { type: 'webln' }, $('wal-remember').checked);
    $('walletdlg').close();
    toast('Wallet connected');
  } catch (err) { walStatus(String(err?.message || err), true); }
});
$('wal-connect').addEventListener('click', async () => {
  const uri = $('wal-nwc').value.trim();
  walStatus('Asking your wallet');
  try {
    useWallet(await NwcWallet.connect(uri, S.pool), { type: 'nwc', uri }, $('wal-remember').checked);
    $('wal-nwc').value = '';
    $('walletdlg').close();
    toast('Wallet connected');
  } catch (err) { walStatus(String(err?.message || err), true); }
});
$('wal-forget').addEventListener('click', () => {
  S.wallet = null;
  local.del('wallet'); session.del('wallet');
  updateChips();
  idleReadout();
  $('walletdlg').close();
  toast('Wallet disconnected');
});

// ---------------------------------------------------------------------------------------------------- links an agent made

async function applyHash() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  const to = (h.get('to') || '').trim();
  if (!to) return;
  const asked = Math.max(0, Math.min(21000, Math.floor(Number(h.get('sats')) || 0)));
  const note = (h.get('note') || '').slice(0, 1000);
  let parsed = null;
  try { parsed = parsePerson(to); } catch {}
  let target = null;
  if (S.mode === 'live') {
    try {
      if (!parsed && to.includes('@')) parsed = await resolveNip05(to);
      if (parsed) { await loadProfiles([parsed.pubkey]); S.extra.set(parsed.pubkey, true); target = personFor(parsed.pubkey); }
    } catch {}
  } else if (parsed || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    const label = parsed ? shortNpub(parsed.pubkey) : to.replace(/^_@/, '');
    target = { id: 'link:' + (parsed?.pubkey || to), pubkey: parsed?.pubkey, label, initial: (label.replace(/^[^a-z0-9]+/i, '')[0] || '?').toUpperCase(), canTakeSats: true, demo: true, replies: ['caught it, thanks'], n: 0 };
  }
  const banner = $('aimed');
  banner.hidden = false;
  if (!target) {
    banner.textContent = `This link aims at ${to}, but that isn't a nostr name SLYNG can find.`;
    return;
  }
  putOnFence(target);
  if (note) { $('note').value = note; autosize(); sling.setNoted(true); }
  const d = asked ? detentForAmount(asked) : 0;
  sling.setSuggested(d);
  const amount = asked ? `: ${fmt(LADDER[d])} sats${LADDER[d] !== asked ? ` (the ring closest to the ${fmt(asked)} it asked for)` : ''}` : '';
  banner.textContent = `A link aimed this at ${target.label}${amount}${note ? ', with a note' : ''}. `
    + (asked ? 'Pull to the marked ring and let go' : 'Pull back and let go')
    + (S.mode === 'demo' ? '. In the demo nothing is sent; sign in to sling it for real.' : '.');
}

// ---------------------------------------------------------------------------------------------------- small things

let toastTimer = 0;
function toast(msg, ms = 3800) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

async function copy(text, done = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(done); } catch { toast('Couldn\'t copy. Select the text and copy it yourself.'); }
}

for (const b of document.querySelectorAll('[data-copy]')) {
  b.addEventListener('click', () => copy($(b.dataset.copy).textContent));
}

function autosize() {
  const t = $('note');
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight + 3, 140) + 'px';
}
$('note').addEventListener('input', () => { autosize(); sling.setNoted(Boolean(noteText())); });
$('note').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('sling').focus(); } });

const waitFor = (get, ms) => new Promise((resolve) => {
  const t0 = Date.now();
  const tick = () => { const v = get(); if (v || Date.now() - t0 > ms) resolve(v); else setTimeout(tick, 100); };
  tick();
});

async function boot() {
  setFence(DEMO);
  updateChips();
  renderLog();
  idleReadout();
  const acc = session.get('account') || local.get('account');
  const remembered = Boolean(local.get('account'));
  if (acc?.type === 'local' && isHex64(acc.sk || '')) {
    try { await goLive(new LocalSigner(unhex(acc.sk)), { remember: remembered, how: 'local', quiet: true }); } catch {}
  } else if (acc?.type === 'extension') {
    const ext = await waitFor(() => globalThis.nostr, 1500);
    if (ext) try { await goLive(await ExtensionSigner.connect(ext), { remember: remembered, how: 'extension', quiet: true }); } catch {}
  }
  if (S.mode === 'demo') await applyHash();
  const w = session.get('wallet') || local.get('wallet');
  const wRemember = Boolean(local.get('wallet'));
  if (w?.type === 'nwc') NwcWallet.connect(w.uri, S.pool).then((x) => useWallet(x, w, wRemember)).catch(() => {});
  if (w?.type === 'webln') {
    waitFor(() => globalThis.webln, 1500).then((p) => p && WebLNWallet.connect(p).then((x) => useWallet(x, w, wRemember)).catch(() => {}));
  }
  addEventListener('hashchange', () => applyHash());
  document.documentElement.dataset.ready = 'true';
}

boot();
