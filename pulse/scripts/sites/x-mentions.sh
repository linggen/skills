#!/usr/bin/env bash
# x-mentions.sh — registered as the FetchXMentions tool.
#
# Surfaces recent X (Twitter) mentions + replies to the user's tweets, via the
# official X API v2 with the user's own credentials
# (~/.linggen/skills/pulse/credentials/x.env, set up via Settings -> X).
#
# For each item we resolve the tweet it replied to (referenced_tweets); when
# that parent is one of YOUR tweets it's kind="reply_to_me" and we attach your
# tweet as parent_comment_body — the same shape as reddit-mentions, so the UI
# renders "your tweet" + "their reply" + a draft, which you copy to reply.
#
# Output (always JSON, exit 0):
#   { items: [{kind, title, body, url, author, created_iso, score,
#              watched_term, parent_comment_body?, parent_comment_url?}],
#     count, errors }
#   kind in {"reply_to_me","mention"}
#
# Cost: ~2 paid API calls per run (your X credits). Recent mentions only.
#
# Deps: python3 stdlib only (urllib + json) — App-only Bearer auth, no requests_oauthlib.

set -uo pipefail

MAX="${1:-15}"
if ! command -v python3 &>/dev/null; then
  printf '%s\n' '{"items":[],"count":0,"errors":["python3 missing"]}'
  exit 0
fi

SITES_DIR="$(cd "$(dirname "$0")" && pwd)"
MAX="$MAX" SITES_DIR="$SITES_DIR" python3 <<'PY'
import json, os, sys

sys.path.insert(0, os.environ["SITES_DIR"])  # heredoc has no __file__
from x_api import api_get, resolve_self_id  # noqa: E402

try:
    max_results = max(5, min(int(os.environ.get("MAX", "15")), 100))
except ValueError:
    max_results = 15

items, errors = [], []

def out(extra_err=None):
    if extra_err:
        errors.append(extra_err)
    print(json.dumps({"items": items, "count": len(items), "errors": errors}))
    sys.exit(0)

# 1. Who am I? App-only Bearer has no "/users/me" — resolve by configured handle.
my_id, username, err = resolve_self_id()
if err:
    out(err)

# 2. Recent mentions (includes replies to you). Pull referenced tweets +
#    authors so we can recover the parent ("your tweet") for replies.
params = {
    "max_results": max_results,
    "tweet.fields": "created_at,author_id,public_metrics,text,referenced_tweets",
    "user.fields": "username,name",
    "expansions": "author_id,referenced_tweets.id,referenced_tweets.id.author_id",
}
status, data = api_get(f"/users/{my_id}/mentions", params)
if status != 200:
    out(f"X mentions failed ({status})")

users = {u["id"]: u for u in (data.get("includes", {}) or {}).get("users", [])}
inc_tweets = {t["id"]: t for t in (data.get("includes", {}) or {}).get("tweets", [])}

def handle_of(uid):
    return users.get(uid, {}).get("username", "")

for t in data.get("data", []) or []:
    author_id = t.get("author_id")
    author_handle = handle_of(author_id)
    m = t.get("public_metrics", {}) or {}
    # Find the tweet this one replied to, if any.
    parent_id = None
    for ref in (t.get("referenced_tweets") or []):
        if ref.get("type") == "replied_to":
            parent_id = ref.get("id")
            break
    parent = inc_tweets.get(parent_id) if parent_id else None
    parent_is_mine = bool(parent) and parent.get("author_id") == my_id
    kind = "reply_to_me" if parent_is_mine else "mention"
    parent_body, parent_url = "", ""
    if parent_is_mine:
        parent_body = (parent.get("text") or "")[:1500]
        parent_url = f"https://x.com/{username}/status/{parent_id}"
    items.append({
        "kind": kind,
        "title": f"@{author_handle} on X" if author_handle else "X mention",
        "body": (t.get("text") or "")[:1500],
        "url": f"https://x.com/{author_handle}/status/{t['id']}" if author_handle else "",
        "author": f"@{author_handle}" if author_handle else "",
        "created_iso": t.get("created_at"),
        "score": m.get("like_count", 0),
        "watched_term": f"@{username}",
        "parent_comment_body": parent_body,
        "parent_comment_url": parent_url,
    })

out()
PY
