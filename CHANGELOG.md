# Changelog

## [Unreleased]

### Security
- The Venice worker's shell no longer sees secrets: its environment drops tokens and keys, its checkout keeps no token in `.git/config`, and the workflows check out without persisted credentials.

### Added
- Venture loop launches products, not pages: a launch round where board seats write plans and one synthesizes `LAUNCH.md` with attribution; launch pages with one primary call to action, pricing, quickstart and honest limits in a rotating design direction; early-access signups through a GitHub issue form, thanked on their issues; deterministic and headless-Chrome checks with fix rounds and an andon; a 7-day decision against success and kill lines; a studio index at `/ventures/`.
- Hands-off upgrade support with spec planner, auto-merge, and Venice worker integration
