#!/usr/bin/env bash
# reddit.sh — registered as the FetchReddit tool.
#
# Fetches the 25 newest threads from each subreddit listed in
# ~/.linggen/skills/composer/config.json under sites.reddit.subs.
# Output: JSON array of {sub, title, url, comments, age_hours, summary}.
# The agent filters by today's themes after this runs.

set -uo pipefail

CONFIG="$HOME/.linggen/skills/composer/config.json"
if [[ ! -f "$CONFIG" ]]; then
  echo "[]"
  exit 0
fi

subs=$(jq -r '.sites.reddit.subs[]?' "$CONFIG" 2>/dev/null)
if [[ -z "$subs" ]]; then
  echo "[]"
  exit 0
fi

(
  for sub in $subs; do
    curl -fsS --max-time 10 \
      -A "linggen-composer/0.1" \
      "https://www.reddit.com/r/${sub}/new.json?limit=25" 2>/dev/null \
      | jq -c --arg sub "$sub" '.data.children[].data | {
          sub: $sub,
          title,
          url: ("https://reddit.com" + .permalink),
          comments: .num_comments,
          age_hours: (((now - .created_utc) / 3600) | floor),
          summary: ((.selftext // "") | .[:300])
        }' 2>/dev/null
  done
) | jq -s '.' 2>/dev/null || echo "[]"
