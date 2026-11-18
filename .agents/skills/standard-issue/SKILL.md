---
name: standard-issue
description: What every page the factory ships carries by default (installable and offline, link previews, share links), how to make each piece, and the checker that proves it. Use when building, shipping or reviewing any web page, venture, splash page or web app, or when a card says "standard issue".
---

# Standard issue

Every page we ship carries these three things, at the operator's word (2026-11-18): ventures, product sites, splash pages, web apps. A page without them is not done, whatever else it does.

## 1. Installable, and it works offline

- **Manifest.** `manifest.webmanifest`, linked with `<link rel="manifest">`: `name`, `short_name`, `id`, `start_url` and `scope` (`"./"`, so one folder works on every host it is served at), `display: "standalone"`, `theme_color`, `background_color`, and icons: PNG 192 and 512 (`purpose: "any"`) plus a 512 PNG with `purpose: "maskable"`.
- **Icons.** `favicon.svg` and `favicon-32.png`, and `apple-touch-icon.png` (180x180, full bleed: iOS rounds the corners itself).
- **Service worker.** `sw.js`, registered from the page on `load`. Precache the shell; fetch the page network-first (fresh whenever online, the cached copy offline) and everything else cache-first; bump the cache name when a precached file changes. Serve `sw.js` with `Cache-Control: no-cache` (on Teahub pages, a `_headers` file). A page with a backend still caches its shell and says, offline, what needs the network.
- **Room at the top.** `viewport-fit=cover` and `env(safe-area-inset-*)` padding, so an installed app's status bar or window controls never cover the page (AGENTS.md). With `window-controls-overlay`, place the bar with `env(titlebar-area-*)`.
- **Fonts that travel.** Self-host web fonts (woff2, latin subset, with their license) or use system fonts, so the page looks the same offline and makes no third-party calls.
- **A way to install** where it fits: a small "install" control that appears when `beforeinstallprompt` fires, and on iPhone a hint (Share, then Add to Home Screen).

## 2. Link previews

What chat apps and social sites show when someone pastes the link. In `<head>`:

```html
<link rel="canonical" href="https://example.lol/">
<meta name="description" content="...">
<meta name="theme-color" content="#...">
<meta property="og:type" content="website">
<meta property="og:site_name" content="...">
<meta property="og:url" content="https://example.lol/">
<meta property="og:title" content="...">
<meta property="og:description" content="...">
<meta property="og:image" content="https://example.lol/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="...">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="...">
<meta name="twitter:description" content="...">
<meta name="twitter:image" content="https://example.lol/og.png">
```

`og:image` and `og:url` are absolute URLs on the canonical domain: crawlers don't resolve relative ones. `og.png` is 1200x630 and designed for the page (its name, what it does in a line, the domain, in its own colors and type). Draw it as `og.html` and render it (below) rather than screenshotting the live page.

## 3. Share links

Whatever a person makes or achieves on the page (a score, a creation, a result, a setup) gets a share button, and the link it makes brings that thing back.

- A static page carries the state in the link: `?c=<base64url JSON>` with a version field. Validate every field on load (types, ranges, lengths) and put shared text on the page with `textContent`, never `innerHTML`.
- A page with a backend can save it instead (a venture's `Time.save()` and `Time.load()`).
- The button calls `navigator.share({title, text, url})` when there is one (phones, macOS, Windows), straight from the click before any `await` so the browser sees the gesture, and otherwise copies `text + url` to the clipboard and says so ("Copied. Paste it to a friend."). An `AbortError` means the person closed the sheet: say nothing.
- The link uses the canonical domain, so one made on a staging address still lands on the real site.
- Opening a shared link sets the page up the same way and shows what was shared before anything else.

## Making the assets (on hb-5)

`render.mjs` draws the raster set with headless Chrome:

    node .agents/skills/standard-issue/render.mjs <folder> [--css fonts/fonts.css]

- `icon.svg` → `icon-192.png`, `icon-512.png` (transparent corners)
- `favicon.svg` (else `icon.svg`) → `favicon-32.png`: if the icon carries words, give the tab a simpler mark
- `icon-maskable.svg` (else `icon.svg`) → `icon-maskable-512.png` and `apple-touch-icon.png`: full bleed, the mark inside the middle 80%
- `og.html` (else `index.html`) → `og.png`, 1200x630
- `--css` loads a stylesheet from the folder (the page's own fonts) for the SVG renders

Keep the sources next to the PNGs so the next agent can change and re-render them.

## Checking (on hb-5)

    node .agents/skills/standard-issue/check.mjs <url>

It loads the page in headless Chrome and checks everything a machine can: the head tags, `og.png` and the icons and their sizes, the manifest, Chrome's own installability verdict, the service worker, and a reload with the network off. It exits 1 on any failure. Run it on a local preview before the PR (an `og:image` that isn't live yet is only a warning there) and on the live URL after the deploy, and put its summary line in the PR. Share links are checked by hand: open one in a fresh profile and watch the shared thing come back. Look at the page installed at least once (desktop Chrome: the install icon in the address bar; a phone: Add to Home Screen).

## Done when (for cards)

- `check.mjs <live url>` shows 0 fail.
- A shared link, opened in a fresh browser, brings back what was shared.

## Examples

- karaokey (gh-pages `ventures/karaokey/`, karaokey.lol): all of it, including challenge links that carry a score, the setup and freestyle bars, and offline play.
- braid.here (gh-pages `ventures/braid/`): manifest, icons and a designed preview card on a landing page.

The venture loop's builder writes text files only, so it can't make the PNGs yet: time#341 has it render them in the check step.
