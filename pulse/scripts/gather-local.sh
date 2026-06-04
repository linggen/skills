#!/usr/bin/env bash
#
# gather-local.sh — Collect yesterday's local activity for Pulse.
#
# Returns a JSON object on stdout (single line) of the shape:
#   { "items": [ { kind, source, label, body, ts, ref }, … ],
#     "window": { since: "YYYY-MM-DD", until: "YYYY-MM-DD", expanded_to: "24h|7d|30d" },
#     "workspace": "<absolute path or empty>",
#     "errors": [ "string", … ] }
#
# kind is one of:
#   - "commit"       — git commit in workspace (label = subject, body = body, ref = sha)
#   - "session-cc"   — Claude Code session with user activity that day
#   - "session-ling" — Linggen session with user activity that day
#   - "file"         — recently changed file in workspace (label = path, ts = mtime ISO)
#
# Sources reused from ling-mem skill (collect_sessions.sh) when present, so we
# don't reimplement session walking. Falls back gracefully if ling-mem isn't
# installed.
#
# Window expansion: starts at 24h, expands to 7d then 30d if fewer than
# MIN_ITEMS items were found. Caller doesn't pick the window — let the script
# find enough signal automatically.
#
# Privacy: no network calls. Reads only ~/.linggen, ~/.claude, and the
# configured workspace path. No data leaves the machine.

set -uo pipefail

SKILL_DIR="${HOME}/.linggen/skills/pulse"
# Memory skill dir — the skill was renamed ling-mem → shared-memory. Prefer
# the new name; fall back to the old one for installs that haven't migrated.
MEM_SKILL_DIR="${HOME}/.linggen/skills/shared-memory"
[ -d "$MEM_SKILL_DIR" ] || MEM_SKILL_DIR="${HOME}/.linggen/skills/ling-mem"
CONFIG_PATH="${SKILL_DIR}/config.json"
MIN_ITEMS=5      # expand window if fewer than this
HARD_CAP=40      # don't return more than this even at widest window
FILE_CAP=20      # cap changed-files separately to avoid drowning sessions/commits

if ! command -v jq &>/dev/null; then
  echo '{"items":[],"window":{"expanded_to":"none"},"workspace":"","errors":["jq missing"]}'
  exit 0
fi

# ── Resolve workspace from config ──
workspace=""
if [ -f "$CONFIG_PATH" ]; then
  workspace=$(jq -r '.workspace_path // ""' "$CONFIG_PATH" 2>/dev/null)
  # Expand ~ if present
  if [[ "$workspace" == "~"* ]]; then
    workspace="${workspace/#~/$HOME}"
  fi
fi

errors_file=$(mktemp)
items_file=$(mktemp)
trap 'rm -f "$errors_file" "$items_file"' EXIT

emit_item() {
  # emit_item <kind> <source> <label> <body> <ts> <ref>
  jq -cn \
    --arg kind "$1" \
    --arg source "$2" \
    --arg label "$3" \
    --arg body "$4" \
    --arg ts "$5" \
    --arg ref "$6" \
    '{kind:$kind, source:$source, label:$label, body:$body, ts:$ts, ref:$ref}' \
    >> "$items_file"
}

emit_error() {
  printf '%s\n' "$1" >> "$errors_file"
}

# ── Sessions (reuse ling-mem's collect_sessions.sh) ──
gather_sessions() {
  local target_date="$1"
  local collect="${MEM_SKILL_DIR}/scripts/collect_sessions.sh"
  if [ ! -x "$collect" ]; then
    return
  fi
  # NDJSON, one session per line.
  "$collect" "$target_date" 2>/dev/null | while read -r line; do
    [ -z "$line" ] && continue
    local source label user_turns bytes filepath
    source=$(echo "$line" | jq -r '.source // ""')
    label=$(echo "$line" | jq -r '.label // ""')
    user_turns=$(echo "$line" | jq -r '.user_turns // 0')
    bytes=$(echo "$line" | jq -r '.bytes // 0')
    filepath=$(echo "$line" | jq -r '.filepath // ""')
    # Skip greeting-only / empty sessions — < 2 user turns is noise.
    [ "${user_turns:-0}" -lt 2 ] && continue
    local kind="session-cc"
    [ "$source" = "Linggen" ] && kind="session-ling"
    local body="${user_turns} user turns · $((bytes / 1024)) KB"
    emit_item "$kind" "$source" "$label" "$body" "$target_date" "$filepath"
  done
}

# ── Git commits in workspace ──
# If workspace itself is a git repo, scan it. If it's a parent of multiple
# repos (the monorepo-of-repos pattern), scan each nested repo too. Skips
# vendor/node_modules/target/.linggen subtrees so a Cargo crate dependency
# graph doesn't drag in unrelated history.
gather_commits_one() {
  local repo="$1" since="$2"
  local repo_name
  repo_name=$(basename "$repo")
  # Subject-only — commit bodies are often empty or duplicate of subject for
  # daily-post drafting. One commit per line, tab-separated fields.
  git -C "$repo" log --since="$since" --no-merges \
    --pretty=format:'%H%x09%cI%x09%s' 2>>"$errors_file" \
    | while IFS=$'\t' read -r sha ts subject; do
        [ -z "${sha:-}" ] && continue
        emit_item "commit" "git:$repo_name" "${subject:-}" "" "$ts" "$sha"
      done
}

gather_commits() {
  local since="$1"
  [ -z "$workspace" ] && return
  [ ! -d "$workspace" ] && return
  if [ -d "$workspace/.git" ]; then
    gather_commits_one "$workspace" "$since"
    return
  fi
  # Workspace is a parent of repos — find nested .git dirs (one level deep
  # only, to keep this bounded).
  find "$workspace" -mindepth 2 -maxdepth 2 -type d -name .git 2>/dev/null \
    | while read -r gitdir; do
        local repo
        repo=$(dirname "$gitdir")
        gather_commits_one "$repo" "$since"
      done
}

# ── Recently changed files (non-git workspaces, or untracked files) ──
gather_files() {
  local hours="$1"
  [ -z "$workspace" ] && return
  [ ! -d "$workspace" ] && return
  # find -mmin works in minutes; convert hours to minutes.
  local mins=$((hours * 60))
  # Skip noisy dirs. Cap output so a node_modules misconfiguration doesn't
  # blow up the JSON.
  find "$workspace" \
    -type d \( -name node_modules -o -name target -o -name dist -o -name build -o -name .git -o -name .next -o -name __pycache__ -o -name .venv \) -prune \
    -o -type f -mmin -"$mins" \
    -not -name '*.lock' -not -name '*.log' \
    -print 2>/dev/null \
    | head -n "$FILE_CAP" \
    | while read -r path; do
        [ -z "$path" ] && continue
        local ts=""
        if [[ "$(uname)" == "Darwin" ]]; then
          ts=$(stat -f "%Sm" -t "%Y-%m-%dT%H:%M:%S" "$path" 2>/dev/null)
        else
          ts=$(date -r "$path" "+%Y-%m-%dT%H:%M:%S" 2>/dev/null)
        fi
        local rel="${path#$workspace/}"
        emit_item "file" "fs" "$rel" "" "$ts" "$path"
      done
}

count_items() {
  wc -l < "$items_file" | tr -d ' '
}

# ── Sweep windows: 24h → 7d → 30d, stop when we have enough ──

# Window 1: yesterday (UTC date). Sessions are date-keyed in ling-mem.
yesterday_date=""
if [[ "$(uname)" == "Darwin" ]]; then
  yesterday_date=$(date -v-1d +%Y-%m-%d)
else
  yesterday_date=$(date -d 'yesterday' +%Y-%m-%d)
fi
expanded="24h"

today_date=""
if [[ "$(uname)" == "Darwin" ]]; then
  today_date=$(date +%Y-%m-%d)
else
  today_date=$(date +%Y-%m-%d)
fi

# Scan BOTH yesterday and today. ling-mem's collect_sessions filters by
# mtime — a session worked on yesterday but reopened today shows up as
# "today" only. Without scanning today, we miss every in-progress session
# the user is still editing. Including today is harmless: today's sessions
# are usually adjacent to yesterday's work anyway.
gather_sessions "$yesterday_date"
gather_sessions "$today_date"
gather_commits "24 hours ago"
gather_files 24

# Expand if thin.
if [ "$(count_items)" -lt "$MIN_ITEMS" ]; then
  expanded="7d"
  # Commits across last 7 days (overrides earlier 24h scan — git-log uniques
  # by sha, but our emit doesn't dedup; trim duplicates below).
  > "$items_file"
  gather_commits "7 days ago"
  # Sessions across the 7-day window (includes today).
  for i in 0 1 2 3 4 5 6 7; do
    if [[ "$(uname)" == "Darwin" ]]; then
      d=$(date -v-"$i"d +%Y-%m-%d)
    else
      d=$(date -d "$i days ago" +%Y-%m-%d)
    fi
    gather_sessions "$d"
  done
  gather_files $((24 * 7))
fi

if [ "$(count_items)" -lt "$MIN_ITEMS" ]; then
  expanded="30d"
  > "$items_file"
  gather_commits "30 days ago"
  for i in $(seq 0 30); do
    if [[ "$(uname)" == "Darwin" ]]; then
      d=$(date -v-"$i"d +%Y-%m-%d)
    else
      d=$(date -d "$i days ago" +%Y-%m-%d)
    fi
    gather_sessions "$d"
  done
  gather_files $((24 * 30))
fi

# Trim to HARD_CAP, prefer most-recent (sort by ts desc, head).
trimmed=$(jq -s 'sort_by(.ts) | reverse | .[0:'"$HARD_CAP"']' "$items_file" 2>/dev/null || echo '[]')

# Emit final JSON
errors_json=$(jq -R -s 'split("\n") | map(select(. != ""))' "$errors_file")
since_iso=""
case "$expanded" in
  24h) since_iso="$yesterday_date" ;;
  7d)
    if [[ "$(uname)" == "Darwin" ]]; then since_iso=$(date -v-7d +%Y-%m-%d); else since_iso=$(date -d '7 days ago' +%Y-%m-%d); fi ;;
  30d)
    if [[ "$(uname)" == "Darwin" ]]; then since_iso=$(date -v-30d +%Y-%m-%d); else since_iso=$(date -d '30 days ago' +%Y-%m-%d); fi ;;
esac
until_iso=$(date +%Y-%m-%d)

jq -cn \
  --argjson items "$trimmed" \
  --arg since "$since_iso" \
  --arg until "$until_iso" \
  --arg expanded "$expanded" \
  --arg workspace "$workspace" \
  --argjson errors "$errors_json" \
  '{items:$items, window:{since:$since, until:$until, expanded_to:$expanded}, workspace:$workspace, errors:$errors}'
