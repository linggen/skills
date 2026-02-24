#!/bin/bash
# Fetch stored memories by metadata key/value.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

KEY="${1:?Usage: fetch_memory.sh <key> <value>}"
VALUE="${2:?Usage: fetch_memory.sh <key> <value>}"

DATA=$(jq -n --arg key "$KEY" --arg value "$VALUE" '{key: $key, value: $value}')

RESPONSE=$(curl -s -X POST "$API_URL/api/memory/fetch_by_meta" \
  -H "Content-Type: application/json" \
  -d "$DATA")

if [ $? -ne 0 ]; then
    echo '{"error": "Memory server not reachable. Start with: ling-mem serve"}'
    exit 1
fi

# Check for error in response
if echo "$RESPONSE" | jq -e '.error' >/dev/null 2>&1; then
    echo "Error: $(echo "$RESPONSE" | jq -r '.error')"
    exit 1
fi

echo "$RESPONSE" | jq -r '"## Memory: \(.title)\nTags: \(.tags | join(", "))\n\n---\n\n\(.body)"'
