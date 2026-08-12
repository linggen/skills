#!/usr/bin/env bash
# hn-karma.sh — page-side HN karma snapshot (NOT a registered agent tool).
#
# One free public Firebase user lookup (/v0/user/<username>.json, no auth) using
# sites.hackernews.username. Returns the account's current karma so pulse-app.js
# can chart account growth in the status strip alongside X followers.
#
# Invoked page-side via /api/bash, gated on sites.hackernews.enabled and
# throttled to one snapshot/day by the caller. No SKILL.md tool entry — the
# agent never calls this.
#
# Output (always JSON, exit 0):
#   { "username": "<handle>", "karma": <int|null>, "errors": [ ... ] }
# karma is null + a clear error when no username is configured or the lookup
# fails.
#
# Deps: python3 stdlib only (urllib + json).

set -uo pipefail

if ! command -v python3 &>/dev/null; then
  printf '%s\n' '{"username":"","karma":null,"errors":["python3 missing"]}'
  exit 0
fi

CONFIG="$HOME/.linggen/skills/pulse/config.json" python3 <<'PY'
import json, os, sys, urllib.parse, urllib.request

def out(username="", karma=None, err=None):
    print(json.dumps({"username": username, "karma": karma,
                      "errors": [err] if err else []}))
    sys.exit(0)

try:
    with open(os.environ["CONFIG"]) as f:
        hn = (json.load(f).get("sites", {}).get("hackernews", {}) or {})
except Exception:
    out()

username = (hn.get("username") or "").strip().lstrip("@")
if not username:
    out()

try:
    u = urllib.parse.quote(username)
    with urllib.request.urlopen(
            f"https://hacker-news.firebaseio.com/v0/user/{u}.json", timeout=8) as r:
        prof = json.load(r)
except Exception as e:
    out(username, None, f"HN user lookup failed: {e}")

if not isinstance(prof, dict):
    out(username, None, f"no HN user '{username}'")

karma = prof.get("karma")
out(username, karma if isinstance(karma, int) else None)
PY
