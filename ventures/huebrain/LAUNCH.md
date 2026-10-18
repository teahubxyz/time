# Huebrain: launch plan

For couples like Dana who are repainting together and can't agree on colors, Huebrain turns 20 quick Love/Nope taps into a visible taste map, a 5-color palette and a side-by-side match score, so each person shows what they like before arguing over paint chips, without any account, upload or Pinterest-board homework.

- **Page:** https://huebrain.yolopreneur.lol/
- **Join early access:** [the issue form](https://teahub.xyz/teahubxyz/time/issues/new?template=early-access.yml&title=Early+access%3A+Huebrain&venture=huebrain&plan=Pro+%28early+access%29) (a public issue on Teahub; no email, nothing charged)
- **Signal:** https://teahub.xyz/teahubxyz/time/issues/152 (👍 = wants the next version)
- **Design:** product-first: the tool fills the first screen and the look follows the product
- **Card:** https://teahub.xyz/teahubxyz/time/issues/150 (pitched by `sonnet`)

## Audience: the first 100 users

The first 100 users are people mid-decision on colors: homeowners and renters repainting or furnishing with a partner, plus a smaller group of home stagers, decorators and designers who show clients palettes. They gather in r/HomeDecorating, r/InteriorDesign, r/DesignMyRoom, r/centuryhomes, r/paint and r/DIY. A second group is curious about tiny in-browser nets: Show HN readers and followers of chenglou/handwired issues and discussions, who will share a live, explainable net with non-developer friends. Designer newsletters and Discords (Figma, Procreate communities) are for Pro interest.

## Business model

The free page is the proof and the viral loop: anyone can train a brain, download a wallpaper and share a link so a partner can compare. Professionals (designers, stagers, decorators) pay for what saves them time with clients: saving and retraining brains, blending a couple's or team's brains into one palette, and exporting to ASE, Figma, Procreate or the nearest real paint-brand colors, turning a vague first taste conversation into a concrete palette they can present. Nothing is charged today; the early-access list measures whether that demand is real before Pro is built.

## Pricing (early access: nothing is charged)

| Tier | Price | For | Includes |
|---|---|---|---|
| Free | $0 | Anyone picking colors for personal use, like Dana and her partner, or a friend group | 20-swatch Love/Nope training with a live neural net and visible neuron pulses, color-wheel heat map, 5-color palette, guess-and-check on new swatches, wallpaper PNG download, and a share link with sid |
| Pro (early access) | $6/mo founding price, nothing charged to | Freelance designers, stagers and decorators who show clients palettes | Save and retrain brains over time, blend a couple's or team's brains into one shared palette, export to ASE, Figma and Procreate swatches, and match to the nearest real paint-brand colors. |
| Studio (early access) | $15/mo founding price, nothing charged t | Small design or staging teams sharing client work | Everything in Pro, plus shared team brains, team sharing of saved palettes, and blending across several clients or teammates. |

## Primary call to action

**Join early access**: the header's one button, linking to the early-access form.

## Launch channels (drafts; nothing is sent)

### Show HN (news.ycombinator.com)

> Show HN: Huebrain – tap Love/Nope on 20 colors and watch a tiny neural net learn your taste in the browser
> 
> You tap Love or Nope on 20 swatches. A small neural net trains in the page as you tap, and its neurons pulse as they update. It then paints the whole color wheel as a heat map of what you'd say yes to, proposes a 5-color palette, and guesses on new swatches so you can check whether it actually learned you. You can download a wallpaper PNG or copy a link that encodes your trained weights, so someone else can open it and compare with a match score. No server, no account, nothing uploaded. Inspired by chenglou/handwired showing how small a useful net can be; the net is a few layers of plain JavaScript. I'm also gauging interest in a Pro version for designers (saving, blending brains, ASE/Figma/Procreate and paint-brand exports) via an early-access issue on Teahub: [Teahub early-access issue link]. Nothing is charged. Feedback on the training, the heat map, and where the net falls short is welcome.

### r/HomeDecorating (check self-promotion rules first; post as a free tool, cross-p

> Made a free color-taste tool for when you and your partner can't agree on paint
> 
> My partner and I could never agree on paint colors, so I made a small free toy: Huebrain shows you one color at a time, you tap Love or Nope on 20 of them, and a tiny neural net trains in your browser as you tap. You get a heat map of the color wheel showing what you'd say yes to plus a 5-color palette. Then send your partner the link, they do their own 20 taps, and you see both brains side by side with a match score. Everything runs locally, nothing is uploaded, no account. The most useful feedback for me is whether the palette it picks feels like you, or feels wrong: [link]

### chenglou/handwired GitHub Discussions (Show and tell)

> Built a small non-developer toy on the idea that a tiny net can run and be understood in plain JS: Huebrain. It trains a small net on 20 Love/Nope color taps in the browser, visualizes neurons pulsing during training, and renders the learned function over the color wheel as a heat map. The trained weights fit in a share link, so two people can compare with a match score. Everything is client-side, nothing uploaded. It's aimed at people choosing colors, not at developers, but you may find the in-page training fun to poke at. Posting here in case it's a useful example of the approach reaching a non-coding audience. Happy to hear if the network setup or visualization could be clearer, or how to keep the net small and readable: [link]

## 7-day lines

- **Success:** After 7 days, at least 10 distinct Teahub accounts have requested Pro early access through the issue form or 👍'd the signal issue, and at least 3 of them came from different launch channels. (at least 10 signups)
- **Kill:** After 7 days, fewer than 2 distinct Teahub accounts have requested early access or 👍'd the signal issue despite posting in all three channels, and the posts got little reply; then we stop Pro work and keep only the free page. (at most 2 signups)

A signup is a distinct Teahub account, other than the repo owner, a seat or a bot, that opened an early-access issue for
Huebrain or 👍'd the signal issue. Between the lines, the studio watches one more week, then parks it.

## Where each idea came from

- positioning: `opus`
- audience: `sonnet`
- business model: `sonnet`
- pricing: `opus`
- primary cta: `opus`
- launch channels: `opus`
- metrics: `haiku`

**Dissent:** Opus wanted a higher bar (25 to succeed, kill at 5 or fewer) because 10 early-access clicks may be too weak a signal to justify building Pro, and no two seats agreed on which subreddit to lead with.

## The board's plans

<details><summary>haiku</summary>

```json
{
 "positioning": "For couples and roommates repainting a room who can't agree on colors, Huebrain learns your taste from 20 Love or Nope taps in your browser and shows a color map, a palette, and a match score with your partner, so you can argue less over paint chips and nothing is uploaded.",
 "audience": "The first 100 are couples and housemates about to repaint, found in r/InteriorDesign and r/firsttimehomebuyer, plus designers and stagers who read Show HN, and tinkerers in the chenglou/handwired issues and discussions who care about small nets that run in a browser.",
 "business_model": "The free page stays free and is the product for the couple. Designers, stagers and decorators who present palettes to clients pay for Pro, which saves them hours by exporting ASE, Figma and Procreate swatches and matching to real paint-brand colors, and lets them keep a retrained brain over time. Early-access signups are not charged today; founding prices apply only when paid tiers open.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "Couples, roommates and anyone choosing colors for personal use",
   "includes": "The full in-browser experience: 20 taps, live neural net, color-wheel heat map, 5-color palette, guess-and-check swatches, PNG wallpaper download, and a shareable link for side-by-side match score. Nothing is uploaded."
  },
  {
   "tier": "Pro Founding",
   "price": "$7/mo founding price (not charged yet; early-access list only)",
   "for": "Freelance designers, stagers and decorators who show palettes to clients",
   "includes": "Save and retrain your brain over time, export ASE, Figma and Procreate swatches, and map palettes to the nearest real paint-brand colors."
  },
  {
   "tier": "Studio Founding",
   "price": "$19/mo founding price (not charged yet; early-access list only)",
   "for": "Small design studios and couples or teams who want one shared palette",
   "includes": "Everything in Pro, plus blending several people's brains into one shared palette and team sharing of saved palettes."
  }
 ],
 "primary_cta": "Join early-access list",
 "launch_channels": [
  {
   "channel": "r/InteriorDesign (subreddit)",
   "draft": "Title: A free browser tool that learns your color taste from 20 yes/no taps\n\nI built Huebrain: you tap Love or Nope on 20 color swatches, a small neural net trains live in the page, then it paints your color wheel as a heat map of what you'd say yes to and proposes a 5-color palette. You can download a wallpaper PNG or send a link so a partner can see a match score. It runs entirely in your browser, nothing is uploaded, and no account is needed. It's free. I'm also collecting early-access signups for a paid version aimed at designers who present palettes to clients; nothing is charged today. Feedback welcome, especially on whether the palette matches how you actually choose colors: [Teahub early-access issue link]"
  },
  {
   "channel": "Show HN",
   "draft": "Title: Show HN: Huebrain, a tiny neural net that learns your color taste in the browser\n\nHuebrain trains a small neural net in your browser from 20 Love/Nope taps on color swatches. The neurons pulse as it trains, then it draws your color wheel as a heat map and suggests a palette. Everything runs locally with no server and no account. Built for couples who can't agree on paint, and it can export a wallpaper or a shareable link with a match score. The free page is the whole product today. Early-access list for a paid designer version: [Teahub early-access issue link]. Happy to talk about the net design, which is a few layers of plain JavaScript, or about where the training falls short."
  },
  {
   "channel": "chenglou/handwired discussions",
   "draft": "Title: Using a tiny in-browser net to learn color taste\n\nFollowing up on how small nets can be understood and run without a server: I made Huebrain, which trains a small net on 20 swatch taps in the page and visualizes the neurons firing during training. It's a toy for people choosing colors, not a dev tool. If anyone here has ideas for making the training visible or for keeping the net small and readable, I'd like to hear them. Repo details and early-access list: [Teahub early-access issue link]"
  }
 ],
 "success_metric": "After 7 days, at least 10 people have a Teahub account that asked for early access or 👍'd the signal issue, and at least 3 of them came from different channels.",
 "success_signups": 10,
 "kill_metric": "After 7 days, fewer than 2 people have signed up for early access or 👍'd the signal issue, and the channel posts got little reply, meaning the free page did not hook anyone enough to want the paid version.",
 "kill_signups": 2
}
```

</details>

<details><summary>sonnet</summary>

```json
{
 "positioning": "For Dana and anyone choosing colors with a partner or client, Huebrain is a 20-tap game where a tiny neural net learns your color taste live in your browser and shows it as a shareable wallpaper and match score, so you can compare tastes before arguing over paint chips, with no account and no upload.",
 "audience": "The first 100 users are people mid-decision on colors: couples repainting or furnishing a home, plus a smaller group of home stagers, interior decorators and designers who show clients palettes. They gather in r/centuryhomes, r/HomeDecorating, r/DIY, r/malelivingspace, r/paint and r/ColorizedHistory-style color communities, r/InteriorDesign, r/proceed and r/web_design, Show HN, and the handwired (chenglou/handwired) GitHub discussions for people curious about tiny in-browser nets. Designer newsletters and Discords (e.g. Figma Friends, Procreate-focused communities) are for Pro interest.",
 "business_model": "The free page is the proof and the viral loop: anyone can train a brain, download a wallpaper and share a link. Professionals (designers, stagers, decorators) would pay for what saves them time with clients: saving and retraining brains, blending a couple's or team's brains into one palette, and exporting to ASE, Figma, Procreate or the nearest real paint-brand colors. Nothing is charged today; the early-access list measures whether that demand is real.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "Dana and any couple or friend group who want to see what they like before arguing over paint chips",
   "includes": "20-swatch Love/Nope training, live neuron pulses, heat-map color wheel, 5-color palette, test guesses on new swatches, wallpaper PNG download, share link with side-by-side match score. Runs locally, nothing uploaded."
  },
  {
   "tier": "Huebrain Pro (early access)",
   "price": "Founding price $6/mo, nothing charged today",
   "for": "Designers, stagers and decorators who show clients palettes",
   "includes": "Save and retrain brains over time, blend a couple's or team's brains into one shared palette, export to ASE, Figma and Procreate swatches, nearest real paint-brand color matches. Early-access list only; you are not charged now."
  }
 ],
 "primary_cta": "Train my brain",
 "launch_channels": [
  {
   "channel": "r/HomeDecorating (check rules on self-promotion first; post as a free tool)",
   "draft": "My partner and I could never agree on paint colors, so I made a small free toy: you tap Love or Nope on 20 color swatches, a tiny neural net trains in your browser as you tap, and it paints a heat map of the colors you'd say yes to plus a 5-color palette. You can send your link to your partner and it shows both brains side by side with a match score. Everything runs locally, nothing is uploaded, no account. Would love to know if the palette it picks feels like you: [link]"
  },
  {
   "channel": "Show HN",
   "draft": "Show HN: Huebrain – a tiny neural net that learns your color taste from 20 taps, in the browser. You tap Love/Nope on 20 swatches; a small net trains client-side while the neurons visibly pulse, then it paints the full color wheel as a heat map, proposes a 5-color palette, and guesses on new swatches so you can check it. Share links encode the weights, so two people can compare side by side with a match score. No server, no account, nothing uploaded. Inspired by chenglou/handwired showing that small nets can run with plain JS. A Pro version for designers (save/retrain, blend brains, ASE/Figma/Procreate export, paint-brand matches) is on an early-access list; nothing is charged. Feedback welcome: [link]"
  },
  {
   "channel": "chenglou/handwired GitHub discussions",
   "draft": "Sharing a small thing built in the same spirit as handwired: a tiny neural net that trains in the browser on 20 Love/Nope color taps and shows its neurons pulsing as it learns. It is aimed at non-developers who choose colors, not at developers, but you may find the in-page training fun to poke at. No server, nothing uploaded. Happy to hear whether the live training feels clear: [link]"
  }
 ],
 "success_metric": "After 7 days, at least 10 people (Teahub accounts that asked for early access or 👍'd the signal issue) have joined the Pro early-access list.",
 "success_signups": 10,
 "kill_metric": "After 7 days, fewer than 2 people have joined the early-access list or 👍'd the signal issue, despite posting in all channels; then we stop and do not build Pro.",
 "kill_signups": 2
}
```

</details>

<details><summary>opus</summary>

```json
{
 "positioning": "For couples like Dana who are repainting together and can't agree on colors, Huebrain turns 20 quick Love/Nope taps into a visible taste map, a 5-color palette and a side-by-side match score, so each person shows what they like before arguing over paint chips, without any account, upload or Pinterest-board homework.",
 "audience": "The first 100 are people choosing colors right now, plus people curious about tiny in-browser neural nets. The color choosers are homeowners and renters repainting with a partner, along with the decorators and stagers who show them palettes; they gather in r/DesignMyRoom, r/HomeDecorating and r/InteriorDesign. The curious ones are followers of chenglou/handwired (its issues and discussions) and Show HN readers, who will share a live, explainable net with non-developer friends.",
 "business_model": "Designers, home stagers and decorators pay for Huebrain Pro. It saves their clients' brains over time, blends a couple's or team's brains into one shared palette, and exports to ASE, Figma, Procreate or the nearest real paint-brand colors. That turns a vague first client conversation about taste into a concrete palette they can present quickly and look good showing.",
 "pricing": [
  {
   "tier": "Free",
   "price": "$0",
   "for": "Anyone picking colors, like Dana and her partner",
   "includes": "20-swatch Love/Nope training with a live neural net, color-wheel heat map, a 5-color palette, guesses on new swatches, wallpaper PNG download, and a share link with side-by-side match score. Everything runs locally and nothing is uploaded."
  },
  {
   "tier": "Pro (early access)",
   "price": "$6/mo founding price, nothing charged today",
   "for": "Designers, stagers and decorators who show clients palettes",
   "includes": "Save and retrain brains over time, blend a couple's or team's brains into one shared palette, export to ASE, Figma and Procreate swatches, and match to the nearest real paint-brand colors."
  },
  {
   "tier": "Studio (early access)",
   "price": "$15/mo founding price, nothing charged today",
   "for": "Small design or staging teams sharing client work",
   "includes": "Everything in Pro, plus shared team brains and blending across several clients or teammates."
  }
 ],
 "primary_cta": "Train my color brain",
 "launch_channels": [
  {
   "channel": "Show HN (news.ycombinator.com)",
   "draft": "Show HN: Huebrain – tap Love/Nope on 20 colors and watch a tiny neural net learn your taste in the browser\n\nYou tap Love or Nope on 20 swatches. A small neural net trains in the page as you tap, and its neurons pulse as they update. It then paints the whole color wheel as a heat map of what you'd say yes to, proposes a 5-color palette, and guesses on new swatches so you can check whether it actually learned you. You can download a wallpaper PNG or copy a link that encodes your trained net, so someone else can open it and compare with a match score. No server, no account, nothing uploaded. Inspired by chenglou/handwired showing how small a useful net can be. I'm also gauging interest in a Pro version (saving, blending brains, ASE/Figma/Procreate and paint-brand exports) via an early-access issue on Teahub. Nothing is charged. Feedback on the training and the heat map is welcome."
  },
  {
   "channel": "r/DesignMyRoom",
   "draft": "Made a free color-taste tool for when you and your partner can't agree on paint\n\nHuebrain shows you one color at a time. You tap Love or Nope on 20 of them, and a tiny model in your browser learns what you like. You get a heat map of the color wheel and a 5-color palette. Then send your partner the link, they do their own 20 taps, and you see both side by side with a match score. It runs entirely in your browser, with no account and no upload. Feel free to tell me if the palette it gives you feels wrong. That's the most useful feedback for me."
  },
  {
   "channel": "chenglou/handwired GitHub Discussions (Show and tell)",
   "draft": "Built a small non-developer toy on the idea that a tiny net can run and be understood in plain JS: Huebrain. It trains a small net on 20 Love/Nope color taps in the browser, visualizes neurons pulsing during training, and renders the learned function over the color wheel as a heat map. The trained weights fit in a share link, so two people can compare. Everything is client-side. Posting here in case it's a useful example of the approach reaching a non-coding audience. Happy to hear if the network setup or visualization could be clearer."
  }
 ],
 "success_metric": "Within 7 days of launch, at least 25 distinct Teahub accounts have requested Pro early access through the issue form or 👍'd the signal issue.",
 "success_signups": 25,
 "kill_metric": "After 7 days, 5 or fewer distinct Teahub accounts have requested early access or 👍'd the signal issue. If so, we stop Pro work and keep only the free page.",
 "kill_signups": 5
}
```

</details>
