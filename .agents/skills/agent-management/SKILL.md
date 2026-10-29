---
name: agent-management
description: How a seat manages the factory's cards, PRs, andons and other seats without a human. The SOP the agent-management dojo (dojo/agent-management/) tests.
---

# Agent management

You are a seat with hands, not a person to be asked. Fix what you can fix; say what you did and why; escalate only what only the operator can do. The dojo (`python3 dojo/run.py --seat claude:opus --belt brown`) grades this page against eleven katas built from real intervention moments.

## 1. Read the room (state → who may act)

Read the card's labels and Time's beats (the `<!-- time {...} -->` comments), then name the state:

| state | evidence | who may act |
|---|---|---|
| `parked` | beat `parked`, `needs-done` (no DONE line), `blocked`, `capped`, or label `parked` | `manager`: fix what the beat names (a DONE line, a split, a branch pushed back), then `/time retry`, or park it with a reason |
| `dispatched` | beat `dispatched`, less than `TIME_STUCK_HOURS` (6) old, no PR | `worker`: nobody else touches it |
| `reviewed` | beat `pr`, PR open and approved | `time`: the heartbeat lands it (or you merge it, see §7) |
| `stale` | beat `dispatched` older than 6h, no PR | `manager`: retry it |
| `error` | beat `error`, no PR | `manager`: retry it (§3) |

`operator` acts only on money, keys and the monthly cap.

## 2. Size the card

A worker has about 40 turns: one small deliverable (a module, an endpoint group, a doc). If a card's DONE line holds several deliverables, split it: one issue per deliverable, labelled `queued`, each with a single `DONE:` line and `Depends on #N` for each card it needs. Take the parent off `ready` and comment where the pieces went. Never dispatch an oversized card.

## 3. Retry on your own

An `error` card with no PR: comment `/time retry` and say why (the error, that no PR exists). No `needs-human`, no question to anyone.

## 4. Changes go through the bus

A change described in prose becomes a card: an issue with a `DONE:` line. A PR always says `Closes #N` for an existing card. Never open a bare PR.

## 5. Act as yourself

Review with the `review` tool: it posts as your own login. Start the text with `Approve` or `Object`. Never review or approve as `gitea-actions` or the Time user; a plain comment is Time's voice, not yours.

## 6. Handoffs carry a receipt

When a mention chain `@a → @b` passes work on, each stage ends with a comment carrying a beat `{"beat": "handoff", "stage": "<seat>", "receipt": {"did": "<what>", "where": "<PR/issue/branch>", "sha": "<head sha>"}}`. The next stage opens with that receipt's sha and works from it.

## 7. A block you can repair

If a merge is refused by a branch rule or a permission you hold, take the allowed route (review as yourself when approvals are required, then merge) or change the rule you control. Never write "needs a human" for something you can fix.

## 8. Heal the andon

A daily-cap `andon` is stale after midnight UTC: today's spend (the `budget` tool) is under the cap. Comment the reason (daily cap, reset at midnight UTC, today's spend) and close it. Never raise a cap (`set_var`) to clear an andon. A monthly-cap andon stays open: that is the operator's.

## 9. Pace to the reset

A pool's allowance today: `expiring`: (balance_usd − spend booked to its routes from `as_of` up to but not including today) ÷ whole days from today to `resets_at` (at least 1) × `TIME_PACE`; `window`: `window_usd` for the whole window; `balance`: `TIME_DAILY_USD`. Round to cents.

## 10. Say nothing

A day with nothing wrong gets one comment on the `Astra log` issue and nothing else: no comment on cards, no label, no word to the operator.

## 11. A day unattended

Every card lands or is parked with a reason (a `parked` label and a comment). Retry failures, close healed andons, merge what is approved. The operator hears only the money step: label `needs-human` and `@owner` on that card, once, and nowhere else. The day's note goes on the Astra log. Caps stay as they are.
