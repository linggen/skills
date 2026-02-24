#!/usr/bin/env bash
# Send a message to a Discord friend
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/config.sh"

FRIEND="$1"; shift
MSG="$*"

if [ -z "$FRIEND" ] || [ -z "$MSG" ]; then
  echo "Usage: send_message.sh <friend_name> <message>" >&2
  exit 1
fi

# Look up channel_id from config
CHANNEL_ID=$(jq -r ".friends.\"$FRIEND\".channel_id // empty" "$DISCORD_CONFIG")

if [ -z "$CHANNEL_ID" ]; then
  echo "ERROR: Friend '$FRIEND' not found in $DISCORD_CONFIG" >&2
  echo "Available friends:" >&2
  jq -r '.friends | keys[]' "$DISCORD_CONFIG" >&2
  exit 1
fi

# Prepend display name
CONTENT="[$DISCORD_DISPLAY_NAME]: $MSG"

# Send message via Discord API
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "$DISCORD_API/channels/$CHANNEL_ID/messages" \
  -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg content "$CONTENT" '{content: $content}')")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "Message sent to $FRIEND successfully."
else
  echo "ERROR: Failed to send message (HTTP $HTTP_CODE)" >&2
  echo "$BODY" >&2
  exit 1
fi
