// The sender's own wallet: WebLN (a lightning browser extension such as Alby) or Nostr Wallet Connect (NIP-47).
// Each wallet does one thing here: pay an invoice SLYNG has already checked.

import { unhex, hex, getPublicKey, isHex64, isValidPrivateKey, nip04Encrypt, nip04Decrypt, nip44ConversationKey, nip44Encrypt, nip44Decrypt } from './crypto.js';
import { finalizeEvent, normalizeRelay, now } from './nostr.js';

export class WebLNWallet {
  constructor(provider) { this.provider = provider; this.kind = 'webln'; this.label = 'Browser wallet'; }
  static async connect(provider = globalThis.webln) {
    if (!provider) throw new Error('No lightning wallet extension found in this browser.');
    await provider.enable?.();
    const w = new WebLNWallet(provider);
    try { const info = await provider.getInfo?.(); if (info?.node?.alias) w.label = info.node.alias; } catch {}
    return w;
  }
  async pay(invoice) {
    const r = await this.provider.sendPayment(invoice);
    if (!r?.preimage) throw new Error('Your wallet did not confirm the payment.');
    return { preimage: r.preimage };
  }
}

export function parseNwcUri(uri) {
  let u;
  try { u = new URL(String(uri).trim().replace(/^nostrwalletconnect:\/\//i, 'nostr+walletconnect://')); } catch { u = null; }
  if (!u || !/^nostr\+walletconnect:$/i.test(u.protocol)) {
    throw new Error('That is not a Nostr Wallet Connect string (it starts with nostr+walletconnect://).');
  }
  const wallet = (u.hostname || u.pathname.replace(/^\/+/, '')).toLowerCase();
  const relays = u.searchParams.getAll('relay').map(normalizeRelay).filter(Boolean);
  const secret = (u.searchParams.get('secret') || '').toLowerCase();
  if (!isHex64(wallet) || !relays.length || !isHex64(secret) || !isValidPrivateKey(unhex(secret))) {
    throw new Error('That wallet connection is missing its wallet key, relay or secret.');
  }
  return { wallet, relays, secret: unhex(secret), lud16: u.searchParams.get('lud16') || '' };
}

export class NwcWallet {
  constructor(conn, pool) {
    this.conn = conn;
    this.pool = pool;
    this.kind = 'nwc';
    this.client = hex(getPublicKey(conn.secret));
    this.encryption = 'nip04';
    this.label = conn.lud16 || 'Wallet Connect';
  }

  static async connect(uri, pool) {
    const w = new NwcWallet(parseNwcUri(uri), pool);
    const info = await pool.query(w.conn.relays, [{ kinds: [13194], authors: [w.conn.wallet], limit: 1 }], { timeout: 7000 });
    if (!info.length) throw new Error('The wallet did not answer on its relay. Check the connection string, or that the wallet is online.');
    const latest = info.sort((a, b) => b.created_at - a.created_at)[0];
    const methods = String(latest.content).split(/[\s,]+/);
    if (!methods.includes('pay_invoice')) throw new Error('This wallet connection is not allowed to pay invoices.');
    const enc = latest.tags.find((t) => t[0] === 'encryption')?.[1] || '';
    if (enc.split(/\s+/).includes('nip44_v2')) w.encryption = 'nip44';
    return w;
  }

  async encrypt(text) {
    if (this.encryption === 'nip44') return nip44Encrypt(text, nip44ConversationKey(this.conn.secret, unhex(this.conn.wallet)));
    return nip04Encrypt(text, this.conn.secret, unhex(this.conn.wallet));
  }

  async decrypt(payload) {
    if (this.encryption === 'nip44' && !payload.includes('?iv=')) {
      return nip44Decrypt(payload, nip44ConversationKey(this.conn.secret, unhex(this.conn.wallet)));
    }
    return nip04Decrypt(payload, this.conn.secret, unhex(this.conn.wallet));
  }

  async request(method, params, timeout = 60000) {
    const tags = [['p', this.conn.wallet]];
    if (this.encryption === 'nip44') tags.push(['encryption', 'nip44_v2']);
    const ev = finalizeEvent({
      kind: 23194, created_at: now(), tags, content: await this.encrypt(JSON.stringify({ method, params })),
    }, this.conn.secret);
    return new Promise((resolve, reject) => {
      let settled = false;
      const sub = this.pool.subscribe(this.conn.relays, [{ kinds: [23195], authors: [this.conn.wallet], '#e': [ev.id] }], {
        onevent: async (e) => {
          if (settled) return;
          try {
            const body = JSON.parse(await this.decrypt(e.content));
            settled = true;
            clearTimeout(t);
            sub.close();
            if (body.error) reject(new Error(body.error.message || body.error.code || 'Your wallet refused.'));
            else resolve(body.result);
          } catch {}
        },
      });
      const t = setTimeout(() => { if (!settled) { settled = true; sub.close(); reject(new Error('Your wallet did not answer in time.')); } }, timeout);
      this.pool.publish(this.conn.relays, ev).then((r) => {
        if (!r.ok && !settled) { settled = true; clearTimeout(t); sub.close(); reject(new Error('Could not reach your wallet\'s relay.')); }
      });
    });
  }

  async pay(invoice) {
    const r = await this.request('pay_invoice', { invoice });
    if (!r?.preimage) throw new Error('Your wallet did not confirm the payment.');
    return { preimage: r.preimage };
  }
}
