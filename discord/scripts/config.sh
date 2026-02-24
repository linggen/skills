#!/usr/bin/env bash
# Discord skill shared configuration
set -euo pipefail

# Require bot token
if [ -z "${DISCORD_BOT_TOKEN:-}" ]; then
  echo "ERROR: DISCORD_BOT_TOKEN environment variable is not set." >&2
  echo "Set it with: export DISCORD_BOT_TOKEN='your-bot-token'" >&2
  exit 1
fi

# Display name for outgoing messages
DISCORD_DISPLAY_NAME="${DISCORD_DISPLAY_NAME:-linggen-user}"

# Discord API base
DISCORD_API="https://discord.com/api/v10"

# Require jq
if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required but not installed." >&2
  echo "Install it with: brew install jq (macOS) or apt install jq (Linux)" >&2
  exit 1
fi

# Locate discord.json config (project-level first, then global)
DISCORD_CONFIG=""
if [ -f ".linggen/discord.json" ]; then
  DISCORD_CONFIG=".linggen/discord.json"
elif [ -f "${HOME}/.linggen/discord.json" ]; then
  DISCORD_CONFIG="${HOME}/.linggen/discord.json"
fi

if [ -z "$DISCORD_CONFIG" ]; then
  echo "ERROR: No discord.json config found." >&2
  echo "Create .linggen/discord.json or ~/.linggen/discord.json with your friends config." >&2
  exit 1
fi

export DISCORD_BOT_TOKEN DISCORD_DISPLAY_NAME DISCORD_API DISCORD_CONFIG
