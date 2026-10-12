# Changelog

## [Unreleased]

### Security
- A venture build writes only inside its own `ventures/<slug>/` folder on the Pages branch, which also carries the studio's site and every other venture: a fix round once wrote its page over the site's front page.
- The Venice worker's shell no longer sees secrets: its environment drops tokens and keys, its checkout keeps no token in `.git/config`, and the workflows check out without persisted credentials.

### Added
- Accounts for ventures, with passkeys: each venture's backend can sign people up and in (Face ID, Touch ID, Windows Hello, a phone), keep a 30-day session, and list what each person saved. No passwords, no email, nothing to configure; accounts live in the venture's own database on its own domain. `time.js` gains `Time.signUp`, `Time.signIn`, `Time.signOut`, `Time.user` and `Time.mine`, and builds are told to use them for the paid tier's promise without ever putting sign-in in front of the free product.
- Venture backends use Gemma 4 (`@cf/google/gemma-4-26b-a4b-it`) by default and read both the older `{response}` and the OpenAI-style answer from Workers AI (the first default had been retired).
- Ventures can be backed by Cloudflare: with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, each venture gets its own Worker, D1 database and Workers AI, and lives at `<slug>.<TIME_VENTURE_DOMAIN>` (or workers.dev) while its page stays on GitHub Pages. The page's `time.js` gives share links and a small model, and degrades to null so products still work without it. Existing ventures are backfilled a couple per tick; a new worker redeploys every venture; the doctor checks the token.
- Venture loop launches products, not pages: a launch round where board seats write plans and one synthesizes `LAUNCH.md` with attribution; launch pages where the working product fills the first screen under a slim header with one call to action, then pricing and honest limits, in a look that follows the product; early-access signups through a GitHub issue form, thanked on their issues; deterministic and headless-Chrome checks with fix rounds and an andon; a 7-day decision against success and kill lines; a studio index at `/ventures/`.
- Start a venture whenever you like: Actions → venture → Run workflow → "Start a new venture now" (`gh workflow run venture.yml -f start=true`); the schedule still starts one a day.
- The board's taste: a delight anyone gets within a minute ranks above another developer utility, and when a product makes something people read (a deck, a card), its preloaded sample is the product's own pitch.
- The studio index at `/ventures/` wears the Time site's blueprint theme (title block, grid paper, type), with each launched venture's laptop screenshot.
- The headless-Chrome check fails a launch page where something sits on top of the product (a page fixed to the screen's height lets the next section slide over it).
- The board sees the studio's own ventures: pitches that repeat one (by slug, name or an earlier slug) are set aside before the vote, since the week's trending list barely moves from day to day.
- Hands-off upgrade support with spec planner, auto-merge, and Venice worker integration
