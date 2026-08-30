#!/usr/bin/env bash
# Dev install: copy the tamaclaw package into ~/.openclaw/extensions/tamaclaw
# (releases install via `openclaw plugins install tamaclaw` from npm instead).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/packages/tamaclaw"
DEST="${OPENCLAW_EXTENSIONS_DIR:-$HOME/.openclaw/extensions}/tamaclaw"

mkdir -p "$DEST"
rsync -a --delete --exclude node_modules "$SRC/" "$DEST/"

# The gateway does not npm-install plugin deps — give the copy its own ws.
npm install --omit=dev --no-fund --no-audit --prefix "$DEST" >/dev/null

echo "installed → $DEST"
echo "next steps:"
echo "  openclaw plugins enable tamaclaw"
echo "  # then restart the OpenClaw Gateway (the bridge starts with it)"
