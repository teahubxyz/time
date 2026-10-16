// Sats over lightning: lightning addresses (LUD-16), LNURL-pay (LUD-06), and zaps (NIP-57).
// The page asks the recipient's lightning address server for an invoice, checks that the invoice is for exactly the
// amount asked, and hands it to the sender's own wallet. SLYNG never holds funds.

import { bech32Decode, bech32Encode, now, tagValue, verifyEvent } from './nostr.js';
import { utf8 } from './crypto.js';

export function lightningAddressUrl(address) {
  const m = /^([a-z0-9._+-]+)@([a-z0-9.-]+\.[a-z]{2,}|localhost(:\d+)?|127\.0\.0\.1(:\d+)?)$/i.exec(String(address || '').trim());
  if (!m) return null;
  const [, name, domain] = m;
  const local = /^(localhost|127\.0\.0\.1)/.test(domain);
  return `${local ? 'http' : 'https'}://${domain}/.well-known/lnurlp/${name.toLowerCase()}`;
}

export const lnurlEncode = (url) => bech32Encode('lnurl', utf8(url)).toUpperCase();

export function lnurlDecode(lnurl) {
  const { hrp, bytes } = bech32Decode(String(lnurl).replace(/^lightning:/i, ''));
  if (hrp !== 'lnurl') throw new Error('not an lnurl');
  return new TextDecoder().decode(bytes);
}

// Where to ask for an invoice, from a profile's lud16 (preferred) or lud06
export function payUrlFor(profile) {
  if (profile?.lud16) {
    const u = lightningAddressUrl(profile.lud16);
    if (u) return u;
  }
  if (profile?.lud06) {
    try { return lnurlDecode(profile.lud06); } catch {}
  }
  return null;
}

export async function fetchPayEndpoint(url, fetcher = globalThis.fetch) {
  let res;
  try {
    res = await fetcher(url, { headers: { accept: 'application/json' } });
  } catch {
    throw new Error('Their lightning address server did not answer.');
  }
  if (!res.ok) throw new Error(`Their lightning address server answered ${res.status}.`);
  const j = await res.json();
  if (j?.status === 'ERROR') throw new Error(j.reason || 'Their lightning address refused.');
  if (j?.tag !== 'payRequest' || typeof j.callback !== 'string') throw new Error('Their lightning address is not set up to receive payments.');
  return {
    url,
    callback: j.callback,
    min: Number(j.minSendable) || 1000,
    max: Number(j.maxSendable) || 0,
    allowsNostr: j.allowsNostr === true && typeof j.nostrPubkey === 'string' && /^[0-9a-f]{64}$/.test(j.nostrPubkey),
    nostrPubkey: j.nostrPubkey,
    commentAllowed: Number(j.commentAllowed) || 0,
  };
}

export function zapRequestTemplate({ recipient, msats, relays, lnurl, comment = '', eventId = null }) {
  const tags = [['relays', ...relays.slice(0, 8)], ['amount', String(msats)], ['lnurl', lnurl], ['p', recipient]];
  if (eventId) tags.push(['e', eventId]);
  tags.push(['client', 'slyng']);
  return { kind: 9734, created_at: now(), content: comment, tags };
}

// The amount a BOLT-11 invoice asks for, in millisats (null if it names none)
export function invoiceMsats(pr) {
  const s = String(pr || '').toLowerCase().replace(/^lightning:/, '');
  const sep = s.lastIndexOf('1');
  if (!s.startsWith('ln') || sep < 0) return null;
  const hrp = s.slice(0, sep);
  const m = /^ln(bcrt|bc|tbs|tb|sb)(\d+)([munp]?)$/.exec(hrp);
  if (!m) return null;
  const [, , digits, mult] = m;
  const n = BigInt(digits);
  const msats = { '': n * 100000000000n, m: n * 100000000n, u: n * 100000n, n: n * 100n, p: n / 10n }[mult];
  if (mult === 'p' && n % 10n) return null;
  return Number(msats);
}

export async function fetchInvoice(endpoint, msats, zapRequest = null, fetcher = globalThis.fetch) {
  if (msats < endpoint.min || (endpoint.max && msats > endpoint.max)) {
    const lo = Math.ceil(endpoint.min / 1000), hi = Math.floor(endpoint.max / 1000);
    throw new Error(`Their lightning address takes ${lo.toLocaleString('en-US')} to ${hi.toLocaleString('en-US')} sats at a time.`);
  }
  const u = new URL(endpoint.callback);
  u.searchParams.set('amount', String(msats));
  if (zapRequest) {
    u.searchParams.set('nostr', JSON.stringify(zapRequest));
    u.searchParams.set('lnurl', lnurlEncode(endpoint.url));
  }
  let res;
  try { res = await fetcher(u.toString(), { headers: { accept: 'application/json' } }); } catch {
    throw new Error('Their lightning address server did not answer.');
  }
  const j = await res.json().catch(() => ({}));
  if (j?.status === 'ERROR' || !j?.pr) throw new Error(j?.reason || 'Their lightning address did not send an invoice.');
  const asked = invoiceMsats(j.pr);
  if (asked !== msats) throw new Error('Their server sent an invoice for a different amount, so nothing was paid.');
  return j.pr;
}

// A zap receipt (kind 9735): who zapped whom, how much, and the note in the request
export function readZapReceipt(e) {
  try {
    const desc = JSON.parse(tagValue(e, 'description') || 'null');
    if (!desc || desc.kind !== 9734 || !verifyEvent(desc)) return null;
    const bolt11 = tagValue(e, 'bolt11');
    const msats = invoiceMsats(bolt11);
    const requested = Number(tagValue(desc, 'amount') || 0);
    if (msats == null || (requested && requested !== msats)) return null;
    return {
      id: e.id,
      from: tagValue(e, 'P') || desc.pubkey,
      to: tagValue(e, 'p'),
      sats: Math.floor(msats / 1000),
      comment: desc.content || '',
      at: e.created_at,
      requestId: desc.id,
      server: e.pubkey,
    };
  } catch {
    return null;
  }
}
