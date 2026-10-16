// Private notes (NIP-17): a kind-14 message, sealed by the sender (NIP-59 kind 13) and gift-wrapped (kind 1059) by a
// throwaway key for each recipient, so relays see neither the words nor who sent them.

import { generatePrivateKey, nip44ConversationKey, nip44Encrypt, unhex } from './crypto.js';
import { eventId, finalizeEvent, now, tagValue, verifyEvent } from './nostr.js';

const TWO_DAYS = 2 * 24 * 60 * 60;
const jitter = () => now() - Math.floor(Math.random() * TWO_DAYS);

export function rumor(senderPubkey, recipients, text, extraTags = []) {
  const r = {
    kind: 14,
    pubkey: senderPubkey,
    created_at: now(),
    tags: [...recipients.map((p) => ['p', p]), ...extraTags],
    content: text,
  };
  r.id = eventId(r);
  return r;
}

// seal for one recipient (signed by the sender), then wrap it with a fresh key
export async function wrapFor(signer, rumorEvent, recipient) {
  const seal = await signer.signEvent({
    kind: 13, created_at: jitter(), tags: [], content: await signer.nip44Encrypt(recipient, JSON.stringify(rumorEvent)),
  });
  const eph = generatePrivateKey();
  const content = nip44Encrypt(JSON.stringify(seal), nip44ConversationKey(eph, unhex(recipient)));
  return finalizeEvent({ kind: 1059, created_at: jitter(), tags: [['p', recipient]], content }, eph);
}

// One wrap for the recipient and one for the sender's own inbox, so the note shows up on their other clients too
export async function sealNote(signer, recipient, text) {
  const me = await signer.getPublicKey();
  const r = rumor(me, [recipient], text);
  const toThem = await wrapFor(signer, r, recipient);
  const toMe = recipient === me ? null : await wrapFor(signer, r, me);
  return { rumor: r, toThem, toMe };
}

// Open a gift wrap addressed to us. Returns the rumor with its true sender, or null if anything doesn't check out.
export async function openWrap(signer, wrap) {
  try {
    if (wrap.kind !== 1059 || !verifyEvent(wrap)) return null;
    const seal = JSON.parse(await signer.nip44Decrypt(wrap.pubkey, wrap.content));
    if (seal.kind !== 13 || !verifyEvent(seal)) return null;
    const r = JSON.parse(await signer.nip44Decrypt(seal.pubkey, seal.content));
    if (r.pubkey !== seal.pubkey) return null;
    if (r.kind !== 14 || typeof r.content !== 'string') return null;
    return { ...r, wrapId: wrap.id, to: tagValue(r, 'p') };
  } catch {
    return null;
  }
}
