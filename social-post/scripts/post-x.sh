#!/bin/bash
# post-x.sh — Post a tweet to X (Twitter) using API v2 with OAuth 1.0a.
# Usage: bash post-x.sh "Your tweet text here"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/config.sh"
load_x || exit 1

TEXT="$1"
if [ -z "$TEXT" ]; then
    echo "ERROR: No text provided." >&2
    exit 1
fi

if [ ${#TEXT} -gt 280 ]; then
    echo "WARNING: Text is ${#TEXT} chars (X free limit is 280). It may be truncated." >&2
fi

# --- OAuth 1.0a signature generation ---
# This implements the full OAuth 1.0a HMAC-SHA1 signing flow.

ENDPOINT="https://api.x.com/2/tweets"
METHOD="POST"
NONCE=$(openssl rand -hex 16)
TIMESTAMP=$(date +%s)

# Percent-encode helper
pct_encode() {
    python3 -c "import urllib.parse; print(urllib.parse.quote('$1', safe=''))"
}

# Build the OAuth signature base string.
# For POST with JSON body, only OAuth params go in the signature base.
PARAMS="oauth_consumer_key=$X_API_KEY"
PARAMS="$PARAMS&oauth_nonce=$NONCE"
PARAMS="$PARAMS&oauth_signature_method=HMAC-SHA1"
PARAMS="$PARAMS&oauth_timestamp=$TIMESTAMP"
PARAMS="$PARAMS&oauth_token=$X_ACCESS_TOKEN"
PARAMS="$PARAMS&oauth_version=1.0"

SIG_BASE="$METHOD&$(pct_encode "$ENDPOINT")&$(pct_encode "$PARAMS")"
SIG_KEY="$(pct_encode "$X_API_SECRET")&$(pct_encode "$X_ACCESS_TOKEN_SECRET")"
SIGNATURE=$(printf '%s' "$SIG_BASE" | openssl dgst -sha1 -hmac "$SIG_KEY" -binary | base64)
ENC_SIG=$(pct_encode "$SIGNATURE")

AUTH_HEADER="OAuth oauth_consumer_key=\"$X_API_KEY\""
AUTH_HEADER="$AUTH_HEADER, oauth_nonce=\"$NONCE\""
AUTH_HEADER="$AUTH_HEADER, oauth_signature=\"$ENC_SIG\""
AUTH_HEADER="$AUTH_HEADER, oauth_signature_method=\"HMAC-SHA1\""
AUTH_HEADER="$AUTH_HEADER, oauth_timestamp=\"$TIMESTAMP\""
AUTH_HEADER="$AUTH_HEADER, oauth_token=\"$X_ACCESS_TOKEN\""
AUTH_HEADER="$AUTH_HEADER, oauth_version=\"1.0\""

# Build JSON payload
JSON_PAYLOAD=$(python3 -c "import json; print(json.dumps({'text': '''$TEXT'''}))" 2>/dev/null || \
    printf '{"text":"%s"}' "$(echo "$TEXT" | sed 's/"/\\"/g')")

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
    -H "Authorization: $AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "$JSON_PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
    TWEET_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "unknown")
    echo "OK: Posted to X. Tweet ID: $TWEET_ID"
    echo "URL: https://x.com/i/status/$TWEET_ID"
else
    echo "ERROR: X API returned HTTP $HTTP_CODE" >&2
    echo "$BODY" >&2
    exit 1
fi
