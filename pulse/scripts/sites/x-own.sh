#!/usr/bin/env bash
# x-own.sh — registered as the FetchXOwnPosts tool.
#
# Returns the user's OWN recent X posts with engagement metrics (likes,
# reposts, replies, impressions), via the official X API v2 with the user's
# own credentials (~/.linggen/skills/pulse/credentials/x.env, set up via
# Settings -> X). Ported from the xbot skill's my_tweets.py.
#
# Two uses:
#   - draft-content reads this so a new x-post builds on what the user
#     already shipped/posted instead of repeating it, and so high-engagement
#     past posts inform what to write more of (the performance feedback loop).
#   - lets the page surface "what you posted recently + how it did".
#
# Usage:
#   x-own.sh [max_results]   (default 10, capped 5..100)
#
# Output (always JSON, exit 0):
#   { username, items:[{text, url, likes, reposts, replies, views,
#                        score, created_iso, age_hours}],
#     replied_to:[ "<x.com status url>", … ], count, errors }
#   score = likes + reposts (same convention as FetchX), so the agent can
#   rank the user's own posts the same way it ranks discovered ones.
#   replied_to = parent tweets the user has already replied to — Pulse uses
#   this to suppress already-engaged posts from discovery (mirrors Reddit's
#   own_comment behavior). items stays original-posts-only for draft de-dup.
#
# Cost: ~2 paid API calls per run (your X credits). Recent posts only.
#
# Deps: python3 stdlib only (urllib + json) — App-only Bearer auth, no requests_oauthlib.

set -uo pipefail

MAX="${1:-10}"
if ! command -v python3 &>/dev/null; then
  printf '%s\n' '{"username":"","items":[],"count":0,"errors":["python3 missing"]}'
  exit 0
fi

SITES_DIR="$(cd "$(dirname "$0")" && pwd)"
MAX="$MAX" SITES_DIR="$SITES_DIR" python3 <<'PY'
import json, os, sys
from datetime import datetime, timezone

sys.path.insert(0, os.environ["SITES_DIR"])  # heredoc has no __file__
from x_api import api_get, resolve_self_id  # noqa: E402

try:
    max_results = max(5, min(int(os.environ.get("MAX", "10")), 100))
except ValueError:
    max_results = 10

items, replied_to, errors = [], [], []
username = ""

def out(extra_err=None):
    if extra_err:
        errors.append(extra_err)
    print(json.dumps({"username": username, "items": items,
                      "replied_to": replied_to,
                      "count": len(items), "errors": errors}))
    sys.exit(0)

def age_hours(iso):
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return int((datetime.now(timezone.utc) - dt).total_seconds() // 3600)
    except Exception:
        return None

# 1. Who am I? App-only Bearer has no "/users/me" — resolve by configured handle.
my_id, username, err = resolve_self_id()
if err:
    out(err)

# 2. My recent tweets + engagement. Keep replies in the response (exclude
#    only retweets) so we can report which parents I already replied to —
#    but classify each tweet: a reply (referenced_tweets type "replied_to")
#    feeds `replied_to`, everything else (original posts + quotes) feeds
#    `items` so the draft de-dup contract is unchanged.
params = {
    "max_results": max_results,
    "tweet.fields": "created_at,public_metrics,text,referenced_tweets",
    "exclude": "retweets",
}
status, data = api_get(f"/users/{my_id}/tweets", params)
if status != 200:
    out(f"X user-tweets failed ({status})")

seen_parents = set()
for t in data.get("data", []) or []:
    parent_id = next(
        (r.get("id") for r in (t.get("referenced_tweets") or [])
         if r.get("type") == "replied_to"),
        None,
    )
    if parent_id:
        # A reply by me — record the PARENT tweet so discovery won't
        # resurface a post I already engaged with.
        if parent_id not in seen_parents:
            seen_parents.add(parent_id)
            replied_to.append(f"https://x.com/i/status/{parent_id}")
        continue
    m = t.get("public_metrics", {}) or {}
    likes = m.get("like_count", 0)
    reposts = m.get("retweet_count", 0)
    replies = m.get("reply_count", 0)
    views = m.get("impression_count", 0)
    items.append({
        "text": t.get("text", ""),
        "url": f"https://x.com/{username}/status/{t['id']}" if username else "",
        "likes": likes,
        "reposts": reposts,
        "replies": replies,
        "views": views,
        "score": likes + reposts,
        "created_iso": t.get("created_at"),
        "age_hours": age_hours(t.get("created_at")),
    })

out()
PY
