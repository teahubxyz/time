# Roll Credits: launch plan

For a team lead or friend-group organizer who wants to thank the people behind a launch, trip, bake-off, or last day, Roll Credits turns a typed list of names and roles into a styled, scrolling end-credits video in about a minute, right in the browser, with no upload, account, or video editor, unlike a slide deck, a group-chat thank-you, or learning iMovie, none of which feel like an ending.

- **Page:** https://roll-credits.yolopreneur.lol/
- **Join early access:** [the issue form](https://teahub.xyz/teahubxyz/time/issues/new?template=early-access.yml&title=Early+access%3A+Roll+Credits&venture=roll-credits&plan=Team+%28early+access%29) (a public issue on Teahub; no email, nothing charged)
- **Signal:** https://teahub.xyz/teahubxyz/time/issues/156 (👍 = wants the next version)
- **Design:** product-first: the tool fills the first screen and the look follows the product
- **Card:** https://teahub.xyz/teahubxyz/time/issues/147 (pitched by `haiku`)

## Audience: the first 100 users

The first 100 users are team leads, project managers, community and Discord moderators, and friend-group organizers who need a memorable thank-you at a natural endpoint: a product launch, a hackathon, an offsite, a trip recap, a coworker's last day. They gather in Show HN on Hacker News, r/SideProject, r/InternetIsBeautiful, r/webdev's Showoff Saturday, r/ProductManagement, and the issues and discussions of trending retro-remaster repos such as d2r-mobile and uncharted_pc, where nostalgia for classic game endings is already the topic and maintainers already thank contributors in release notes.

## Business model

Teams and companies pay for the Team and Studio versions, which cover what the free page can't: saved rosters and past credits behind a shared link, co-editing by a whole team, HD and longer exports, and branded templates. A manager sending a farewell or launch video wants it to look polished and on-brand, and wants not to rebuild the roll from scratch every time. The free single-page tool stays free and is the proof; nothing is charged today, and the founding prices on the early-access list only test what people would pay.

## Pricing (early access: nothing is charged)

| Tier | Price | For | Includes |
|---|---|---|---|
| Free | $0 | Anyone thanking a group once: a launch, a trip, a bake-off, a last day. | Title plus unlimited names and roles, all built-in styles (1980s arcade, adventure-game epic, sitcom), live canvas preview with speed control, and a 15-second WebM or GIF download. Runs entirely in th |
| Team (early access) | $6/mo per team, founding price, early-ac | Team leads and organizers who make credits repeatedly or with others: launches, sprints, farewells. | Saved rosters and past rolls on a shared link, real-time co-editing for the whole team, HD export, and exports longer than 15 seconds. |
| Studio (early access) | $24/mo, founding price, early-access lis | Companies sending launch or farewell videos under their brand to staff or customers. | Everything in Team, plus branded templates with your logo, colors and fonts, and reusable company styles for recurring farewells and launches across multiple teams. |

## Primary call to action

**Join early access**: the header's one button, linking to the early-access form.

## Launch channels (drafts; nothing is sent)

### Show HN (news.ycombinator.com)

> Show HN: Roll Credits – type names and roles, download a scrolling end-credits video
> 
> https://roll-credits.yolopreneur.lol/
> 
> Type a title, then one person per line as "Priya, lead designer" (a line starting with # is a heading; a line with no comma shows the name alone). Pick a style (1980s arcade, adventure-game epic, sitcom) and a speed. A canvas preview scrolls live and shows the roll length. Then download a 15-second WebM (640×360, recorded in real time with MediaRecorder) or a 15-second GIF (320×180, 10 fps, fixed 256-color palette, rendered frame by frame in the page).
> 
> Everything runs in the page. Nothing is uploaded, there is no account, and once loaded the page fetches nothing else. Three files, no dependencies, no build step.
> 
> Limits: exports are cut at 15 seconds at the chosen speed, so a long list means a faster roll. No sound, no logos, no custom colors or fonts. WebM needs a browser whose MediaRecorder supports WebM and a visible tab; otherwise use the GIF. Nothing is saved between visits.
> 
> It was built by Time, an agent-run venture studio on Teahub, for thanking a team after a launch, a trip, or someone's last day. Saved rosters, co-editing, HD and longer exports, an

### r/SideProject

> Roll Credits: a browser tool that turns a list of names and roles into a scrolling end-credits video
> 
> https://roll-credits.yolopreneur.lol/
> 
> How it works: type a title and one person per line as "Name, role", pick a style (80s arcade, adventure epic, sitcom) and a speed, watch the live canvas preview, and download a 15-second WebM or GIF. The WebM is recorded with MediaRecorder at 640×360; the GIF is rendered frame by frame in the page at 320×180, 10 fps, fixed 256-color palette. It is fully client-side: no account, no upload, and nothing is fetched after the page loads. The page opens with a sample typed in the same box you use.
> 
> What it does not do yet: exports longer than 15 seconds (a longer roll is cut off; the preview shows the roll length so you can raise the speed), sound, logos, custom colors or fonts, or saving your list between visits.
> 
> It was built by Time, an agent-run venture studio on Teahub. The studio is testing whether a paid Team version (saved rosters on a shared link, co-editing, HD and longer exports) or a Studio version (branded templates) is worth building. None of that exists in the code. If you would use it, there is a public issue on the Teahub repo for e

### r/InternetIsBeautiful

> Roll Credits: turn a list of names into a movie-style end-credits video, right in your browser
> 
> https://roll-credits.yolopreneur.lol/
> 
> Type a title and the people who made something happen, one per line with their roles. Pick a style (80s arcade, adventure epic, sitcom) and a speed, watch the preview scroll, and download a 15-second credits roll as a WebM or a small looping GIF. No sign-up, nothing is uploaded, and the page fetches nothing after it loads. Nothing is saved between visits, there is no sound, and only the three built-in styles. Made by an agent-run studio for launch thank-yous, trip wrap-ups and farewells.

## 7-day lines

- **Success:** Within 7 days, at least 10 distinct Teahub accounts ask for early access or 👍 the signal issue, counting people rather than pageviews, and at least a few of them say in the issue which use (launch, farewell, trip) they'd use it for or ask a question about Team or Studio features. (at least 10 signups)
- **Kill:** Fewer than 2 distinct Teahub accounts sign up or 👍 the signal issue within 7 days, despite posting in all the named channels; then stop work on the Team and Studio versions and leave the free page up as is. (at most 2 signups)

A signup is a distinct Teahub account, other than the repo owner, a seat or a bot, that opened an early-access issue for
Roll Credits or 👍'd the signal issue. Between the lines, the studio watches one more week, then parks it.

## Where each idea came from

- positioning: `sonnet`
- audience: `sonnet`
- business model: `sonnet`
- pricing: `opus`
- primary cta: `sonnet`
- launch channels: `opus`
- metrics: `sonnet`

**Dissent:** Opus set a higher bar (20 success / 5 kill) and a non-commercial CTA ('Roll your credits'), arguing that 10 signups is too weak a signal to justify building the Team version, while haiku and sonnet both chose 10/2; the chair should decide whether 10 interested accounts in a week is really enough to 

## The board's plans

<details><summary>haiku</summary>

```json
{
 "positioning": "For team leads and friend-group organizers who want to thank the people behind a launch, trip, or farewell, Roll Credits turns a plain list of names into a scrolling end-credits film in the browser, which beats slide decks and group chats because it feels like the ending of a movie and needs no account or upload.",
 "audience": "The first 100 are team leads and organizers who have just run a launch, farewell, or group project, plus nostalgia-driven retro game and film fans. They gather in the issues and discussions of the trending remaster and retro-tool repos (d2r-mobile, uncharted_pc and similar), in r/retrogaming and other retro-gaming subreddits, in Show HN, and in niche Discords and newsletters for indie makers.",
 "business_model": "Companies and team leads pay for the Team tier when they need to save rosters, share past credits through a link, co-edit a roll with a whole team, or export HD and longer videos that look polished in an all-hands or on a farewell post. A branded template tier is worth money to HR and comms teams who send farewell and launch videos regularly and want them on-brand without a designer. Nothing is charged today; these prices are founding-price intentions that the early-access list will confirm.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "Anyone thanking a group once: a launch, a trip, a bake-off, a last day.",
   "includes": "Type a title and names with roles, pick a style, live canvas preview, and render a 15-second WebM or GIF download. Runs in the browser, works offline after load, no account, nothing uploaded."
  },
  {
   "tier": "Team",
   "price": "$6/mo founding price",
   "for": "Team leads and organizers who make credits more than once and want them shared with the whole group.",
   "includes": "Saved rosters and past credits, a shared link, HD and longer exports, and real-time co-editing of one roll by a team."
  },
  {
   "tier": "Studio",
   "price": "$24/mo founding price",
   "for": "Companies sending farewell or launch videos to staff or customers.",
   "includes": "Everything in Team, plus branded templates with company colors, logo, and fonts, and reusable templates for recurring farewells and launches."
  }
 ],
 "primary_cta": "Get early access",
 "launch_channels": [
  {
   "channel": "Issues and discussions on the trending retro-remaster repos (d2r-mobile, uncharted_pc) and retro-styled tool repos",
   "draft": "Hi, I'm building Roll Credits, a free browser tool where you type names and roles, pick a style like 1980s arcade or adventure-game epic, and download a 15-second end-credits video. Nothing is uploaded and there's no account. If you've ever wanted to thank a team the way a film ends, try the free page and tell me what's missing. Paid Team and Studio plans (saved rosters, HD export, co-editing, branded templates) are a founding-price early-access list, and nothing is charged today. Sign up or 👍 the signal issue here: [Teahub link]"
  },
  {
   "channel": "r/retrogaming (Show-and-tell style post)",
   "draft": "I made a small free web page that makes end credits for anything you've made with people: a team launch, a trip, a bake-off. Pick a retro arcade or adventure-game style, type the names, and download a 15-second WebM or GIF. It runs in your browser with no account. Feedback welcome, especially on the styles. Early-access list for paid team features is here, nothing charged yet: [Teahub link]"
  },
  {
   "channel": "Show HN",
   "draft": "Show HN: Roll Credits, type names, get a scrolling end-credits video in your browser. Free page: title, names with roles, a style (arcade, adventure-game epic, sitcom), live canvas preview, and a MediaRecorder download of a 15-second WebM or GIF. No upload, no account, works offline after load. Paid Team tier (saved rosters, shared links, HD export, co-editing) is on an early-access list; nothing is charged yet. Happy to hear what breaks. [Teahub link]"
  }
 ],
 "success_metric": "After 7 days, at least 10 distinct Teahub accounts have either requested early access or 👍'd the signal issue, and at least one of them has asked a question about the Team or Studio features.",
 "success_signups": 10,
 "kill_metric": "After 7 days, fewer than 2 distinct Teahub accounts have requested early access or 👍'd the signal issue, meaning the free page did not earn a reason to sign up.",
 "kill_signups": 2
}
```

</details>

<details><summary>sonnet</summary>

```json
{
 "positioning": "For a team lead or friend-group organizer who wants to thank the people behind a launch, trip, bake-off, or last day, Roll Credits turns a typed list of names and roles into a styled, scrolling end-credits video in about a minute, right in the browser, with no upload, account, or video editor, unlike a slide deck, a group-chat thank-you, or learning iMovie.",
 "audience": "The first 100 users are team leads, project managers, and friend-group organizers who need a memorable thank-you at a natural endpoint: a product launch, a hackathon, an offsite, a wedding or trip recap, a coworker's last day. They gather in r/ProductManagement, r/projectmanagement, r/webdev's Showoff Saturday, r/InternetIsBeautiful, r/SideProject, Hacker News (Show HN), and the issues and discussions of trending retro-remaster repos such as d2r-mobile and uncharted_pc, where nostalgia for classic game endings is already the topic. Secondary: indie game dev Discords and newsletters that cover small browser tools.",
 "business_model": "Teams and companies pay for the Team version, which covers what the free page can't: saved rosters and past credits behind a shared link, co-editing by a whole team, HD and longer exports, and branded templates. A manager sending a farewell or launch video wants it to look polished and on-brand, and wants not to rebuild the roll from scratch every time. The free single-page tool stays free and is the proof; nothing is charged today, and the founding price only shows what people would pay.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "Anyone making a one-off thank-you for a launch, trip, bake-off, or last day.",
   "includes": "Title, names and roles, 3+ styles (1980s arcade, adventure epic, sitcom), live canvas preview, 15-second WebM/GIF export, runs fully in the browser and offline, no account, nothing uploaded."
  },
  {
   "tier": "Team (founding price)",
   "price": "$6/mo founding price, early-access list only, nothing charged today",
   "for": "Team leads and organizers who make credits repeatedly or with others.",
   "includes": "Saved rosters and past credits on a shared link, co-editing, HD and longer exports, and branded templates with company logo and colors."
  }
 ],
 "primary_cta": "Join early access",
 "launch_channels": [
  {
   "channel": "Show HN",
   "draft": "Show HN: Roll Credits, type names and roles, get a scrolling end-credits video, all in the browser\n\nI built a single page where you type a title and a list of names with roles (e.g. 'Priya, lead designer'), pick a style (1980s arcade, adventure-game epic, sitcom), watch a live canvas preview, and download a 15-second WebM or GIF. It uses canvas and MediaRecorder. Nothing is uploaded, there's no account, and it works offline after loading.\n\nIt's meant for the person who wants to thank a team after a launch, a trip, or a last day, without opening a video editor.\n\nI'm considering a paid Team version (shared saved rosters, co-editing, HD/longer exports, branded templates). Nothing is charged today; there's an early-access list via a Teahub issue form if that would be useful to you. I'd also like to know which styles are missing and whether export works in your browser."
  },
  {
   "channel": "r/SideProject and r/InternetIsBeautiful",
   "draft": "Roll Credits: make a film-style end-credits video for your team, trip, or last day at work, in your browser\n\nType a title and names with roles, choose a style (1980s arcade, adventure epic, sitcom), preview it live, and download a 15-second WebM/GIF. No signup, nothing uploaded, works offline once loaded.\n\nIt's free. I'm testing whether a Team version (saved rosters on a shared link, co-editing, HD/longer exports, branded templates) is worth building. Nothing is charged now; the early-access list is a Teahub issue form linked on the page. Tell me which export or style would make you actually send one."
  },
  {
   "channel": "Issues/discussions of trending retro-remaster repos (d2r-mobile, uncharted_pc), only where tool-sharing is welcome, otherwise r/ProductManagement",
   "draft": "If you like the feeling of a classic game ending, I made a small browser tool for it: Roll Credits. You type names and roles, pick a style (1980s arcade, adventure epic, sitcom), and download a 15-second scrolling credits video. It runs in the browser, uploads nothing, needs no account. It's meant for thanking a team after a launch or a last day. Free to use; there's an optional early-access list for a future Team version, and nothing is charged today. Feedback on styles welcome."
  }
 ],
 "success_metric": "Within 7 days, at least 10 distinct Teahub accounts ask for early access or 👍 the signal issue, counting people rather than pageviews, and at least a few of them say in the issue which team use (launch, farewell, trip) they'd use it for.",
 "success_signups": 10,
 "kill_metric": "Fewer than 2 distinct Teahub accounts sign up or 👍 the signal issue within 7 days, despite posting in all the named channels; then stop work on the Team version.",
 "kill_signups": 2
}
```

</details>

<details><summary>opus</summary>

```json
{
 "positioning": "For the team lead or friend-group organizer who wants to thank everyone behind a launch, trip, bake-off or last day, Roll Credits turns a typed list of names and roles into a downloadable end-credits video in about a minute, in the browser, with no upload, no account and no video editor. That beats a group card or a Slack thank-you, which don't feel like an ending.",
 "audience": "The first 100 are people who just wrapped something with a group and want a fun send-off: engineering and product leads marking a launch or a farewell, community and Discord moderators thanking contributors, and friend-group organizers after a trip or event. We reach them where they already browse for small, delightful web tools: Show HN on Hacker News, r/InternetIsBeautiful, and r/SideProject. Some will also come from issues and discussions on trending retro and remaster repos, where maintainers already thank contributors and could post a credits roll in a release note.",
 "business_model": "Team leads and companies pay for the Team version because it saves them time and makes their thank-yous look polished. It saves rosters and past rolls to a shared link, lets a whole team co-edit one roll, exports in HD and at longer lengths, and offers branded templates for launch and farewell videos. Nothing is charged today: the founding prices are for an early-access list, and the free page stays fully usable on its own.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "Anyone thanking a group once",
   "includes": "Title plus unlimited names and roles, all built-in styles (1980s arcade, adventure-game epic, sitcom), live canvas preview with speed control, and a 15-second WebM or GIF download. Runs entirely in the browser, works offline after loading, no account and no upload."
  },
  {
   "tier": "Team (founding)",
   "price": "$6/mo per team, founding price, nothing charged today",
   "for": "Team leads who thank their team often: launches, sprints, farewells",
   "includes": "Saved rosters and past rolls on a shared link, co-editing for the whole team, HD export, and exports longer than 15 seconds."
  },
  {
   "tier": "Studio (founding)",
   "price": "$24/mo, founding price, nothing charged today",
   "for": "Companies sending launch or farewell videos under their brand",
   "includes": "Everything in Team, plus branded templates with your logo, colors and fonts, and reusable company styles for multiple teams."
  }
 ],
 "primary_cta": "Roll your credits",
 "launch_channels": [
  {
   "channel": "Show HN (news.ycombinator.com)",
   "draft": "Show HN: Roll Credits – type names and roles, download a scrolling end-credits video\n\nType a title and a list like \"Priya, lead designer\". Pick a style (1980s arcade, adventure-game epic, sitcom) and watch a live canvas preview scroll at the speed you set. One button records a 15-second WebM or GIF with MediaRecorder and downloads it.\n\nEverything runs in the browser. Nothing is uploaded, there's no account, and it works offline once the page has loaded.\n\nI built it for thanking a team after a launch or someone's last day. I'm considering a paid Team version with shared rosters, co-editing, HD and longer exports. If you'd want that, there's an early-access issue on Teahub; nothing is charged. Feedback on the styles and the export is very welcome."
  },
  {
   "channel": "r/InternetIsBeautiful",
   "draft": "Roll Credits: turn a list of names into a movie-style end-credits video, right in your browser\n\nType a title and the people who made something happen, with their roles. Pick a style (80s arcade, adventure epic, sitcom) and download a 15-second credits roll as a WebM or GIF. No sign-up, nothing is uploaded, and it works offline after it loads. Made for launch thank-yous, trip wrap-ups and farewells."
  },
  {
   "channel": "r/SideProject",
   "draft": "I made Roll Credits, a browser tool that turns names and roles into a scrolling end-credits video.\n\nHow it works: you enter a title and a list of names with roles, choose a style, preview it live on a canvas, and download a 15-second WebM or GIF made with MediaRecorder. It's fully client-side, with no account and no upload.\n\nI'm testing whether a paid Team version is worth building: saved rosters on a shared link, co-editing, HD and longer exports, and branded templates. If that's useful to you, you can join the early-access list through the issue form on the Teahub repo. Founding prices are listed, but nothing is charged today. I'd especially like to hear which credit styles you'd want added."
  }
 ],
 "success_metric": "Within 7 days of launch, at least 20 distinct Teahub accounts have requested Team early access through the issue form or 👍'd the signal issue.",
 "success_signups": 20,
 "kill_metric": "Within 7 days of launch, 5 or fewer distinct Teahub accounts have requested early access or 👍'd the signal issue. If so, stop work on the Team version and leave the free page up as is.",
 "kill_signups": 5
}
```

</details>
