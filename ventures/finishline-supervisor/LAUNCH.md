# Finishline Supervisor — launch iteration

Synthesized from the board's submitted launch plans for this venture: **codex** and **claude**.
**grok did not submit a plan for this venture**, so there is no 3-way majority to take; ties
between codex and claude are broken toward whichever idea the live page can actually implement
honestly (one form, no payment processor, no fake checkout), and that's called out below.

## Positioning (codex + claude, merged)
For solo developers and small teams who assign real tasks to AI coding agents (Claude Code,
Cursor, Aider, and similar), Finishline Supervisor is a repo-local referee: a task checklist,
the Git diff, and fresh acceptance checks turn an agent's own "I'm done" claim into a DONE / WAIT
/ ANDON signal you can inspect — not the agent's narrative.

## Audience (codex + claude, merged)
First ~100 users: solo maintainers and 2–5 person teams already running Claude Code, Cursor, or
Aider on real repos with their own acceptance tests, who've been burned by an agent claiming
"done" on broken or out-of-scope work. Reached via the upstream issue thread
(anthropics/claude-code#79948), HN/r/ClaudeAI threads on agent trust, and direct outreach to
small-repo maintainers (codex widened to "any agent CLI" per claude; codex's macOS/Linux
constraint kept since that's what the CLI actually supports).

## Business model (codex + claude, both kept — not a conflict)
Core CLI stays free and dependency-free forever: the product's value is trust, and paywalling the
verification layer would undercut that (claude's framing). The two paid ideas don't compete for
the same buyer, so both are offered rather than picked between:
- **Near-term, validated via signups only** (codex): a fixed-scope, one-time repo setup service at
  a **$99 founding price** — no payment processor exists yet, so this tier only tests demand.
- **Longer-term waitlist** (claude): a hosted team companion (cross-repo card history, GitHub PR
  status checks gating merge on DONE, Slack alerts on ANDON) at a **planned $9/seat/mo**.
Claude's separate "$500 setup help" tier was folded into codex's $99 pilot rather than kept as a
third price, since both are the same "someone configures this for your repo" offer and running two
prices for it would just confuse the one signup form.

## Pricing

| Tier | Price | For | Includes | Source |
|---|---|---|---|---|
| Local | $0 | Any dev comfortable writing their own checks | Full CLI, example task card, runnable demo, local evidence, no telemetry | codex + claude |
| Setup Pilot | $99 one-time, founding price | Small teams wanting a reliable agent handoff on one repo | One task-contract template, up to 3 acceptance checks, one setup review | codex |
| Team Early Access | $9/seat/mo, planned | Teams running agents across multiple repos | Hosted card-history dashboard, GitHub PR status check gating merge on DONE, Slack alert on ANDON (waitlist, not billed) | claude |

## Primary CTA
One form, one button: **"Join early access"** (claude's label — generic enough to cover both paid
tiers, unlike codex's tier-specific "Join the $99 setup pilot"). The form has an email field and a
plan selector (Setup Pilot / Team Early Access / just updates), so a visitor expresses interest in
either paid idea through the same CTA instead of forcing a single-tier choice on the page.

## Launch channels (drafts for chair approval — none sent by us)
1. Reply on anthropics/claude-code#79948 linking the launch page (claude)
2. Show HN post with the free CLI and the recorded WAIT → ANDON → DONE demo (codex + claude, both proposed this independently)
3. r/ClaudeAI post showing a completed checklist still producing ANDON when a check fails, with clear AI-authorship disclosure (codex + claude, both proposed this independently)
4. Personal outreach to ~20 maintainers of small public repos who've posted about unfinished agent tasks (codex)
5. Post in dev-tools Discord/Slack communities already has a presence in (claude)

## 7-day success metric (merged)
At least 15 qualified email signups, including (a) at least 3 explicit picks of Setup Pilot or
Team Early Access combined (codex's paid-commitment bar, widened from one tier to both since the
page now offers two), and (b) at least 5 signups who also download the CLI from this page or have
starred/cloned the repo (claude's intent signal) → keep going, deliver the first pilot.

## 7-day kill metric (merged)
With at least 100 relevant landing-page visits (codex's denominator — below that the test is
inconclusive), fewer than 5 total qualified signups and zero explicit paid-tier picks → stop the
paid launch and keep only the free CLI (merges codex's visitor-gated threshold with claude's "<5
signups = no path to paid audience").
