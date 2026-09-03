#!/usr/bin/env bash
# install.sh — one-time Health setup. Idempotent; runs with $SKILL_DIR set on
# every install path (ling init, WebUI Install, ling skills install, first
# startup).
#
# Nothing is fetched here. Health has no binaries: the phone reads HealthKit
# and this Mac only keeps what the phone sends.
set -euo pipefail

DIR="${SKILL_DIR:-$HOME/.linggen/skills/health}"

# The mirror. Samples, registers and the ledger all live under here.
mkdir -p "$DIR/data"

# Seed the user's config from the shipped example — never overwrite an existing
# one (preserves the workspaces the work signals are read from).
if [ ! -f "$DIR/config.json" ] && [ -f "$DIR/config.example.json" ]; then
  cp "$DIR/config.example.json" "$DIR/config.json"
fi

echo "health: ready ($DIR)"
