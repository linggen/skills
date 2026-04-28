#!/usr/bin/env bash
# collect_sessions.sh — Scan Claude Code + Linggen session stores for a date.
#
# Emits NDJSON (one object per session) to stdout:
#   {"filepath":"...","source":"CC"|"Linggen","label":"...","date":"...",
#    "bytes":N,"user_turns":N}
#
# user_turns counts real user messages (skips tool_result-only "user" entries in
# CC). Callers can skip empty/greeting-only sessions before spawning subagents.
#
# No file writes, no extraction. Callers pair each filepath with
# extract_session.sh to pull the flattened conversation text.
#
# Usage: ./collect_sessions.sh [YYYY-MM-DD]    (default: today)
#
# Requires: jq

set -uo pipefail

TARGET_DATE="${1:-$(date +%Y-%m-%d)}"
HOME_DIR="${HOME:-$(eval echo ~)}"
CC_DIR="${HOME_DIR}/.claude/projects"
LING_DIR="${HOME_DIR}/.linggen/sessions"

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required but not installed." >&2
  exit 1
fi

count_user_turns_cc() {
  # CC: type=="user" with a text content block (tool_result entries don't count)
  jq -s '[.[] | select(.type == "user") | .message.content
         | if type == "array"
           then map(select(.type == "text" and (.text // "" | length > 0))) | length
           else (if . != null and . != "" then 1 else 0 end) end]
         | add // 0' "$1" 2>/dev/null || echo 0
}

count_user_turns_linggen() {
  # Linggen: lines where from_id == "user" (user-originated messages)
  jq -s '[.[] | select(.from_id == "user")] | length' "$1" 2>/dev/null || echo 0
}

file_bytes() {
  if [[ "$(uname)" == "Darwin" ]]; then
    stat -f "%z" "$1" 2>/dev/null || echo 0
  else
    stat -c "%s" "$1" 2>/dev/null || echo 0
  fi
}

emit_manifest() {
  # emit_manifest <filepath> <source> <label> <bytes> <user_turns>
  jq -cn --arg filepath "$1" \
         --arg source "$2" \
         --arg label "$3" \
         --arg date "$TARGET_DATE" \
         --argjson bytes "$4" \
         --argjson user_turns "$5" \
         '{filepath:$filepath, source:$source, label:$label, date:$date,
           bytes:$bytes, user_turns:$user_turns}'
}

# ── Claude Code sessions ──
if [ -d "$CC_DIR" ]; then
  for project_dir in "$CC_DIR"/*/; do
    [ -d "$project_dir" ] || continue
    for jsonl_file in "$project_dir"*.jsonl; do
      [ -f "$jsonl_file" ] || continue

      if [[ "$(uname)" == "Darwin" ]]; then
        file_date=$(stat -f "%Sm" -t "%Y-%m-%d" "$jsonl_file" 2>/dev/null || echo "")
      else
        file_date=$(date -r "$jsonl_file" +%Y-%m-%d 2>/dev/null || echo "")
      fi
      [[ "$file_date" == "$TARGET_DATE" ]] || continue

      project_name=$(basename "$project_dir")
      session_name=$(basename "$jsonl_file" .jsonl)
      label="${project_name}/${session_name}"
      bytes=$(file_bytes "$jsonl_file")
      user_turns=$(count_user_turns_cc "$jsonl_file")
      emit_manifest "$jsonl_file" "CC" "$label" "${bytes:-0}" "${user_turns:-0}"
    done
  done
fi

# ── Linggen sessions ──
if [ -d "$LING_DIR" ]; then
  for session_dir in "$LING_DIR"/*/; do
    [ -d "$session_dir" ] || continue
    jsonl_file="${session_dir}messages.jsonl"
    [ -f "$jsonl_file" ] || continue

    if [[ "$(uname)" == "Darwin" ]]; then
      file_date=$(stat -f "%Sm" -t "%Y-%m-%d" "$jsonl_file" 2>/dev/null || echo "")
    else
      file_date=$(date -r "$jsonl_file" +%Y-%m-%d 2>/dev/null || echo "")
    fi
    [[ "$file_date" == "$TARGET_DATE" ]] || continue

    session_name=$(basename "$session_dir")

    # Only ingest user sessions — skip mission/skill/unknown creators.
    # Mission sessions get promoted to "user" on takeover (see chat_api.rs),
    # so this still captures conversations the user joined.
    [ -f "${session_dir}session.yaml" ] || continue
    creator=$(grep -m1 '^creator:' "${session_dir}session.yaml" 2>/dev/null \
      | sed -E 's/^creator:[[:space:]]*//; s/[[:space:]]*#.*$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/')
    [ "$creator" = "user" ] || continue

    session_title=""
    if [ -f "${session_dir}session.yaml" ]; then
      session_title=$(grep '^title:' "${session_dir}session.yaml" 2>/dev/null | sed 's/^title: *//' | head -1)
    fi
    label="${session_title:-$session_name}"
    bytes=$(file_bytes "$jsonl_file")
    user_turns=$(count_user_turns_linggen "$jsonl_file")
    emit_manifest "$jsonl_file" "Linggen" "$label" "${bytes:-0}" "${user_turns:-0}"
  done
fi
