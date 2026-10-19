---
name: glitztype
description: Make retro WordArt text as Glitztype links, a name or word in one of twelve styles that opens at glitztype.yolopreneur.lol with the whole piece inside the link and nothing uploaded. Use when asked for WordArt, a styled name or word, a banner or sign title, or a transparent-PNG text sticker to open in a browser or share as a link.
---

# Retro WordArt as Glitztype links

Glitztype (https://glitztype.yolopreneur.lol/) draws a name or word in a retro WordArt style. The whole piece travels inside its link, in the `?s=` query value, so nothing is uploaded and opening it needs no account. Whoever opens the link sees the piece, can tweak it, and can press **Download PNG** for a transparent PNG.

## Describe the piece

A piece is one JSON object:

```json
{"text":"Nadia","style":"rainbow","font":"Impact","bend":8}
```

- `text`: the word, up to 42 characters. Runs of whitespace become one space and the ends are trimmed. Required: a piece with empty text is rejected and the page opens on its sample instead.
- `style`: one of `rainbow`, `chrome`, `neon`, `arch`, `gradient`, `shadow`, `outline`, `italic`, `bold`, `wave`, `stripe`, `glow`. Anything else becomes `rainbow`.
- `font`: one of `Arial`, `Courier New`, `Georgia`, `Impact`, `Verdana`, `Comic Sans MS`, `Times New Roman` (system fonts, spelled exactly like that). Anything else becomes `Arial`.
- `bend`: a whole number from -30 to 30, the tilt in degrees. It is ignored by `arch`, and `wave` uses it to shift the wave.
- `colors` (optional): an object keyed by style name. Each value is a `#rrggbb` (or `#rgb`) string, except `rainbow`, which is an array of 2 to 8 such strings. A style you leave out keeps its default colour, and only the colour of the chosen style shows. For example `{"neon":"#00ffff"}`.

Leave out `colors` unless the person asked for specific colours. Keep it short: one to three words look best.

## Make the link

The link is `https://glitztype.yolopreneur.lol/?s=` followed by the JSON's UTF-8 text encoded as base64url without padding (`-` and `_` instead of `+` and `/`, no `=`). No compression. In Python:

```python
import base64, json

piece = {"text": "Nadia", "style": "rainbow", "font": "Impact", "bend": 8}
token = base64.urlsafe_b64encode(json.dumps(piece).encode()).decode().rstrip("=")
link = "https://glitztype.yolopreneur.lol/?s=" + token
```

In Node: `"https://glitztype.yolopreneur.lol/?s=" + Buffer.from(JSON.stringify(piece)).toString("base64url")`.

There is no no-code form: the link has to be base64, so if you can't run code, give the person the JSON and say so rather than a guessed link.

The link for the piece above is:

```
https://glitztype.yolopreneur.lol/?s=eyJ0ZXh0IjogIk5hZGlhIiwgInN0eWxlIjogInJhaW5ib3ciLCAiZm9udCI6ICJJbXBhY3QiLCAiYmVuZCI6IDh9
```

## Hand it over

Reply with the link and keep the JSON so you can revise it: every change makes a new link. The person can press **Download PNG** on the page for a transparent PNG; you can't produce the PNG yourself without a browser.
