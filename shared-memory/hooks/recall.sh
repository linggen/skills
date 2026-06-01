#!/usr/bin/env bash
# UserPromptSubmit hook installed by shared-memory. Surfaces relevant
# memories for each turn. Bails silently on any failure — never blocks
# the user.

set -u
[ "${LING_MEM_RECALL_DISABLE:-0}" = "1" ] && exit 0

command -v jq       >/dev/null 2>&1 || exit 0
command -v ling-mem >/dev/null 2>&1 || exit 0

input="$(cat)"
prompt="$(printf '%s' "$input" | jq -r '.prompt // empty' 2>/dev/null || true)"
cwd="$(printf '%s' "$input"   | jq -r '.cwd    // empty' 2>/dev/null || true)"

[ "${#prompt}" -lt 8 ] && exit 0

topk="${LING_MEM_RECALL_TOPK:-3}"
limit="${LING_MEM_RECALL_LIMIT:-8}"
to="${LING_MEM_RECALL_TIMEOUT:-3}"
min_score="${LING_MEM_RECALL_MIN_SCORE:-0.30}"

proj=""
if [ -n "$cwd" ] && [ "$cwd" != "$HOME" ]; then
  proj="$(basename "$cwd")"
fi

TIMEOUT_BIN=""
if   command -v timeout  >/dev/null 2>&1; then TIMEOUT_BIN="timeout"
elif command -v gtimeout >/dev/null 2>&1; then TIMEOUT_BIN="gtimeout"
fi

# Portable timeout. Stock macOS ships neither `timeout` nor `gtimeout`
# (those are GNU coreutils, opt-in via Homebrew). Without a fallback, a
# hung daemon — slow LanceDB scan, OOM, lock contention — would block
# the user's prompt indefinitely. The background+kill pattern works on
# any POSIX shell.
run_with_timeout() {
  local seconds="$1"; shift
  if [ -n "$TIMEOUT_BIN" ]; then
    "$TIMEOUT_BIN" "$seconds" "$@" 2>/dev/null
    return
  fi
  "$@" 2>/dev/null &
  local pid=$!
  (
    sleep "$seconds"
    kill -TERM "$pid" 2>/dev/null
    sleep 1
    kill -KILL "$pid" 2>/dev/null
  ) &
  local watcher=$!
  wait "$pid" 2>/dev/null
  kill -KILL "$watcher" 2>/dev/null
  wait "$watcher" 2>/dev/null
}

out="$(run_with_timeout "$to" ling-mem search "$prompt" \
    --limit "$limit" --min-score "$min_score" \
    --format json --quiet || true)"

[ -z "$out" ] && exit 0

hits="$(printf '%s' "$out" | jq -sr --arg proj "$proj" --argjson k "$topk" '
  map(select(
    ((.contexts // []) | map(select(startswith("project/"))))
    | (length == 0 or any(. == ("project/" + $proj)))
  ))
  | .[:$k]
  | .[]
  | "From memory (\(.type), \(.host // "unknown"), \((.created_at // "")[0:10]), score=\((.score // 0) * 100 | floor / 100), id=\(.id)): \(.content)"
' 2>/dev/null || true)"

[ -z "$hits" ] && exit 0

printf '%s\n' "$hits"
hit_count="$(printf '%s\n' "$hits" | grep -c .)"
if [ "$hit_count" -gt 1 ]; then
  echo "Note: When you see duplicates, dedup via 'ling-mem delete <id>'. When you see conflicts, ask the user which is correct, then 'ling-mem edit <id>'. Please keep memory in good shape."
fi
