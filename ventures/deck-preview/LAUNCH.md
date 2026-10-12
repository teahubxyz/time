# DeckPreview: launch plan

For a product manager rewriting investor slides the night before a board meeting on a locked-down laptop, DeckPreview turns a pasted outline into an editable, exportable slide deck entirely in the browser — no install, no account, no upload — instead of fighting PowerPoint templates or waiting on a Google Slides login.

- **Page:** https://teahubxyz.github.io/time/ventures/deck-preview/
- **Join early access:** [the issue form](https://github.com/teahubxyz/time/issues/new?template=early-access.yml&title=Early+access%3A+DeckPreview&venture=deck-preview&plan=Pro) (a public GitHub issue; no email, nothing charged)
- **Signal:** https://github.com/teahubxyz/time/issues/16 (👍 = wants the next version)
- **Design:** product-first: the tool fills the first screen and the look follows the product
- **Card:** https://github.com/teahubxyz/time/issues/15 (pitched by `grok`)

## Audience: the first 100 users

The first 100 users are PMs and technical founders already watching the storytold clean-room office suite: the issues and discussions of storytold/deckcraft and its sibling repos wordcraft, gridcraft, and cadcraft; readers of r/productmanagement and r/startups; Show HN browsers; and members of PM communities like the Lenny's Newsletter Slack/Discord and Product School's community channels.

## Business model

The free page stays free forever and is the proof. Individual PMs and consultants pay a founding price for branded template packs and scheduled auto-export to PDF, because it saves them hours of reformatting and makes them look polished in front of investors and execs. Teams pay for shared slide libraries so every deck matches the brand without a designer.

## Pricing (early access: nothing is charged)

| Tier | Price | For | Includes |
|---|---|---|---|
| Free | $0 | a PM who needs a deck tonight on any machine | Paste a markdown-style outline, get live HTML/CSS slides; drag-reorder, color themes, simple text animations; export a self-contained HTML file or print to PDF. No sign-up, nothing uploaded. |
| Pro | $5/mo founding price | PMs and consultants who present every week | One-click branded template packs, saved brand presets, scheduled auto-export to PDF. |
| Team | $15/mo founding price | small product teams that share decks | Team-shared slide libraries, shared brand kits, everything in Pro. |

## Primary call to action

**Get early access**: the hero's one button, linking to the early-access form.

## Launch channels (drafts; nothing is sent)

### GitHub Discussions on storytold/deckcraft (cross-posted to wordcraft/gridcraft/c

> Title: DeckPreview — paste an outline, get editable slides in the browser (no install, no upload)
> 
> I built a free, single-page companion to the deckcraft idea: paste a markdown-style outline and it renders a live slide deck with HTML/CSS, entirely client-side. You can drag-reorder slides, change colors, and add simple text animations, then export a self-contained HTML file or print to PDF via the browser. No sign-up, nothing leaves your machine.
> 
> There is an early-access list (a GitHub issue form — no email collected, nothing charged today) for a paid version with branded template packs, scheduled PDF export, and team slide libraries. Link: [URL]. Feedback and feature requests welcome here or in the issue tracker.

### Show HN

> Show HN: DeckPreview – paste an outline, get editable slides in your browser
> 
> A free single web page: paste a markdown-style outline and it instantly renders a slide deck with HTML/CSS, all client-side. Drag to reorder slides, change colors, add simple text animations, then export a self-contained HTML file or print to PDF. No sign-up, no upload — nothing leaves the browser.
> 
> Built for the night-before-the-board-meeting slide rewrite on a laptop where you can't install anything. There's an early-access list (GitHub issue form, no email, nothing charged today) for a paid tier with branded template packs, scheduled PDF export, and team slide libraries. [URL]

### r/productmanagement

> Title: Free tool: paste an outline, get an editable slide deck in the browser (no install, no sign-up)
> 
> DeckPreview is a free single web page: paste a markdown-style outline and it renders a live deck in HTML/CSS. Drag-reorder slides, tweak colors, add simple text animations, export a self-contained HTML file or print to PDF. Everything runs client-side — no account, nothing uploaded, works on a locked-down work laptop.
> 
> Aimed at the investor-deck-rewrite-the-night-before problem. There's an early-access list (GitHub issue form, no email collected, nothing charged today) for a paid version with branded template packs, scheduled PDF export, and team slide libraries. [URL] Happy to answer questions.

## 7-day lines

- **Success:** After 7 days: at least 10 GitHub accounts have requested early access via the issue form or 👍'd the signal issue, and at least one launch post has substantive comments about the paid features. (at least 10 signups)
- **Kill:** After 7 days: fewer than 2 early-access signups and no substantive comments on any launch post — the pain isn't sharp enough; stop work on the paid tier. (at most 2 signups)

A signup is a distinct GitHub account, other than the repo owner or a bot, that opened an early-access issue for
DeckPreview or 👍'd the signal issue. Between the lines, the studio watches one more week, then parks it.

## Where each idea came from

- positioning: `kimi`
- audience: `kimi`
- business model: `kimi`
- pricing: `kimi`
- primary cta: `kimi`
- launch channels: `kimi`
- metrics: `kimi`

## The board's plans

<details><summary>grok</summary>

```json
{
 "positioning": "For a product manager rewriting investor slides the night before a board meeting who needs zero-install edits, DeckPreview renders a live editable HTML slide deck from a pasted outline in the browser, unlike PowerPoint or Google Slides that require accounts, installs, or cloud sync.",
 "audience": "product managers and slide creators already gathering in r/productmanagement, r/startups, Show HN threads, and GitHub issues/discussions on trending repos like storytold/deckcraft and similar clean-room office tools",
 "business_model": "Professionals pay for features that save time on branding, automation, and team sharing once the free core is proven useful. The free page handles creation, editing, and basic export with no sign-up. Paid tiers add one-click templates, scheduled PDF exports, and shared libraries that reduce repetitive work for teams.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "individual slide creation and edits",
   "includes": "paste outline, live HTML/CSS rendering, drag-reorder, color changes, text animations, self-contained HTML or PDF export"
  },
  {
   "tier": "Pro",
   "price": "$5/mo",
   "for": "professionals and small teams",
   "includes": "branded template packs, scheduled auto-export to PDF, team-shared slide libraries"
  }
 ],
 "primary_cta": "Request Early Access",
 "launch_channels": [
  {
   "channel": "r/productmanagement",
   "draft": "DeckPreview: paste a markdown-style outline and get browser-native editable slides with drag-reorder and export. Free page works with no sign-up or upload. Feedback welcome via the GitHub issue form linked in the page."
  },
  {
   "channel": "Show HN",
   "draft": "DeckPreview: one web page that turns a pasted outline into tweakable HTML slides you can reorder, style, and export as self-contained file or PDF. No accounts or installs. Early access via GitHub issue form on the page."
  }
 ],
 "success_metric": "10 GitHub accounts requesting early access via issue form",
 "success_signups": 10,
 "kill_metric": "fewer than 3 GitHub accounts requesting early access via issue form",
 "kill_signups": 2
}
```

</details>

<details><summary>kimi</summary>

```json
{
 "positioning": "For a product manager rewriting investor slides the night before a board meeting on a locked-down laptop, DeckPreview turns a pasted outline into an editable, exportable slide deck entirely in the browser — no install, no account, no upload — instead of fighting PowerPoint templates or waiting on a Google Slides login.",
 "audience": "The first 100 users are PMs and technical founders already watching the storytold clean-room office suite: the issues and discussions of storytold/deckcraft and its sibling repos wordcraft, gridcraft, and cadcraft; readers of r/productmanagement and r/startups; Show HN browsers; and members of PM communities like the Lenny's Newsletter Slack/Discord and Product School's community channels.",
 "business_model": "The free page stays free forever and is the proof. Individual PMs and consultants pay a founding price for branded template packs and scheduled auto-export to PDF, because it saves them hours of reformatting and makes them look polished in front of investors and execs. Teams pay for shared slide libraries so every deck matches the brand without a designer.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "a PM who needs a deck tonight on any machine",
   "includes": "Paste a markdown-style outline, get live HTML/CSS slides; drag-reorder, color themes, simple text animations; export a self-contained HTML file or print to PDF. No sign-up, nothing uploaded."
  },
  {
   "tier": "Pro",
   "price": "$5/mo founding price (nothing charged today)",
   "for": "PMs and consultants who present every week",
   "includes": "One-click branded template packs, saved brand presets, scheduled auto-export to PDF."
  },
  {
   "tier": "Team",
   "price": "$15/mo founding price (nothing charged today)",
   "for": "small product teams that share decks",
   "includes": "Team-shared slide libraries, shared brand kits, everything in Pro."
  }
 ],
 "primary_cta": "Get early access",
 "launch_channels": [
  {
   "channel": "GitHub Discussions on storytold/deckcraft (cross-posted to wordcraft/gridcraft/cadcraft where relevant)",
   "draft": "Title: DeckPreview — paste an outline, get editable slides in the browser (no install, no upload)\n\nI built a free, single-page companion to the deckcraft idea: paste a markdown-style outline and it renders a live slide deck with HTML/CSS, entirely client-side. You can drag-reorder slides, change colors, and add simple text animations, then export a self-contained HTML file or print to PDF via the browser. No sign-up, nothing leaves your machine.\n\nThere is an early-access list (a GitHub issue form — no email collected, nothing charged today) for a paid version with branded template packs, scheduled PDF export, and team slide libraries. Link: [URL]. Feedback and feature requests welcome here or in the issue tracker."
  },
  {
   "channel": "Show HN",
   "draft": "Show HN: DeckPreview – paste an outline, get editable slides in your browser\n\nA free single web page: paste a markdown-style outline and it instantly renders a slide deck with HTML/CSS, all client-side. Drag to reorder slides, change colors, add simple text animations, then export a self-contained HTML file or print to PDF. No sign-up, no upload — nothing leaves the browser.\n\nBuilt for the night-before-the-board-meeting slide rewrite on a laptop where you can't install anything. There's an early-access list (GitHub issue form, no email, nothing charged today) for a paid tier with branded template packs, scheduled PDF export, and team slide libraries. [URL]"
  },
  {
   "channel": "r/productmanagement",
   "draft": "Title: Free tool: paste an outline, get an editable slide deck in the browser (no install, no sign-up)\n\nDeckPreview is a free single web page: paste a markdown-style outline and it renders a live deck in HTML/CSS. Drag-reorder slides, tweak colors, add simple text animations, export a self-contained HTML file or print to PDF. Everything runs client-side — no account, nothing uploaded, works on a locked-down work laptop.\n\nAimed at the investor-deck-rewrite-the-night-before problem. There's an early-access list (GitHub issue form, no email collected, nothing charged today) for a paid version with branded template packs, scheduled PDF export, and team slide libraries. [URL] Happy to answer questions."
  }
 ],
 "success_metric": "After 7 days: at least 10 GitHub accounts have requested early access via the issue form or 👍'd the signal issue, and at least one launch post has substantive comments about the paid features.",
 "success_signups": 10,
 "kill_metric": "After 7 days: fewer than 2 early-access signups and no substantive comments on any launch post — the pain isn't sharp enough; stop work on the paid tier.",
 "kill_signups": 2
}
```

</details>
