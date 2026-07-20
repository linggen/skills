#!/usr/bin/env bash
# reddit-karma.sh — page-side Reddit karma snapshot (NOT a registered agent tool).
#
# Post-lockdown Reddit 403s every .json endpoint anonymously, but the
# old.reddit.com user PROFILE HTML still serves 200 with the karma numbers
# in the sidebar (spans class="karma" = post karma, class="comment-karma").
# Parse those. Anonymous requests 429 readily, so keep a last-good cache —
# the caller only snapshots once/day anyway.
#
# Invoked page-side via /api/bash, gated on sites.reddit.enabled + username.
# No SKILL.md tool entry — the agent never calls this.
#
# Output (always JSON, exit 0):
#   { "username", "karma": <post+comment|null>, "post_karma", "comment_karma",
#     "stale": <bool>, "errors": [ ... ] }
#
# Deps: python3 stdlib only.

set -uo pipefail

if ! command -v python3 &>/dev/null; then
  printf '%s\n' '{"username":"","karma":null,"errors":["python3 missing"]}'
  exit 0
fi

CONFIG="$HOME/.linggen/skills/pulse/config.json" python3 <<'PY'
import json, os, re, sys, urllib.parse, urllib.request

CACHE = os.path.expanduser("~/.linggen/skills/pulse/state/reddit-karma-cache.json")

def out(username="", karma=None, post=None, comment=None, stale=False, err=None):
    print(json.dumps({"username": username, "karma": karma,
                      "post_karma": post, "comment_karma": comment,
                      "stale": stale, "errors": [err] if err else []}))
    sys.exit(0)

try:
    with open(os.environ["CONFIG"]) as f:
        reddit = (json.load(f).get("sites", {}).get("reddit", {}) or {})
except Exception:
    out()

username = (reddit.get("username") or "").strip().lstrip("u/").lstrip("/")
if not username:
    out()

def cached(err):
    try:
        c = json.load(open(CACHE))
        if c.get("username") == username and isinstance(c.get("karma"), int):
            out(username, c["karma"], c.get("post_karma"), c.get("comment_karma"),
                stale=True, err=err)
    except Exception:
        pass
    out(username, None, err=err)

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
     "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36")
try:
    req = urllib.request.Request(
        f"https://old.reddit.com/user/{urllib.parse.quote(username)}",
        headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=15) as r:
        html = r.read().decode("utf-8", "replace")
except Exception as e:
    cached(f"profile fetch failed: {e}")

m_post = re.search(r'class="karma">([\d,]+)<', html)
m_comment = re.search(r'class="karma comment-karma">([\d,]+)<', html)
if not m_post and not m_comment:
    cached("karma spans not found in profile HTML (layout change or shadowban?)")

post = int(m_post.group(1).replace(",", "")) if m_post else 0
comment = int(m_comment.group(1).replace(",", "")) if m_comment else 0
total = post + comment

try:
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with open(CACHE, "w") as f:
        json.dump({"username": username, "karma": total,
                   "post_karma": post, "comment_karma": comment}, f)
except Exception:
    pass

out(username, total, post, comment)
PY
