#!/bin/bash
# Index a directory for semantic search.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

PATH_ARG="${1:?Usage: index_source.sh <path> [mode]}"
MODE="${2:-auto}"

# Resolve to absolute path
ABS_PATH="$(cd "$PATH_ARG" && pwd)"
SOURCE_NAME="$(basename "$ABS_PATH")"

echo "Indexing: $ABS_PATH (mode: $MODE)"

# Check if source already exists
EXISTING=$(curl -sf "$API_URL/api/resources" 2>/dev/null || echo '{"resources":[]}')
SOURCE_ID=$(echo "$EXISTING" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for r in data.get('resources', []):
    if r.get('path') == '$ABS_PATH' or r.get('path') == '$PATH_ARG':
        print(r['id'])
        break
" 2>/dev/null || true)

if [ -z "$SOURCE_ID" ]; then
    echo "Creating new source: $SOURCE_NAME"
    RESULT=$(curl -sf "$API_URL/api/resources" \
      -H "Content-Type: application/json" \
      -d "{\"name\": \"$SOURCE_NAME\", \"resource_type\": \"local\", \"path\": \"$ABS_PATH\", \"include_patterns\": [], \"exclude_patterns\": []}" \
      2>/dev/null)
    SOURCE_ID=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
    echo "Source created: $SOURCE_ID"
fi

# Trigger indexing
echo "Starting $MODE indexing..."
curl -sf "$API_URL/api/index_source" \
  -H "Content-Type: application/json" \
  -d "{\"source_id\": \"$SOURCE_ID\", \"mode\": \"$MODE\"}" \
  2>/dev/null || echo '{"error": "Failed to start indexing"}'
