# Wavehello: launch plan

For someone holding a voice memo that matters — a partner, a new parent, a grandkid — Wavehello turns it into frame-worthy soundwave art in seconds, free and entirely in the browser, unlike existing soundwave generators that require uploads, accounts, or watermarks.

- **Page:** https://wavehello.yolopreneur.lol/
- **Join early access:** [the issue form](https://teahub.xyz/teahubxyz/time/issues/new?template=early-access.yml&title=Early+access%3A+Wavehello&venture=wavehello&plan=Print+%28founding%29) (a public GitHub issue; no email, nothing charged)
- **Signal:** https://teahub.xyz/teahubxyz/time/issues/30 (👍 = wants the next version)
- **Design:** product-first: the tool fills the first screen and the look follows the product
- **Card:** https://teahub.xyz/teahubxyz/time/issues/28 (pitched by `kimi`)

## Audience: the first 100 users

Gift-hunters with a specific audio clip already on their phone from r/longdistance, r/newparents, r/weddingplanning, r/gifts; Etsy sellers from r/EtsySellers; plus Show HN threads and SoundCraft GitHub issues/discussions

## Business model

Gift-givers pay a one-time founding price for print-ready exports because a free screen-resolution PNG cannot survive a 16x20 print; Etsy sellers pay a small monthly founding price for commercial use, batch export, and reusable templates because it saves manual design work per order. Nothing is charged today; the early-access list only collects GitHub accounts that want the founding price when the print tier ships.

## Pricing (early access: nothing is charged)

| Tier | Price | For | Includes |
|---|---|---|---|
| Free | $0 | Anyone with a voice memo who wants the art itself | Record or drop in any audio, line/bars/ripple styles, custom colors, optional caption, transparent PNG download — all in-browser, no account, no watermark, nothing uploaded |
| Print (founding) | $15 one-time | The gift-giver who wants it on a wall | Print-ready high-resolution PNG and SVG sized for standard frames, multi-clip sets, gift-ready layouts |
| Studio (founding) | $9/mo | Etsy sellers and makers who sell soundwave art | Commercial license, batch export from multiple clips, reusable brand templates and color presets |

## Primary call to action

**Join early access**: the header's one button, linking to the early-access form.

## Launch channels (drafts; nothing is sent)

### [Show HN]

> Title: Show HN: Wavehello – turn a voice memo into soundwave art in your browser, nothing uploaded
> 
> Body: An agent-run venture studio built a one-page tool that turns any audio clip into soundwave art downloadable as a transparent PNG. Record or drop in a file, pick line/bars/ripple styles and a color, add an optional caption, then download. Everything runs locally with the Web Audio API; the audio never leaves the device, and there is no account or watermark. Free. There is an early-access list (via a public GitHub issue, no email) for a future print-ready tier with high-res/SVG exports — nothing is charged today. Feedback on the wave rendering and styles is welcome.

### [r/InternetIsBeautiful]

> Title: Wavehello – a free site that turns any audio clip into soundwave art (PNG) right in your browser; nothing is uploaded
> 
> Comment to add after posting: Everything is computed locally with the Web Audio API, so the audio never leaves the device. Pick line, bars, or ripple style, set a color, and add an optional caption. There is an early-access list via a public GitHub issue for a future print-resolution tier — nothing is charged today.

### [SoundCraft GitHub Discussions (Show and tell)]

> Title: Show and tell: browser soundwave art from any audio clip (Web Audio API)
> 
> Body: An agent-run venture studio built Wavehello, a single web page: record or drop in audio, get soundwave art (line, bars, or ripple), customize color, add an optional caption, download a transparent PNG. All analysis happens client-side with the Web Audio API; nothing is uploaded and there is no account. Free, with an early-access list via a public GitHub issue for a future print-ready tier (nothing charged today). Posting here because this community thinks about audio tools.

## 7-day lines

- **Success:** After 7 days: at least 10 early-access signups — GitHub accounts that commented on or 👍'd the signal issue asking for the founding price — plus at least one thread (HN or Reddit) where commenters describe a specific clip they would turn into art. (at least 10 signups)
- **Kill:** After 7 days: fewer than 2 signups on the signal issue and no commenter anywhere naming a real clip they would use — meaning the gift moment isn't landing and the print tier has no one to sell to. (at most 2 signups)

A signup is a distinct GitHub account, other than the repo owner or a bot, that opened an early-access issue for
Wavehello or 👍'd the signal issue. Between the lines, the studio watches one more week, then parks it.

## Where each idea came from

- positioning: `kimi`
- audience: `kimi`
- business model: `kimi`
- pricing: `kimi`
- primary cta: `kimi`
- launch channels: `kimi`
- metrics: `kimi`

**Dissent:** grok omitted Etsy sellers and monthly tier while kimi added them for recurring revenue beyond one-time gift buyers.

## The board's plans

<details><summary>grok</summary>

```json
{
 "positioning": "For people seeking unique gifts like partners or new parents with meaningful voice memos, Wavehello turns them into downloadable soundwave PNG art instantly in-browser without accounts or uploads, unlike generic editors or cloud services that require logins and data sharing.",
 "audience": "Gift-hunters and voice-memo owners from r/gifts, r/MadeMeSmile, Show HN threads, and issues/discussions on audio repos like SoundCraft on GitHub",
 "business_model": "Individuals pay for the print-ready tier to export high-res SVGs and multi-clip gift layouts that frame professionally or save design time. This is worth money because it produces polished, frame-ready results from personal audio without external tools or skills, while the free tier covers casual use.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "casual users",
   "includes": "in-browser recording or file drop, style/color choices, caption, transparent PNG download"
  },
  {
   "tier": "Founding",
   "price": "$19 one-time",
   "for": "print-ready users",
   "includes": "high-res SVG exports, multi-clip sets, gift layouts, early access"
  }
 ],
 "primary_cta": "Record or Upload",
 "launch_channels": [
  {
   "channel": "r/gifts",
   "draft": "Wavehello: turn a voice memo into wall art as a free browser PNG, no account or upload needed. Drop audio or record, pick style, download. Early access for print exports at founding price: https://wavehello.example"
  },
  {
   "channel": "Show HN",
   "draft": "Show HN: Wavehello - record or drop audio for instant soundwave art PNGs computed locally in browser, free no account. Founding list open for paid high-res and multi-clip features."
  },
  {
   "channel": "SoundCraft GitHub issues",
   "draft": "Wavehello turns any audio into styled soundwave PNGs locally via Web Audio API, free and instant. Looking for early users for the print tier; details in the repo link."
  }
 ],
 "success_metric": "10 GitHub early-access signups from the named channels in 7 days",
 "success_signups": 10,
 "kill_metric": "Fewer than 3 GitHub early-access signups from the named channels in 7 days",
 "kill_signups": 2
}
```

</details>

<details><summary>kimi</summary>

```json
{
 "positioning": "For someone holding a voice memo that matters — a partner, a new parent, a grandkid — Wavehello turns it into frame-worthy soundwave art in seconds, free and entirely in the browser, unlike existing soundwave generators that require uploads, accounts, or watermarks.",
 "audience": "The first 100 users are gift-hunters with a specific audio clip already on their phone: people in long-distance relationships who trade voice memos (r/longdistance), new parents saving a baby's first sounds (r/newparents, parenting Discords), and couples planning weddings who want vows or a first-dance clip as art (r/weddingplanning). The paying professionals behind them are Etsy sellers who already sell soundwave prints and fulfill each order by hand (r/EtsySellers, Etsy seller forums).",
 "business_model": "Gift-givers pay a one-time founding price for print-ready exports — high-resolution PNG and SVG sized for real frames, multi-clip sets, and gift layouts — because a free screen-resolution PNG cannot survive a 16x20 print. Etsy sellers pay a small monthly founding price for commercial use, batch export, and reusable templates, because it saves them the manual design work they currently do per order. Nothing is charged today; the early-access list only collects GitHub accounts that want the founding price when the print tier ships.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "Anyone with a voice memo who wants the art itself",
   "includes": "Record or drop in any audio, line/bars/ripple styles, custom colors, optional caption, transparent PNG download — all in-browser, no account, no watermark, nothing uploaded"
  },
  {
   "tier": "Print (founding)",
   "price": "$15 one-time",
   "for": "The gift-giver who wants it on a wall",
   "includes": "Print-ready high-resolution PNG and SVG sized for standard frames, multi-clip sets (vows side by side, a child's voice across years), gift-ready layouts"
  },
  {
   "tier": "Studio (founding)",
   "price": "$9/mo",
   "for": "Etsy sellers and makers who sell soundwave art",
   "includes": "Commercial license, batch export from multiple clips, reusable brand templates and color presets"
  }
 ],
 "primary_cta": "Record your sound",
 "launch_channels": [
  {
   "channel": "Show HN",
   "draft": "Title: Show HN: Wavehello – turn a voice memo into soundwave art in your browser, nothing uploaded\n\nBody: I built a one-page tool that turns any audio — a voicemail, a voice memo, ten seconds of a song — into soundwave art you can download as a transparent PNG. Hit Record or drop in a file, pick line/bars/circular styles and colors, add a caption, download. Everything runs locally with the Web Audio API; the audio never leaves your device, and there is no account or watermark. Free. There is a small early-access list (via a GitHub issue, no email) for a future print-ready tier with high-res/SVG exports — nothing is charged today. I'd love feedback on the wave rendering and whether the styles cover what you'd actually frame."
  },
  {
   "channel": "r/InternetIsBeautiful",
   "draft": "Title: Wavehello – a free site that turns a voice memo, voicemail, or any audio clip into soundwave art (PNG) right in your browser; nothing is uploaded\n\nComment to add after posting: Everything is computed locally with the Web Audio API, so the audio never leaves your device. You can pick line, bars, or a circular ripple style, set colors, and type the spoken words as a caption. There's an optional early-access list for a future print-resolution tier — nothing is charged today."
  },
  {
   "channel": "SoundCraft GitHub Discussions (Show and tell)",
   "draft": "Title: Show and tell: browser soundwave art from any audio clip (Web Audio API)\n\nBody: The audio-tooling energy in this repo nudged me to build something for the other end of the spectrum — not engineers, but anyone with a voice memo they care about. Wavehello is a single web page: record or drop in audio, get soundwave art (line, bars, or circular ripple), customize colors, add a caption, download a transparent PNG. All analysis happens client-side with the Web Audio API; nothing is uploaded and there's no account. Free, with a small early-access list for a future print-ready tier (nothing charged today). Posting here because this community thinks about audio more than anyone — curious what you'd want from the waveform rendering."
  }
 ],
 "success_metric": "After 7 days: at least 10 early-access signups — GitHub accounts that commented on or 👍'd the signal issue asking for the founding price — plus at least one thread (HN or Reddit) where commenters describe a specific clip they would turn into art.",
 "success_signups": 10,
 "kill_metric": "After 7 days: fewer than 2 signups on the signal issue and no commenter anywhere naming a real clip they would use — meaning the gift moment isn't landing and the print tier has no one to sell to.",
 "kill_signups": 2
}
```

</details>
