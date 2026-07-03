#!/usr/bin/env bash
# x-following.sh — registered as the FetchXFollowing tool.
#
# Lists the accounts a handle follows, read from the user's logged-in x.com
# session through the linggen-browser extension (bridge op "following") — no
# metered API, $0/read. Two uses:
#   (no arg)        → the USER's own following (sites.x.username). This is the
#                     candidate pool the agent curates the reply-target roster
#                     from, AND the exclusion set for follow-suggestions.
#   <handle>        → that handle's following (the "second-degree" roster
#                     source: who do my target accounts follow → central niche
#                     accounts worth surfacing).
#
# Following changes slowly, so the result is cached 24h by handle — a gather
# reuses the last pull instead of re-opening an x.com tab every run.
#
# Usage:  x-following.sh [handle] [max]
# Output (JSON array; [] on no handle / bridge unavailable):
#   [{ handle, name, followers, following_count, bio, verified }]
#
# Deps: python3 stdlib only.

set -uo pipefail

if ! command -v python3 &>/dev/null; then
  printf '%s\n' '[]'; exit 0
fi

SITES_DIR="$(cd "$(dirname "$0")" && pwd)"
# The engine passes the literal '{{arg}}' when the agent omits an arg.
ARG_HANDLE="${1:-}"; case "$ARG_HANDLE" in "{{"*"}}") ARG_HANDLE="";; esac
MAX="${2:-400}"; case "$MAX" in "{{"*"}}") MAX=400;; esac
ARG_HANDLE="$ARG_HANDLE" MAX="$MAX" SITES_DIR="$SITES_DIR" \
  CONFIG="$HOME/.linggen/skills/pulse/config.json" python3 <<'PY'
import json, os, sys

sys.path.insert(0, os.environ["SITES_DIR"])
from x_api import cache_get, cache_put, bridge_call  # noqa: E402

try:
    max_results = max(1, min(int(os.environ.get("MAX", "400")), 1000))
except ValueError:
    max_results = 400

self_handle = ""
ttl_h = 24
try:
    with open(os.environ["CONFIG"]) as f:
        x = (json.load(f).get("sites", {}).get("x", {}) or {})
    self_handle = (x.get("username") or "").strip().lstrip("@")
    ttl_h = x.get("following_ttl_hours", 24) or 24
except Exception:
    pass

# No arg → the user's own following; arg → that handle's following.
handle = (os.environ.get("ARG_HANDLE") or self_handle).strip().lstrip("@")
if not handle:
    print("[]"); sys.exit(0)

_ckey = "xfollowing:" + handle.lower()
_cached = cache_get(_ckey, int(ttl_h) * 3600)
if _cached is not None:
    print(json.dumps(_cached)); sys.exit(0)

_items = bridge_call(
    "following", {"handle": handle, "self": self_handle, "max": max_results}
)
if _items is None:
    print("[]"); sys.exit(0)
# NEVER cache an empty result: a transient capture miss must not poison
# followed-tagging for the whole TTL. Only a real list is worth caching.
if _items:
    cache_put(_ckey, _items)
print(json.dumps(_items))
PY
