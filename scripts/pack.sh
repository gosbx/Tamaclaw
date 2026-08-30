#!/usr/bin/env bash
# Build a fully self-contained tarball of the tamaclaw package, ready for
# `npm publish dist/tamaclaw-<version>.tgz` or
# `openclaw plugins install ./dist/tamaclaw-<version>.tgz`.
#
# Staged in a temp dir so bundleDependencies (ws) land inside the tarball —
# with npm workspaces the dep hoists to the repo root and a plain `npm pack`
# from the workspace would miss it.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/packages/tamaclaw"
DIST="$ROOT/dist"
STAGE="$(mktemp -d /tmp/tamaclaw-pack.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT

rsync -a --exclude node_modules "$SRC/" "$STAGE/"
(cd "$STAGE" && npm install --omit=dev --no-fund --no-audit >/dev/null)

mkdir -p "$DIST"
TARBALL="$(cd "$STAGE" && npm pack --pack-destination "$DIST" 2>/dev/null | tail -1)"

echo "→ $DIST/$TARBALL"
tar -tzf "$DIST/$TARBALL" | grep -c "^package/" | xargs echo "  files:"
tar -tzf "$DIST/$TARBALL" | grep -q "package/node_modules/ws/package.json" \
  && echo "  ✓ ws bundled" || { echo "  ✗ ws MISSING"; exit 1; }
tar -tzf "$DIST/$TARBALL" | grep -q "package/display/vendor/chart.umd.js" \
  && echo "  ✓ chart.js vendored" || { echo "  ✗ chart.umd.js MISSING"; exit 1; }
