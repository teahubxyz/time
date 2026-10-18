# Loot Drop

Live page: https://loot-drop.yolopreneur.lol/

Type the name of any everyday thing (your dad's grill, a coworker's lucky mug, a battered office chair) and get an ARPG-style item tooltip with a rarity, affixes and flavor text. It is free and runs entirely in the page.

## Who it is for

The friend in a gaming group chat who wants to crown a buddy's office chair "The Throne of Endless Standups" and post it before the joke goes cold, without an image editor or meme template.

## How to use it

1. Type an item name and pick a rarity: normal, magic, rare, set or unique.
2. Optionally add a photo (pixelated into 16×16 item art in a canvas), your own lines (one per line), or your own flavor text.
3. **Download PNG** saves the tooltip with a transparent background. **Copy link** copies a URL that holds the whole card in its hash; opening it drops the item with a beam of light and a clink. **Drop it** replays the drop.

The generator is seeded from the name, so the same name always rolls the same affixes (the rarity decides how many show). Affixes and flavor text come from small word lists inside `app.js`. With no photo, the art is a pixel sigil seeded from the name.

The page loads with a sample, the Loot Drop pitch itself, which goes through the same code as anything you type.

## Files

- `index.html`: the page, with styles inline
- `app.js`: the whole product, plain JavaScript with no libraries and no network calls

## Honest limits

- The word lists are small, so affixes and flavor lines repeat across different items.
- A link carries a 16×16 version of your photo, not the original, so links with a photo are long.
- Nothing is saved: no accounts, no collection. The item exists only in the PNG or link you keep.
- The clink may stay silent until you have clicked or tapped the page, because browsers block early audio.
- A fan-made style homage. It uses no game assets and is not affiliated with any game or publisher.

## Guild Vault (early access)

A paid team plan is only an early-access idea so far: nothing is built and nothing is charged. You can ask for it on the [early-access form](https://teahub.xyz/teahubxyz/time/issues/new?template=early-access.yml&title=Early+access%3A+Loot+Drop&venture=loot-drop&plan=Guild+Vault+%28early+access%29), which opens a public issue on Teahub.
