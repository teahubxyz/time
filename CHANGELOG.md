# Changelog

## [Unreleased]

### Security
- Time's state comments (`<!-- time {...} -->` beats) count only when written by `github-actions[bot]`; a pasted marker from anyone else is ignored. A stranger on a public repo could otherwise steer a card to merge a chosen PR or build a chosen page.
- `/time retry` and "Approve"/"Object" comments count only from the owner, members, collaborators and Time itself; any other bot is a stranger too.
- The protected-path check reads every file of a PR (not the first 100) and counts a rename under both names.
- The browser pass clones the Pages branch, then drops `.git` (the clone URL carried the token), serves only the venture's own folder, and runs headless Chrome with no network except localhost, so a model-written page can't read or send anything.
- The worker's `run` tool executes inside a throwaway container (`docker run`, the checkout mounted; the workflows set `TIME_RUN_IMAGE: node:22-bookworm`), so a command can't read the orchestrator's environment through `/proc`. Unset, or without a docker daemon, it is the host shell as before.
- A venture build writes only inside its own `ventures/<slug>/` folder on the Pages branch, which also carries the studio's site and every other venture: a fix round once wrote its page over the site's front page.
- The Venice worker's shell no longer sees secrets: its environment drops tokens and keys, its checkout keeps no token in `.git/config`, and the workflows check out without persisted credentials.

### Changed
- The second fix round escalates to Kimi's code model (`venice:kimi code`) instead of grok 4.7: still a different model from the first round, at a fraction of the cost. `TIME_VENTURE_ESCALATE` overrides it.

### Added
- A batch's children start in the tick that spawned them (GitHub lists a card made a moment ago only later, so they used to wait a tick).
- Build briefs keep claims to what the code does: no promised features or schedules, and the trending repos are the wave a venture rides, never something it "builds on". Fix rounds take a failing claim off the page rather than building a feature in a hurry. In the first live batch, every fix round was a claim the code didn't back.
- Venture batches (multi-ceremony): one batch card scouts once, the seats pitch a field (rounds until there are 2k pitches), and the board ranks the whole field; the top k, each wanted by two seats, become venture cards in the batch's own milestone. They run the ordinary loop side by side and launch together: a child that passes its checks waits at `ready` until every sibling is settled or the hold (`TIME_VENTURE_BATCH_HOLD_HOURS`, 6) runs out; stragglers then launch alone. No child left behind: a held child gets one batch retry, and held again it is counted dead with its reason. A retro on the batch card compares the cohort's signups against each plan's lines, then the card and milestone close. Set `TIME_VENTURE_BATCH=3` to make batches the daily default, or Actions → venture → Run workflow → "batch".
- Parallel builds: a tick runs up to `TIME_VENTURE_HEAVY` (default 3) worker runs at once, one per card, so a batch builds in one tick instead of three. Each build keeps its own folder lock, `ventures.json` is updated under a lock with a fresh read, and a Pages write that loses the race for the branch head (409) is retried. `TIME_VENTURE_HEAVY=1` is the old one-at-a-time.
- Fix rounds yield the worker runs to cards still due their first build, so a page that keeps failing can't starve the others.
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
