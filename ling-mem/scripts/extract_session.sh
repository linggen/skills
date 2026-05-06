#!/usr/bin/env bash
#
# Privacy + intent (for human readers and static scanners):
# Reads ONE session JSONL file from the LOCAL filesystem and prints a
# flattened transcript to stdout. No network calls. No data leaves the
# machine. The agent reads stdout in-process to identify durable user
# preferences, which it writes back to the LOCAL ling-mem database.
#
# extract_session.sh — Print a flattened [role]: text transcript for one session.
#
# Strips tool_use and tool_result blocks, keeps user + assistant text only.
# Messages are capped at 2000 chars each. Output goes to stdout.
#
# Usage:  ./extract_session.sh <filepath> <source> [YYYY-MM-DD] [MAX_CHARS]
#   source:    "CC" (Claude Code) or "Linggen"
#   date:      filter messages to this date (default: today)
#   max_chars: total-output cap in bytes. If the transcript would exceed
#              this, the script truncates and appends a marker line so the
#              subagent knows it got a partial. Default 200000 (~50k tokens)
#              — enough room for the subagent's own system prompt + its JSON
#              output inside a 128k-context model. Set to 0 for unlimited.
#
# Requires: jq

set -uo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <filepath> <source> [YYYY-MM-DD] [MAX_CHARS]" >&2
  echo "  source: CC or Linggen" >&2
  exit 1
fi

FILEPATH="$1"
SOURCE="$2"
TARGET_DATE="${3:-$(date +%Y-%m-%d)}"
MAX_CHARS="${4:-200000}"

if [ ! -f "$FILEPATH" ]; then
  echo "Error: file not found: $FILEPATH" >&2
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required but not installed." >&2
  exit 1
fi

if [[ "$(uname)" == "Darwin" ]]; then
  DAY_START=$(date -j -f "%Y-%m-%d %H:%M:%S" "${TARGET_DATE} 00:00:00" "+%s" 2>/dev/null || echo "0")
else
  DAY_START=$(date -d "${TARGET_DATE} 00:00:00" "+%s" 2>/dev/null || echo "0")
fi
DAY_END=$((DAY_START + 86400))

# Strip injected noise that isn't user prose:
#   - <system-reminder>...</system-reminder>  — CC auto-memory / tool reminders
#   - <command-name>...</command-name>        — CC slash-command markers
#   - <command-message>...</command-message>  — CC slash-command args
#   - ``` fenced code blocks                  — mockups, file contents, ascii art
strip_noise() {
  perl -0777 -pe '
    s{<system-reminder>.*?</system-reminder>}{}gs;
    s{<command-(?:name|message|args)>.*?</command-(?:name|message|args)>}{}gs;
    s{```[\s\S]*?```}{}g;
    s{\n{3,}}{\n\n}g;
  '
}

# Cap total output by byte count. The subagent gets the head of the
# transcript plus a truncation marker so it knows there's more. Most
# durable facts surface in the first N messages anyway — keep-first is
# a safer heuristic than random sampling.
apply_max() {
  if [ "$MAX_CHARS" -le 0 ]; then
    cat
  else
    awk -v max="$MAX_CHARS" '
      BEGIN { total = 0 }
      {
        line_len = length($0) + 1   # +1 for the newline
        if (total + line_len <= max) {
          print
          total += line_len
        } else if (total == 0) {
          # Single line larger than max — emit it truncated so we always
          # produce something useful.
          print substr($0, 1, max - 40)
          print "[TRUNCATED: transcript exceeded MAX_CHARS=" max "]"
          exit
        } else {
          print "[TRUNCATED: transcript exceeded MAX_CHARS=" max "]"
          exit
        }
      }
    '
  fi
}

# Emit a one-line header so the subagent sees which project the session
# happened in. For CC sessions, every message carries `cwd`; we pick the
# most common one (users sometimes cd during a session). For Linggen
# sessions, the cwd field is per-record too. If no cwd is found, the
# header is omitted and the subagent treats the candidate's cwd as
# unknown (leaves it out of the JSON).
emit_cwd_header() {
  local session_cwd
  session_cwd=$(jq -r 'select(.cwd != null) | .cwd' "$FILEPATH" 2>/dev/null | sort | uniq -c | sort -rn | awk 'NR==1 { $1=""; sub(/^ +/,""); print }')
  if [ -n "$session_cwd" ]; then
    echo "[SESSION_CWD]: $session_cwd"
    echo ""
  fi
}

case "$SOURCE" in
  CC)
    emit_cwd_header
    jq -r --arg date "$TARGET_DATE" '
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
    ' "$FILEPATH" 2>/dev/null | strip_noise | apply_max
    ;;
  Linggen)
    emit_cwd_header
    jq -r --argjson start "$DAY_START" --argjson end "$DAY_END" '
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
    ' "$FILEPATH" 2>/dev/null | strip_noise | apply_max
    ;;
  *)
    echo "Error: unknown source '$SOURCE' (expected CC or Linggen)" >&2
    exit 1
    ;;
esac
