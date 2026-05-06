#!/usr/bin/env bash
# collect.sh — pulse skill context-gathering script.
#
# Invoked by the agent in Phase 1 of the drafting protocol. Writes a
# unified manifest to /tmp/pulse-manifest-<date>.json describing
# the last 24h of work — sessions, commits, ling-mem facts.
#
# The agent reads this manifest, then proceeds to theme extraction.

set -uo pipefail

DATE="$(date +%Y-%m-%d)"
SINCE_TS="$(date -u -v -24H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
            || date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)"
MANIFEST="/tmp/pulse-manifest-$DATE.json"

# Voice samples — preload so the agent can read them via this manifest
# rather than a separate tool call.
VOICE_FILE="$HOME/.linggen/skills/pulse/references/voice-samples.md"
VOICE_CONTENT=""
if [[ -f "$VOICE_FILE" ]]; then
  VOICE_CONTENT="$(cat "$VOICE_FILE")"
fi

# Sessions in the last 24h: enumerate Claude Code + Linggen session
# dirs, find files modified within the window, capture (path, bytes,
# user-turn count if computable).
collect_sessions() {
  local roots=("$HOME/.claude/projects" "$HOME/.linggen/sessions")
  for root in "${roots[@]}"; do
    [[ -d "$root" ]] || continue
    find "$root" -type f -name '*.jsonl' -mtime -1 2>/dev/null
  done | while read -r f; do
    local bytes
    bytes="$(wc -c < "$f" 2>/dev/null | tr -d ' ' || echo 0)"
    local turns
    turns="$(grep -c '"role":"user"' "$f" 2>/dev/null || echo 0)"
    printf '{"path":"%s","bytes":%s,"user_turns":%s}\n' "$f" "$bytes" "$turns"
  done
}

# Commits in the last 24h across all known repos under ~/workspace.
collect_commits() {
  local workspace="$HOME/workspace"
  [[ -d "$workspace" ]] || return 0
  for repo in "$workspace"/*/.git; do
    local repo_dir
    repo_dir="$(dirname "$repo")"
    git -C "$repo_dir" log --since="$SINCE_TS" --pretty='format:{"repo":"%h-prefix","hash":"%h","subject":"%s","author":"%an","date":"%aI"}' 2>/dev/null \
      | sed "s|h-prefix|$(basename "$repo_dir")|g"
  done | sed 's/$/,/' | sed '$s/,$//'
}

# ling-mem facts added/updated in last 24h. Best-effort: if ling-mem
# CLI is missing, return empty.
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
COMMITS_RAW="$(collect_commits)"
COMMITS_JSON="[$(echo "$COMMITS_RAW" | tr '\n' ' ')]"
COMMITS_JSON="$(echo "$COMMITS_JSON" | jq '.' 2>/dev/null || echo '[]')"
MEMORIES_JSON="$(collect_memories | jq -s '.' 2>/dev/null || echo '[]')"

jq -n \
  --arg date "$DATE" \
  --arg since "$SINCE_TS" \
  --arg voice "$VOICE_CONTENT" \
  --argjson sessions "$SESSIONS_JSON" \
  --argjson commits "$COMMITS_JSON" \
  --argjson memories "$MEMORIES_JSON" \
  '{
    date: $date,
    since: $since,
    sessions: $sessions,
    commits: $commits,
    memories: $memories,
    voice_samples: $voice
  }' > "$MANIFEST"

echo "$MANIFEST"
