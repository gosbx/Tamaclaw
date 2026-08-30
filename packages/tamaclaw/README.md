# tamaclaw 🥚🦞

Companion display for [OpenClaw](https://openclaw.ai): an animated mascot that
lives on a small screen, speaks out loud, shows emotions, notifications and
dashboard charts — the agent's face.

One package = everything: OpenClaw plugin + local bridge (REST → WebSocket +
TTS) + the kiosk display app. No build step (Node ≥ 23.6 runs the TypeScript
directly), no external services.

## Install

```bash
openclaw plugins install tamaclaw
openclaw plugins enable tamaclaw
# restart the Gateway — the bridge + display server start with it
```

Open `http://localhost:4321` on the kiosk screen. First run shows the mascot
picker (5 skins: 🪐 nebula, 👾 pixa, 🍡 mochi, 👻 holo, 🦞 claw).

## Tools the agent gets

| Tool | Effect |
| --- | --- |
| `tamaclaw_say(text, mood?)` | Speaks out loud (queued, lip-synced) |
| `tamaclaw_notify(title, body?, level?, ttl?)` | Toast — `info` / `warning` / `critical` (critical chimes and interrupts speech) |
| `tamaclaw_chart(widget, title, type, data, pin?, ttl?)` | Chart widget on the dashboard carousel |
| `tamaclaw_show(icon?, title?, source?, body?, html?, ttl?, say?, clear?)` | Rich content card, chat-style: email/Slack/news summaries or any HTML — the mascot steps aside to a corner |
| `tamaclaw_mood(mood)` | Ambient emotion: `idle` `thinking` `talking` `happy` `alert` `sleeping` |
| `tamaclaw_skin(skin)` | Switch mascot |

A bundled skill teaches the agent when to use them. If the bridge is down,
tools fail fast (~3s) with a clear message — they never hang the agent.

## REST API (same features, any client)

`POST /say · /notify · /dashboard · /show · /mood · /skin` and `GET /health`
on port 4321. Example:

```bash
curl -X POST localhost:4321/say -H 'content-type: application/json' \
  -d '{"text":"deploy terminado","mood":"happy"}'
```

## Config (plugin config or env)

| Key | Default | |
| --- | --- | --- |
| `port` / `TAMACLAW_PORT` | `4321` | Bridge/display port |
| `startBridge` | `true` | Run the bridge inside the Gateway; `false` if you run `node bridge/main.ts` yourself |
| `bridgeUrl` / `TAMACLAW_BRIDGE_URL` | `http://127.0.0.1:<port>` | Where tools POST |
| `TAMACLAW_TTS` | `say` | `say` (macOS) · `openai` · `elevenlabs` · `off` — cloud engines fall back to `say` on failure |
| `TAMACLAW_VOICE` / `TAMACLAW_RATE` | system | Voice / wpm for `say` |
| `TAMACLAW_WAKE` | on | `caffeinate -u` wakes the screen on events (`off` to disable) |
| `TAMACLAW_SKIN` | — | Force a mascot at startup |

Kiosk tips (Mac mini): `sudo pmset -a sleep 0 displaysleep 10` so the system
never sleeps (the screen may — Tamaclaw wakes it on events).

## Native window (no browser)

`shell/` contains a tiny native macOS app (Swift + WKWebView) that shows the
display as a borderless window filling a chosen screen — made for a small
secondary monitor. Build it inside the installed package:

```bash
npm run shell:build          # needs Xcode Command Line Tools (swiftc)
dist/Tamaclaw.app/Contents/MacOS/Tamaclaw   # auto-picks the secondary screen
```

`TAMACLAW_SCREEN=<i|main|secondary>`, `TAMACLAW_WINDOW=1` (normal window),
`TAMACLAW_FLOAT=1` (always on top), `TAMACLAW_URL` (remote bridge). It retries
until the bridge is up and follows screen layout changes. Browser kiosk mode
works too: `open -a "Google Chrome" --args --kiosk --app=http://localhost:4321`.

## Standalone (no OpenClaw)

```bash
npx tamaclaw   # once published — or: node bridge/main.ts
```

The bridge is just a local HTTP server; anything that can `curl` can drive
the mascot.
