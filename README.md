# Tamaclaw 🥚🦞

Companion display for [OpenClaw](https://github.com/openclaw): an animated
digital pet that lives on a small screen connected to a Mac mini and acts as
the agent's "face" — it speaks, shows emotions, notifications, and dashboard
widgets.

Everything lives in **a single distributable npm package** (`tamaclaw`):
OpenClaw plugin + bridge + display. Installing the plugin installs
everything — the bridge starts as a Gateway service.

```
tamaclaw/
├── packages/tamaclaw/         # THE package (npm: "tamaclaw")
│   ├── index.ts               #   OpenClaw plugin: tools + bridge service
│   ├── openclaw.plugin.json   #   manifest (config: port, startBridge, …)
│   ├── bridge/                #   REST in → WebSocket out + TTS + wake
│   │   └── main.ts            #   standalone entry (npm run dev)
│   ├── display/               #   kiosk app (the face) — vanilla JS + chart.js vendored
│   ├── shared/protocol.ts     #   protocol event types
│   ├── shell/                 #   native macOS window (Swift + WKWebView)
│   └── skills/tamaclaw/       #   SKILL.md for the agent
├── demo.sh                    # Show of example events via curl
└── scripts/
    ├── build-shell.sh         # Build dist/Tamaclaw.app (native window)
    ├── install-plugin.sh      # Dev install (copies to ~/.openclaw/extensions)
    └── pack.sh                # Self-contained tarball for release (dist/*.tgz)
```

## Quick start

Requires Node ≥ 23.6 (runs TypeScript natively — no build step).

```bash
npm install
npm run dev          # starts the bridge, which serves the display at http://localhost:4321
```

Open `http://localhost:4321` (on the Mac mini: Chromium in kiosk mode, see
below) and from another terminal:

```bash
curl -X POST localhost:4321/say -H 'content-type: application/json' \
  -d '{"text":"hello, I am Tamaclaw","mood":"happy"}'
```

→ the character animates, speaks through the speakers and smiles. For the
full tour (charts, toasts, critical interruption):

```bash
./demo.sh
```

## Bridge REST API

| Endpoint | Body | Effect |
| --- | --- | --- |
| `POST /say` | `{text, mood?, voice?, rate?}` | Speaks (queued, with lip-sync) |
| `POST /notify` | `{title, body?, level?, ttl?, sound?}` | Toast `info`/`warning`/`critical` — critical chimes and interrupts current audio |
| `POST /dashboard` | `{widget, chart, title, data, pin?, ttl?}` | Chart widget (same `widget` = replaces; `pin` = never expires) |
| `POST /show` | `{icon?, title?, source?, body?, html?, ttl?, say?, clear?}` | Chat-style content card (email summary, Slack, news, or **arbitrary HTML**: charts, tables…) — the pet steps aside and the card takes the stage; `say` reads it aloud; auto-dismisses or use `clear` |
| `POST /mood` | `{value}` | `idle` · `thinking` · `talking` · `happy` · `alert` · `sleeping` |
| `POST /skin` | `{value}` | Switches the pet: `nebula` · `pixa` · `mochi` · `holo` · `claw` |
| `GET /health` | — | Bridge status |

Data formats: `[{"label","value"}, …]` or
`{"labels":[…], "series":[{"label","values":[…]}]}` (multi-series).

Bridge environment variables: `TAMACLAW_PORT` (4321), `TAMACLAW_VOICE`,
`TAMACLAW_RATE`, and `TAMACLAW_TTS` (see below).

## Voice (TTS)

The default is macOS `say`: zero dependencies, offline, free. Optional
higher-quality engines via `TAMACLAW_TTS`:

| `TAMACLAW_TTS` | Engine | Requires | Notes |
| --- | --- | --- | --- |
| `say` (default) | macOS `say` | nothing | 💡 Download an *Enhanced/Premium* voice in Settings → Accessibility → Spoken Content and use `TAMACLAW_VOICE="Samantha (Enhanced)"` — big quality jump, free |
| `openai` | OpenAI TTS (`gpt-4o-mini-tts`) | `OPENAI_API_KEY` | Natural neural voices, ~pennies per hour of speech. Voice via `TAMACLAW_OPENAI_VOICE` (default `nova`) |
| `elevenlabs` | ElevenLabs (`eleven_flash_v2_5`) | `ELEVENLABS_API_KEY` | Top quality on the market, free tier available. Voice via `TAMACLAW_ELEVEN_VOICE` (voice id) |
| `off` | silence | nothing | Keeps lip-sync on screen |

Cloud engines **automatically fall back to `say`** if the request fails
(no network, no quota, invalid key) — the pet never goes silent. The `voice`
field in `POST /say` lets you change the voice per utterance on any engine
(on ElevenLabs it's the voice id).

Example:

```bash
ELEVENLABS_API_KEY=xi-... TAMACLAW_TTS=elevenlabs npm run start
```

## Pets (skins)

5 interchangeable pets, all with the full mood state machine:

| Skin | Vibe |
| --- | --- |
| 🪐 `nebula` | Luminous AI orb — breathing gradients, equalizer mouth when talking |
| 👾 `pixa` | Retro pixel-art tamagotchi — CRT scanlines, 2-frame lip-sync |
| 🍡 `mochi` | Kawaii squishy pastel — squash & stretch, oversized eyes |
| 👻 `holo` | Y2K iridescent ghost — holographic chrome and sparkles |
| 🦞 `claw` | The classic coral blob from v1 |

On first launch the display shows the **initial setup** to choose a pet
(live preview when you tap each option). To change later:

- `⚙ skin` button (bottom right) or press `s` on the display,
- `curl -X POST localhost:4321/skin -d '{"value":"pixa"}'`,
- or the `tamaclaw_skin` tool from OpenClaw.

The choice persists in `localStorage` (and the bridge re-sends the last
selection via API to displays that reconnect).

## Character behavior

- **idle**: breathes, blinks, micro-movements.
- **talking**: animated mouth between `say:start` and `say:end` (pseudo-amplitude;
  the voice layer is abstracted in `packages/tamaclaw/bridge/tts.ts` to plug in
  ElevenLabs/OpenAI TTS with real amplitude later).
- **happy / alert**: revert to idle after ~8s.
- **sleeping**: after 3 min without events, or if it loses connection to the
  bridge (auto-reconnection with backoff).
- `say` utterances are queued and never overlap; a `critical` notification
  interrupts the one currently playing.
- Widgets rotate in a carousel; unpinned ones expire (default 2 min).

## Installing in OpenClaw

On the Gateway machine:

```bash
openclaw plugins install tamaclaw
openclaw plugins enable tamaclaw
# restart the Gateway — the bridge and display start with it
```

Without npm (private release): `npm run pack` generates
`dist/tamaclaw-x.y.z.tgz`, self-contained, and installs with
`openclaw plugins install ./tamaclaw-x.y.z.tgz`.

For local development: `npm run install-plugin` (copies + deps to
`~/.openclaw/extensions/tamaclaw`), or
`openclaw plugins install --link ./packages/tamaclaw` to link without copying.

The plugin registers the `tamaclaw-bridge` service (configurable with
`startBridge: false` if you prefer running the bridge separately) and the
tools `tamaclaw_say`, `tamaclaw_notify`, `tamaclaw_chart`, `tamaclaw_show`,
`tamaclaw_mood`, `tamaclaw_skin`. The skill (`skills/tamaclaw/SKILL.md`)
teaches the agent to notify on long-running task completions, send charts
instead of text tables, and use moods as ambient feedback. If the bridge is
down, tools return a clear error in ~3s — they never hang the agent.

Package details in [packages/tamaclaw/README.md](packages/tamaclaw/README.md).

## Wake: the screen turns on automatically

When a `say`, `notify`, `dashboard`, or `show` event arrives, the bridge runs
`caffeinate -u -t 15`: macOS treats it as user activity and **turns the
screen on instantly**, before the voice starts. The screen can sleep freely
between events — Tamaclaw wakes it when OpenClaw has something to say.
Config: `TAMACLAW_WAKE=off` to disable, `TAMACLAW_WAKE_SECS` for the
minimum seconds the screen stays on (default 15).

⚠️ `caffeinate` only wakes the *screen*. If the **system** itself sleeps,
the bridge won't even receive the event. On the kiosk Mac mini, disable
system sleep once (the screen can still sleep):

```bash
sudo pmset -a sleep 0 displaysleep 10
```

With that the flow becomes: screen off → OpenClaw sends an event → screen
turns on → the pet wakes up (exits `sleeping` mood) → speaks.

## Native window (no browser)

`packages/tamaclaw/shell/` is a minimal native macOS app (one Swift file +
WKWebView, builds with `swiftc` — only Command Line Tools, no Xcode) that
shows the display in a borderless window filling the screen of your choice.
Ideal for a small secondary monitor with a different resolution: the layout
is responsive and adapts automatically.

```bash
./scripts/build-shell.sh          # → dist/Tamaclaw.app
dist/Tamaclaw.app/Contents/MacOS/Tamaclaw            # auto: secondary monitor if available
TAMACLAW_SCREEN=1 dist/…/Tamaclaw                    # screen by index
TAMACLAW_WINDOW=1 dist/…/Tamaclaw                    # normal window (dev)
TAMACLAW_FLOAT=1  dist/…/Tamaclaw                    # always on top
```

Behavior: no Dock icon (`LSUIElement`), retries every 2s until the bridge is
up, and re-adjusts if you connect/disconnect monitors or change the
resolution. `TAMACLAW_URL` points to another host/port if needed.

**Persistence** (start at login + relaunch on crash): LaunchAgent template at
[scripts/com.tamaclaw.shell.plist](scripts/com.tamaclaw.shell.plist) — adjust
the path, copy to `~/Library/LaunchAgents/`, and `launchctl load`.

Alternative without compiling anything: Chrome kiosk
(`open -a "Google Chrome" --args --kiosk --app=http://localhost:4321`).

## Development

- `npm run dev` — standalone bridge with `--watch`.
- The display is static: reload the browser after editing
  `packages/tamaclaw/display/`.
- `npm run pack` — builds and validates the release tarball in `dist/`
  (verifies that `ws` is bundled and chart.js is vendored).
