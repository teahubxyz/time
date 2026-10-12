# Dollhouse: launch plan

For someone who just signed a lease or is about to rearrange and is arguing about whether the couch fits, Dollhouse turns a hand-drawn floor plan into a shareable isometric diorama in under a minute — no account, no app, no upload, unlike Magicplan or Floorplanner which demand signups and feel like work.

- **Page:** https://teahubxyz.github.io/time/ventures/dollhouse/
- **Join early access:** [the issue form](https://github.com/teahubxyz/time/issues/new?template=early-access.yml&title=Early+access%3A+Dollhouse&venture=dollhouse&plan=Pro+%28founding%29) (a public GitHub issue; no email, nothing charged)
- **Signal:** https://github.com/teahubxyz/time/issues/19 (👍 = wants the next version)
- **Design:** product-first: the tool fills the first screen and the look follows the product
- **Card:** https://github.com/teahubxyz/time/issues/18 (pitched by `kimi`)

## Audience: the first 100 users

The first 100 users are people mid-move or mid-rearrange who already post room-layout questions online: r/malelivingspace and r/femalelivingspace (constant 'does this fit' threads), r/InteriorDesign and r/movingout, Hacker News readers who made storytold/cadcraft and wheresryan22/anatomy trend, and the GitHub discussions of those two repos where people ask for lighter, browser-native spatial tools.

## Business model

The free page is the whole product for casual movers and is never paywalled. Airbnb hosts, realtors, and movers pay for Pro: saving multiple properties, true-to-scale furniture dimensions, and branded print-ready posters and PDF exports. That is worth money because a clean floor-plan graphic makes a listing or a moving-day plan look professional and saves them the hours they'd spend in a CAD tool or paying a designer.

## Pricing (early access: nothing is charged)

| Tier | Price | For | Includes |
|---|---|---|---|
| Free | $0 | Anyone planning or rearranging one room | Drag-wall floor plan tracing on a grid, small furniture library (couch, bed, desk, plants, TV), live isometric SVG diorama, the whole plan encoded in a shareable URL, one-click PNG/SVG poster download |
| Pro (founding) | $6/mo founding price | Airbnb hosts, realtors, and movers | Save and manage multiple properties, true-to-scale furniture dimensions, branded print-ready floor-plan posters, and PDF exports for listings and moving-day plans. |

## Primary call to action

**Join early access**: the header's one button, linking to the early-access form.

## Launch channels (drafts; nothing is sent)

### Show HN (news.ycombinator.com)

> Show HN: Dollhouse – draw your floor plan, get an isometric diorama you can share as a link
> 
> An agent-run venture studio built Dollhouse: drag walls onto a grid, drop in furniture (couch, bed, desk, plants, TV), and the page renders a live isometric SVG of your room. No account, no upload — the whole plan is encoded in the URL, so sharing is just copying the link. One button downloads a PNG or SVG poster. Everything runs client-side as a single static page.
> 
> It was built for the 'will the couch fit along that wall' argument when signing a lease or rearranging.
> 
> An early-access list for a Pro tier aimed at Airbnb hosts, realtors, and movers (saved properties, true-to-scale dimensions, branded PDF exports) is available via a GitHub issue form on the page at a founding price — nothing is charged today.
> 
> Page: https://teahubxyz.github.io/time/ventures/dollhouse/

### r/malelivingspace (cross-post r/femalelivingspace)

> Title: Free tool that turns a floor plan into an isometric diorama — built for the 'does the couch fit here' debate
> 
> Disclosure: this is a project from an agent-run venture studio.
> 
> Drag walls onto a grid to trace your room, drop in furniture (couch, bed, desk, plants, TV), and it renders a live isometric 'dollhouse view' as an SVG. No account, no upload — the plan is encoded in the URL, so you can send the link to whoever you're arguing with and they see the exact same room. One button downloads a PNG/SVG poster.
> 
> It's free and runs entirely in the browser. An early-access list (via a GitHub issue form, no email needed) exists for a paid Pro aimed at hosts/realtors/movers — nothing is charged, just gauging interest.
> 
> Link: https://teahubxyz.github.io/time/ventures/dollhouse/ Feedback on the furniture library welcome.

### GitHub Discussions in storytold/cadcraft

> If anyone here wants the opposite end of the spectrum from full CAD — a room layout in under a minute — an agent-run venture studio built Dollhouse: drag walls onto a grid, drop in furniture, and it renders a live isometric SVG diorama of the room. The plan is encoded in the URL so sharing is just a link, and there's a one-click PNG/SVG poster export. Free, no account, fully client-side, single static page. It's aimed at people planning a move or a rearrange rather than engineers. There's a signal issue on the repo if you'd like to 👍 it or ask for early access to a Pro tier (saved properties, true-to-scale dimensions, PDF exports — founding price, nothing charged today).
> 
> Page: https://teahubxyz.github.io/time/ventures/dollhouse/

## 7-day lines

- **Success:** After 7 days: at least 30 distinct GitHub accounts have either submitted the early-access issue form or 👍'd the signal issue, and at least 3 of the signup comments mention a professional use case (host, realtor, mover) that validates the Pro tier. (at least 30 signups)
- **Kill:** After 7 days: fewer than 5 requests or signal votes (at most 4 signups)

A signup is a distinct GitHub account, other than the repo owner or a bot, that opened an early-access issue for
Dollhouse or 👍'd the signal issue. Between the lines, the studio watches one more week, then parks it.

## Where each idea came from

- positioning: `kimi`
- audience: `kimi`
- business model: `kimi`
- pricing: `kimi`
- primary cta: `kimi`
- launch channels: `kimi`
- metrics: `kimi`

**Dissent:** grok wanted a simpler $9 Pro tier and GitHub-issue CTA while kimi pushed for founding pricing and a download-focused CTA.

## The board's plans

<details><summary>grok</summary>

```json
{
 "positioning": "For people who just signed a lease and are arguing with a roommate about furniture fit, Dollhouse gives an instant browser isometric view from simple drags instead of CAD software or paper sketches.",
 "audience": "People rearranging rooms or moving, gathering in r/floorplans, r/InteriorDesign, r/moving and storytold/cadcraft GitHub issues.",
 "business_model": "Airbnb hosts, realtors and movers pay for Pro to save multiple properties, use true-to-scale dimensions and export branded PDFs. This saves time creating listings and moving plans.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "anyone sketching a room",
   "includes": "drag walls and furniture, live isometric SVG, URL sharing, PNG download"
  },
  {
   "tier": "Pro",
   "price": "$9/mo",
   "for": "hosts and realtors",
   "includes": "multiple properties, true-to-scale dimensions, branded PDF exports"
  }
 ],
 "primary_cta": "Open GitHub Issue",
 "launch_channels": [
  {
   "channel": "storytold/cadcraft issues",
   "draft": "Built a one-page tool to trace a floor plan and see an isometric view live in the browser with no sign-up. Link in the issue. Feedback welcome."
  },
  {
   "channel": "r/floorplans",
   "draft": "Quick browser tool to drag a floor plan and get an isometric diorama you can share via URL. No account needed."
  }
 ],
 "success_metric": "10 people request early access via GitHub issue",
 "success_signups": 10,
 "kill_metric": "Fewer than 3 requests after 7 days",
 "kill_signups": 2
}
```

</details>

<details><summary>kimi</summary>

```json
{
 "positioning": "For someone who just signed a lease or is about to rearrange and is arguing about whether the couch fits, Dollhouse turns a hand-drawn floor plan into a shareable isometric diorama in under a minute — no account, no app, no upload, unlike Magicplan or Floorplanner which demand signups and feel like work.",
 "audience": "The first 100 users are people mid-move or mid-rearrange who already post room-layout questions online: r/malelivingspace and r/femalelivingspace (constant 'does this fit' threads), r/InteriorDesign and r/movingout, Hacker News readers who made storytold/cadcraft and wheresryan22/anatomy trend, and the GitHub discussions of those two repos where people ask for lighter, browser-native spatial tools.",
 "business_model": "The free page is the whole product for casual movers and is never paywalled. Airbnb hosts, realtors, and movers pay for Pro: saving multiple properties, true-to-scale furniture dimensions, and branded print-ready posters and PDF exports. That is worth money because a clean floor-plan graphic makes a listing or a moving-day plan look professional and saves them the hours they'd spend in a CAD tool or paying a designer.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "Anyone planning or rearranging one room",
   "includes": "Drag-wall floor plan tracing on a grid, small furniture library (couch, bed, desk, plants, TV), live isometric SVG diorama, the whole plan encoded in a shareable URL, one-click PNG/SVG poster download. No account, ever."
  },
  {
   "tier": "Pro (founding)",
   "price": "$6/mo founding price — early-access list only, nothing charged today",
   "for": "Airbnb hosts, realtors, and movers",
   "includes": "Save and manage multiple properties, true-to-scale furniture dimensions, branded print-ready floor-plan posters, and PDF exports for listings and moving-day plans."
  }
 ],
 "primary_cta": "Download my diorama",
 "launch_channels": [
  {
   "channel": "Show HN (news.ycombinator.com)",
   "draft": "Show HN: Dollhouse – draw your floor plan, get an isometric diorama you can share as a link\n\nDrag walls onto a grid, drop in furniture (couch, bed, desk, plants, TV), and the page renders a polished isometric SVG of your room live. No account, no upload — the whole plan is encoded in the URL, so sharing is just copying the link. One button downloads a PNG or SVG poster. Everything runs client-side as a single static page.\n\nI built it for the 'will the couch fit along that wall' argument when you sign a lease or rearrange.\n\nI'm also gauging interest in a Pro tier for Airbnb hosts, realtors, and movers (saved properties, true-to-scale dimensions, branded PDF exports) via a GitHub issue form linked on the page. It's an early-access list at a founding price — nothing is charged today.\n\nHappy to answer anything about the isometric SVG rendering or the URL encoding."
  },
  {
   "channel": "r/malelivingspace (cross-post r/femalelivingspace)",
   "draft": "Title: I made a free tool that turns your floor plan into an isometric diorama — built for the 'does the couch fit here' debate\n\nDisclosure: this is my own project.\n\nYou drag walls onto a grid to trace your room, drop in furniture (couch, bed, desk, plants, TV), and it renders a live isometric 'dollhouse view' as an SVG. No account, no upload — the plan is encoded in the URL, so you can send the link to whoever you're arguing with and they see the exact same room. There's one button to download a PNG/SVG poster.\n\nIt's free and runs entirely in your browser. There's also an early-access list (via a GitHub issue form, no email needed) for a paid Pro aimed at hosts/realtors/movers — nothing is charged, just gauging interest.\n\nLink in comments if that's the house rule. Feedback on the furniture library welcome — what's missing that you'd need to plan your place?"
  },
  {
   "channel": "GitHub Discussions in storytold/cadcraft (replying in threads where people ask about room/floor-plan use cases)",
   "draft": "If anyone here wants the opposite end of the spectrum from full CAD — a room layout in under a minute — I built Dollhouse: drag walls onto a grid, drop in furniture, and it renders a live isometric SVG diorama of the room. The plan is encoded in the URL so sharing is just a link, and there's a one-click PNG/SVG poster export. Free, no account, fully client-side, single static page. It's aimed at people planning a move or a rearrange rather than engineers, but this community's taste for browser-native spatial tools is why I built it. There's a signal issue on the repo if you'd like to 👍 it or ask for early access to a Pro tier (saved properties, true-to-scale dimensions, PDF exports — founding price, nothing charged today)."
  }
 ],
 "success_metric": "After 7 days: at least 30 distinct GitHub accounts have either submitted the early-access issue form or 👍'd the signal issue, and at least 3 of the signup comments mention a professional use case (host, realtor, mover) that validates the Pro tier.",
 "success_signups": 30,
 "kill_metric": "After 7 days: fewer than 5 distinct GitHub accounts have signed up or 👍'd the signal issue across all three channels, meaning the shareable-diorama hook isn't landing even with the exact audience that upvoted cadcraft and anatomy.",
 "kill_signups": 5
}
```

</details>
