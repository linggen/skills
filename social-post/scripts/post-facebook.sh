#!/bin/bash
# post-facebook.sh — Post to a Facebook Page using the Graph API.
# Usage: bash post-facebook.sh "Your post text here"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/config.sh"
load_facebook || exit 1

TEXT="$1"
if [ -z "$TEXT" ]; then
    echo "ERROR: No text provided." >&2
    exit 1
fi

# URL-encode the message
ENCODED_TEXT=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$TEXT'''))")

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "https://graph.facebook.com/v21.0/${FB_PAGE_ID}/feed" \
    -d "message=${ENCODED_TEXT}" \
    -d "access_token=${FB_PAGE_ACCESS_TOKEN}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    POST_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "unknown")
    echo "OK: Posted to Facebook Page. Post ID: $POST_ID"
    # Extract the actual post part of the ID (format: pageId_postId)
    ACTUAL_POST_ID=$(echo "$POST_ID" | cut -d'_' -f2)
    echo "URL: https://www.facebook.com/${FB_PAGE_ID}/posts/${ACTUAL_POST_ID}"
else
    echo "ERROR: Facebook API returned HTTP $HTTP_CODE" >&2
    echo "$BODY" >&2
    exit 1
fi
