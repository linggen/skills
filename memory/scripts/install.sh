#!/usr/bin/env bash
# install.sh — Bootstrap memory files and mission for the memory skill.
# Idempotent: skips files that already exist.
#
# Expects $SKILL_DIR to be set by the engine.

set -euo pipefail

MEMORY_DIR="$HOME/.linggen/memory"
MISSIONS_DIR="$HOME/.linggen/missions"
ASSETS="$SKILL_DIR/assets"

# --- Memory files ---
mkdir -p "$MEMORY_DIR"
for f in "$ASSETS"/user_info.md "$ASSETS"/user_feedback.md \
         "$ASSETS"/agent_done_week.md "$ASSETS"/agent_done_month.md \
         "$ASSETS"/agent_done_year.md; do
  target="$MEMORY_DIR/$(basename "$f")"
  [ -f "$target" ] || cp "$f" "$target"
done

# --- Mission ---
MISSION_DIR="$MISSIONS_DIR/memory"
if [ ! -d "$MISSION_DIR" ]; then
  mkdir -p "$MISSION_DIR"
  NOW=$(date +%s)
  sed "s/created_at: 0/created_at: $NOW/" "$ASSETS/mission.md" > "$MISSION_DIR/mission.md"
fi
