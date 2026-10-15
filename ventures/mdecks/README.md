# .mdeck

Type slides in plain text and instantly preview a clean presentation layout — right in the browser.

**Live page:** https://mdecks.yolopreneur.lol/

## Who it is for

People who make a quick throwaway deck every week — sprint demos, status updates, lunch talks — and would rather type than drag boxes in Google Slides or Keynote. If you already write everything else in Markdown, .mdeck lets you write your deck the same way.

## How to use it

1. Open the page and type markdown-ish text in the editor on the left. It comes preloaded with a sample deck so you can see real output immediately.
2. Watch the preview on the right re-typeset live. Navigate with the arrow keys (or swipe on touch screens); a progress bar tracks your place.
3. A slide with too much text shrinks to fit, down to 70% of the normal size. Past that it's cut into two or more slides, between lines and never right after a heading, and each new slide repeats its title with "(cont.)". A note under the preview says which slides were cut; put in a `---` yourself to choose the break. Cuts are worked out for a 1280x720 screen, so the copied deck has the same slides on any screen, and on a smaller one they shrink a little more.
4. Press **Copy deck as HTML** to copy the whole deck as one self-contained HTML file. Open it in any browser and present with the arrow keys — offline, no dependencies.
5. Or press **Copy link** for a link with the whole deck inside it. Whoever opens it gets the deck in the editor, ready to present or change; changes make a new link. The deck rides after the `#`, which browsers never send to a server, so nothing is stored anywhere.

The syntax:

- `# Title` and `## Subtitle` for headings
- `- bullet` (or `* bullet`) for lists
- `---` on its own line starts a new slide
- Inline `**bold**`, `*italic*`, and `` `code` ``
- `[text](https://…)` for a link
- Any other line becomes a paragraph

Everything runs in the page. Nothing is stored, nothing is sent anywhere, no account is needed, and the page is free.

## Links, for agents and scripts

A link is the page's address, then `#d=`, then the deck's text (UTF-8) compressed with raw deflate and written in base64url without padding. Anything that can't compress can use `#md=` and the text percent-encoded instead; those links are just longer. The page opens either kind.

In Python:

```python
import base64, zlib

def mdeck_link(text):
    deflate = zlib.compressobj(9, zlib.DEFLATED, -15)
    data = deflate.compress(text.encode()) + deflate.flush()
    return "https://mdecks.yolopreneur.lol/#d=" + base64.urlsafe_b64encode(data).decode().rstrip("=")
```

In Node:

```js
const link = "https://mdecks.yolopreneur.lol/#d=" + require("zlib").deflateRawSync(text).toString("base64url");
```

From a shell, for a deck in `deck.md`:

```sh
python3 -c 'import base64,sys,zlib; c=zlib.compressobj(9,zlib.DEFLATED,-15); d=c.compress(sys.stdin.buffer.read())+c.flush(); print("https://mdecks.yolopreneur.lol/#d="+base64.urlsafe_b64encode(d).decode().rstrip("="))' < deck.md
```

Without compression: `"https://mdecks.yolopreneur.lol/#md=" + encodeURIComponent(text)`.

## Honest limits

- Nothing is stored — close the tab without copying a link or the HTML and your text is gone.
- Anyone with a link can read the deck in it, and a very long deck makes a link some apps cut short.
- One layout and one typeface; no themes or branding.
- No images, tables, or nested lists yet.
- No speaker notes, presenter view, or PDF export (that is the Pro idea, if enough people ask for it).
- The copy button needs a modern browser with clipboard access.

## .mdeck Pro (not built yet)

The paid idea: saved decks, themes, speaker notes, and PDF export — still plain text in. Early access is collected via a [public GitHub issue form](https://teahub.xyz/teahubxyz/time/issues/new?template=early-access.yml&title=Early+access%3A+.mdeck&venture=mdecks&plan=Pro); no email, no payment, nothing is charged today. A 👍 on the [signal issue](https://teahub.xyz/teahubxyz/time/issues/13) counts as interest too.

## Context

Built by [Time](https://teahub.xyz/teahubxyz/time), an agent-run venture studio on GitHub. The launch plan, audience, pricing, and 7-day success/kill lines are in [LAUNCH.md](LAUNCH.md).