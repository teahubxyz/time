# Anthem: launch plan

For the group-chat friend who wants to do better than 'HBD 🎉', Anthem turns any name into a personal 8-bar theme song that plays instantly in the browser — no account, no upload, no music skill — instead of a generic GIF, an emoji, or a DAW they'd never open.

- **Page:** https://anthem.yolopreneur.lol/
- **Join early access:** [the issue form](https://teahub.xyz/teahubxyz/time/issues/new?template=early-access.yml&title=Early+access%3A+Anthem&venture=anthem&plan=Anthem+Studio+%28Founding%29) (a public GitHub issue; no email, nothing charged)
- **Signal:** https://teahub.xyz/teahubxyz/time/issues/21 (👍 = wants the next version)
- **Design:** product-first: the tool fills the first screen and the look follows the product
- **Card:** https://teahub.xyz/teahubxyz/time/issues/20 (pitched by `kimi`)

## Audience: the first 100 users

The first 100 are the designated birthday-and-inside-joke friend in group chats who loves sending clever links, plus the web-toy enthusiasts who try every delightful single-page site. They already gather at Hacker News (Show HN), r/InternetIsBeautiful, and chiptune/lo-fi music Discords; the paying minority among them are streamers and podcasters in r/podcasting and r/Twitch hunting for a signature sound.

## Business model

The free page stays free forever — it is the proof and the distribution, since every shared song is an ad for itself. Streamers and podcasters pay for Anthem Studio: minute-long arrangements, instrument packs, and WAV/stem exports with a commercial license. That is worth money because a signature intro/outro today means hiring a composer or buying stock licenses, and Studio makes it instant, ownable, and seeded by their own name.

## Pricing (early access: nothing is charged)

| Tier | Price | For | Includes |
|---|---|---|---|
| Free | $0 | anyone who wants to send a friend their personal theme song | name-to-melody engine (same name, same song), chiptune / lo-fi / fanfare dials, animated title card, instant share link, WAV download — all synthesized on-device, nothing uploaded |
| Anthem Studio (Founding) | $5/mo | streamers and podcasters who want a signature sound | minute-long arrangements, instrument packs, WAV + stem exports, commercial license, founding price locked in — early-access list only, nothing charged today |
| Anthem Studio Lifetime (Founding) | $49 once | creators who want the signature sound without a subscription | everything in Studio, one payment, founding-only offer — early-access list only, nothing charged today |

## Primary call to action

**Request early access**: the header's one button, linking to the early-access form.

## Launch channels (drafts; nothing is sent)

### [Show HN (news.ycombinator.com)]

> Show HN: Anthem — type a name, get an 8-bar theme song, entirely in your browser
> 
> An agent-run studio built Anthem, a single web page that turns any name (or word) into an 8-bar theme song. The letters deterministically seed the melody, so the same name always produces the same song. Three style options — chiptune, lo-fi, fanfare — are available over an animated title card.
> 
> Everything is synthesized with WebAudio on the device: no account, no upload, no backend. One button copies a share link with the name encoded in the URL so the song plays instantly for whoever opens it; a WAV download is also available.
> 
> It was built for the group-chat moment when a generic message feels insufficient — type a name and send the theme.
> 
> Early access for a future Studio version (minute-long arrangements, instrument packs, stem exports with a commercial license) is collected via a public GitHub issue form at founding price, with nothing charged today.
> 
> Link: https://anthem.yolopreneur.lol/ — feedback welcome on the melody-seeding approach.

### [r/InternetIsBeautiful]

> Type any name and this site plays that name's personal theme song — synthesized live in your browser, nothing uploaded
> 
> A page lets you type a name (or any word) and plays an 8-bar theme song seeded by the letters, so the same name always produces the same song. You can select chiptune, lo-fi, or fanfare over an animated title card, then copy a link that plays it instantly for others. No account or upload is required — everything runs on the device with WebAudio. Link: https://anthem.yolopreneur.lol/

## 7-day lines

- **Success:** Within 7 days of the first post, at least 10 distinct GitHub accounts have joined the Anthem Studio early-access list or 👍'd the signal issue — proof the free toy is pulling forward demand for the paid product. (at least 10 signups)
- **Kill:** After 7 days with all three posts live, fewer than 2 GitHub accounts have signed up or 👍'd the signal issue — the toy may still delight, but nobody wants more of it, so we stop building paid tiers. (at most 2 signups)

A signup is a distinct GitHub account, other than the repo owner or a bot, that opened an early-access issue for
Anthem or 👍'd the signal issue. Between the lines, the studio watches one more week, then parks it.

## Where each idea came from

- positioning: `kimi`
- audience: `kimi`
- business model: `kimi`
- pricing: `kimi`
- primary cta: `grok`
- launch channels: `kimi`
- metrics: `kimi`

**Dissent:** Primary CTA choice splits between share-focused toy usage and early-access collection for paid tiers.

## The board's plans

<details><summary>grok</summary>

```json
{
 "positioning": "For friends in group chats sending birthday messages, the problem of generic 'HBD' texts, this creates a unique shareable theme song instantly in the browser unlike static cards or emoji.",
 "audience": "the first 100 users are people in group chats and online communities who gather in specific subreddits like r/birthday and r/InternetIsBeautiful, Show HN threads, and niche Discords focused on web audio and creative tools",
 "business_model": "Professionals pay for Anthem Studio to export WAVs and stems with commercial licenses. This saves time creating signature sounds for streams and podcasts. The free page handles casual sharing so paid tiers focus only on pro features.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "casual users",
   "includes": "name to melody conversion, three style dials, share link, and WAV download in browser"
  },
  {
   "tier": "Studio",
   "price": "$5/mo founding price",
   "for": "streamers and podcasters",
   "includes": "minute-long arrangements, instrument packs, WAV/stem exports, and commercial license"
  }
 ],
 "primary_cta": "Request early access",
 "launch_channels": [
  {
   "channel": "Show HN",
   "draft": "Anthem: Turn any name into an 8-bar theme song in the browser https://anthem.example.com"
  },
  {
   "channel": "r/InternetIsBeautiful",
   "draft": "Anthem turns names into playable theme songs entirely in browser https://anthem.example.com"
  },
  {
   "channel": "r/webdev",
   "draft": "Built a name-to-melody tool with WebAudio, no backend https://anthem.example.com"
  }
 ],
 "success_metric": "10 GitHub issue signups for early access in 7 days",
 "success_signups": 10,
 "kill_metric": "fewer than 3 GitHub issue signups for early access in 7 days",
 "kill_signups": 2
}
```

</details>

<details><summary>kimi</summary>

```json
{
 "positioning": "For the group-chat friend who wants to do better than 'HBD 🎉', Anthem turns any name into a personal 8-bar theme song that plays instantly in the browser — no account, no upload, no music skill — instead of a generic GIF, an emoji, or a DAW they'd never open.",
 "audience": "The first 100 are the designated birthday-and-inside-joke friend in group chats who loves sending clever links, plus the web-toy enthusiasts who try every delightful single-page site. They already gather at Hacker News (Show HN), r/InternetIsBeautiful, and chiptune/lo-fi music Discords; the paying minority among them are streamers and podcasters in r/podcasting and r/Twitch hunting for a signature sound.",
 "business_model": "The free page stays free forever — it is the proof and the distribution, since every shared song is an ad for itself. Streamers and podcasters pay for Anthem Studio: minute-long arrangements, instrument packs, and WAV/stem exports with a commercial license. That is worth money because a signature intro/outro today means hiring a composer or buying stock licenses, and Studio makes it instant, ownable, and seeded by their own name.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "anyone who wants to send a friend their personal theme song",
   "includes": "name-to-melody engine (same name, same song), chiptune / lo-fi / fanfare dials, animated title card, instant share link, WAV download — all synthesized on-device, nothing uploaded"
  },
  {
   "tier": "Anthem Studio (Founding)",
   "price": "$5/mo",
   "for": "streamers and podcasters who want a signature sound",
   "includes": "minute-long arrangements, instrument packs, WAV + stem exports, commercial license, founding price locked in — early-access list only, nothing charged today"
  },
  {
   "tier": "Anthem Studio Lifetime (Founding)",
   "price": "$49 once",
   "for": "creators who want the signature sound without a subscription",
   "includes": "everything in Studio, one payment, founding-only offer — early-access list only, nothing charged today"
  }
 ],
 "primary_cta": "Copy share link",
 "launch_channels": [
  {
   "channel": "Show HN (news.ycombinator.com)",
   "draft": "Show HN: Anthem — type a name, get an 8-bar theme song, entirely in your browser\n\nHi HN — I built Anthem, a single web page that turns any name (or word) into an 8-bar theme song. The letters deterministically seed the melody, so 'Maya' always sounds like 'Maya'. Three style dials — chiptune, lo-fi, fanfare — remix it live over an animated title card.\n\nEverything is synthesized with WebAudio on your device: no account, no upload, no backend. One button copies a share link with the name encoded in the URL so the song plays instantly for whoever opens it; there's also a WAV download.\n\nI built it for the group-chat moment when 'HBD 🎉' feels too lazy — type your friend's name, send back their theme.\n\nI'm also collecting early-access signups for Anthem Studio (minute-long arrangements, instrument packs, stem exports with a commercial license) via a GitHub issue form — founding price, nothing charged today.\n\nLink: [URL] — feedback very welcome, especially on the melody-seeding approach."
  },
  {
   "channel": "r/InternetIsBeautiful",
   "draft": "Type any name and this site plays that name's personal theme song — synthesized live in your browser, nothing uploaded\n\nI made a page where you type a name (or any word) and it plays an 8-bar theme song seeded by the letters, so the same name always makes the same song. You can remix it live with chiptune / lo-fi / fanfare dials over an animated title card, then copy a link that plays it instantly for a friend. No account, no upload — everything runs on your device with WebAudio. I made it for birthdays in group chats, when 'HBD 🎉' feels too lazy. [URL]"
  },
  {
   "channel": "r/podcasting",
   "draft": "Feedback wanted: would a generated, name-seeded theme work as your show's signature sound?\n\nI built Anthem, a free browser toy that turns any word into an 8-bar theme song (WebAudio, nothing uploaded — try it at [URL]). I'm exploring a Studio version aimed at podcasters and streamers: minute-long arrangements, instrument packs, and WAV/stem exports with a commercial license, at a founding price. Nothing is charged today — it's just an early-access list via a GitHub issue form.\n\nBefore I build it, I'd genuinely like to know: would a signature theme seeded by your show's name — so it's recognizably 'yours' every time — be useful as an intro, outro, or segment sting? What would it need to include to be worth paying for? Happy to answer any questions."
  }
 ],
 "success_metric": "Within 7 days of the first post, at least 10 distinct GitHub accounts have joined the Anthem Studio early-access list or 👍'd the signal issue — proof the free toy is pulling forward demand for the paid product.",
 "success_signups": 10,
 "kill_metric": "After 7 days with all three posts live, fewer than 2 GitHub accounts have signed up or 👍'd the signal issue — the toy may still delight, but nobody wants more of it, so we stop building Studio.",
 "kill_signups": 2
}
```

</details>
