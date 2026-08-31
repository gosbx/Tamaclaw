#!/usr/bin/env bash
# ============================================================================
# Tamaclaw Setup & Launch
# ============================================================================
# One command to install, update, and launch Tamaclaw.
#
# Run directly from GitHub (no clone needed):
#   bash <(curl -fsSL https://raw.githubusercontent.com/gosbx/Tamaclaw/main/launch.sh)
#   bash <(curl -fsSL https://raw.githubusercontent.com/gosbx/Tamaclaw/main/launch.sh) --kiosk
#
# Or from a local clone:
#   ./launch.sh
#   ./launch.sh --kiosk
#
# What it does (step by step):
#   1. Checks prerequisites (Node >= 23.6, openclaw CLI)
#   2. Installs the tamaclaw plugin (if not already installed)
#   3. Updates it (if a newer version is available on npm)
#   4. Enables the plugin (if not already enabled)
#   5. Restarts the OpenClaw Gateway (so the bridge service registers)
#   6. Waits for the bridge to be healthy
#   7. Opens the display (browser or kiosk mode)
#   8. Returns control to your terminal
#
# Usage:
#   ./launch.sh                  # install/update + open in default browser
#   ./launch.sh --kiosk          # install/update + open in Chrome kiosk
#   ./launch.sh --standalone     # skip OpenClaw, just run the bridge + open
#   ./launch.sh --port 5000      # use a custom port
#   ./launch.sh --stop           # stop a standalone bridge started by this script
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
STOP=false
PIDFILE="/tmp/tamaclaw-bridge.pid"
LOGFILE="/tmp/tamaclaw-bridge.log"

# ── Parse args ──────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --kiosk)        KIOSK=true; shift ;;
    --standalone)   STANDALONE=true; shift ;;
    --skip-install) SKIP_INSTALL=true; shift ;;
    --port)         PORT="$2"; shift 2 ;;
    --stop)         STOP=true; shift ;;
    -h|--help)
      echo "Usage: $0 [--kiosk] [--standalone] [--skip-install] [--port N] [--stop]"
      echo ""
      echo "  --kiosk         Open display in Chrome kiosk mode (fullscreen, no UI)"
      echo "  --standalone    Run the bridge directly, skip OpenClaw plugin install"
      echo "  --skip-install  Skip plugin install/update/enable, just restart and open"
      echo "  --port N        Bridge port (default: 4321)"
      echo "  --stop          Stop a standalone bridge started by this script"
      echo ""
      echo "Run directly from GitHub:"
      echo "  bash <(curl -fsSL https://raw.githubusercontent.com/gosbx/Tamaclaw/main/launch.sh)"
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

# ── Stop mode ───────────────────────────────────────────────────────────────

if $STOP; then
  if [[ -f "$PIDFILE" ]]; then
    PID=$(cat "$PIDFILE")
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID"
      rm -f "$PIDFILE"
      echo "Stopped Tamaclaw bridge (PID $PID)."
    else
      rm -f "$PIDFILE"
      echo "Bridge was not running (stale PID file removed)."
    fi
  else
    echo "No standalone bridge to stop (no PID file at $PIDFILE)."
  fi
  exit 0
fi

# ── Banner ──────────────────────────────────────────────────────────────────

echo ""
echo "  🥚🦞 Tamaclaw Setup & Launch"
echo ""

# ── Step 1: Prerequisites ──────────────────────────────────────────────────

step "Checking prerequisites"

if ! command -v node &>/dev/null; then
  fail "Node.js is not installed. Install Node >= 23.6: https://nodejs.org"
fi

NODE_MAJOR=$(node -e 'console.log(process.versions.node.split(".")[0])')
if [[ "$NODE_MAJOR" -lt 23 ]]; then
  fail "Node.js $NODE_MAJOR found, but >= 23.6 is required. Update: https://nodejs.org"
fi
ok "Node.js $(node -v)"

if ! command -v curl &>/dev/null; then
  fail "curl is required but not found."
fi

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

  if openclaw plugins list 2>/dev/null | grep -q "tamaclaw"; then
    ok "tamaclaw is already installed"

    # ── Step 2b: Update plugin ────────────────────────────────────────────

    step "Checking for updates"

    UPDATE_OUTPUT=$(openclaw plugins update tamaclaw 2>&1) || true
    if echo "$UPDATE_OUTPUT" | grep -q "is up to date"; then
      ok "tamaclaw is up to date"
    elif echo "$UPDATE_OUTPUT" | grep -q "Updated"; then
      ok "$UPDATE_OUTPUT"
    else
      # update command might not exist in older versions, skip gracefully
      ok "Update check done"
    fi
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

# ── Standalone: start bridge in background ──────────────────────────────────

BRIDGE_STARTED=false

if $STANDALONE; then
  step "Starting Tamaclaw bridge (standalone)"

  # Kill previous standalone bridge if running
  if [[ -f "$PIDFILE" ]]; then
    OLD_PID=$(cat "$PIDFILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
      echo "   Stopping previous bridge (PID $OLD_PID)..."
      kill "$OLD_PID" 2>/dev/null || true
      sleep 1
    fi
    rm -f "$PIDFILE"
  fi

  # Check if something else is already on the port
  if curl -sf "$URL/health" >/dev/null 2>&1; then
    ok "Bridge is already running at $URL"
  else
    # Find the bridge entry point
    SCRIPT_DIR=""
    # If run via bash <(curl ...), $0 won't be a real path
    if [[ -f "$0" ]]; then
      SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    fi

    BRIDGE=""
    for candidate in \
      "${SCRIPT_DIR:+$SCRIPT_DIR/packages/tamaclaw/bridge/main.ts}" \
      "${SCRIPT_DIR:+$SCRIPT_DIR/bridge/main.ts}" \
      "${SCRIPT_DIR:+$SCRIPT_DIR/dist/bridge/main.js}"; do
      [[ -z "$candidate" ]] && continue
      if [[ -f "$candidate" ]]; then
        BRIDGE="$candidate"
        break
      fi
    done

    # Search OpenClaw plugin install paths (may have generation suffixes)
    if [[ -z "$BRIDGE" ]]; then
      for candidate in "$HOME"/.openclaw/npm/projects/tamaclaw*/node_modules/tamaclaw/dist/bridge/main.js; do
        if [[ -f "$candidate" ]]; then
          BRIDGE="$candidate"
          break
        fi
      done
    fi
    if [[ -z "$BRIDGE" ]]; then
      for candidate in "$HOME"/.openclaw/npm/projects/tamaclaw*/node_modules/tamaclaw/bridge/main.ts; do
        if [[ -f "$candidate" ]]; then
          BRIDGE="$candidate"
          break
        fi
      done
    fi

    # Last resort: try to find it via npm global or npx
    if [[ -z "$BRIDGE" ]]; then
      # Try npx resolution
      NPX_PATH=$(npm root -g 2>/dev/null)/tamaclaw/dist/bridge/main.js
      if [[ -f "$NPX_PATH" ]]; then
        BRIDGE="$NPX_PATH"
      fi
    fi

    if [[ -z "$BRIDGE" ]]; then
      echo ""
      echo "   Cannot find the bridge entry point."
      echo "   Install it first:"
      echo "     npm install -g tamaclaw"
      echo "   Or with OpenClaw:"
      echo "     openclaw plugins install tamaclaw"
      fail "Bridge not found."
    fi

    echo "   Starting: node $BRIDGE"
    nohup node "$BRIDGE" > "$LOGFILE" 2>&1 &
    BRIDGE_PID=$!
    disown "$BRIDGE_PID" 2>/dev/null || true
    echo "$BRIDGE_PID" > "$PIDFILE"

    if wait_for_health "$URL" 10; then
      ok "Bridge started in background (PID $BRIDGE_PID)"
      BRIDGE_STARTED=true
    else
      kill "$BRIDGE_PID" 2>/dev/null || true
      rm -f "$PIDFILE"
      echo ""
      echo "   Bridge log:"
      tail -20 "$LOGFILE" 2>/dev/null || true
      fail "Bridge failed to start. Check $LOGFILE for details."
    fi
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
echo "  🥚🦞 Tamaclaw is running!"
echo ""
echo "  Display : $URL"
echo "  Health  : $URL/health"
if $BRIDGE_STARTED; then
echo "  Bridge  : PID $(cat "$PIDFILE"), log at $LOGFILE"
fi
echo "============================================"
echo ""
echo "Try it:"
echo "  curl -X POST localhost:$PORT/say -H 'content-type: application/json' \\"
echo "    -d '{\"text\": \"Hello! Tamaclaw is alive.\", \"mood\": \"happy\"}'"
echo ""
if $BRIDGE_STARTED; then
echo "To stop the standalone bridge:"
echo "  ./launch.sh --stop"
echo ""
fi
echo "To run this again later:"
echo "  bash <(curl -fsSL https://raw.githubusercontent.com/gosbx/Tamaclaw/main/launch.sh)"
echo ""
