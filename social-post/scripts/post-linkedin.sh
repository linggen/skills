#!/bin/bash
# post-linkedin.sh — Post to LinkedIn using the UGC Posts API.
# Usage: bash post-linkedin.sh "Your post text here"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/config.sh"
load_linkedin || exit 1

TEXT="$1"
if [ -z "$TEXT" ]; then
    echo "ERROR: No text provided." >&2
    exit 1
fi

if [ ${#TEXT} -gt 3000 ]; then
    echo "WARNING: Text is ${#TEXT} chars (LinkedIn limit is 3,000). Post may fail." >&2
fi

# Build the JSON payload using python3 for safe escaping
JSON_PAYLOAD=$(python3 -c "
import json
payload = {
    'author': 'urn:li:person:${LI_USER_URN}',
    'lifecycleState': 'PUBLISHED',
    'specificContent': {
        'com.linkedin.ugc.ShareContent': {
            'shareCommentary': {
                'text': '''${TEXT}'''
            },
            'shareMediaCategory': 'NONE'
        }
    },
    'visibility': {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
    }
}
print(json.dumps(payload))
")

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "https://api.linkedin.com/v2/ugcPosts" \
    -H "Authorization: Bearer ${LI_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -H "X-Restli-Protocol-Version: 2.0.0" \
    -d "$JSON_PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
    POST_URN=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','unknown'))" 2>/dev/null || echo "unknown")
    # Convert URN to URL-friendly ID
    ACTIVITY_ID=$(echo "$POST_URN" | sed 's/urn:li:share://' | sed 's/urn:li:ugcPost://')
    echo "OK: Posted to LinkedIn. Post URN: $POST_URN"
    echo "URL: https://www.linkedin.com/feed/update/$POST_URN"
else
    echo "ERROR: LinkedIn API returned HTTP $HTTP_CODE" >&2
    echo "$BODY" >&2
    if [ "$HTTP_CODE" = "401" ]; then
        echo "HINT: Your LinkedIn access token may have expired (tokens last 60 days). Run: /social-post config linkedin" >&2
    fi
    exit 1
fi
