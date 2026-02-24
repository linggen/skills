#!/bin/bash
# Semantic memory search — find stored memories by meaning.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

QUERY="${1:?Usage: search_memory.sh <query> [limit] [source_id]}"
LIMIT="${2:-10}"
SOURCE_ID="${3:-}"

DATA=$(jq -n \
  --arg query "$QUERY" \
  --argjson limit "$LIMIT" \
  --arg source_id "$SOURCE_ID" \
  '{query: $query, limit: $limit, source_id: (if $source_id == "" then null else $source_id end)} | with_entries(select(.value != null))')

RESPONSE=$(curl -s -X POST "$API_URL/api/memory/search_semantic" \
  -H "Content-Type: application/json" \
  -d "$DATA")

if [ $? -ne 0 ]; then
    echo '{"error": "Memory server not reachable. Start with: ling-mem serve"}'
    exit 1
fi

echo "## Semantic Memory Results for: $QUERY"
echo ""
echo "$RESPONSE" | jq -r --argjson limit "$LIMIT" '.results[:$limit] | .[] | "### \(.title // "Untitled") [\(.source_id)]\n- File: `\(.file_path)`\n- Snippet: \(.snippet)...\n"'
