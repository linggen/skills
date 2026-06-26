#!/usr/bin/env bash
# bluesky-search.sh — registered as the FetchBlueskyKeywords tool.
#
# Searches Bluesky public posts for the keywords configured under
# sites.bluesky.keywords in ~/.linggen/skills/pulse/config.json. Keywords
# should be category phrases extracted from the brief — see SKILL.md
# discover-customers — NOT brand names (which rarely match).
#
# Public AT Proto endpoint, no auth, generous rate limit (~3000/5min).
#
# Output: JSON array of {source, watched_term, title, url, author,
#                        body, summary, created_iso, age_hours,
#                        reply_count, repost_count, like_count}.
# Empty array if disabled, no keywords, or API failure.

set -uo pipefail

CONFIG="$HOME/.linggen/skills/pulse/config.json"
API="https://api.bsky.app/xrpc"
UA="linggen-pulse/0.1"
LIMIT=15

if ! command -v jq &>/dev/null || ! command -v curl &>/dev/null; then
  echo "[]"; exit 0
fi
[[ -f "$CONFIG" ]] || { echo "[]"; exit 0; }

if ! jq -e '(.sites.bluesky.enabled // false) == true' "$CONFIG" >/dev/null 2>&1; then
  echo "[]"; exit 0
fi

keywords=$(jq -r '.sites.bluesky.keywords[]? // empty' "$CONFIG" 2>/dev/null)
[[ -z "$keywords" ]] && { echo "[]"; exit 0; }

(
  while IFS= read -r kw; do
    [[ -z "$kw" ]] && continue
    q_enc=$(printf %s "$kw" | jq -sRr @uri)
    raw=$(curl -fsS --max-time 10 -A "$UA" \
      "${API}/app.bsky.feed.searchPosts?q=${q_enc}&limit=${LIMIT}&sort=latest" 2>/dev/null)
    [[ -z "$raw" ]] && continue
    echo "$raw" | jq -c --arg kw "$kw" '
      .posts // []
      | .[]
      | select(.record.text != null)
      | {
          source: "bluesky",
          watched_term: $kw,
          title: (.record.text | .[0:100]),
          url: ("https://bsky.app/profile/" + .author.handle + "/post/" + (.uri | split("/") | last)),
          author: ("@" + .author.handle),
          author_display: (.author.displayName // ""),
          body: .record.text,
          summary: (.record.text | .[0:300]),
          created_iso: (.record.createdAt // ""),
          age_hours: (
            (.record.createdAt // "") as $c
            | ($c | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601?) as $t
            | if $t then ((now - $t) / 3600 | floor) else null end
          ),
          reply_count: (.replyCount // 0),
          repost_count: (.repostCount // 0),
          like_count: (.likeCount // 0)
        }
    ' 2>/dev/null
  done <<< "$keywords"
) | jq -s 'unique_by(.url)' 2>/dev/null || echo "[]"
