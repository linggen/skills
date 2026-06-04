#!/usr/bin/env bash
# hn-search.sh — registered as the FetchHNSearch tool.
#
# Keyword-searches Hacker News for RECENT story threads on a topic, via the
# public Algolia HN Search API (no auth, no rate-limit pain). This is the
# discovery counterpart to FetchHackerNews (which only pulls today's top 30
# for the trend section) — here we find threads worth COMMENTING on, so a
# new HN account can build karma with thoughtful replies before posting.
#
# Usage:
#   hn-search.sh "<query>" [days]
#     query — required; the topic to search (e.g. "AI agent memory").
#     days  — recency window, default 7. HN threads die fast; a comment on a
#             stale thread earns no karma, so we default to fresh discussion.
#   If no query is given, falls back to OR-joining sites.hackernews.keywords.
#
# Output (JSON array, exit 0):
#   [ { id, title, url, hn_url, points, num_comments, author,
#       text, created_iso, age_hours }, … ]   # url = story link or hn_url
#
# Deps: python3 (stdlib only — urllib + json).

set -uo pipefail

if ! command -v python3 &>/dev/null; then
  echo "[]"; exit 0
fi

QUERY="${1:-}" DAYS="${2:-7}" CONFIG="$HOME/.linggen/skills/pulse/config.json" python3 <<'PY'
import json, os, sys, urllib.parse, urllib.request
from datetime import datetime, timezone

query = (os.environ.get("QUERY") or "").strip()

# Fall back to configured keywords when the agent passes no explicit query.
if not query:
    try:
        with open(os.environ["CONFIG"]) as f:
            kws = (json.load(f).get("sites", {}).get("hackernews", {}) or {}).get("keywords") or []
        query = " ".join(k for k in kws if k)
    except Exception:
        query = ""

if not query:
    print("[]"); sys.exit(0)

try:
    days = max(1, int(os.environ.get("DAYS", "7") or 7))
except ValueError:
    days = 7

now = datetime.now(timezone.utc).timestamp()
cutoff = int(now) - days * 86400
params = urllib.parse.urlencode({
    "query": query,
    "tags": "story",
    "numericFilters": f"created_at_i>{cutoff}",
    "hitsPerPage": 25,
})
url = f"https://hn.algolia.com/api/v1/search?{params}"

try:
    req = urllib.request.Request(url, headers={"User-Agent": "pulse/1.0"})
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.load(r)
except Exception:
    print("[]"); sys.exit(0)

out = []
for h in data.get("hits", []) or []:
    oid = h.get("objectID")
    if not oid:
        continue
    created = h.get("created_at_i") or 0
    out.append({
        "id": oid,
        "title": h.get("title") or h.get("story_title") or "",
        "url": h.get("url") or f"https://news.ycombinator.com/item?id={oid}",
        "hn_url": f"https://news.ycombinator.com/item?id={oid}",
        "points": h.get("points") or 0,
        "num_comments": h.get("num_comments") or 0,
        "author": h.get("author") or "",
        "text": (h.get("story_text") or "")[:500],
        "created_iso": h.get("created_at"),
        "age_hours": int((now - created) // 3600) if created else None,
    })

print(json.dumps(out))
PY
