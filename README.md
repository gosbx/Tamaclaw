# Tamaclaw 🥚🦞

Companion display para [OpenClaw](https://github.com/openclaw): una mascota
digital animada que vive en una pantalla pequeña conectada a un Mac mini y
actúa como la "cara" del agente — habla, muestra emociones, notificaciones y
widgets de dashboard.

Todo vive en **un solo paquete npm distribuble** (`tamaclaw`): plugin de
OpenClaw + bridge + display. Instalar el plugin instala todo — el bridge
arranca como servicio del Gateway.

```
tamaclaw/
├── packages/tamaclaw/         # EL paquete (npm: "tamaclaw")
│   ├── index.ts               #   plugin OpenClaw: tools + servicio del bridge
│   ├── openclaw.plugin.json   #   manifest (config: port, startBridge, …)
│   ├── bridge/                #   REST in → WebSocket out + TTS + wake
│   │   └── main.ts            #   entry standalone (npm run dev)
│   ├── display/               #   app kiosk (el rostro) — vanilla JS + chart.js vendored
│   ├── shared/protocol.ts     #   tipos del protocolo de eventos
│   └── skills/tamaclaw/       #   SKILL.md para el agente
├── demo.sh                    # Show de eventos de ejemplo vía curl
└── scripts/
    ├── install-plugin.sh      # Instalación dev (copia a ~/.openclaw/extensions)
    └── pack.sh                # Tarball auto-contenido para release (dist/*.tgz)
```

## Quick start

Requiere Node ≥ 23.6 (ejecuta TypeScript nativamente — sin build step).

```bash
npm install
npm run dev          # levanta el bridge, que sirve la display en http://localhost:4321
```

Abre `http://localhost:4321` (en el Mac mini: Chromium en modo kiosk, ver abajo)
y desde otra terminal:

```bash
curl -X POST localhost:4321/say -H 'content-type: application/json' \
  -d '{"text":"hola, soy Tamaclaw","mood":"happy"}'
```

→ el personaje se anima, habla por los parlantes y sonríe. Para el tour
completo (charts, toasts, interrupción crítica):

```bash
./demo.sh
```

## API REST del bridge

| Endpoint | Body | Efecto |
| --- | --- | --- |
| `POST /say` | `{text, mood?, voice?, rate?}` | Habla (encolado, con lip-sync) |
| `POST /notify` | `{title, body?, level?, ttl?, sound?}` | Toast `info`/`warning`/`critical` — critical suena e interrumpe el audio en curso |
| `POST /dashboard` | `{widget, chart, title, data, pin?, ttl?}` | Widget de chart (mismo `widget` = reemplaza; `pin` = no expira) |
| `POST /show` | `{icon?, title?, source?, body?, html?, ttl?, say?, clear?}` | Tarjeta de contenido estilo chat (resumen de email, Slack, noticia, o **HTML arbitrario**: charts, tablas…) — la mascota se hace a un lado y la tarjeta toma el escenario; `say` la lee en voz alta; expira sola o con `clear` |
| `POST /mood` | `{value}` | `idle` · `thinking` · `talking` · `happy` · `alert` · `sleeping` |
| `POST /skin` | `{value}` | Cambia la mascota: `nebula` · `pixa` · `mochi` · `holo` · `claw` |
| `GET /health` | — | Estado del bridge |

Formatos de `data`: `[{"label","value"}, …]` o
`{"labels":[…], "series":[{"label","values":[…]}]}` (multi-serie).

Variables de entorno del bridge: `TAMACLAW_PORT` (4321), `TAMACLAW_VOICE`,
`TAMACLAW_RATE`, y `TAMACLAW_TTS` (ver abajo).

## Voz (TTS)

El default es `say` de macOS: cero dependencias, offline, gratis. Motores
opcionales de más calidad vía `TAMACLAW_TTS`:

| `TAMACLAW_TTS` | Motor | Requiere | Notas |
| --- | --- | --- | --- |
| `say` (default) | macOS `say` | nada | 💡 Descarga una voz *Enhanced/Premium* en Ajustes → Accesibilidad → Contenido hablado y usa `TAMACLAW_VOICE="Paulina (Enhanced)"` — gran salto de calidad, gratis |
| `openai` | OpenAI TTS (`gpt-4o-mini-tts`) | `OPENAI_API_KEY` | Voces neurales naturales, ~centavos por hora de voz. Voz con `TAMACLAW_OPENAI_VOICE` (default `nova`) |
| `elevenlabs` | ElevenLabs (`eleven_flash_v2_5`) | `ELEVENLABS_API_KEY` | La calidad top del mercado, tier gratis disponible. Voz con `TAMACLAW_ELEVEN_VOICE` (voice id) |
| `off` | silencio | nada | Mantiene el lip-sync en pantalla |

Los motores cloud hacen **fallback automático a `say`** si la petición falla
(sin red, sin cuota, key inválida) — la mascota nunca se queda muda. El campo
`voice` de `POST /say` permite cambiar la voz por frase en cualquier motor
(en ElevenLabs es el voice id).

Ejemplo:

```bash
ELEVENLABS_API_KEY=xi-... TAMACLAW_TTS=elevenlabs npm run start
```

## Mascotas (skins)

5 mascotas intercambiables, todas con la máquina de moods completa:

| Skin | Vibe |
| --- | --- |
| 🪐 `nebula` | Orbe IA luminoso — gradientes que respiran, boca ecualizadora al hablar |
| 👾 `pixa` | Pixel-art retro tamagotchi — scanlines CRT, lip-sync de 2 frames |
| 🍡 `mochi` | Kawaii squishy pastel — squash & stretch, ojos gigantes |
| 👻 `holo` | Fantasmita Y2K iridiscente — cromo holográfico y destellos |
| 🦞 `claw` | El blob coral clásico de la v1 |

En el primer arranque la display muestra el **setup inicial** para elegir
(preview en vivo al tocar cada opción). Para cambiar después:

- botón `⚙ skin` (abajo a la derecha) o tecla `s` en la display,
- `curl -X POST localhost:4321/skin -d '{"value":"pixa"}'`,
- o la tool `tamaclaw_skin` desde OpenClaw.

La elección persiste en `localStorage` (y el bridge re-manda la última
elegida vía API a displays que se reconectan).

## Comportamiento del personaje

- **idle**: respira, parpadea, micro-movimientos.
- **talking**: boca animada entre `say:start` y `say:end` (pseudo-amplitud;
  la capa de voz está abstraída en `packages/bridge/src/tts.ts` para enchufar
  ElevenLabs/OpenAI TTS con amplitud real después).
- **happy / alert**: vuelven solos a idle a los ~8s.
- **sleeping**: tras 3 min sin eventos, o si pierde conexión con el bridge
  (reconexión automática con backoff).
- Los `say` se encolan y nunca se pisan; un `notify` critical interrumpe el
  que esté sonando.
- Los widgets rotan en carrusel; los no-pineados expiran (default 2 min).

## Instalación en OpenClaw

Una vez publicado en npm, en la máquina del Gateway:

```bash
openclaw plugins install tamaclaw
openclaw plugins enable tamaclaw
# reiniciar el Gateway — el bridge y la display arrancan con él
```

Sin npm (release privado): `npm run pack` genera `dist/tamaclaw-x.y.z.tgz`
auto-contenido y se instala con `openclaw plugins install ./tamaclaw-x.y.z.tgz`.

Para desarrollo local: `npm run install-plugin` (copia + deps a
`~/.openclaw/extensions/tamaclaw`), o
`openclaw plugins install --link ./packages/tamaclaw` para enlazar sin copiar.

El plugin registra el servicio `tamaclaw-bridge` (configurable con
`startBridge: false` si prefieres correr el bridge aparte) y las tools
`tamaclaw_say`, `tamaclaw_notify`, `tamaclaw_chart`, `tamaclaw_mood`,
`tamaclaw_skin`. El skill (`skills/tamaclaw/SKILL.md`) le enseña al agente a
notificar al terminar tareas largas, mandar charts en vez de tablas de texto
y usar moods como feedback ambiental. Si el bridge está caído, las tools
devuelven un error claro en ~3s — no cuelgan al agente.

Detalles del paquete en [packages/tamaclaw/README.md](packages/tamaclaw/README.md).

## Wake: la pantalla se enciende sola

Cuando llega un `say`, `notify` o `dashboard`, el bridge ejecuta
`caffeinate -u -t 15`: macOS lo trata como actividad de usuario y **enciende
la pantalla al instante**, antes de que empiece la voz. La pantalla puede
apagarse tranquila entre eventos — Tamaclaw la despierta cuando OpenClaw
tenga algo que decir. Config: `TAMACLAW_WAKE=off` para desactivarlo,
`TAMACLAW_WAKE_SECS` para el mínimo de segundos encendida (default 15).

⚠️ `caffeinate` solo despierta la *pantalla*. Si el **sistema** entero se
duerme, el bridge ni siquiera recibe el evento. En el Mac mini kiosk,
desactiva el sleep del sistema una vez (la pantalla sí puede dormir):

```bash
sudo pmset -a sleep 0 displaysleep 10
```

Con eso el flujo queda: pantalla negra → OpenClaw manda un evento → pantalla
se enciende → la mascota despierta (sale del mood `sleeping`) → habla.

## Ventana nativa (sin navegador)

`packages/tamaclaw/shell/` es una app macOS nativa mínima (un archivo Swift +
WKWebView, compila con `swiftc` — solo Command Line Tools, sin Xcode) que
muestra la display en una ventana sin bordes que llena la pantalla que elijas.
Ideal para un monitor anexo pequeño con otra resolución: el layout es
responsive y se adapta solo.

```bash
./scripts/build-shell.sh          # → dist/Tamaclaw.app
dist/Tamaclaw.app/Contents/MacOS/Tamaclaw            # auto: monitor secundario si existe
TAMACLAW_SCREEN=1 dist/…/Tamaclaw                    # pantalla por índice
TAMACLAW_WINDOW=1 dist/…/Tamaclaw                    # ventana normal (dev)
TAMACLAW_FLOAT=1  dist/…/Tamaclaw                    # siempre encima
```

Comportamiento: sin ícono en el dock (`LSUIElement`), reintenta cada 2s hasta
que el bridge esté arriba, y se reacomoda si conectas/desconectas monitores o
cambia la resolución. `TAMACLAW_URL` apunta a otro host/puerto si hace falta.

**Persistencia** (arranque al login + relanzar si muere): plantilla de
LaunchAgent en [scripts/com.tamaclaw.shell.plist](scripts/com.tamaclaw.shell.plist) —
ajusta la ruta, cópialo a `~/Library/LaunchAgents/` y `launchctl load`.

Alternativa sin compilar nada: Chrome kiosk
(`open -a "Google Chrome" --args --kiosk --app=http://localhost:4321`).

## Desarrollo

- `npm run dev` — bridge standalone con `--watch`.
- La display es estática: recarga el navegador tras editar
  `packages/tamaclaw/display/`.
- `npm run pack` — construye y valida el tarball de release en `dist/`
  (verifica que `ws` va bundled y chart.js vendored).
