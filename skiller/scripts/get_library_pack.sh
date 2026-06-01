#!/bin/bash
# Get the content of a specific library pack.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

PACK_ID="${1:?Usage: get_library_pack.sh <pack_id>}"

ENC_PACK_ID=$(python3 - "$PACK_ID" <<'PY'
import sys, urllib.parse
print(urllib.parse.quote(sys.argv[1], safe=""))
PY
)

RESPONSE=$(curl -s -X GET "$API_URL/api/library/packs/$ENC_PACK_ID")

if [ $? -ne 0 ]; then
    echo "Error: Could not connect to memory server at $API_URL"
    echo "Start the daemon with: ling-mem start"
    exit 1
fi

# Check for error in response
if echo "$RESPONSE" | grep -q "Pack not found"; then
    echo "Error: Pack '$PACK_ID' not found."
    exit 1
fi

echo "$RESPONSE" | jq -r ".content // .error // .message // \"Error: Could not parse response\""
