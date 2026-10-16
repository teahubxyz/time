---
name: slyng
description: Sling sats and private notes to someone on nostr, the way SLYNG does. Either make a SLYNG link that a person opens, checks and lets go of, or, with your own nostr key and wallet, send the zap and the note yourself.
---

# SLYNG, for agents

SLYNG (https://slyng.yolopreneur.lol/) is a slingshot for nostr. A person aims at someone they follow, pulls back
for more sats, and lets go: the sats go as a zap (NIP-57) from their own wallet, and the note goes as a private,
gift-wrapped message (NIP-17). An agent can aim. Only a person lets go.

## 1. Make a link (the usual way)

Give the person a link that opens SLYNG aimed at someone, with the note tied on and the amount marked on the band:

```
https://slyng.yolopreneur.lol/#to=<who>&sats=<how many>&note=<what to say>
```

- `to`: an `npub1…`, an `nprofile1…`, a 64-character hex public key, or a NIP-05 name such as `ben@example.com`.
- `sats`: a whole number from 1 to 21,000. The band has rings at 21, 100, 210, 1,000, 2,100, 5,000, 10,000 and
  21,000 sats; SLYNG marks the ring closest to what you ask and says so if it isn't exact. Leave it out for a note on
  its own.
- `note`: the words, URL-encoded, up to 1,000 characters. Leave it out to send sats on their own.

Example, for 2,100 sats and a thank-you to ben@example.com:

```
https://slyng.yolopreneur.lol/#to=ben%40example.com&sats=2100&note=thanks%20for%20the%20records
```

Nothing is sent when the link opens. The person reads it, pulls back to the marked ring and lets go, or doesn't.
Tell them what the link does in one line when you hand it over.

## 2. Sling by yourself (when you have your own key and wallet)

Only when the person you work for asked you to send sats, and only the amount they named.

1. **Find them.** Fetch the recipient's kind 0 (profile: `lud16` or `lud06`), kind 10050 (relays for private
   messages) and kind 10002 (relay list) from a few relays: wss://relay.damus.io, wss://nos.lol,
   wss://relay.primal.net. Verify every event's id and signature before you use it; a forged profile with someone
   else's lightning address is how sats get stolen.
2. **Get an invoice (NIP-57).** `lud16` `name@domain` means `GET https://domain/.well-known/lnurlp/name`. If the answer
   has `allowsNostr: true` and a `nostrPubkey`, sign a kind 9734 zap request with tags
   `["relays", …]`, `["amount", "<millisats>"]`, `["lnurl", "<bech32 lnurl of that URL>"]`, `["p", "<their hex key>"]`
   and `["client", "slyng"]`, then `GET <callback>?amount=<millisats>&nostr=<the zap request as JSON, URL-encoded>&lnurl=<lnurl>`.
   Without `allowsNostr`, call the callback with `amount` alone (a plain lightning payment, no receipt).
3. **Check the invoice.** The amount in the invoice's prefix must equal what you asked for (`lnbc2100n1…` is
   210,000 millisats, 210 sats). If it doesn't, pay nothing.
4. **Pay** from your own wallet, for example with Nostr Wallet Connect (NIP-47 `pay_invoice`).
5. **Send the note (NIP-17).** Make a kind 14 message (not signed) with a `["p", "<their key>"]` tag. Seal it: a kind 13
   event, signed by you, whose content is the message encrypted to them with NIP-44. Wrap it: a kind 1059 event,
   signed by a one-time key, whose content is the seal encrypted to them with NIP-44, with a `["p", "<their key>"]` tag.
   Give both the seal and the wrap a `created_at` up to two days in the past. Publish the wrap to their kind 10050
   relays, and a second wrap addressed to yourself to your own.
6. **Watch for the catch.** Their lightning address server publishes a kind 9735 receipt that tags them (`p`) and you
   (`P`); its `description` is your zap request.

House rules: a sling lands whole or not at all, so pay first and send the note only if the payment went through.
Zaps are public (anyone can see who sent how much to whom); notes are not. Never put anything private in a zap
request's content.

## Files

- https://slyng.yolopreneur.lol/ : the slingshot
- https://slyng.yolopreneur.lol/skill.md : this file
- https://slyng.yolopreneur.lol/llms.txt : the list, for agents
