#!/bin/bash
# List all indexed sources.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

RESPONSE=$(curl -s -X GET "$API_URL/api/resources")

if [ $? -ne 0 ]; then
    echo '{"error": "Memory server not reachable. Start with: ling-mem serve"}'
    exit 1
fi

COUNT=$(echo "$RESPONSE" | jq '.resources | length')
echo "## Indexed Sources ($COUNT total)"
echo ""
echo "$RESPONSE" | jq -r '.resources[] | "### \(.name)\n- **ID:** `\(.id)`\n- **Type:** \(.resource_type)\n- **Path:** `\(.path)`\n- **Files:** \(.stats.file_count // 0)\n- **Chunks:** \(.stats.chunk_count // 0)\n"'
