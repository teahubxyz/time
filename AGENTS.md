# Agents

- **Managing the factory's own seats** (cards, PRs, andons, handoffs): follow [.agents/skills/agent-management/SKILL.md](.agents/skills/agent-management/SKILL.md). The dojo that tests it lives in `dojo/`: `python3 dojo/run.py --seat claude:opus --belt brown` (real model calls, results in `dojo/results/`), `python3 dojo/run.py --selftest` (offline, runs in `test_time.py`).
- Housekeeping: [.agents/skills/housekeeping/SKILL.md](.agents/skills/housekeeping/SKILL.md).
- Setting up Time: [.claude/skills/time/SKILL.md](.claude/skills/time/SKILL.md).
- **Every page we ship needs room at the top for installed PWAs.** Installed as an app (desktop or phone), the window's own controls (macOS traffic lights, back/forward, share, the phone's status bar) sit over the top of the page. Keep a top bar's content out from under them: `viewport-fit=cover` with `env(safe-area-inset-*)` padding, and where the manifest uses `window-controls-overlay`, `env(titlebar-area-x/width/height)` so the bar sits beside the controls, not under them. Check it installed, not just in a tab.
