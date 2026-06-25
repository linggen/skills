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
# Reads the user's logged-in x.com session through the linggen-browser
# extension (bridge op "targets") — no metered API, $0/read. Returns [] when
# the bridge/extension isn't available.
#
# Deps: python3 stdlib only.

set -uo pipefail

if ! command -v python3 &>/dev/null; then
  printf '%s\n' '[]'; exit 0
fi

SITES_DIR="$(cd "$(dirname "$0")" && pwd)"
MAX="${1:-25}" SITES_DIR="$SITES_DIR" CONFIG="$HOME/.linggen/skills/pulse/config.json" python3 <<'PY'
import json, os, sys

sys.path.insert(0, os.environ["SITES_DIR"])
from x_api import cache_get, cache_put, bridge_call  # noqa: E402

try:
    max_results = max(10, min(int(os.environ.get("MAX", "25")), 100))
except ValueError:
    max_results = 25

ttl_h = 6
try:
    with open(os.environ["CONFIG"]) as f:
        x = (json.load(f).get("sites", {}).get("x", {}) or {})
    handles = [h.strip().lstrip("@") for h in (x.get("target_accounts") or []) if h and h.strip()]
    ttl_h = x.get("cache_ttl_hours", 6) or 6
except Exception:
    handles = []

if not handles:
    print("[]"); sys.exit(0)

# Recent search caps query length (~512); cap handles so the OR-group fits.
handles = handles[:25]

# Cache the result by roster: a repeat gather within the TTL reuses the last
# pull instead of re-opening an x.com tab through the bridge.
_ckey = "xtargets:" + ",".join(sorted(handles))
_cached = cache_get(_ckey, int(ttl_h) * 3600)
if _cached is not None:
    print(json.dumps(_cached)); sys.exit(0)

# Bridge-only: read the logged-in x.com session for $0 via linggen-browser.
# None = bridge/extension unavailable → emit [] so callers continue.
_items = bridge_call("targets", {"handles": handles, "per_author": 3, "max": max_results})
if _items is None:
    print("[]"); sys.exit(0)
cache_put(_ckey, _items)
print(json.dumps(_items))
PY
