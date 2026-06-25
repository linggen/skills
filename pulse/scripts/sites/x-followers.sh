#!/usr/bin/env bash
# x-followers.sh — page-side follower-count snapshot (NOT a registered agent tool).
#
# Reads the account's current follower count from the logged-in x.com session
# via the linggen-browser extension (bridge op "followers"), resolved from the
# configured handle (sites.x.username). Lets pulse-app.js chart audience growth
# in the status strip — the "is the account actually growing?" loop.
#
# Invoked page-side via /api/bash (like x-suggest-accounts.sh), gated on
# sites.x.enabled and throttled to one snapshot/day by the caller. No SKILL.md
# tool entry — the agent never calls this.
#
# Output (always JSON, exit 0):
#   { "username": "<handle>", "followers": <int|null>, "errors": [ ... ] }
# followers is null + a clear error when the bridge/extension is unavailable.
#
# Deps: python3 stdlib only (urllib + json).

set -uo pipefail

if ! command -v python3 &>/dev/null; then
  printf '%s\n' '{"username":"","followers":null,"errors":["python3 missing"]}'
  exit 0
fi

SITES_DIR="$(cd "$(dirname "$0")" && pwd)"
SITES_DIR="$SITES_DIR" python3 <<'PY'
import json, os, sys

sys.path.insert(0, os.environ["SITES_DIR"])  # heredoc has no __file__
from x_api import bridge_call  # noqa: E402

# Handle from config (no API self-lookup anymore).
username = ""
try:
    with open(os.path.expanduser("~/.linggen/skills/pulse/config.json")) as f:
        username = (((json.load(f).get("sites") or {}).get("x") or {})
                    .get("username") or "").strip().lstrip("@")
except Exception:
    pass

# Bridge-only: the extension returns a one-element list carrying the count,
# e.g. [{"followers": 1234}]. None = bridge/extension unavailable.
res = bridge_call("followers", {"username": username})
followers, errors = None, []
if res is None:
    errors = ["x followers: bridge/extension unavailable (no reader op yet)"]
elif res:
    first = res[0]
    followers = first.get("followers") if isinstance(first, dict) else first

print(json.dumps({
    "username": username,
    "followers": followers,
    "errors": errors,
}))
PY
