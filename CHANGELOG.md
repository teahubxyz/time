# Changelog

## [Unreleased]

### Security
- The Venice worker's shell no longer sees secrets: its environment drops tokens and keys, its checkout keeps no token in `.git/config`, and the workflows check out without persisted credentials.

### Added
- Venture loop launches products, not pages: a launch round where board seats write plans and one synthesizes `LAUNCH.md` with attribution; launch pages where the working product fills the first screen under a slim header with one call to action, then pricing and honest limits, in a look that follows the product; early-access signups through a GitHub issue form, thanked on their issues; deterministic and headless-Chrome checks with fix rounds and an andon; a 7-day decision against success and kill lines; a studio index at `/ventures/`.
- The board's taste: a delight anyone gets within a minute ranks above another developer utility, and when a product makes something people read (a deck, a card), its preloaded sample is the product's own pitch.
- The board sees the studio's own ventures: pitches that repeat one (by slug, name or an earlier slug) are set aside before the vote, since the week's trending list barely moves from day to day.
- Hands-off upgrade support with spec planner, auto-merge, and Venice worker integration
