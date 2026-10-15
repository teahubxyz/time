---
name: mdeck
description: Make slide decks as .mdeck links, plain-text slides that open at mdecks.yolopreneur.lol with the whole deck inside the link and nothing uploaded. Use when asked for slides, a deck or a presentation to open in a browser or share as a link.
---

# Slide decks as .mdeck links

.mdeck (https://mdecks.yolopreneur.lol/) turns plain text into slides. The deck travels inside its link, after the `#`, so nothing is uploaded and opening it needs no account. Whoever opens the link can present it with the arrow keys, edit it, or copy it as one HTML file.

## Write the deck

- `# Title` starts a slide's title, and `## Subtitle` goes under it.
- `- point` (or `* point`) is a bullet.
- Any other line is a paragraph.
- `---` on its own line starts a new slide.
- Inline: `**bold**`, `*italic*`, `` `code` `` and `[text](https://...)`.

Nothing else renders: no images, tables, nested lists or code blocks. Aim for a title and three to six short bullets per slide. A slide that runs long shrinks its text and, past 70%, is cut in two with its title repeated, so nothing overflows, but your own `---` breaks will fall in better places.

For example:

```
# Q3 in one minute
## What shipped and what slipped

- Shipped: the new editor
- Slipped: PDF export, now due in November
- Next: a link for every deck

---
# Thanks

Questions welcome.
```

## Make the link

The link is `https://mdecks.yolopreneur.lol/#d=` followed by the deck's UTF-8 text compressed with raw deflate (no zlib header) and encoded as base64url without padding. In Python:

```python
import base64, zlib

c = zlib.compressobj(9, zlib.DEFLATED, -15)
data = c.compress(deck.encode()) + c.flush()
link = "https://mdecks.yolopreneur.lol/#d=" + base64.urlsafe_b64encode(data).decode().rstrip("=")
```

In Node: `"https://mdecks.yolopreneur.lol/#d=" + require("zlib").deflateRawSync(deck).toString("base64url")`.

If you can't run code, use `https://mdecks.yolopreneur.lol/#md=` followed by the text percent-encoded, the way `encodeURIComponent` does it. Those links are longer but work the same.

## Hand it over

Reply with the link, and keep the deck's text so you can revise it: every change makes a new link. Someone who wants a file can open the link and press **Copy deck as HTML** for one self-contained HTML file.
