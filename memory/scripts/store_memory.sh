#!/bin/bash
# Store a memory (architectural decision, pattern, context) with metadata.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

TITLE="${1:?Usage: store_memory.sh <title> <content> [tags]}"
CONTENT="${2:?Usage: store_memory.sh <title> <content> [tags]}"
TAGS="${3:-}"

DATA=$(jq -n \
  --arg title "$TITLE" \
  --arg content "$CONTENT" \
  --arg tags "$TAGS" \
  '{title: $title, content: $content} + (if $tags != "" then {tags: $tags} else {} end)')

RESPONSE=$(curl -s -X POST "$API_URL/api/memory/store" \
  -H "Content-Type: application/json" \
  -d "$DATA")

if [ $? -ne 0 ]; then
    echo '{"error": "Memory server not reachable. Start with: ling-mem serve"}'
    exit 1
fi

echo "$RESPONSE"
