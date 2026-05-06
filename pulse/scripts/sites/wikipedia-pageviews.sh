#!/usr/bin/env bash
# wikipedia-pageviews.sh — registered as the FetchWikipediaPageviews tool.
#
# Fetches the last 30 days of pageviews for each topic listed in
# ~/.linggen/skills/pulse/config.json (sites["wikipedia-pageviews"].topics).
# Returns a per-topic 30-day total + 30-day trend %.
#
# Public Wikimedia REST API. No auth.
# Topics are Wikipedia article titles (use underscores or spaces; the
# script URL-encodes).
#
# Output: JSON array of
#   {topic, source, total_30d, prev_30d, percent_change_30d, sparkline}.

set -uo pipefail

CONFIG="$HOME/.linggen/skills/pulse/config.json"
if [[ ! -f "$CONFIG" ]]; then
  echo "[]"
  exit 0
fi

TOPICS_RAW="$(jq -r '.sites["wikipedia-pageviews"].topics[]?' "$CONFIG" 2>/dev/null)"
if [[ -z "$TOPICS_RAW" ]]; then
  echo "[]"
  exit 0
fi

# Date helpers — use UTC. start = today-60, mid = today-30, end = today.
END_DATE="$(date -u +%Y%m%d)"
MID_DATE="$(date -u -v -30d +%Y%m%d 2>/dev/null || date -u -d '30 days ago'  +%Y%m%d)"
START_DATE="$(date -u -v -60d +%Y%m%d 2>/dev/null || date -u -d '60 days ago' +%Y%m%d)"

urlencode() {
  python3 -c "import sys, urllib.parse as u; print(u.quote(sys.argv[1].replace(' ', '_'), safe=''))" "$1"
}

results=()
while IFS= read -r topic; do
  [[ -z "$topic" ]] && continue
  enc="$(urlencode "$topic")"
  url="https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/${enc}/daily/${START_DATE}/${END_DATE}"
  data="$(curl -fsS --max-time 10 -A "linggen-pulse/0.1" "$url" 2>/dev/null)" || continue
  parsed="$(python3 - "$data" "$topic" "$MID_DATE" <<'PY' 2>/dev/null
import sys, json
try:
    payload = json.loads(sys.argv[1])
    topic = sys.argv[2]
    mid = sys.argv[3]  # YYYYMMDD
    items = payload.get("items", [])
    prev_total = sum(i["views"] for i in items if i["timestamp"][:8] <  mid)
    curr_total = sum(i["views"] for i in items if i["timestamp"][:8] >= mid)
    if prev_total > 0:
        pct = round(((curr_total - prev_total) / prev_total) * 100, 1)
    else:
        pct = None
    sparkline = [i["views"] for i in items[-30:]]
    print(json.dumps({
        "topic": topic,
        "source": "wikipedia-pageviews",
        "total_30d": curr_total,
        "prev_30d": prev_total,
        "percent_change_30d": pct,
        "sparkline": sparkline,
    }))
except Exception:
    pass
PY
)"
  [[ -n "$parsed" ]] && results+=("$parsed")
done <<< "$TOPICS_RAW"

if [[ ${#results[@]} -eq 0 ]]; then
  echo "[]"
else
  printf '%s\n' "${results[@]}" | jq -s '.' 2>/dev/null || echo "[]"
fi
