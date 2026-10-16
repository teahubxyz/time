# SLYNG

Sling sats and notes on nostr: https://slyng.yolopreneur.lol/

Aim at someone you follow, pull back for more, let go to send. Sats go as a zap (NIP-57) from your own wallet; the
note goes private and gift-wrapped (NIP-17). A yolo venture on [yolopreneur.lol](https://yolopreneur.lol/),
October 2026. The Y in the name is the slingshot.

## What it is

One static page, no backend, no dependencies. This folder is the site; `tests/` and `tools/` come along.

- `index.html`, `style.css`, `app.js`: the page. The slingshot fills the first screen; below it the story, how it
  works, the agent link, plans, the fine print.
- `sling.js`: the slingshot. The pull is a polar coordinate around the fork: its angle picks who on the fence, its
  length picks the amount on the ladder (a note, then 21, 100, 210, 1,000, 2,100, 5,000, 10,000, 21,000 sats). Mouse,
  touch and keyboard (arrows aim and stretch, Enter lets go). The geometry is exported for the tests.
- `lib/crypto.js`: SHA-256, HMAC, HKDF, secp256k1 (BIP-340 Schnorr and ECDH), ChaCha20, NIP-44 v2, and NIP-04 for
  wallets that still need it. Checked against the BIP-340 and NIP-44 test vectors.
- `lib/nostr.js`: bech32 and NIP-19, events, signers (a key in the page, or a NIP-07 extension), a relay pool that
  answers NIP-42 AUTH, NIP-05 lookups.
- `lib/zap.js`: lightning addresses, LNURL-pay, zap requests and receipts, and the check that an invoice is for exactly
  the amount pulled before anything is paid.
- `lib/wallet.js`: the sender's wallet, WebLN (a browser extension) or Nostr Wallet Connect (NIP-47).
- `lib/dm.js`: private notes, sealed and gift-wrapped (NIP-17, NIP-59).
- `skill.md`, `llms.txt`: for agents. An agent can aim (a link with `#to=…&sats=…&note=…`); only a person lets go.
- `fonts/`: Slyng Condensed and Slyng Text, cut from TeX Gyre Heros Condensed and TeX Gyre Adventor (GUST Font
  License; `fonts/MANIFEST-SLYNG.txt` says what changed).
- `tools/devnet.mjs`: a nostr network on localhost for the tests: a relay with optional AUTH, a lightning address
  server that publishes zap receipts, and a Nostr Wallet Connect wallet.
- `branding/`: the brand page, https://slyng.yolopreneur.lol/branding/ (see Brand, below).

## Brand

The logo is the name in Unbounded ExtraBold with the Y as the slingshot: a volt stone on the vertex of the Y, and the
band drawn up the inside of its arms to the tips, cut flush. Ink `#111014`, bone `#F1F0EC`, white, and volt
`#D9FF3D`. The app icon is the slingshot alone, white on ink with the band and stone in volt. `branding/` has the
files, the rules, the motion, and every draft from the six rounds that found it.

- `branding/index.html`, `branding/brand.css`: the page. No script, and its own Content-Security-Policy.
- `branding/img/`: every image on it, drawn from the fonts' own outlines by `tools/brand/make.py` (Python 3.10+,
  fontTools, Pillow, and Playwright's Chromium for the animations; the fonts come from google/fonts at a fixed commit,
  checked by sha256). `branding/img/MANIFEST` has each file's sha256.
- `tools/brand/`: one module per round of the work, kept as they were, so every draft comes out exactly as it was
  first drawn. `python3 tools/brand/make.py --stills` makes just the SVGs, in seconds.

The images are made files, like `shots/`, but the runner can't make them, so the branch carries only their
`MANIFEST`: `tools/build.sh` runs `tools/brand/restore.sh`, which fetches each one back from the live site and checks
it against `MANIFEST`. A refresh keeps the page whole, and refuses to land if anything doesn't match. To change the
images: run `python3 tools/brand/make.py`, commit the new `MANIFEST`, and land the folder with `tools/bundle.sh` and
the seed workflow.

## Decisions

- **Static, no server, no Cloudflare costs.** The page talks to nostr relays and to recipients' lightning address
  servers from the browser. The Content-Security-Policy allows scripts, styles and fonts from the page only, and
  connections to `https:` and `wss:` (plus localhost, for the devnet).
- **Non-custodial.** Sats move from the sender's wallet to the recipient's; SLYNG never holds them. The invoice amount
  is read from the BOLT-11 prefix and must match the pull, or nothing is paid.
- **A sling lands whole or not at all.** With sats and a note, the wallet pays first and the note goes only if the
  payment did. The stone is in the air for 2.6 seconds, and catching it back cancels everything.
- **Zaps are public, notes are private.** The zap request carries no comment; the note travels separately, gift
  wrapped, to the recipient's NIP-17 inbox relays.
- **Demo first.** Until someone signs in, four made-up people stand on the fence and the sats are pretend; nothing
  leaves the page. Signing in is a nostr extension (preferred), a key made here, or a pasted nsec.
- **Verify everything.** Every event from a relay is checked (id and signature) before it's used, so a relay can't
  swap in someone else's lightning address.

## Run it

```sh
node --test tests/*.test.js              # vectors, notes, zaps, the slingshot, and the devnet flow
node tools/serve.mjs                     # in this folder, then open http://127.0.0.1:8000/
node tools/devnet.mjs --auth             # a local relay, lightning address server and wallet; prints test keys
python3 tests/smoke.py                   # Chromium (Playwright), desktop and phone: the demo, and a live sling via the devnet
tools/build.sh                           # the tests, branding/img from the live site, then shots/desktop.png and shots/og.png
python3 tools/brand/make.py              # every image on the brand page, from scratch, into branding/img/
```

To sling by hand against the devnet, open `http://127.0.0.1:8000/?relays=ws://127.0.0.1:<port>` and sign in with one
of the keys it printed (paste the `sk` as a secret key).

## Ship it

SLYNG lives where the yolo ventures live: `ventures/slyng/` on the gh-pages branch of teahubxyz/time, served at
https://slyng.yolopreneur.lol/. To ship a change, commit this folder as `ventures/slyng/` to a branch of
teahubxyz/time (say `venture/slyng`) and run Time's refresh workflow (Actions -> refresh) with slug `slyng` and from
`venture/slyng`. It runs `tools/build.sh` on the runner, lands the folder on gh-pages in one commit, and asks Teahub
pages to pull.

Or as a bundle: `tools/bundle.sh` makes `slyng.tgz` and its sha256 for the seed workflow, when the bundle can reach
the runner (a Boring blob download link).

## Next

- Three front doors: slyng.app (notes), slyng.money (sats), slyng.ing (the market), maybe slyng.my for listings
  (`slyng.my/oldbike`, with `?via=<npub>` on a repost so the sale splits to whoever brought the buyer).
- The market: stalls for local and digital goods, offers slung at a stall and countered, the deal desk as stall-keeper.
- Files: sling a file and the key to open it.
- Reach: for notes, a longer pull goes further (one person, a group, everyone).
- Remote signers (NIP-46). A Whop app.
