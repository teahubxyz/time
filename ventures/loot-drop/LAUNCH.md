# Loot Drop: launch plan

For the friend in a gaming group chat who wants to crown a buddy's battered office chair 'The Throne of Endless Standups' before the joke goes cold, Loot Drop makes a convincing ARPG-style item tooltip from any name in under a minute, with seeded stats, pixel art from your photo and a link that drops it in a beam of light, so there is no fiddling with an image editor or meme template.

- **Page:** https://loot-drop.yolopreneur.lol/
- **Join early access:** [the issue form](https://teahub.xyz/teahubxyz/time/issues/new?template=early-access.yml&title=Early+access%3A+Loot+Drop&venture=loot-drop&plan=Guild+Vault+%28early+access%29) (a public issue on Teahub; no email, nothing charged)
- **Signal:** https://teahub.xyz/teahubxyz/time/issues/153 (👍 = wants the next version)
- **Design:** product-first: the tool fills the first screen and the look follows the product
- **Card:** https://teahub.xyz/teahubxyz/time/issues/148 (pitched by `opus`)

## Audience: the first 100 users

The first 100 are people who already joke in loot-tooltip language: players reminiscing about Diablo II on r/diablo2 and r/Diablo, the r/pathofexile and r/ARPG crowds who argue affixes for fun, developers starring the D2R and game-port repos this week (d2r-mobile, uncharted_pc, BRUTAL) who browse their Discussions, and Show HN readers who like small, local-only browser toys. Later, team leads and community managers who run kudos channels on Slack and Discord are the people who would pay.

## Business model

The free page is the complete product for individuals and no feature it has today will ever be paywalled. Team leads and community managers pay for Guild Vault, a team plan that turns Loot Drop into a recurring recognition ritual: custom affix packs written around their team's in-jokes, extra tooltip styles, a saved collection page for the team, and a Slack/Discord bot that hands out a weekly legendary for kudos and birthdays. It is worth money to them because it makes recognition fun and shareable with no weekly effort and makes the person running the channel look good. Nothing is charged today; the founding price is reserved for the early-access list.

## Pricing (early access: nothing is charged)

| Tier | Price | For | Includes |
|---|---|---|---|
| Free | $0 | Anyone who wants to crown an everyday object in a group chat | Unlimited items at all five rarities (normal, magic, rare, set, unique), seeded affixes and flavor text from local word lists (same name always rolls the same item), optional photo pixelated into item |
| Guild Vault (early access) | $6/mo per team, founding price locked fo | Team leads, community managers and Discord mods who run kudos, shout-outs or birthdays on a schedule | Custom affix and flavor-text packs for your team's in-jokes, extra tooltip styles, a saved collection page per team, and a Slack/Discord bot that awards a weekly legendary item for kudos and birthdays |

## Primary call to action

**Join early-access list**: the header's one button, linking to the early-access form.

## Launch channels (drafts; nothing is sent)

### Show HN (news.ycombinator.com)

> Show HN: Loot Drop – turn any everyday object into an ARPG item tooltip
> 
> Type a name like "my dad's grill" and pick a rarity, and you get a loot tooltip with affixes and flavor text. The generator is seeded from the name, so the same item always rolls the same stats. You can add a photo, which is pixelated into item art in a canvas in your browser. Nothing is uploaded. Export a transparent PNG, or copy a link that stores the whole card in the URL hash. Whoever opens the link sees the item drop with a light beam.
> 
> No account, no server-side storage. I'm considering a paid team version with custom affix packs and a Slack/Discord kudos bot. Nothing is charged, and there's an early-access issue form on Teahub if that sounds useful: [page link]. I'd welcome feedback on the word lists and on how the seeding feels.

### r/diablo2 (also r/ARPG, following each sub's self-promotion rules; post as a fre

> I made a free browser toy that rolls loot tooltips for real-life objects
> 
> Type anything, like your coworker's lucky mug or the office chair that's survived three reorgs, and pick normal, magic, rare, set or unique. You get a tooltip with affixes like '+3 to Passive-Aggressive Emails' and a line of flavor text. The same name always rolls the same stats, so you can't reroll your friend's chair into something better. You can drop in a photo to get pixel item art. It stays in your browser. Share it as a PNG, or as a link that drops the item with a beam of light.
> 
> This is a fan-made style homage. It doesn't use any game assets. Link: [page]. I'd love suggestions for affixes to add to the word lists. Post your worst desk object in the comments.

### Discussions tab of the trending d2r-mobile repo (only in a Show-and-tell categor

> Show and tell: a small side project inspired by the D2R nostalgia this week. Loot Drop generates an ARPG-style item tooltip for any everyday object, seeded from the name. It works fully in the browser, with no uploads, and exports a PNG or a share link that plays the item drop. It's not affiliated with this project or with Blizzard, and it uses no game assets. If you try it, tell me what looks wrong with the tooltip layout. If mods consider this off-topic, I'm happy to remove it. Link: [page]

## 7-day lines

- **Success:** Within 7 days of launch, at least 15 distinct Teahub accounts have asked for Guild Vault early access through the issue form or 👍'd the signal issue, counted as accounts rather than pageviews, and at least one reply in a launch thread asks about team or bot features. That shows team-recognition dema (at least 15 signups)
- **Kill:** After 7 days, 3 or fewer Teahub accounts have asked for early access or 👍'd the signal issue despite posting in all the named channels, meaning the free card did not earn a reason to follow up; the studio stops investment, does not build Guild Vault, and keeps only the free page. (at most 3 signups)

A signup is a distinct Teahub account, other than the repo owner, a seat or a bot, that opened an early-access issue for
Loot Drop or 👍'd the signal issue. Between the lines, the studio watches one more week, then parks it.

## Where each idea came from

- positioning: `opus`
- audience: `opus`
- business model: `opus`
- pricing: `sonnet`
- primary cta: `haiku`
- launch channels: `opus`
- metrics: `opus`

**Dissent:** opus wanted the primary CTA to be 'Roll your item' (let the free toy sell itself and measure the list as a secondary signal) while haiku and sonnet lead with the early-access list, so the chair should decide whether the page optimizes for play or for Guild Vault signups.

## The board's plans

<details><summary>haiku</summary>

```json
{
 "positioning": "For the friend in a gaming group chat who wants to crown a buddy's battered office chair before the joke dies, Loot Drop turns any everyday object into a Diablo-style item card they can post as a PNG or link in seconds, which beats a meme or a screenshot because it looks like a real drop.",
 "audience": "The first 100 are people who already share Diablo II and ARPG jokes: commenters and Discussions participants on the d2r-mobile repo and the other trending game-port repos from this week, r/diablo2 and r/PathOfExileBuilds-style ARPG subreddits, Show HN readers who like small browser toys, and niche gaming Discords where people post loot screenshots.",
 "business_model": "Free stays a complete, single-page card maker for individuals. Teams pay for Guild Vault: custom affix packs, extra tooltip styles, a saved collection page per team, and a Slack/Discord bot that hands out a weekly legendary item for kudos and birthdays, which saves a team lead or community manager the effort of running recognition by hand. Nothing is charged today; founding prices are reserved for people on the early-access list.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "Anyone making a one-off joke item for a group chat",
   "includes": "Item name, optional photo pixelated into item art, rarity picker (normal to unique), seeded affixes and flavor text, transparent PNG export, and shareable link that drops the item with a beam and clink. No account needed."
  },
  {
   "tier": "Guild Vault",
   "price": "$6/mo per team (founding price)",
   "for": "Team leads and community managers who want recognition to recur",
   "includes": "Custom affix packs, extra tooltip styles, and a saved collection page per team. Founding price is locked for early-access list members. Not charged today."
  },
  {
   "tier": "Guild Vault + Bot",
   "price": "$12/mo per team (founding price)",
   "for": "Slack or Discord communities running weekly kudos and birthday awards",
   "includes": "Everything in Guild Vault plus the Slack/Discord bot that hands out a weekly legendary item for kudos and birthdays. Founding price is locked for early-access list members. Not charged today."
  }
 ],
 "primary_cta": "Join early-access list",
 "launch_channels": [
  {
   "channel": "Show HN (news.ycombinator.com)",
   "draft": "Show HN: Loot Drop – type the name of any everyday thing and get a Diablo-style item tooltip\n\nType an item name (e.g. \"the Throne of Endless Standups\", a battered office chair), optionally add a photo, pick a rarity, and get an ARPG-style card with affixes and flavor text. The same name always rolls the same stats because the generator is seeded from the name. Export a transparent PNG or copy a link that opens the item dropping with a light beam. Everything runs in the browser; photos are pixelated in a canvas and not uploaded.\n\nFree and works now. Paid team features (custom affix packs, a saved collection page, a Slack/Discord bot) are planned but nothing is charged yet. Early-access list is an issue form on Teahub: [page link]\n\nFeedback welcome, especially on the affix word lists."
  },
  {
   "channel": "d2r-mobile GitHub Discussions (github.com/d2r-mobile)",
   "draft": "Built a small browser tool inspired by Diablo II's loot tooltip, for making item cards out of everyday objects (type a name, pick a rarity, export a PNG). Not affiliated with this project, just a fan piece for the nostalgia. Free to use at [page link]. If anyone wants to try it and tell me what looks wrong with the tooltip layout, I'd appreciate it."
  },
  {
   "channel": "r/diablo2 (Reddit)",
   "draft": "Title: I made a thing that turns your office chair into a Diablo II-style unique\n\nType any everyday object, get a tooltip with rarity, affixes like \"+3 to Passive-Aggressive Emails\" and flavor text, then export a transparent PNG or share a link that drops it with a beam of light. Works in the browser, no upload. Free: [page link]. Early-access list (no charge yet) is on the same page. Post your worst desk object in the comments."
  }
 ],
 "success_metric": "After 7 days, at least 25 Teahub accounts have either asked for early access in the issue form or given a thumbs-up to the signal issue, and at least one reply in a launch thread asks about team or bot features.",
 "success_signups": 25,
 "kill_metric": "After 7 days, fewer than 3 Teahub accounts have asked for early access or thumbs-upped the signal issue, meaning the free card did not earn a reason to follow up; the studio stops investment and does not build Guild Vault.",
 "kill_signups": 3
}
```

</details>

<details><summary>sonnet</summary>

```json
{
 "positioning": "For the friend in a gaming group chat who wants to crown a buddy's battered office chair 'The Throne of Endless Standups' before the joke goes cold, Loot Drop turns any name into a Diablo-style item tooltip in seconds, with no signup and no upload, instead of a clumsy Photoshop mockup or a generic meme generator.",
 "audience": "The first 100 users are people who already post ARPG and Diablo jokes: members of Diablo II/D2R communities, Path of Exile players, and gaming-adjacent Discord and group-chat regulars. A smaller group is team leads and community managers who run kudos or birthday rituals in Slack or Discord and would want recurring awards. Places: r/diablo2, r/diablo, r/pathofexile, r/ProgrammerHumor, r/D2R, the d2r-mobile repo's Discussions (asked first, no spam), and Show HN.",
 "business_model": "The free page is the product for individuals: it makes the card, the PNG and the link, and it stays free. Paying customers are team leads and community managers who want to hand out awards on a schedule without making each one by hand. They would pay for custom affix packs, extra tooltip styles, a saved team collection page, and a Slack/Discord bot that posts a weekly legendary for kudos and birthdays, because it saves them time and makes their team's recognition look good.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "Anyone who wants to make and post a single joke item right now",
   "includes": "Name-seeded generator (same name always rolls the same item), all five rarities, local word lists, optional photo pixelated in-browser (never uploaded), transparent PNG export, shareable link with light beam and clink"
  },
  {
   "tier": "Guild Vault",
   "price": "Founding price $6/mo per team (early-access list only; nothing is charged today)",
   "for": "Team leads and community managers running a Slack or Discord with recurring kudos and birthdays",
   "includes": "Custom affix packs for your team's in-jokes, extra tooltip styles, a saved collection page per team, and a Slack/Discord bot that hands out a weekly legendary item"
  }
 ],
 "primary_cta": "Join Guild Vault list",
 "launch_channels": [
  {
   "channel": "r/diablo2 (check the self-promo rules first; post as a free tool)",
   "draft": "I made a free web page that turns any everyday thing into a Diablo II-style item tooltip. Type a name like 'Dad's Grill', pick a rarity, and it rolls affixes and flavor text. The same name always rolls the same stats. You can export a transparent PNG or copy a link that drops the item with a light beam and a clink. Photos are pixelated in your browser and never uploaded. Free, no signup. I'd love to know which affixes you want added. If you'd want a team version for Discord (weekly legendary for kudos and birthdays), there's an early-access list on the page. Nothing is charged today."
  },
  {
   "channel": "Show HN",
   "draft": "Show HN: Loot Drop – make an ARPG item tooltip out of any name, all client-side. You type a name (optionally add a photo) and pick a rarity. A generator seeded from the name writes affixes and flavor text from local word lists, so output is deterministic. The photo is pixelated into item art on a canvas and nothing leaves your browser. Export a transparent PNG or copy a URL whose hash encodes the whole card; opening it plays the drop animation. It's meant for group-chat jokes. I'm testing whether team leads would want a paid Slack/Discord version with a weekly legendary item, so there's an early-access list. Nothing is charged today. Feedback welcome on the word lists and tooltip styles."
  },
  {
   "channel": "d2r-mobile GitHub Discussions (only if Discussions are enabled and show-and-tell posts are welcome)",
   "draft": "Not a contribution, just a small fan project in the same nostalgia lane: Loot Drop makes a D2-style item tooltip from any name, such as a coworker's mug, and exports a PNG or a link with a light beam drop. It's free and runs entirely in the browser. If you try it, tell me which affixes feel wrong or missing. There's also an early-access list for a team version (Slack/Discord weekly legendary). Nothing is charged today."
  }
 ],
 "success_metric": "After 7 days, at least 10 people have joined the early-access list or 👍'd the signal issue on Teahub, counted as Teahub accounts rather than pageviews. At least some of them should come from the named channels above.",
 "success_signups": 10,
 "kill_metric": "After 7 days, fewer than 2 Teahub accounts have asked for early access or 👍'd the signal issue, despite posting in all the named channels. In that case, stop work on Guild Vault and keep only the free page.",
 "kill_signups": 2
}
```

</details>

<details><summary>opus</summary>

```json
{
 "positioning": "For the friend in a gaming group chat who wants to crown a buddy's battered office chair 'The Throne of Endless Standups' before the joke goes cold, Loot Drop makes a convincing ARPG-style item tooltip from any name in under a minute, with seeded stats, pixel art from your photo and a link that drops it in a beam of light, so there is no fiddling with an image editor or meme template.",
 "audience": "The first 100 are people who already joke in loot-tooltip language: players reminiscing about Diablo II on r/diablo2 and r/Diablo, the r/pathofexile and r/ARPG crowds who argue affixes for fun, developers starring the D2R and game-port repos this week (d2r-mobile, uncharted_pc, BRUTAL) who browse their Discussions, and Show HN readers who like small, local-only browser toys. Later, team leads and community managers who run kudos channels on Slack and Discord are the people who would pay.",
 "business_model": "Team leads and community managers pay for Guild Vault, a team plan that turns Loot Drop into a recurring recognition ritual: custom affix packs written around their team's in-jokes, extra tooltip styles, a saved collection page for the team, and a Slack/Discord bot that hands out a weekly legendary for kudos and birthdays. It is worth money to them because it makes recognition fun and shareable with no weekly effort, and it makes the person running the channel look good. The free page stays complete, and no feature it has today will ever be paywalled.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "Anyone who wants to crown an everyday object in a group chat",
   "includes": "Unlimited items at all five rarities (normal, magic, rare, set, unique), seeded affixes and flavor text from local word lists, photo pixelated into item art in your browser with nothing uploaded, transparent PNG export, and a shareable link that encodes the card in the URL hash and plays the drop with a light beam and clink"
  },
  {
   "tier": "Guild Vault (early access)",
   "price": "$8/mo per team, founding price; nothing is charged today, and joining the early-access list costs nothing",
   "for": "Team leads, community managers and Discord mods who run kudos, shout-outs or birthdays",
   "includes": "Custom affix and flavor-text packs for your team, extra tooltip styles, a saved collection page per team, and a Slack/Discord bot that awards a weekly legendary item for kudos and birthdays"
  }
 ],
 "primary_cta": "Roll your item",
 "launch_channels": [
  {
   "channel": "Show HN (news.ycombinator.com)",
   "draft": "Show HN: Loot Drop – turn any everyday object into an ARPG item tooltip\n\nType a name like \"my dad's grill\" and pick a rarity, and you get a loot tooltip with affixes and flavor text. The generator is seeded from the name, so the same item always rolls the same stats. You can add a photo, which is pixelated into item art in a canvas in your browser. Nothing is uploaded. Export a transparent PNG, or copy a link that stores the whole card in the URL hash. Whoever opens the link sees the item drop with a light beam.\n\nNo account, no server-side storage. I'm considering a paid team version with custom affix packs and a Slack/Discord kudos bot. Nothing is charged, and there's an early-access issue on Teahub if that sounds useful. I'd welcome feedback on the word lists and on how the seeding feels."
  },
  {
   "channel": "r/diablo2 (also r/ARPG, following each sub's self-promotion rules)",
   "draft": "I made a free browser toy that rolls loot tooltips for real-life objects\n\nType anything, like your coworker's lucky mug or the office chair that's survived three reorgs, and pick normal, magic, rare, set or unique. You get a tooltip with affixes like '+3 to Passive-Aggressive Emails' and a line of flavor text. The same name always rolls the same stats, so you can't reroll your friend's chair into something better. You can drop in a photo to get pixel item art. It stays in your browser. Share it as a PNG, or as a link that drops the item with a beam of light.\n\nThis is a fan-made style homage. It doesn't use any game assets. Link: [page]. I'd love suggestions for affixes to add to the word lists."
  },
  {
   "channel": "Discussions tab of the trending d2r-mobile repo (only in a Show-and-tell category if one exists; otherwise skip)",
   "draft": "Show and tell: a small side project inspired by the D2R nostalgia this week. Loot Drop generates an ARPG-style item tooltip for any everyday object, seeded from the name. It works fully in the browser, with no uploads, and exports a PNG or a share link that plays the item drop. It's not affiliated with this project or with Blizzard, and it uses no game assets. If mods consider this off-topic, I'm happy to remove it. Link: [page]"
  }
 ],
 "success_metric": "Within 7 days of launch, at least 15 distinct Teahub accounts have asked for Guild Vault early access through the issue form or 👍'd the signal issue. That shows team-recognition demand beyond one-off laughs.",
 "success_signups": 15,
 "kill_metric": "After 7 days, 3 or fewer distinct Teahub accounts have signed up or 👍'd the signal issue. If so, stop Guild Vault work and keep only the free page as-is.",
 "kill_signups": 3
}
```

</details>
