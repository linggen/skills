#!/usr/bin/env bash
# reddit.sh — registered as the FetchReddit tool.
#
# Fetches threads from each subreddit listed in
# ~/.linggen/skills/pulse/config.json under sites.reddit.subs.
#
# Modes:
#   bash reddit.sh             # /new.json (default — newest threads)
#   bash reddit.sh --rising    # /rising.json (threads gaining velocity)
#   bash reddit.sh --top       # /top.json?t=day (top of last 24h)
#
# Output: JSON array of {sub, title, url, comments, age_hours,
#                        summary, mode, score}.
# The agent filters by goal/theme keywords after this runs.

set -uo pipefail

MODE="new"
LIMIT=25
for arg in "$@"; do
  case "$arg" in
    --rising) MODE="rising" ;;
    --top)    MODE="top"    ;;
    --new)    MODE="new"    ;;
  esac
done

CONFIG="$HOME/.linggen/skills/pulse/config.json"
if [[ ! -f "$CONFIG" ]]; then
  echo "[]"
  exit 0
fi

subs=$(jq -r '.sites.reddit.subs[]?' "$CONFIG" 2>/dev/null)
if [[ -z "$subs" ]]; then
  echo "[]"
  exit 0
fi

# Per Reddit's URL shape: /new, /rising, /top?t=day.
ENDPOINT="${MODE}.json?limit=${LIMIT}"
[[ "$MODE" == "top" ]] && ENDPOINT="top.json?limit=${LIMIT}&t=day"

(
  for sub in $subs; do
    curl -fsS --max-time 10 \
      -A "linggen-pulse/0.1" \
      "https://www.reddit.com/r/${sub}/${ENDPOINT}" 2>/dev/null \
      | jq -c --arg sub "$sub" --arg mode "$MODE" '.data.children[].data | {
          sub: $sub,
          mode: $mode,
          title,
          url: ("https://reddit.com" + .permalink),
          comments: .num_comments,
          score: .score,
          age_hours: (((now - .created_utc) / 3600) | floor),
          summary: ((.selftext // "") | .[:300])
        }' 2>/dev/null
  done
) | jq -s '.' 2>/dev/null || echo "[]"
