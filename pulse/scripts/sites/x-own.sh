#!/usr/bin/env bash
# x-own.sh — registered as the FetchXOwnPosts tool.
#
# Returns the user's OWN recent X posts with engagement metrics (likes,
# reposts, replies, impressions), read from the logged-in x.com session via the
# linggen-browser extension (bridge op "own") — no metered API, $0/read.
# The op is live (x module v3). When the bridge or extension is unavailable
# this still returns an empty but valid payload and reports why in `errors`.
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
# Cost: $0 — reads via the linggen-browser bridge, no paid X API.
#
# Deps: python3 stdlib only (urllib + json).

set -uo pipefail

# The engine passes the literal '{{arg}}' when the agent omits an arg.
MAX="${1:-10}"; case "$MAX" in "{{"*"}}") MAX=10;; esac
if ! command -v python3 &>/dev/null; then
  printf '%s\n' '{"username":"","items":[],"count":0,"errors":["python3 missing"]}'
  exit 0
fi

SITES_DIR="$(cd "$(dirname "$0")" && pwd)"
MAX="$MAX" SITES_DIR="$SITES_DIR" python3 <<'PY'
import json, os, sys

sys.path.insert(0, os.environ["SITES_DIR"])  # heredoc has no __file__
from x_api import bridge_call  # noqa: E402

try:
    max_results = max(5, min(int(os.environ.get("MAX", "10")), 100))
except ValueError:
    max_results = 10

# Handle from config (no API self-lookup anymore).
username = ""
try:
    with open(os.path.expanduser("~/.linggen/skills/pulse/config.json")) as f:
        username = (((json.load(f).get("sites") or {}).get("x") or {})
                    .get("username") or "").strip().lstrip("@")
except Exception:
    pass

# Bridge-only: the linggen-browser extension reads the user's own timeline
# (x.com/<handle>/with_replies). The `own` reader returns a dict
# {items: [...original posts...], replied_to: [...parent status urls...]}.
# bridge_call returns None when the bridge/extension is unavailable.
result = bridge_call("own", {"username": username, "max": max_results})
if result is None:
    items, replied_to = [], []
    errors = ["x own-posts: bridge/extension unavailable"]
elif isinstance(result, dict):
    items = result.get("items") or []
    replied_to = result.get("replied_to") or []
    errors = []
else:  # legacy/list shape — items only
    items = result or []
    replied_to = []
    errors = []
print(json.dumps({
    "username": username,
    "items": items,
    "replied_to": replied_to,
    "count": len(items),
    "errors": errors,
}))
PY
