#!/bin/bash
# List all library packs available on the memory server.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

RESPONSE=$(curl -s -X GET "$API_URL/api/library")

if [ $? -ne 0 ]; then
    echo "Error: Could not connect to memory server at $API_URL"
    echo "Start the daemon with: ling-mem start"
    exit 1
fi

echo "## Library Packs"
echo ""
echo "$RESPONSE" | jq -r '.packs[] | "### \(.name)\n- **ID:** `\(.id)`\n- **Folder:** \(.folder // "root")\n- **Description:** \(.description // "No description")\n"'
