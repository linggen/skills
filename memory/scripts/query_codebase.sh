#!/bin/bash
# Deep metadata search across indexed codebases.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

QUERY="${1:?Usage: query_codebase.sh <query> [limit] [exclude_source_id]}"
LIMIT="${2:-3}"
EXCLUDE_SOURCE_ID="${3:-}"

DATA=$(jq -n \
  --arg query "$QUERY" \
  --argjson limit "$LIMIT" \
  --arg exclude_source_id "$EXCLUDE_SOURCE_ID" \
  '{query: $query, limit: $limit, exclude_source_id: (if $exclude_source_id == "" then null else $exclude_source_id end)} | with_entries(select(.value != null))')

RESPONSE=$(curl -s -X POST "$API_URL/api/query" \
  -H "Content-Type: application/json" \
  -d "$DATA")

if [ $? -ne 0 ]; then
    echo "Error: Could not connect to memory server at $API_URL"
    exit 1
fi

echo "$RESPONSE" | jq -r ".results[:$LIMIT] | to_entries | .[] | \"--- Chunk \((.key + 1)) [\(.value.source_id)] ---\nFile: \(.value.document_id)\n\n\(.value.content)\n\""
