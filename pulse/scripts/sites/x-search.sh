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
# Deps: python3 stdlib only (urllib + json) — App-only Bearer auth, no requests_oauthlib.

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
from x_api import api_get, cache_get, cache_put  # noqa: E402

query = os.environ["QUERY"].strip()
try:
    max_results = max(10, min(int(os.environ.get("MAX", "15")), 100))
except ValueError:
    max_results = 15

# Cache by query: X recent-search reads are metered/credit-billed, so a repeat
# gather (same keyword) within the TTL reuses the last pull and costs 0 reads.
try:
    with open(os.path.expanduser("~/.linggen/skills/pulse/config.json")) as _cf:
        _ttl_h = (((json.load(_cf).get("sites", {}) or {}).get("x", {}) or {}).get("cache_ttl_hours", 6)) or 6
except Exception:
    _ttl_h = 6
_ckey = f"xsearch:{query}:{max_results}"
_cached = cache_get(_ckey, int(_ttl_h) * 3600)
if _cached is not None:
    print(json.dumps(_cached)); sys.exit(0)

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
    # Relevancy (not the default recency) ranking. X recent-search by recency
    # returns the just-posted firehose — overwhelmingly promo/spam/bots that
    # never clear the agent's topical-fit cutoff, so the X section came back
    # empty. Relevancy surfaces the most relevant + engaged posts for the
    # query, which is what we actually want to draft replies to.
    "sort_order": "relevancy",
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

cache_put(_ckey, out)
print(json.dumps(out))
PY
