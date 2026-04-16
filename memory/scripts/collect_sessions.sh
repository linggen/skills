#!/usr/bin/env bash
# collect_sessions.sh — Scan Claude Code + Linggen session stores for a date.
#
# Emits NDJSON (one object per session) to stdout:
#   {"filepath":"...","source":"CC"|"Linggen","label":"...","date":"YYYY-MM-DD"}
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

emit_manifest() {
  # emit_manifest <filepath> <source> <label>
  jq -cn --arg filepath "$1" \
         --arg source "$2" \
         --arg label "$3" \
         --arg date "$TARGET_DATE" \
         '{filepath:$filepath, source:$source, label:$label, date:$date}'
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
      emit_manifest "$jsonl_file" "CC" "$label"
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

    # Skip mission-created sessions to prevent self-ingestion
    if [ -f "${session_dir}session.yaml" ]; then
      creator=$(grep '^creator:' "${session_dir}session.yaml" 2>/dev/null | sed 's/^creator: *//' | head -1)
      [ "$creator" = "mission" ] && continue
    fi

    session_title=""
    if [ -f "${session_dir}session.yaml" ]; then
      session_title=$(grep '^title:' "${session_dir}session.yaml" 2>/dev/null | sed 's/^title: *//' | head -1)
    fi
    label="${session_title:-$session_name}"
    emit_manifest "$jsonl_file" "Linggen" "$label"
  done
fi
