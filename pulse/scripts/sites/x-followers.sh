#!/usr/bin/env bash
# x-followers.sh — page-side follower-count snapshot (NOT a registered agent tool).
#
# One cheap X API v2 user lookup (/users/by/username?user.fields=public_metrics)
# resolved from the configured handle (sites.x.username). Returns the account's
# current follower count so pulse-app.js can chart audience growth in the status
# strip — the "is the account actually growing?" loop.
#
# Invoked page-side via /api/bash (like x-suggest-accounts.sh), gated on
# sites.x.enabled and throttled to one snapshot/day by the caller. No SKILL.md
# tool entry — the agent never calls this.
#
# Output (always JSON, exit 0):
#   { "username": "<handle>", "followers": <int|null>, "errors": [ ... ] }
# followers is null + a clear error when creds or handle are absent.
#
# Deps: python3 stdlib only (urllib + json) — App-only Bearer, no requests_oauthlib.

set -uo pipefail

if ! command -v python3 &>/dev/null; then
  printf '%s\n' '{"username":"","followers":null,"errors":["python3 missing"]}'
  exit 0
fi

SITES_DIR="$(cd "$(dirname "$0")" && pwd)"
SITES_DIR="$SITES_DIR" python3 <<'PY'
import json, os, sys

sys.path.insert(0, os.environ["SITES_DIR"])  # heredoc has no __file__
from x_api import resolve_self_id, self_followers  # noqa: E402

_id, username, err = resolve_self_id()
errors = [err] if err else []
print(json.dumps({
    "username": username,
    "followers": self_followers(),
    "errors": errors,
}))
PY
