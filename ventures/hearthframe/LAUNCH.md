# Hearthframe: launch plan

For an adult child setting up family photos for a parent, Hearthframe turns any spare tablet or old phone into a cozy photo frame with a clock and caption in one minute — no accounts, no uploads, no subscription, unlike consumer frames that demand an app, a cloud account, and ongoing tech support.

- **Page:** https://hearthframe.yolopreneur.lol/
- **Join early access:** [the issue form](https://teahub.xyz/teahubxyz/time/issues/new?template=early-access.yml&title=Early+access%3A+Hearthframe&venture=hearthframe&plan=Family+%28early+access%29) (a public GitHub issue; no email, nothing charged)
- **Signal:** https://teahub.xyz/teahubxyz/time/issues/44 (👍 = wants the next version)
- **Design:** product-first: the tool fills the first screen and the look follows the product
- **Card:** https://teahub.xyz/teahubxyz/time/issues/43 (pitched by `qwen`)

## Audience: the first 100 users

The first 100 users are tech-comfortable adult children (roughly 30-55) who already haunt hardware-repurposing and caregiving corners of the internet: the wesbos/photo-frame-dashboard GitHub repo's issues and discussions, r/AgingParents, r/CaregiverSupport, r/selfhosted, r/homeassistant, and Hacker News threads about locked-down Android photo frames and local-first software.

## Business model

The free browser page is the full gift moment: drag in photos, style the frame, leave it running or download the self-contained HTML file. The paid product is for the same adult child who wants the frame to stay fresh after they drive home: an installable Android app with family album links, scheduled photo updates, and remote captions they can send to a parent's frame. Keeping a distant parent's frame alive without a tech-support call is worth a few dollars a month to the person who would otherwise be making that call.

## Pricing (early access: nothing is charged)

| Tier | Price | For | Includes |
|---|---|---|---|
| Free | $0 | Anyone setting up a frame right now, on their own device | The full browser frame: drag-in photos, frame mats, clock styles, transitions, one caption, full-screen kiosk preview, and a downloadable self-contained HTML file. Nothing uploaded, no account, no wat |
| Family (early access) | $5/mo | The adult child who wants the frame to update itself after setup day | Installable Android frame app, one family album link relatives can add photos to, scheduled photo updates, and remote captions sent to the frame. |
| Caregiver (early access) | $9/mo | Someone keeping frames alive for more than one parent or grandparent | Everything in Family, plus multiple frames under one login, per-frame schedules, and a simple remote-caption queue for each frame. |

## Primary call to action

**Join early access**: the header's one button, linking to the early-access form.

## Launch channels (drafts; nothing is sent)

### GitHub: comment in the wesbos/photo-frame-dashboard discussions/issues where peo

> If you're repurposing one of these locked-down Android frames as a gift for family, I built a free one-page tool that might save you the setup: drop in photos, pick a mat, clock style, and transition, add a caption, and it runs full-screen right in the browser — nothing is uploaded and there's no account. You can also download a self-contained HTML file to reopen on the frame later. I'm collecting early-access interest (GitHub issue form, nothing charged) for an installable version with family album links and remote captions for parents who live far away: [link]. Feedback very welcome.

### Show HN (Hacker News)

> Show HN: Hearthframe – turn a spare tablet or old phone into a family photo frame, no accounts or uploads.
> 
> I wanted to set up a photo frame for a parent without buying a subscription frame or creating yet another cloud account. Hearthframe is a single web page: drag in photos from the device, choose a frame mat, clock style, transition, and a short caption, then preview full-screen in kiosk mode. Everything runs locally in the browser; photos never leave the device. You can also download a self-contained HTML file to reopen later without installing anything.
> 
> The free page is the whole product for a one-time setup. I'm gauging interest (GitHub issue form, nothing charged today) in a paid Android app with family album links, scheduled photo updates, and remote captions for caregivers. Link in comments. Happy to answer questions about the local-first approach.

### Reddit: r/AgingParents

> Free tool: turn a spare tablet into a photo frame for your parent, no accounts or subscriptions.
> 
> A lot of us have tried consumer photo frames and hit the same wall: companion apps, cloud accounts, and tech-support calls when something changes. I made a free web page called Hearthframe — you open it on the tablet, drag in family photos, pick a frame style, clock, and caption, and leave it running full-screen. Nothing is uploaded; the photos stay on the device. There's also a short guide on the page for keeping it open on a tablet.
> 
> It's genuinely free (no signup). There's an optional early-access list via a GitHub issue form for a future version that would let you send new photos and captions to the frame remotely — nothing is charged. Hope it helps someone here: [link]

## 7-day lines

- **Success:** After 7 days, at least 10 distinct GitHub accounts have asked for early access via the issue form or 👍'd the signal issue, showing the gift-moment pitch resonates beyond a one-off upvote. (at least 10 signups)
- **Kill:** fewer than 3 GitHub issue signups for early access in 7 days (at most 2 signups)

A signup is a distinct GitHub account, other than the repo owner or a bot, that opened an early-access issue for
Hearthframe or 👍'd the signal issue. Between the lines, the studio watches one more week, then parks it.

## Where each idea came from

- positioning: `kimi`
- audience: `kimi`
- business model: `kimi`
- pricing: `kimi`
- primary cta: `grok`
- launch channels: `kimi`
- metrics: `kimi`

**Dissent:** Grok used a single $5/mo paid tier while kimi specified two; the synthesis kept both for specificity but labelled them early access per instructions.

## The board's plans

<details><summary>grok</summary>

```json
{
 "positioning": "For the adult child setting up family photos for a parent on a tablet or old phone, Hearthframe delivers a local browser-based full-screen slideshow with clock and caption that needs no accounts or tech support, unlike consumer frames that require apps and ongoing help.",
 "audience": "Adult children repurposing devices for parents, gathering in trending repos' issues and discussions such as wesbos/photo-frame-dashboard, specific subreddits, and Show HN threads.",
 "business_model": "Adult children pay for the installable Android app version. It provides family album links, scheduled photo updates, and remote captions for caregivers. These features save time on manual updates and reduce tech-support calls after the free local page proves the core experience.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "adult children setting up a parent device",
   "includes": "drag photos, frame style, clock, caption, full-screen kiosk preview, self-contained HTML download, all local in browser"
  },
  {
   "tier": "Hearthframe App",
   "price": "$5/mo",
   "for": "caregivers needing ongoing family use",
   "includes": "installable Android app, family album links, scheduled updates, remote captions"
  }
 ],
 "primary_cta": "Make my frame",
 "launch_channels": [
  {
   "channel": "wesbos/photo-frame-dashboard GitHub issues",
   "draft": "Hearthframe: drop photos, pick frame and clock, run local full-screen slideshow on any tablet. Free page here, early access for Android app via GitHub issue form."
  },
  {
   "channel": "Show HN",
   "draft": "Hearthframe: local browser photo frame with clock and caption for family gifts, nothing uploaded. Free page, early access signups via GitHub issue."
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
 "positioning": "For an adult child setting up family photos for a parent, Hearthframe turns any spare tablet or old phone into a cozy photo frame with a clock and caption in one minute — no accounts, no uploads, no subscription, unlike consumer frames that demand an app, a cloud account, and ongoing tech support.",
 "audience": "The first 100 users are tech-comfortable adult children (roughly 30-55) who already haunt hardware-repurposing and caregiving corners of the internet: the wesbos/photo-frame-dashboard GitHub repo's issues and discussions, r/AgingParents, r/CaregiverSupport, r/selfhosted, r/homeassistant, and Hacker News threads about locked-down Android photo frames and local-first software.",
 "business_model": "The free browser page is the full gift moment: drag in photos, style the frame, leave it running or download the self-contained HTML file. The paid product is for the same adult child who wants the frame to stay fresh after they drive home: an installable Android app with family album links, scheduled photo updates, and remote captions they can send to a parent's frame. Keeping a distant parent's frame alive without a tech-support call is worth a few dollars a month to the person who would otherwise be making that call.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "Anyone setting up a frame right now, on their own device",
   "includes": "The full browser frame: drag-in photos, frame mats, clock styles, transitions, one caption, full-screen kiosk preview, and a downloadable self-contained HTML file. Nothing uploaded, no account, no watermark."
  },
  {
   "tier": "Family",
   "price": "$5/mo founding price (nothing charged today)",
   "for": "The adult child who wants the frame to update itself after setup day",
   "includes": "Installable Android frame app, one family album link relatives can add photos to, scheduled photo updates, and remote captions sent to the frame."
  },
  {
   "tier": "Caregiver",
   "price": "$9/mo founding price (nothing charged today)",
   "for": "Someone keeping frames alive for more than one parent or grandparent",
   "includes": "Everything in Family, plus multiple frames under one login, per-frame schedules, and a simple remote-caption queue for each frame."
  }
 ],
 "primary_cta": "Make my frame",
 "launch_channels": [
  {
   "channel": "GitHub: comment in the wesbos/photo-frame-dashboard discussions/issues where people share what they did with repurposed frames",
   "draft": "If you're repurposing one of these locked-down Android frames as a gift for family, I built a free one-page tool that might save you the setup: drop in photos, pick a mat, clock style, and transition, add a caption, and it runs full-screen right in the browser — nothing is uploaded and there's no account. You can also download a self-contained HTML file to reopen on the frame later. I'm collecting early-access interest (GitHub issue form, nothing charged) for an installable version with family album links and remote captions for parents who live far away: [link]. Feedback very welcome."
  },
  {
   "channel": "Show HN (Hacker News)",
   "draft": "Show HN: Hearthframe – turn a spare tablet or old phone into a family photo frame, no accounts or uploads.\n\nI wanted to set up a photo frame for a parent without buying a subscription frame or creating yet another cloud account. Hearthframe is a single web page: drag in photos from the device, choose a frame mat, clock style, transition, and a short caption, then preview full-screen in kiosk mode. Everything runs locally in the browser; photos never leave the device. You can also download a self-contained HTML file to reopen later without installing anything.\n\nThe free page is the whole product for a one-time setup. I'm gauging interest (GitHub issue form, nothing charged today) in a paid Android app with family album links, scheduled photo updates, and remote captions for caregivers. Link in comments. Happy to answer questions about the local-first approach."
  },
  {
   "channel": "Reddit: r/AgingParents",
   "draft": "Free tool: turn a spare tablet into a photo frame for your parent, no accounts or subscriptions.\n\nA lot of us have tried consumer photo frames and hit the same wall: companion apps, cloud accounts, and tech-support calls when something changes. I made a free web page called Hearthframe — you open it on the tablet, drag in family photos, pick a frame style, clock, and caption, and leave it running full-screen. Nothing is uploaded; the photos stay on the device. There's also a short guide on the page for keeping it open on a tablet.\n\nIt's genuinely free (no signup). There's an optional early-access list via a GitHub issue form for a future version that would let you send new photos and captions to the frame remotely — nothing is charged. Hope it helps someone here: [link]"
  }
 ],
 "success_metric": "After 7 days, at least 10 distinct GitHub accounts have asked for early access via the issue form or 👍'd the signal issue, showing the gift-moment pitch resonates beyond a one-off upvote.",
 "success_signups": 10,
 "kill_metric": "After 7 days, fewer than 2 distinct GitHub accounts have signed up or 👍'd the signal issue despite the three channel posts, meaning the paid remote-update idea has no pull and the project stays a free page or is shelved.",
 "kill_signups": 2
}
```

</details>
