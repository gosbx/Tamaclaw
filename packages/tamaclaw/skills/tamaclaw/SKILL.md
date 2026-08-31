---
name: tamaclaw
description: Use the Tamaclaw companion display (voice, notifications, dashboard charts, moods) as the agent's physical face. Activate whenever a task finishes, metrics are requested, or ambient feedback would help the user.
metadata: { "openclaw": { "emoji": "🦞" } }
---

# Tamaclaw — the agent's face

A small screen next to the user shows Tamaclaw, an animated pet that represents you.
You control it with four tools. If a tool answers "bridge is not reachable", the display
is off — mention it once and carry on; never retry in a loop.

## When to use each tool

| Situation | Tool | Example |
| --- | --- | --- |
| A long task finished (deploy, build, migration) | `tamaclaw_say` + `tamaclaw_notify` | say "Deploy finished", notify title "Deploy OK" level info |
| Something needs the user's eyes NOW | `tamaclaw_notify` level `critical` | "CI broken on main" |
| Something looks off but isn't urgent | `tamaclaw_notify` level `warning` | "Disk at 85%" |
| The user asks for metrics / numbers / "how are sales going" | `tamaclaw_chart` | bar chart instead of a text table |
| Content the user should READ: email summary, important Slack message, news, a report | `tamaclaw_show` | icon 📧/💬/📰 + title + body text; the mascot steps aside and the card takes the stage |
| Rich/custom visuals: pie or bar charts as inline SVG/CSS, tables, comparisons | `tamaclaw_show` with `html` | any HTML renders in the card (scripts don't execute) |
| You start a long-running job | `tamaclaw_mood` `thinking` | ambient "I'm working on it" |
| A task succeeded | `tamaclaw_mood` `happy` | after tests pass |
| An error appeared | `tamaclaw_mood` `alert` | build failure |
| The user asks to change the pet's look | `tamaclaw_skin` | "switch to the pixel one" → skin `pixa` |

## Guidelines

- **`tamaclaw_show` is for content, `tamaclaw_notify` for pings.** A one-line
  heads-up is a notify; something with substance to read (summary, message,
  article, custom chart) is a show. Pair it with `say` for a one-sentence
  spoken version — never read the whole card out loud. It auto-dismisses
  (default 45s; pass a longer `ttl` for dense content), a new show replaces
  the current one, and `clear: true` dismisses it.

- **Prefer charts over text** when the user asks for metrics: send `tamaclaw_chart`
  and give a one-line verbal summary with `tamaclaw_say`.   Reuse a stable `widget`
  id (e.g. `sales_today`) so updates replace the old chart instead of stacking.
  Use `pin: true` only for things the user wants to keep watching.
- **Keep speech short.** One or two sentences, conversational. The queue never drops utterances, so don't spam `say`.
- **Moods are ambient, not chatty.** Set `thinking` when starting long work,
  `happy`/`alert` at the end. The character returns to idle on its own — no
  need to reset it.
- **critical interrupts speech** on the display. Reserve it for things that
  genuinely need immediate attention.
- Don't echo everything you say in chat to the display; use it for moments
  that matter (task completions, alerts, requested dashboards).
