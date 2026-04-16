#!/usr/bin/env bash
# collect_sessions.sh — Gather today's conversations from Claude Code and Linggen.
# Outputs user/assistant messages as plain text, ready for model extraction.
#
# Usage: ./collect_sessions.sh [YYYY-MM-DD]
# Defaults to today if no date given.
#
# Requires: jq

set -euo pipefail

TARGET_DATE="${1:-$(date +%Y-%m-%d)}"
HOME_DIR="${HOME:-$(eval echo ~)}"
CC_DIR="${HOME_DIR}/.claude/projects"
LING_DIR="${HOME_DIR}/.linggen/sessions"

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required but not installed." >&2
  exit 1
fi

# Convert target date to epoch range for Linggen timestamp filtering
if [[ "$(uname)" == "Darwin" ]]; then
  DAY_START=$(date -j -f "%Y-%m-%d" "$TARGET_DATE" "+%s" 2>/dev/null || echo "0")
else
  DAY_START=$(date -d "$TARGET_DATE" "+%s" 2>/dev/null || echo "0")
fi
DAY_END=$((DAY_START + 86400))

found=0

# ---------------------------------------------------------------------------
# Claude Code sessions (~/.claude/projects/*/*.jsonl)
# ---------------------------------------------------------------------------

if [ -d "$CC_DIR" ]; then
  for project_dir in "$CC_DIR"/*/; do
    [ -d "$project_dir" ] || continue
    for jsonl_file in "$project_dir"*.jsonl; do
      [ -f "$jsonl_file" ] || continue

      # Skip files not modified on target date
      if [[ "$(uname)" == "Darwin" ]]; then
        file_date=$(stat -f "%Sm" -t "%Y-%m-%d" "$jsonl_file" 2>/dev/null || echo "")
      else
        file_date=$(date -r "$jsonl_file" +%Y-%m-%d 2>/dev/null || echo "")
      fi
      [[ "$file_date" == "$TARGET_DATE" ]] || continue

      project_name=$(basename "$project_dir")
      session_name=$(basename "$jsonl_file" .jsonl)

      # Extract user and assistant text messages from today.
      # CC format: .type = "user"|"assistant", .timestamp = ISO 8601,
      #   .message.content = string or array of {type:"text", text:"..."}
      output=$(jq -r --arg date "$TARGET_DATE" '
        select((.type == "user" or .type == "assistant") and ((.timestamp // "") | startswith($date)))
        | (.message.role // .type) as $role
        | (.message.content // "") as $content
        | if ($content | type) == "string" then
            $content
          elif ($content | type) == "array" then
            [.message.content[] | select(.type == "text") | .text] | join("\n")
          else
            ""
          end
        | if . == "" then empty
          else "[\($role)]: \(.[0:2000])"
          end
      ' "$jsonl_file" 2>/dev/null)

      if [ -n "$output" ]; then
        echo "========== Claude Code: ${project_name}/${session_name} =========="
        echo "$output"
        echo ""
        found=1
      fi
    done
  done
fi

# ---------------------------------------------------------------------------
# Linggen sessions (~/.linggen/sessions/*/messages.jsonl)
# ---------------------------------------------------------------------------

if [ -d "$LING_DIR" ]; then
  for session_dir in "$LING_DIR"/*/; do
    [ -d "$session_dir" ] || continue
    jsonl_file="${session_dir}messages.jsonl"
    [ -f "$jsonl_file" ] || continue

    # Skip files not modified on target date
    if [[ "$(uname)" == "Darwin" ]]; then
      file_date=$(stat -f "%Sm" -t "%Y-%m-%d" "$jsonl_file" 2>/dev/null || echo "")
    else
      file_date=$(date -r "$jsonl_file" +%Y-%m-%d 2>/dev/null || echo "")
    fi
    [[ "$file_date" == "$TARGET_DATE" ]] || continue

    session_name=$(basename "$session_dir")

    # Skip mission-created sessions to prevent self-ingestion
    # (the memory extraction mission's own sessions should not feed back into memory)
    if [ -f "${session_dir}session.yaml" ]; then
      creator=$(grep '^creator:' "${session_dir}session.yaml" 2>/dev/null | sed 's/^creator: *//' | head -1)
      [ "$creator" = "mission" ] && continue
    fi

    # Read session title from session.yaml if available
    session_title=""
    if [ -f "${session_dir}session.yaml" ]; then
      session_title=$(grep '^title:' "${session_dir}session.yaml" 2>/dev/null | sed 's/^title: *//' | head -1)
    fi
    label="${session_title:-$session_name}"

    # Extract user and agent messages from today.
    # Linggen format: .from_id = "user"|"ling"|"system", .timestamp = unix epoch,
    #   .content = string, .is_observation = bool
    # Skip system messages and observations (tool results, internal events).
    output=$(jq -r --argjson start "$DAY_START" --argjson end "$DAY_END" '
      select(
        (.from_id == "user" or .from_id == "ling")
        and (.is_observation == false or .is_observation == null)
        and (.timestamp >= $start and .timestamp < $end)
      )
      | (.from_id | if . == "ling" then "assistant" else . end) as $role
      | .content // ""
      | if . == "" then empty
        else "[\($role)]: \(.[0:2000])"
        end
    ' "$jsonl_file" 2>/dev/null)

    if [ -n "$output" ]; then
      echo "========== Linggen: ${label} =========="
      echo "$output"
      echo ""
      found=1
    fi
  done
fi

# ---------------------------------------------------------------------------

if [ "$found" -eq 0 ]; then
  echo "No sessions found for ${TARGET_DATE}."
fi
