#!/usr/bin/env bash
# collect.sh — pulse skill context-gathering script.
#
# Invoked by the page on session open / new-run. Writes a manifest to
# ~/.linggen/skills/pulse/data/manifest-<date>.json describing the
# user's recent work (sessions, commits, ling-mem facts) within a
# configurable window. The path lives inside pulse's own data dir so
# it's covered by pulse's existing edit grant — no /tmp leak.
#
# Usage:
#   bash collect.sh                       # default window: 24h
#   bash collect.sh --window=24h          # explicit
#   bash collect.sh --window=7d
#   bash collect.sh --window=30d
#   bash collect.sh --window=since=2026-05-01
#
# Echoes the manifest path to stdout.

set -uo pipefail

# ---- Window parsing -----------------------------------------------------
WINDOW="24h"
for arg in "$@"; do
  case "$arg" in
    --window=*) WINDOW="${arg#--window=}" ;;
  esac
done

DATE="$(date +%Y-%m-%d)"

# Compute SINCE_TS based on window.
case "$WINDOW" in
  24h)
    SINCE_TS="$(date -u -v -24H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
                || date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)"
    MTIME_DAYS=1
    ;;
  7d)
    SINCE_TS="$(date -u -v -7d  +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
                || date -u -d '7 days ago'   +%Y-%m-%dT%H:%M:%SZ)"
    MTIME_DAYS=7
    ;;
  30d)
    SINCE_TS="$(date -u -v -30d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
                || date -u -d '30 days ago'  +%Y-%m-%dT%H:%M:%SZ)"
    MTIME_DAYS=30
    ;;
  since=*)
    SINCE_DATE="${WINDOW#since=}"
    SINCE_TS="${SINCE_DATE}T00:00:00Z"
    NOW_S="$(date +%s)"
    SINCE_S="$(date -j -f "%Y-%m-%d" "${SINCE_DATE}" +%s 2>/dev/null \
              || date -d "${SINCE_DATE}" +%s)"
    MTIME_DAYS=$(( (NOW_S - SINCE_S) / 86400 + 1 ))
    ;;
  *)
    echo "collect.sh: unknown window '$WINDOW' (use 24h|7d|30d|since=YYYY-MM-DD)" >&2
    exit 2
    ;;
esac

MANIFEST_DIR="$HOME/.linggen/skills/pulse/data"
mkdir -p "$MANIFEST_DIR"
MANIFEST="$MANIFEST_DIR/manifest-$DATE.json"

# Sessions in the window: enumerate Claude Code + Linggen session
# dirs, find files modified within the window, capture (path, bytes,
# user-turn count if computable).
collect_sessions() {
  local roots=("$HOME/.claude/projects" "$HOME/.linggen/sessions")
  for root in "${roots[@]}"; do
    [[ -d "$root" ]] || continue
    find "$root" -type f -name '*.jsonl' -mtime -"$MTIME_DAYS" 2>/dev/null
  done | while read -r f; do
    local bytes
    bytes="$(wc -c < "$f" 2>/dev/null | tr -d ' ' || echo 0)"
    local turns
    turns="$(grep -c '"role":"user"' "$f" 2>/dev/null || echo 0)"
    printf '{"path":"%s","bytes":%s,"user_turns":%s}\n' "$f" "$bytes" "$turns"
  done
}

# Commits within the window across all known repos under ~/workspace.
# One JSON object per line, built with jq so subjects/authors containing
# quotes or backslashes can't corrupt the manifest. Fields ride a unit
# separator (%x1f) out of git — a byte that can't appear in commit text.
collect_commits() {
  local workspace="$HOME/workspace"
  [[ -d "$workspace" ]] || return 0
  for repo in "$workspace"/*/.git; do
    local repo_dir repo_name
    repo_dir="$(dirname "$repo")"
    repo_name="$(basename "$repo_dir")"
    git -C "$repo_dir" log --since="$SINCE_TS" --pretty='format:%h%x1f%s%x1f%an%x1f%aI' 2>/dev/null \
      | while IFS=$'\x1f' read -r hash subject author date || [[ -n "$hash" ]]; do
          jq -cn --arg repo "$repo_name" --arg hash "$hash" \
                 --arg subject "$subject" --arg author "$author" --arg date "$date" \
            '{repo:$repo,hash:$hash,subject:$subject,author:$author,date:$date}'
        done
  done
}

# ling-mem facts added/updated within the window. Best-effort: if
# ling-mem CLI is missing, return empty.
collect_memories() {
  if ! command -v ling-mem >/dev/null 2>&1; then
    return 0
  fi
  ling-mem search "" --since "$SINCE_TS" --limit 50 --format json --quiet 2>/dev/null \
    | jq -c 'del(.vector)' 2>/dev/null \
    || true
}

# Build the manifest. Use jq to assemble JSON safely.
SESSIONS_JSON="$(collect_sessions | jq -s '.' 2>/dev/null || echo '[]')"
COMMITS_JSON="$(collect_commits | jq -s '.' 2>/dev/null || echo '[]')"
MEMORIES_JSON="$(collect_memories | jq -s '.' 2>/dev/null || echo '[]')"

jq -n \
  --arg date "$DATE" \
  --arg window "$WINDOW" \
  --arg since "$SINCE_TS" \
  --argjson sessions "$SESSIONS_JSON" \
  --argjson commits "$COMMITS_JSON" \
  --argjson memories "$MEMORIES_JSON" \
  '{
    date: $date,
    window: $window,
    since: $since,
    sessions: $sessions,
    commits: $commits,
    memories: $memories
  }' > "$MANIFEST"

echo "$MANIFEST"
