#!/usr/bin/env bash
# ============================================================================
# Tamaclaw Setup & Launch
# ============================================================================
# One command to go from zero to a running Tamaclaw display.
#
# What it does (step by step):
#   1. Checks prerequisites (Node >= 23.6, openclaw CLI)
#   2. Installs the tamaclaw plugin (if not already installed)
#   3. Enables the plugin (if not already enabled)
#   4. Restarts the OpenClaw Gateway (so the bridge service registers)
#   5. Waits for the bridge to be healthy
#   6. Opens the display (browser or kiosk mode)
#
# Usage:
#   ./launch.sh                  # install + open in default browser
#   ./launch.sh --kiosk          # install + open in Chrome kiosk (fullscreen, no UI)
#   ./launch.sh --standalone     # skip OpenClaw, just run the bridge + open display
#   ./launch.sh --port 5000      # use a custom port
#
# Environment variables:
#   TAMACLAW_PORT    Bridge port (default 4321)
#   TAMACLAW_TTS     TTS engine: say, openai, elevenlabs, off
# ============================================================================
set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────────────

PORT="${TAMACLAW_PORT:-4321}"
KIOSK=false
STANDALONE=false
SKIP_INSTALL=false

# ── Parse args ──────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --kiosk)       KIOSK=true; shift ;;
    --standalone)  STANDALONE=true; shift ;;
    --skip-install) SKIP_INSTALL=true; shift ;;
    --port)        PORT="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--kiosk] [--standalone] [--skip-install] [--port N]"
      echo ""
      echo "  --kiosk         Open display in Chrome kiosk mode (fullscreen, no UI)"
      echo "  --standalone    Run the bridge directly, skip OpenClaw plugin install"
      echo "  --skip-install  Skip plugin install/enable, just restart and open"
      echo "  --port N        Bridge port (default: 4321)"
      exit 0
      ;;
    *) echo "Unknown option: $1. Use --help for usage."; exit 1 ;;
  esac
done

export TAMACLAW_PORT="$PORT"
URL="http://localhost:$PORT"

# ── Helpers ─────────────────────────────────────────────────────────────────

step() { echo ""; echo "── $1"; }
ok()   { echo "   ✓ $1"; }
skip() { echo "   · $1 (skipped)"; }
fail() { echo "   ✗ $1"; exit 1; }
warn() { echo "   ! $1"; }

wait_for_health() {
  local url="$1" max="$2" i=0
  while [[ $i -lt $max ]]; do
    if curl -sf "$url/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}

# ── Step 1: Prerequisites ──────────────────────────────────────────────────

step "Checking prerequisites"

# Node.js
if ! command -v node &>/dev/null; then
  fail "Node.js is not installed. Install Node >= 23.6: https://nodejs.org"
fi

NODE_MAJOR=$(node -e 'console.log(process.versions.node.split(".")[0])')
if [[ "$NODE_MAJOR" -lt 23 ]]; then
  fail "Node.js $NODE_MAJOR found, but >= 23.6 is required. Update: https://nodejs.org"
fi
ok "Node.js $(node -v)"

# OpenClaw (unless standalone)
if ! $STANDALONE; then
  if ! command -v openclaw &>/dev/null; then
    warn "openclaw CLI not found — switching to standalone mode"
    STANDALONE=true
  else
    ok "OpenClaw $(openclaw --version 2>/dev/null | head -1)"
  fi
fi

# ── Step 2: Install plugin ─────────────────────────────────────────────────

if ! $STANDALONE && ! $SKIP_INSTALL; then
  step "Installing tamaclaw plugin"

  # Check if already installed
  if openclaw plugins list 2>/dev/null | grep -q "tamaclaw"; then
    ok "tamaclaw is already installed"
  else
    echo "   Installing from npm..."
    if openclaw plugins install tamaclaw 2>&1; then
      ok "tamaclaw installed"
    else
      fail "Failed to install tamaclaw plugin. Check the output above."
    fi
  fi

  # ── Step 3: Enable plugin ───────────────────────────────────────────────

  step "Enabling tamaclaw plugin"

  if openclaw plugins list 2>/dev/null | grep "tamaclaw" | grep -q "enabled"; then
    ok "tamaclaw is already enabled"
  else
    if openclaw plugins enable tamaclaw 2>&1; then
      ok "tamaclaw enabled"
    else
      fail "Failed to enable tamaclaw plugin."
    fi
  fi

  # ── Step 4: Restart Gateway ─────────────────────────────────────────────

  step "Restarting OpenClaw Gateway"

  # Check if gateway is running
  if openclaw gateway status 2>/dev/null | grep -q "running"; then
    echo "   Stopping gateway..."
    openclaw gateway stop 2>/dev/null || true
    sleep 2
  fi

  echo "   Starting gateway..."
  openclaw gateway start 2>/dev/null &
  disown 2>/dev/null || true
  sleep 3
  ok "Gateway restarted"

  # ── Step 5: Wait for bridge ─────────────────────────────────────────────

  step "Waiting for Tamaclaw bridge on port $PORT"

  if wait_for_health "$URL" 15; then
    ok "Bridge is healthy at $URL"
  else
    warn "Bridge didn't start via Gateway — starting it directly"
    STANDALONE=true
  fi
fi

# ── Standalone: start bridge directly ───────────────────────────────────────

if $STANDALONE; then
  step "Starting Tamaclaw bridge (standalone)"

  # Find the bridge entry point
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  BRIDGE=""

  # Check various locations
  for candidate in \
    "$SCRIPT_DIR/packages/tamaclaw/bridge/main.ts" \
    "$SCRIPT_DIR/bridge/main.ts" \
    "$SCRIPT_DIR/dist/bridge/main.js" \
    "$HOME/.openclaw/npm/projects/tamaclaw/node_modules/tamaclaw/dist/bridge/main.js" \
    "$HOME/.openclaw/npm/projects/tamaclaw/node_modules/tamaclaw/bridge/main.ts"; do
    if [[ -f "$candidate" ]]; then
      BRIDGE="$candidate"
      break
    fi
  done

  if [[ -z "$BRIDGE" ]]; then
    fail "Cannot find the bridge. Install tamaclaw first: openclaw plugins install tamaclaw"
  fi

  # Check if port is already in use
  if curl -sf "$URL/health" >/dev/null 2>&1; then
    ok "Bridge is already running at $URL"
  else
    echo "   Starting: node $BRIDGE"
    node "$BRIDGE" &
    BRIDGE_PID=$!

    # Wait for it to come up
    if wait_for_health "$URL" 10; then
      ok "Bridge started (PID $BRIDGE_PID)"
    else
      fail "Bridge failed to start. Check the output above."
    fi

    # Clean up on exit
    trap "echo ''; echo 'Stopping bridge (PID $BRIDGE_PID)...'; kill $BRIDGE_PID 2>/dev/null; wait $BRIDGE_PID 2>/dev/null" EXIT INT TERM
  fi
fi

# ── Step 6: Open the display ──────────────────────────────────────────────

step "Opening display"

if $KIOSK; then
  echo "   Opening in kiosk mode (fullscreen, no browser UI)..."
  if [[ -d "/Applications/Google Chrome.app" ]]; then
    open -a "Google Chrome" --args --kiosk --app="$URL"
    ok "Opened in Google Chrome kiosk"
  elif [[ -d "/Applications/Chromium.app" ]]; then
    open -a "Chromium" --args --kiosk --app="$URL"
    ok "Opened in Chromium kiosk"
  elif [[ -d "/Applications/Microsoft Edge.app" ]]; then
    open -a "Microsoft Edge" --args --kiosk --app="$URL"
    ok "Opened in Edge kiosk"
  elif [[ -d "/Applications/Brave Browser.app" ]]; then
    open -a "Brave Browser" --args --kiosk --app="$URL"
    ok "Opened in Brave kiosk"
  else
    warn "No Chromium-based browser found for kiosk mode"
    open "$URL"
    ok "Opened in default browser (not kiosk)"
  fi
else
  open "$URL"
  ok "Opened in default browser"
fi

# ── Done ────────────────────────────────────────────────────────────────────

echo ""
echo "============================================"
echo "  Tamaclaw is running!"
echo "  Display : $URL"
echo "  Health  : $URL/health"
echo "============================================"
echo ""
echo "Try it:"
echo "  curl -X POST localhost:$PORT/say -H 'content-type: application/json' \\"
echo "    -d '{\"text\": \"Hello! Tamaclaw is alive.\", \"mood\": \"happy\"}'"
echo ""

# If we started the bridge in standalone mode, keep the script alive
if $STANDALONE && [[ -n "${BRIDGE_PID:-}" ]]; then
  echo "Bridge running in background (PID $BRIDGE_PID). Press Ctrl-C to stop."
  wait $BRIDGE_PID
fi
