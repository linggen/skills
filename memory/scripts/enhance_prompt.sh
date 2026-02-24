#!/bin/bash
# Enhance a prompt with indexed context from the memory server.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

QUERY="${1:?Usage: enhance_prompt.sh <query> [strategy] [source_id]}"
STRATEGY="${2:-full_code}"
SOURCE_ID="${3:-}"

DATA=$(jq -n \
  --arg query "$QUERY" \
  --arg strategy "$STRATEGY" \
  --arg source_id "$SOURCE_ID" \
  '{query: $query, strategy: $strategy, source_id: (if $source_id == "" then null else $source_id end)} | with_entries(select(.value != null))')

RESPONSE=$(curl -s -X POST "$API_URL/api/enhance" \
  -H "Content-Type: application/json" \
  -d "$DATA")

if [ $? -ne 0 ]; then
    echo "Error: Could not connect to memory server at $API_URL"
    exit 1
fi

echo "$RESPONSE" | jq -r '"## Enhanced Prompt\n\n**Detected Intent:** \(.intent)\n\n---\n\n\(.enhanced_prompt)\n\n---\n\n### Context Sources\n" + ([.context_metadata[] | "- `\(.file_path)` (\(.source_id))"] | join("\n"))'
