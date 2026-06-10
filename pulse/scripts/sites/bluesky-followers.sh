#!/usr/bin/env bash
# bluesky-followers.sh — page-side Bluesky follower snapshot (NOT an agent tool).
#
# One free public AT Proto lookup (app.bsky.actor.getProfile, no auth) for
# sites.bluesky.handle. Returns the account's current follower count so
# pulse-app.js can chart account growth in the status strip alongside X / HN.
#
# Invoked page-side via /api/bash, gated on sites.bluesky.enabled and throttled
# to one snapshot/day by the caller. No SKILL.md tool entry — the agent never
# calls this. Mirrors bluesky-mentions.sh's public-API + jq style.
#
# Output (always JSON, exit 0):
#   { "handle": "<handle>", "followers": <int|null>, "errors": [ ... ] }
# followers is null + a clear error when no handle is configured or the lookup
# fails.
#
# Deps: curl + jq.

set -uo pipefail

CONFIG="$HOME/.linggen/skills/pulse/config.json"
API="https://api.bsky.app/xrpc"
UA="linggen-pulse/0.1 (public-only; no-auth)"

# Emit a result envelope. $2 must be valid JSON (a number or the literal null).
emit() {
  jq -cn --arg h "$1" --argjson f "$2" --arg e "$3" \
    '{handle:$h, followers:$f, errors: (if $e=="" then [] else [$e] end)}'
  exit 0
}

command -v jq   &>/dev/null || { printf '%s\n' '{"handle":"","followers":null,"errors":["jq missing"]}'; exit 0; }
command -v curl &>/dev/null || { printf '%s\n' '{"handle":"","followers":null,"errors":["curl missing"]}'; exit 0; }
[[ -f "$CONFIG" ]] || emit "" null "no config.json"

HANDLE=$(jq -r '.sites.bluesky.handle // ""' "$CONFIG" 2>/dev/null | tr -d ' ' | sed 's/^@//')
[[ -z "$HANDLE" ]] && emit "" null "no bluesky handle in config — set sites.bluesky.handle in Settings"

Q=$(printf %s "$HANDLE" | jq -sRr @uri)
JSON=$(curl -fsS --max-time 12 -A "$UA" "${API}/app.bsky.actor.getProfile?actor=${Q}" 2>/dev/null)
[[ -z "$JSON" ]] && emit "$HANDLE" null "bluesky getProfile failed"

FOLLOWERS=$(echo "$JSON" | jq -r '.followersCount // empty')
[[ -z "$FOLLOWERS" ]] && emit "$HANDLE" null "no followersCount in profile"

emit "$HANDLE" "$FOLLOWERS" ""
