#!/usr/bin/env bash
# hackernews.sh — registered as the FetchHackerNews tool.
#
# Fetches the top 30 current HN stories from Firebase. Output: JSON array
# of {id, title, url, score, by, descendants, hn_url, age_hours}. The
# agent reads this output, filters by today's themes, and scores the
# survivors for technical specificity.

set -uo pipefail

ids=$(curl -fsS --max-time 10 \
  "https://hacker-news.firebaseio.com/v0/topstories.json" \
  | jq '.[:30]' 2>/dev/null) || { echo "[]"; exit 0; }

echo "$ids" | jq -r '.[]' | while read -r id; do
  curl -fsS --max-time 5 \
    "https://hacker-news.firebaseio.com/v0/item/${id}.json" 2>/dev/null
done | jq -s 'map(select(.type == "story" and .title != null)) | map({
  id,
  title,
  url: (.url // ("https://news.ycombinator.com/item?id=" + (.id | tostring))),
  score,
  by,
  descendants,
  hn_url: ("https://news.ycombinator.com/item?id=" + (.id | tostring)),
  age_hours: (((now - .time) / 3600) | floor)
})' 2>/dev/null || echo "[]"
