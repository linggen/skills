#!/usr/bin/env bash
# reddit-inbox.sh — registered as the FetchRedditInbox tool.
#
# Pulls the connected user's Reddit inbox (DMs + mentions + replies to
# their posts/comments). Requires that the user has connected their
# Reddit account via Pulse Settings — refresh_token + client_id live in
# config.json under sites.reddit.
#
# Output (always JSON, even on auth failure):
#   { items: [
#       { kind: "message" | "comment_reply" | "post_reply" | "username_mention",
#         id, subject, body, author, url, created_iso, unread, context_url? }
#     ],
#     count: N, errors: [...] }
#
# Exit code is always 0 — agent reads errors[] for failure signal.

set -uo pipefail

CONFIG="$HOME/.linggen/skills/pulse/config.json"
errors=()
items_json="[]"

emit_empty() {
  jq -cn --argjson items '[]' --arg note "$1" '{items:$items, count:0, errors:[$note]}'
  exit 0
}

if ! command -v jq &>/dev/null; then
  emit_empty "jq missing"
fi
if ! command -v curl &>/dev/null; then
  emit_empty "curl missing"
fi
if [ ! -f "$CONFIG" ]; then
  emit_empty "no config.json"
fi

CLIENT_ID=$(jq -r '.sites.reddit.client_id // ""' "$CONFIG" 2>/dev/null)
REFRESH=$(jq -r '.sites.reddit.refresh_token // ""' "$CONFIG" 2>/dev/null)
USERNAME=$(jq -r '.sites.reddit.username // "anonymous"' "$CONFIG" 2>/dev/null)

if [ -z "$CLIENT_ID" ] || [ -z "$REFRESH" ]; then
  emit_empty "reddit not connected (open Pulse Settings → Reddit → Connect)"
fi

UA="pulse/0.1 by /u/${USERNAME}"
BASIC=$(printf '%s:' "$CLIENT_ID" | base64 | tr -d '\n')

# ── Exchange refresh_token for a short-lived access_token ──
token_resp=$(curl -sS -X POST 'https://www.reddit.com/api/v1/access_token' \
  -H "Authorization: Basic ${BASIC}" \
  -H "User-Agent: ${UA}" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data "grant_type=refresh_token&refresh_token=${REFRESH}" 2>/dev/null)

ACCESS=$(echo "$token_resp" | jq -r '.access_token // ""' 2>/dev/null)
if [ -z "$ACCESS" ]; then
  err=$(echo "$token_resp" | jq -r '.error // "token exchange failed"' 2>/dev/null)
  emit_empty "auth: $err"
fi

# ── Fetch inbox ──
inbox=$(curl -sS 'https://oauth.reddit.com/message/inbox?limit=50&raw_json=1' \
  -H "Authorization: Bearer ${ACCESS}" \
  -H "User-Agent: ${UA}" 2>/dev/null)

if [ -z "$inbox" ]; then
  emit_empty "inbox fetch returned empty"
fi

# Normalize: Reddit returns Listing{children:[{kind, data:{...}}]}.
# Map kind codes (t1=comment, t4=private message) + 'was_comment' flag
# into our shape. Drop deleted / removed items.
jq -c '{
  items: [
    .data.children[]
    | .data as $d
    | (
        if .kind == "t4" then "message"
        elif ($d.was_comment // false) and ($d.subject // "" | startswith("comment reply")) then "comment_reply"
        elif ($d.was_comment // false) and ($d.subject // "" | startswith("post reply")) then "post_reply"
        elif ($d.was_comment // false) and ($d.subject // "" | startswith("username mention")) then "username_mention"
        else "other"
        end
      ) as $kind
    | select($d.body != null and $d.body != "[deleted]" and $d.body != "[removed]")
    | {
        kind: $kind,
        id: $d.id,
        subject: ($d.subject // ""),
        body: ($d.body // "" | .[0:600]),
        author: ($d.author // ""),
        url: ($d.context // null | if . then ("https://www.reddit.com" + .) else null end),
        context_url: ($d.context // null | if . then ("https://www.reddit.com" + .) else null end),
        created_iso: ($d.created_utc | if . then (. | strftime("%Y-%m-%dT%H:%M:%SZ")) else null end),
        unread: ($d.new // false)
      }
  ]
} | . + {count: (.items|length), errors: []}' <<< "$inbox"
