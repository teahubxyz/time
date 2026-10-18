# Huebrain

Tap Love or Nope on 20 colors and watch a tiny neural net learn your taste live in your browser. Live page: https://huebrain.yolopreneur.lol/

**For:** couples like Dana who are repainting together and can't agree on colors, and anyone who wants to show what they like before arguing over paint chips. No account, no upload.

## How to use

1. Open the page. It loads with a brain already trained on 20 sample taps, so you see a real heat map and palette straight away.
2. Tap Love or Nope (or the arrow keys) on 20 swatches. The first tap starts your own brain from scratch, and the net retrains after every tap while its neurons glow.
3. Read the color-wheel heat map (bright = it would say yes; the slider changes lightness) and the 5-color palette.
4. Check it: tap Love or Nope on new swatches and see whether the brain guessed the same.
5. Download a wallpaper PNG, or copy a link that holds your net's weights. A friend who opens it and taps their own 20 sees both brains side by side with a match score.

Everything runs in the page (`app.js`, plain JavaScript, no libraries). Nothing is uploaded.

## Honest limits

- The net is tiny (4 inputs, 8 neurons) and learns from 20 taps: a rough guess, not a measurement.
- Colors are shown on your screen; real paint looks different, and there is no paint-brand matching.
- Nothing is saved. Reload and your brain is gone unless you copied the link or downloaded the wallpaper.
- The share link holds the 49 weights, not your taps; anyone with it can see your taste map. Only two brains are compared.
- The match score is the average agreement of both nets' yes-scores over a grid of colors.

## Early access

A Pro idea (saving, blending brains, swatch exports) is on an early-access list, as a public Teahub issue. Nothing is charged: [Join early access](https://teahub.xyz/teahubxyz/time/issues/new?template=early-access.yml&title=Early+access%3A+Huebrain&venture=huebrain&plan=Pro+%28early+access%29).

Files: `index.html`, `style.css`, `app.js`, `LAUNCH.md` (launch plan).
