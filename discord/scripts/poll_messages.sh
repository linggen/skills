#!/usr/bin/env bash
# Poll recent messages from Discord friends
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/config.sh"

FRIEND="${1:-}"
LIMIT="${2:-10}"

poll_channel() {
  local name="$1"
  local channel_id="$2"
  local limit="$3"

  local response
  response=$(curl -s \
    -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
    "$DISCORD_API/channels/$channel_id/messages?limit=$limit")

  echo "--- Messages with $name ---"
  echo "$response" | jq -r '.[] | "[\(.timestamp)] \(.author.username): \(.content)"' 2>/dev/null || echo "(no messages or error)"
  echo ""
}

if [ -n "$FRIEND" ]; then
  # Poll single friend
  CHANNEL_ID=$(jq -r ".friends.\"$FRIEND\".channel_id // empty" "$DISCORD_CONFIG")
  if [ -z "$CHANNEL_ID" ]; then
    echo "ERROR: Friend '$FRIEND' not found in $DISCORD_CONFIG" >&2
    exit 1
  fi
  poll_channel "$FRIEND" "$CHANNEL_ID" "$LIMIT"
else
  # Poll all friends
  for name in $(jq -r '.friends | keys[]' "$DISCORD_CONFIG"); do
    channel_id=$(jq -r ".friends.\"$name\".channel_id" "$DISCORD_CONFIG")
    poll_channel "$name" "$channel_id" "$LIMIT"
  done
fi
