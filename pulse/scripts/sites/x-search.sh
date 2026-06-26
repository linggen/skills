#!/usr/bin/env bash
# x-search.sh — registered as the FetchX tool.
#
# Searches recent X (Twitter) posts for a topic, for discover-customers.
# Reads the user's logged-in x.com session through the
# linggen-browser extension (bridge op "search") — no metered API, $0/read.
# Returns [] when the bridge/extension isn't available.
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
# Cost: $0 — reads via the linggen-browser bridge, no paid X API.
#
# Deps: python3 stdlib only (urllib + json).

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

sys.path.insert(0, os.environ["SITES_DIR"])  # heredoc has no __file__
from x_api import cache_get, cache_put, bridge_call  # noqa: E402

query = os.environ["QUERY"].strip()
try:
    max_results = max(10, min(int(os.environ.get("MAX", "15")), 100))
except ValueError:
    max_results = 15

try:
    with open(os.path.expanduser("~/.linggen/skills/pulse/config.json")) as _cf:
        _x = ((json.load(_cf).get("sites", {}) or {}).get("x", {}) or {})
except Exception:
    _x = {}
# The keyword firehose is OFF by default. It's the lowest value-per-read X
# source — recent-search is mostly tiny/promo accounts that get filtered out —
# and every call still spends metered reads. Curated FetchXTargets is the
# growth engine; opt back in with sites.x.keyword_search=true.
if not _x.get("keyword_search", False):
    print("[]"); sys.exit(0)
# Cache by query: a repeat gather (same keyword) within the TTL reuses the last
# pull instead of re-opening an x.com tab through the bridge.
_ttl_h = _x.get("cache_ttl_hours", 6) or 6
_ckey = f"xsearch:{query}:{max_results}"
_cached = cache_get(_ckey, int(_ttl_h) * 3600)
if _cached is not None:
    print(json.dumps(_cached)); sys.exit(0)

# Bridge-only: read the logged-in x.com session for $0 via linggen-browser.
# None = bridge/extension unavailable → emit [] so callers continue.
_items = bridge_call("search", {"query": query, "max": max_results})
if _items is None:
    print("[]"); sys.exit(0)
cache_put(_ckey, _items)
print(json.dumps(_items))
PY
