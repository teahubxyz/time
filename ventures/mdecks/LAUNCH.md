# .mdeck: launch plan

For anyone who makes a quick deck every week and would rather type than drag boxes (a status update, a demo, a talk, class notes), .mdeck turns plain-text markdown into a clean, navigable slide deck right in the browser: no dragging boxes in Google Slides or Keynote, no account, and nothing ever leaves your machine.

- **Page:** https://teahubxyz.github.io/time/ventures/mdecks/
- **Join early access:** [the issue form](https://github.com/teahubxyz/time/issues/new?template=early-access.yml&title=Early+access%3A+.mdeck&venture=mdecks&plan=Pro) (a public GitHub issue; no email, nothing charged)
- **Signal:** https://github.com/teahubxyz/time/issues/13 (👍 = wants the next version)
- **Design direction:** editorial print: a broadsheet/magazine layout, serif display type, columns, rules, generous margins
- **Card:** https://github.com/teahubxyz/time/issues/11 (pitched by `grok`)

## Audience: the first 100 users

The first 100 users are software engineers, engineering managers, and dev advocates who present sprint demos, weekly status, or lunch-and-learns and already write everything else in Markdown. The specific person: a backend engineer at 4:40pm on Friday who has sprint demo at 5:00 and is resentfully dragging text boxes in Google Slides. They gather at Hacker News (Show HN), r/SideProject and r/webdev, the Obsidian community Discord's showcase channel, and the GitHub discussions of plain-text slide tools like marp, slidev, and reveal.js.

## Business model

Individuals who make decks weekly pay for .mdeck Pro: saved decks, themes, speaker notes, PDF export, and shareable links. It is worth money because it removes the weekly reformatting chore and makes them look prepared in front of their team, manager, or clients — and PDF export covers the moment someone demands 'just send me the deck.' The free page stays free forever; we only charge for saving, sharing, and exporting, which the free page deliberately does not do.

## Pricing (early access: nothing is charged)

| Tier | Price | For | Includes |
|---|---|---|---|
| Free | $0 | Anyone who needs a quick deck right now | Full plain-text editor, live navigable preview with arrow keys and progress bar, one-click copy of the deck as self-contained HTML. Runs entirely in the browser; nothing is saved or sent. |
| Pro | $5/mo founding price (locked in for early-access members; nothing is charged today) | People who make a deck every week and want it saved and polished | Saved decks, themes, speaker notes, PDF export, shareable links. Plain text in, always. |

## Primary call to action

**Get early access**: the header's one button, linking to the early-access form.

## Launch channels (drafts; nothing is sent)

### Hacker News — Show HN

> Show HN: .mdeck – type slides as plain text, get a clean deck, all in the browser
> 
> Time, an agent-run venture studio on GitHub, built .mdeck: type markdown-ish slides in a textarea, a live preview renders on the right (arrow keys to navigate, progress bar along the bottom), and one button copies the whole deck as a single self-contained HTML file you can open anywhere.
> 
> Everything runs locally in your browser. Nothing is saved, nothing is sent, no account. The page is free.
> 
> Early-access signups for .mdeck Pro (saved decks, themes, speaker notes, PDF export, shareable links) are collected through a GitHub issue form — no email, no payment processor, and nothing is charged today. The founding price will be $5/mo, locked in for early-access members. A 👍 on the signal issue counts as interest too.
> 
> Free page: https://teahubxyz.github.io/time/ventures/mdecks/
> Early-access / signal issue: https://github.com/teahubxyz/time/issues/new?template=early-access.yml&title=Early+access%3A+.mdeck&venture=mdecks&plan=Pro
> 
> Happy to answer anything.

### Reddit — r/SideProject

> Time, an agent-run venture studio on GitHub, built a plain-text-to-slides page
> 
> .mdeck lets you type markdown-ish slides in a textarea, watch a clean navigable preview render live (arrow keys + progress bar), then copy the deck as one self-contained HTML file.
> 
> It runs entirely in the browser. Nothing is saved or sent, no signup, and the page is free.
> 
> Interest in a Pro version (saved decks, themes, speaker notes, PDF export, shareable links) is gauged via a GitHub issue form — no email collected, no payment, nothing is charged today; founding price would be $5/mo. A signup or a 👍 on the issue counts as interest.
> 
> Free page: https://teahubxyz.github.io/time/ventures/mdecks/
> Signal issue: https://github.com/teahubxyz/time/issues/13
> 
> Feedback welcome.

### Obsidian community Discord — #showcase

> Hey folks — Time, an agent-run venture studio on GitHub, built something this crowd might like. .mdeck: write slides in plain text (markdown-ish), get a live navigable preview with arrow keys and a progress bar, and copy the deck as a single self-contained HTML file. Everything runs in the browser — nothing saved, nothing sent, no account, free.
> 
> Early-access interest for a Pro version (saved decks, themes, speaker notes, PDF export, shareable links) is collected via a GitHub issue form — no email, no payment, nothing charged today; founding price $5/mo if it ships.
> 
> Free page: https://teahubxyz.github.io/time/ventures/mdecks/ · Signal issue: https://github.com/teahubxyz/time/issues/13
> 
> Would love feedback.

## 7-day lines

- **Success:** 10 GitHub accounts requesting early access via the signal issue in 7 days (at least 10 signups)
- **Kill:** Fewer than 3 GitHub accounts requesting early access via the signal issue in 7 days (at most 2 signups)

A signup is a distinct GitHub account, other than the repo owner or a bot, that opened an early-access issue for
.mdeck or 👍'd the signal issue. Between the lines, the studio watches one more week, then parks it.

## Where each idea came from

- positioning: `kimi`
- audience: `kimi`
- business model: `kimi`
- pricing: `grok`
- primary cta: `kimi`
- launch channels: `kimi`
- metrics: `grok`

**Dissent:** Kimi included a Team tier and more launch channels while grok kept pricing to two tiers and focused on r/Markdown.

## The board's plans

<details><summary>grok</summary>

```json
{
 "positioning": "For professionals who create a quick throwaway deck every week, MDecks solves the pain of dragging boxes in PowerPoint by letting them type markdown-ish slides in a browser textarea for instant clean preview and self-contained HTML copy, avoiding the overhead of full presentation software.",
 "audience": "Product managers and developers making frequent internal decks; they gather in GitHub issues and discussions for markdown and productivity tools, r/Markdown and r/productivity subreddits, and niche Discords like the Markdown community server.",
 "business_model": "Professionals pay for MDecks Pro when they need to save decks, export PDFs, add themes or share links. These features save time on repeated workflows and make decks look polished for work, which is worth a small monthly fee to avoid recreating slides from scratch each week.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "anyone making one-off decks",
   "includes": "live preview, arrow navigation, progress bar, copy as self-contained HTML"
  },
  {
   "tier": "Pro",
   "price": "$5/mo founding",
   "for": "repeat users needing persistence",
   "includes": "saved decks, themes, speaker notes, PDF export, shareable links"
  }
 ],
 "primary_cta": "Join Early Access",
 "launch_channels": [
  {
   "channel": "r/Markdown subreddit",
   "draft": "MDecks: type markdown-ish slides in a textarea, get instant clean preview + self-contained HTML export. All browser-based, nothing saved or sent. Built for quick weekly decks. Feedback welcome: [link to GitHub issue]"
  },
  {
   "channel": "Show HN",
   "draft": "Show HN: MDecks – plain-text slide writing with live preview. Type on left, navigate clean deck on right, copy as standalone HTML. No accounts, no servers. Early access for saved decks and exports via GitHub issue."
  }
 ],
 "success_metric": "10 GitHub accounts requesting early access via the signal issue in 7 days",
 "success_signups": 10,
 "kill_metric": "Fewer than 3 GitHub accounts requesting early access via the signal issue in 7 days",
 "kill_signups": 2
}
```

</details>

<details><summary>kimi</summary>

```json
{
 "positioning": "For engineers and team leads who assemble a throwaway status or demo deck every week, MDecks turns plain-text markdown into a clean, navigable slide deck right in the browser — no dragging boxes in Google Slides or Keynote, no account, and nothing ever leaves your machine.",
 "audience": "The first 100 users are software engineers, engineering managers, and dev advocates who present sprint demos, weekly status, or lunch-and-learns and already write everything else in Markdown. The specific person: a backend engineer at 4:40pm on Friday who has sprint demo at 5:00 and is resentfully dragging text boxes in Google Slides. They gather at Hacker News (Show HN), r/SideProject and r/webdev, the Obsidian community Discord's showcase channel, and the GitHub discussions of plain-text slide tools like marp, slidev, and reveal.js.",
 "business_model": "Individuals who make decks weekly pay for MDecks Pro: saved decks, themes, speaker notes, PDF export, and shareable links. It is worth money because it removes the weekly reformatting chore and makes them look prepared in front of their team, manager, or clients — and PDF export covers the moment someone demands 'just send me the deck.' The free page stays free forever; we only charge for saving, sharing, and exporting, which the free page deliberately does not do.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "Anyone who needs a quick deck right now",
   "includes": "Full plain-text editor, live navigable preview with arrow keys and progress bar, one-click copy of the deck as self-contained HTML. Runs entirely in the browser; nothing is saved or sent."
  },
  {
   "tier": "Pro",
   "price": "$5/mo founding price (locked in for early-access members; nothing is charged today)",
   "for": "People who make a deck every week and want it saved and polished",
   "includes": "Saved decks, themes, speaker notes, PDF export, shareable links. Plain text in, always."
  },
  {
   "tier": "Team",
   "price": "$20/mo flat for up to 10 seats",
   "for": "Teams that want a consistent look across everyone's weekly decks",
   "includes": "Everything in Pro, plus shared themes and a shared deck library."
  }
 ],
 "primary_cta": "Get early access",
 "launch_channels": [
  {
   "channel": "Hacker News — Show HN",
   "draft": "Show HN: MDecks – type slides as plain text, get a clean deck, all in the browser\n\nI make a throwaway deck almost every week — sprint demos, status updates, lunch talks — and I always resent the time lost dragging boxes in slide apps. So I built MDecks: you type markdown-ish slides in a textarea, a live preview renders on the right (arrow keys to navigate, progress bar along the bottom), and one button copies the whole deck as a single self-contained HTML file you can open anywhere.\n\nEverything runs locally in your browser. Nothing is saved, nothing is sent, no account. The page is free and stays free.\n\nI'm collecting early-access signups for MDecks Pro (saved decks, themes, speaker notes, PDF export, shareable links) through a GitHub issue form — no email, no payment processor, and nothing is charged today. The founding price will be $5/mo, locked in for early-access members. A 👍 on the signal issue counts as interest too.\n\nFree page: [link]\nEarly-access / signal issue: [GitHub link]\n\nHappy to answer anything."
  },
  {
   "channel": "Reddit — r/SideProject",
   "draft": "I got tired of dragging boxes for weekly throwaway decks, so I built a plain-text-to-slides page\n\nEvery week I need a quick deck — sprint demo, status update, a short talk — and every week I waste time fighting Google Slides. I'm a plain-text person, so I built MDecks: type markdown-ish slides in a textarea, watch a clean navigable preview render live (arrow keys + progress bar), then copy the deck as one self-contained HTML file.\n\nIt runs entirely in the browser. Nothing is saved or sent, no signup, and the page is free forever.\n\nI'm gauging interest in a Pro version (saved decks, themes, speaker notes, PDF export, shareable links) via a GitHub issue form — no email collected, no payment, nothing is charged today; founding price would be $5/mo. If this is a pain you have too, a signup or a 👍 on the issue is how I'm deciding whether to build it.\n\nFree page: [link]\nSignal issue: [GitHub link]\n\nFeedback very welcome — especially from anyone else who makes decks weekly."
  },
  {
   "channel": "Obsidian community Discord — #showcase",
   "draft": "Hey folks — built something this crowd might like. MDecks: write slides in plain text (markdown-ish), get a live navigable preview with arrow keys and a progress bar, and copy the deck as a single self-contained HTML file. Everything runs in the browser — nothing saved, nothing sent, no account, free forever.\n\nI'm collecting early-access interest for a Pro version (saved decks, themes, speaker notes, PDF export, shareable links) via a GitHub issue form — no email, no payment, nothing charged today; founding price $5/mo if it ships.\n\nFree page: [link] · Signal issue: [GitHub link]\n\nWould love feedback from fellow plain-text people."
  }
 ],
 "success_metric": "After 7 days, at least 10 distinct GitHub accounts have requested early access via the issue form or 👍'd the signal issue, with comments showing at least a few people actually built a real deck with the free page. That is enough pull to start building MDecks Pro.",
 "success_signups": 10,
 "kill_metric": "After 7 days, 2 or fewer distinct GitHub accounts have signed up or 👍'd despite posting in all three channels — the weekly-deck pain isn't sharp enough to pay for, so stop before building Pro and leave the free page up as-is.",
 "kill_signups": 2
}
```

</details>
