#!/usr/bin/env bash
# x-search.sh — registered as the FetchX tool.
#
# Searches recent X (Twitter) posts for a topic, for discover-customers and
# research-market. Uses the official X API v2 recent-search endpoint with the
# user's own developer credentials (~/.linggen/skills/pulse/credentials/x.env,
# set up via Settings -> X). Recent search covers ~the last 7 days only.
#
# Usage:
#   x-search.sh "<query>" [max_results]
#   e.g. x-search.sh "local LLM agents" 15
#
# Output (JSON array; [] on no creds / no hits, so the agent can degrade):
#   [{ source:"x", author, handle, followers, title, text, url,
#      score, likes, reposts, replies, age_hours, created_iso }]
#   `title` == `text` (tweets have no separate title) so discover-customers
#   can score it the same way it scores a Reddit thread title/summary.
#
# Cost: one paid API call per invocation (your X credits, ~$0.001-0.01).
#
# Deps: python3 + requests_oauthlib (same as xbot). No jq/curl needed.

set -uo pipefail

QUERY="${1:-}"
MAX="${2:-15}"
if [ -z "$QUERY" ]; then
  printf '%s\n' '[]'
  exit 0
fi
if ! command -v python3 &>/dev/null; then
  printf '%s\n' '[]'
  exit 0
fi

SITES_DIR="$(cd "$(dirname "$0")" && pwd)"
QUERY="$QUERY" MAX="$MAX" SITES_DIR="$SITES_DIR" python3 <<'PY'
import json, os, sys
from datetime import datetime, timezone

sys.path.insert(0, os.environ["SITES_DIR"])  # heredoc has no __file__
from x_api import api_get  # noqa: E402

query = os.environ["QUERY"].strip()
try:
    max_results = max(10, min(int(os.environ.get("MAX", "15")), 100))
except ValueError:
    max_results = 15

def age_hours(iso):
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return int((datetime.now(timezone.utc) - dt).total_seconds() // 3600)
    except Exception:
        return None

# Exclude retweets/replies by default — we want original posts to engage.
q = f"{query} -is:retweet -is:reply lang:en"
params = {
    "query": q,
    "max_results": max_results,
    "tweet.fields": "created_at,author_id,public_metrics,text",
    "user.fields": "username,name,public_metrics",
    "expansions": "author_id",
}
status, data = api_get("/tweets/search/recent", params)
if status != 200:
    # No creds (status None) or API error — emit empty so callers continue.
    print("[]")
    sys.exit(0)

users = {}
for u in (data.get("includes", {}) or {}).get("users", []):
    users[u["id"]] = u

out = []
for t in data.get("data", []) or []:
    u = users.get(t.get("author_id"), {})
    handle = u.get("username", "")
    m = t.get("public_metrics", {}) or {}
    likes = m.get("like_count", 0)
    reposts = m.get("retweet_count", 0)
    replies = m.get("reply_count", 0)
    text = t.get("text", "")
    out.append({
        "source": "x",
        "author": u.get("name", handle),
        "handle": handle,
        "followers": (u.get("public_metrics", {}) or {}).get("followers_count", 0),
        "title": text,
        "text": text,
        "url": f"https://x.com/{handle}/status/{t['id']}" if handle else "",
        "score": likes + reposts,
        "likes": likes,
        "reposts": reposts,
        "replies": replies,
        "created_iso": t.get("created_at"),
        "age_hours": age_hours(t.get("created_at")),
    })

print(json.dumps(out))
PY
