#!/usr/bin/env bash
# x-targets.sh — registered as the FetchXTargets tool.
#
# The X GROWTH engine: pulls the FRESHEST posts from a curated list of
# mid-tier niche accounts (sites.x.target_accounts) so the user can reply
# EARLY, while the post is still gaining traction and the reply slot is
# visible. This is the real follower-growth lever — replying under accounts
# whose audience IS the target user — as opposed to FetchX keyword search,
# which trawls the firehose (mostly tiny accounts).
#
# Curate the list for relevance × ENGAGEABLE reach, NOT raw fame: ~2k–200k
# follower AI-agent / dev-tool accounts whose reply sections are small
# enough that a sharp comment is seen and the author may engage back. NOT
# mega-accounts (Elon, Sam Altman): their replies are saturated (yours is
# invisible) and their audience is too general to convert.
#
# Usage:
#   x-targets.sh [max_results]   (default 25, capped 10..100)
#   Reads handles from sites.x.target_accounts in config.json.
#
# Output (JSON array; [] on no creds / no targets / no hits): SAME shape as
#   FetchX — [{ source:"x", author, handle, followers, title, text, url,
#               score, likes, reposts, replies, age_hours, created_iso }]
#   so discover-customers ranks + drafts identically. Recency-sorted so the
#   newest (earliest-to-reply) posts come first.
#
# Cost: one paid API call per invocation (your X credits).
# Deps: python3 stdlib only.

set -uo pipefail

if ! command -v python3 &>/dev/null; then
  printf '%s\n' '[]'; exit 0
fi

SITES_DIR="$(cd "$(dirname "$0")" && pwd)"
MAX="${1:-25}" SITES_DIR="$SITES_DIR" CONFIG="$HOME/.linggen/skills/pulse/config.json" python3 <<'PY'
import json, os, sys
from datetime import datetime, timezone

sys.path.insert(0, os.environ["SITES_DIR"])
from x_api import api_get  # noqa: E402

try:
    max_results = max(10, min(int(os.environ.get("MAX", "25")), 100))
except ValueError:
    max_results = 25

try:
    with open(os.environ["CONFIG"]) as f:
        x = (json.load(f).get("sites", {}).get("x", {}) or {})
    handles = [h.strip().lstrip("@") for h in (x.get("target_accounts") or []) if h and h.strip()]
except Exception:
    handles = []

if not handles:
    print("[]"); sys.exit(0)

# Recent search caps query length (~512); cap handles so the OR-group fits.
handles = handles[:25]
from_group = " OR ".join(f"from:{h}" for h in handles)

def age_hours(iso):
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return int((datetime.now(timezone.utc) - dt).total_seconds() // 3600)
    except Exception:
        return None

# Their original posts only (-is:reply -is:retweet). Recency-sorted: we want
# the newest posts so the user can reply while the thread is fresh.
params = {
    "query": f"({from_group}) -is:retweet -is:reply lang:en",
    "max_results": max_results,
    "sort_order": "recency",
    "tweet.fields": "created_at,author_id,public_metrics,text",
    "user.fields": "username,name,public_metrics",
    "expansions": "author_id",
}
status, data = api_get("/tweets/search/recent", params)
if status != 200:
    print("[]"); sys.exit(0)

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
