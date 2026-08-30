#!/usr/bin/env bash
# Build dist/Tamaclaw.app — the native window shell for the display.
# Needs only the Xcode Command Line Tools (swiftc).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHELL_DIR="$ROOT/packages/tamaclaw/shell"
APP="$ROOT/dist/Tamaclaw.app"

mkdir -p "$APP/Contents/MacOS"
swiftc -O "$SHELL_DIR/TamaclawShell.swift" -o "$APP/Contents/MacOS/Tamaclaw"
cp "$SHELL_DIR/Info.plist" "$APP/Contents/Info.plist"
codesign --force --sign - "$APP" 2>/dev/null || true

echo "→ $APP"
echo "run:  $APP/Contents/MacOS/Tamaclaw"
echo "      TAMACLAW_SCREEN=1 $APP/Contents/MacOS/Tamaclaw   # monitor anexo por índice"
echo "      TAMACLAW_WINDOW=1 $APP/Contents/MacOS/Tamaclaw   # ventana normal (dev)"
