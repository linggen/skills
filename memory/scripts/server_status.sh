#!/bin/bash
# Check if the memory server is running.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

RESPONSE=$(curl -s -X GET "$API_URL/api/status")

if [ $? -ne 0 ]; then
    echo '{"error": "Memory server not reachable. Start with: ling-mem serve"}'
    exit 1
fi

echo "## Linggen Memory Status"
echo ""
echo "$RESPONSE" | jq -r '"**Status:** \(.status)\n**Message:** \(.message // "N/A")\n**Progress:** \(.progress // "N/A")"'
