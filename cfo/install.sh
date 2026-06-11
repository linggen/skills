#!/usr/bin/env bash
# install.sh — one-time CFO setup. Idempotent; runs with $SKILL_DIR set on every
# install path (ling init, WebUI Install, ling skills install, first startup).
set -euo pipefail

DIR="${SKILL_DIR:-$HOME/.linggen/skills/cfo}"

# Where imported analyses (redacted rollups) are saved for history.
mkdir -p "$DIR/data"

# Seed the user's config from the shipped example — never overwrite an existing
# config (preserves currency + category overrides the user has set).
if [ ! -f "$DIR/config.json" ] && [ -f "$DIR/config.example.json" ]; then
  cp "$DIR/config.example.json" "$DIR/config.json"
fi

echo "cfo: ready ($DIR)"
