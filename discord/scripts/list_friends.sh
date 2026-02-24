#!/usr/bin/env bash
# List configured Discord friends
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/config.sh"

echo "Discord friends (from $DISCORD_CONFIG):"
echo ""
jq -r '.friends | to_entries[] | "  \(.key) — channel: \(.value.channel_id)\(if .value.note then " (\(.value.note))" else "" end)"' "$DISCORD_CONFIG"
