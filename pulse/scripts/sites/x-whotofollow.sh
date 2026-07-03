#!/usr/bin/env bash
# x-whotofollow.sh — registered as the FetchXWhoToFollow tool.
#
# X's own "Who to follow" recommendations, read from the logged-in x.com
# session through the linggen-browser extension (bridge op "whotofollow") — no
# metered API, $0/read. X personalizes these from your graph and already
# excludes people you follow, so it's the highest-priority source (source 1)
# for the not-yet-followed accounts in the target roster.
#
# We additionally exclude anything the user has already decided on — the
# current roster, ignored accounts, and dismissed suggestions — so the same
# faces don't keep resurfacing.
#
# Usage:  x-whotofollow.sh [max]
# Output (JSON array; [] on bridge unavailable):
#   [{ handle, name, followers, following_count, bio, verified }]
#
# Deps: python3 stdlib only.

set -uo pipefail

if ! command -v python3 &>/dev/null; then
  printf '%s\n' '[]'; exit 0
fi

SITES_DIR="$(cd "$(dirname "$0")" && pwd)"
# The engine passes the literal '{{arg}}' when the agent omits an arg.
MAX="${1:-60}"; case "$MAX" in "{{"*"}}") MAX=60;; esac
MAX="$MAX" SITES_DIR="$SITES_DIR" \
  CONFIG="$HOME/.linggen/skills/pulse/config.json" python3 <<'PY'
import json, os, sys

sys.path.insert(0, os.environ["SITES_DIR"])
from x_api import cache_get, cache_put, bridge_call  # noqa: E402

try:
    max_results = max(1, min(int(os.environ.get("MAX", "60")), 100))
except ValueError:
    max_results = 60

self_handle = ""
exclude = set()
ttl_h = 12
try:
    with open(os.environ["CONFIG"]) as f:
        x = (json.load(f).get("sites", {}).get("x", {}) or {})
    self_handle = (x.get("username") or "").strip().lstrip("@")
    ttl_h = x.get("whotofollow_ttl_hours", 12) or 12
    for h in (r.get("handle") for r in (x.get("roster") or []) if isinstance(r, dict)):
        if h:
            exclude.add(str(h).strip().lstrip("@").lower())
    for key in ("ignored_accounts", "dismissed_suggestions", "target_accounts"):
        for h in (x.get(key) or []):
            if h:
                exclude.add(str(h).strip().lstrip("@").lower())
except Exception:
    pass

# Cache by the exclusion set so a changed roster re-pulls; a steady roster reuses.
_ckey = "xwhotofollow:" + ",".join(sorted(exclude))
_cached = cache_get(_ckey, int(ttl_h) * 3600)
if _cached is not None:
    print(json.dumps(_cached)); sys.exit(0)

_items = bridge_call(
    "whotofollow",
    {"exclude": sorted(exclude), "self": self_handle, "max": max_results},
)
if _items is None:
    print("[]"); sys.exit(0)
# Don't cache a transient empty (would suppress suggestions for the TTL).
if _items:
    cache_put(_ckey, _items)
print(json.dumps(_items))
PY
