#!/usr/bin/env bash
# extract_session.sh — Print a flattened [role]: text transcript for one session.
#
# Strips tool_use and tool_result blocks, keeps user + assistant text only.
# Messages are capped at 2000 chars each. Output goes to stdout.
#
# Usage:  ./extract_session.sh <filepath> <source> [YYYY-MM-DD]
#   source: "CC" (Claude Code) or "Linggen"
#   date:   filter messages to this date (default: today)
#
# Requires: jq

set -uo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <filepath> <source> [YYYY-MM-DD]" >&2
  echo "  source: CC or Linggen" >&2
  exit 1
fi

FILEPATH="$1"
SOURCE="$2"
TARGET_DATE="${3:-$(date +%Y-%m-%d)}"

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

case "$SOURCE" in
  CC)
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
    ' "$FILEPATH" 2>/dev/null | strip_noise
    ;;
  Linggen)
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
    ' "$FILEPATH" 2>/dev/null | strip_noise
    ;;
  *)
    echo "Error: unknown source '$SOURCE' (expected CC or Linggen)" >&2
    exit 1
    ;;
esac
