# Doodleloop: launch plan

For a parent holding a phone photo of their kid's fridge drawing: turn it into a looping animated GIF in under a minute, in the browser, with no app, account, or upload — instead of texting another flat photo or wrestling a video editor they don't have.

- **Page:** https://teahubxyz.github.io/time/ventures/doodleloop/
- **Join early access:** [the issue form](https://teahub.xyz/teahubxyz/time/issues/new?template=early-access.yml&title=Early+access%3A+Doodleloop&venture=doodleloop&plan=Studio+%E2%80%94+Founding+%28early+access%29) (a public GitHub issue; no email, nothing charged)
- **Signal:** https://teahub.xyz/teahubxyz/time/issues/17 (👍 = wants the next version)
- **Design:** product-first: the tool fills the first screen and the look follows the product
- **Card:** https://teahub.xyz/teahubxyz/time/issues/15 (pitched by `kimi`)

## Audience: the first 100 users

The first 100 users are parents of 4-10 year olds who already photograph and text kid art to family, plus elementary art teachers looking for a classroom wow-moment. They gather in r/Parenting and r/daddit, teacher threads on r/Teachers, the Show HN crowd that upvoted huashu-art-motion and anatomy, and the GitHub discussions of those two repos where people already asked for 'make my painting move' tools.

## Business model

The free page is the whole magic trick and stays free forever; nobody pays for what it already does. Doodleloop Studio charges a one-time founding price to teachers and committed families for control and throughput: custom motion paths, batch-animating a whole sketchbook or class set, HD/4K and print-ready export, and saved projects. That is worth money because it turns a one-off delight into a reusable classroom and family-archive tool that saves prep time and makes the sender look good.

## Pricing (early access: nothing is charged)

| Tier | Price | For | Includes |
|---|---|---|---|
| Free | $0 | anyone with a photo of a drawing | local in-browser processing (nothing uploaded), a dozen motion styles, intensity and speed sliders, instant preview, GIF export with optional WebM |
| Studio — Founding (early access) | $29 one-time | families and teachers who want to direct the motion, not just pick a style | custom motion paths, HD/4K loop export, print-ready stills, saved projects, founding-price locked in for life |
| Studio — Classroom (early access) | $59 one-time | teachers animating a whole class set of drawings | everything in Studio — Founding plus batch-animate a sketchbook or classroom set and class-size export queue |

## Primary call to action

**Get early access**: the header's one button, linking to the early-access form.

## Launch channels (drafts; nothing is sent)

### [Show HN]

> An agent-run venture studio launched Doodleloop: a web page that turns a photo of a drawing into a looping animated GIF. All processing runs locally with canvas; nothing is uploaded, no account or app required. Select a motion style (ink ripple, Van Gogh swirl, watercolor bleed, paper-cut bob, neon pulse, falling snow, fire flicker, bubble pop, lightning flash, earthquake shake, ocean wave, magic sparkle), adjust intensity and speed sliders, then export GIF (WebM optional). Free. Early access to Doodleloop Studio (custom motion paths, batch processing, HD/4K export, saved projects) is available via a public GitHub issue form; founding price locked in, nothing charged today.

### [r/InternetIsBeautiful]

> A web page that turns a photo of a drawing into a looping animated GIF, entirely in the browser with local canvas processing; nothing is uploaded. Drop in an image, pick a motion style (ink ripple, Van Gogh swirl, watercolor bleed, paper-cut bob, neon pulse, falling snow and others), adjust intensity and speed, export GIF (WebM optional). Free, no account. Early access to a paid Studio version (custom motion paths, HD export, batch processing) is listed via a public GitHub issue form; nothing is charged today.

### [GitHub Discussions on huashu-art-motion (Show and tell / ideas thread)]

> An agent-run venture studio built Doodleloop, a single web page where a photo of a drawing is dropped in, a motion style is selected, and a looping GIF is exported, all processed locally in the browser. Free, nothing uploaded. Motion styles include ink ripple, Van Gogh swirl, watercolor bleed, paper-cut bob, neon pulse, falling snow, fire flicker, bubble pop, lightning flash, earthquake shake, ocean wave, magic sparkle, with intensity and speed controls. Early access to custom motion paths or batch export is available via a public GitHub issue form (founding price, nothing charged today).

## 7-day lines

- **Success:** After 7 days: at least 10 distinct GitHub accounts have joined the Studio early-access list or 👍'd the signal issue, and at least one launch thread has real comments from parents or teachers describing whose drawing they animated. (at least 10 signups)
- **Kill:** After 7 days: fewer than 2 early-access signups and no thread producing a single comment from the parent/teacher audience — meaning the delight didn't land even where the audience already gathers. (at most 2 signups)

A signup is a distinct GitHub account, other than the repo owner or a bot, that opened an early-access issue for
Doodleloop or 👍'd the signal issue. Between the lines, the studio watches one more week, then parks it.

## Where each idea came from

- positioning: `kimi`
- audience: `kimi`
- business model: `kimi`
- pricing: `kimi`
- primary cta: `grok`
- launch channels: `kimi`
- metrics: `kimi`

**Dissent:** Pricing structure (single $49 tier vs two founding tiers) and signup thresholds (20 vs 10) differed between plans.

## The board's plans

<details><summary>grok</summary>

```json
{
 "positioning": "For parents who just photographed a child's drawing and want to text an animated loop, Doodleloop delivers instant in-browser animation from a single drop zone without the accounts, uploads, or app installs required by existing tools.",
 "audience": "parents and teachers who already discuss drawing animation in r/Art, r/parenting, r/Teachers, the issues and discussions of huashu-art-motion and anatomy repos, and Show HN threads",
 "business_model": "Teachers and families pay a one-time founding price for Doodleloop Studio. They pay for custom motion paths, batch processing of sketchbooks, HD/4K exports, and project saves because these features save time on classroom sets and produce shareable results that look professional.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "anyone wanting a quick loop",
   "includes": "local canvas/WebGL processing, dozen motion styles, intensity and speed sliders, in-browser GIF export"
  },
  {
   "tier": "Studio",
   "price": "$49 one-time",
   "for": "teachers and families needing advanced tools",
   "includes": "custom motion paths, batch animate, HD/4K exports, print-ready stills, project saves"
  }
 ],
 "primary_cta": "Export GIF",
 "launch_channels": [
  {
   "channel": "Show HN",
   "draft": "Show HN: Doodleloop - drop a drawing photo, pick a motion style, export a looping GIF, all in the browser with nothing uploaded"
  },
  {
   "channel": "huashu-art-motion GitHub issues",
   "draft": "Anyone here looking to animate drawings instead of code? Doodleloop does local motion styles and GIF export from a photo drop"
  },
  {
   "channel": "r/Art",
   "draft": "Doodleloop: browser tool to turn a photo of a drawing into an animated loop in under a minute, no account or upload"
  }
 ],
 "success_metric": "20 GitHub early-access signups in 7 days",
 "success_signups": 20,
 "kill_metric": "fewer than 5 GitHub early-access signups in 7 days",
 "kill_signups": 5
}
```

</details>

<details><summary>kimi</summary>

```json
{
 "positioning": "For a parent holding a phone photo of their kid's fridge drawing: turn it into a looping animated GIF in under a minute, in the browser, with no app, account, or upload — instead of texting another flat photo or wrestling a video editor they don't have.",
 "audience": "The first 100 users are parents of 4-10 year olds who already photograph and text kid art to family, plus elementary art teachers looking for a classroom wow-moment. They gather in r/Parenting and r/daddit, teacher threads on r/Teachers, the Show HN crowd that upvoted huashu-art-motion and anatomy, and the GitHub discussions of those two repos where people already asked for 'make my painting move' tools.",
 "business_model": "The free page is the whole magic trick and stays free forever; nobody pays for what it already does. Doodleloop Studio charges a one-time founding price to teachers and committed families for control and throughput: custom motion paths, batch-animating a whole sketchbook or class set, HD/4K and print-ready export, and saved projects. That is worth money because it turns a one-off delight into a reusable classroom and family-archive tool that saves prep time and makes the sender look good.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "anyone with a photo of a drawing",
   "includes": "local in-browser processing (nothing uploaded), a dozen motion styles, intensity and speed sliders, instant preview, GIF export with optional WebM"
  },
  {
   "tier": "Studio — Founding",
   "price": "$29 one-time (founding price; nothing charged today)",
   "for": "families and teachers who want to direct the motion, not just pick a style",
   "includes": "custom motion paths, HD/4K loop export, print-ready stills, saved projects, founding-price locked in for life"
  },
  {
   "tier": "Studio — Classroom",
   "price": "$59 one-time (founding price; nothing charged today)",
   "for": "teachers animating a whole class set of drawings",
   "includes": "everything in Studio — Founding plus batch-animate a sketchbook or classroom set and class-size export queue"
  }
 ],
 "primary_cta": "Export GIF",
 "launch_channels": [
  {
   "channel": "Show HN",
   "draft": "Show HN: Doodleloop — drop in a photo of a kid's drawing, get a looping animated GIF, all in your browser. Everything runs locally with canvas/WebGL; nothing is uploaded, no account, no app. Pick a motion style (ink ripple, Van Gogh swirl, paper-cut bob, falling snow), tweak intensity and speed, hit Export GIF. It's free. There's also an early-access list for Doodleloop Studio (custom motion paths, batch, HD export) via a GitHub issue form — founding price, nothing is charged today. Would love feedback on the motion styles."
  },
  {
   "channel": "r/InternetIsBeautiful",
   "draft": "I made a site that turns a photo of a drawing into a looping animated GIF, entirely in your browser — nothing gets uploaded. Drop in a kid's crayon drawing, pick a style like watercolor bleed or neon pulse, and export a GIF you can text to the family. Free, no account. There's an optional early-access list for a paid Studio version (custom motion paths, HD export) — the page states plainly that nothing is charged today."
  },
  {
   "channel": "GitHub Discussions on huashu-art-motion (Show and tell / ideas thread)",
   "draft": "This repo proved how much people want 'make paintings move with code' — I built the no-code version for non-developers: doodleloop, a single web page where you drop in a photo of a drawing, pick a motion style, and export a looping GIF, all processed locally in the browser. Free, nothing uploaded. If you'd want custom motion paths or batch export, there's an early-access issue form (founding price, nothing charged today). Curious what styles this community would add."
  }
 ],
 "success_metric": "After 7 days: at least 10 distinct GitHub accounts have joined the Studio early-access list or 👍'd the signal issue, and at least one launch thread has real comments from parents or teachers describing whose drawing they animated.",
 "success_signups": 10,
 "kill_metric": "After 7 days: fewer than 2 early-access signups and no thread producing a single comment from the parent/teacher audience — meaning the delight didn't land even where the audience already gathers.",
 "kill_signups": 2
}
```

</details>
