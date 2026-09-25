#!/usr/bin/env bash
# latest.sh — emit the most recently imported (REDACTED) rollup JSON, or {} if
# nothing has been imported. Backs the LatestAnalysis tool so the agent fetches
# the current numbers on demand — import itself stays zero-AI. Coreutils only.
#
# `page_did`: what the page did since Ling last read (imports, undos — one JSON
# object per line in data/page-did.jsonl, written by cfo.js). Handed over once:
# the file is moved aside before it is read, so a note the page appends
# meanwhile lands in a fresh file for the next read.
set -uo pipefail
DIR="${SKILL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}/data"
# The reconciled (transfers-excluded, multi-account) report, refreshed by the
# page on every import and on open. {} until the first import.
report='{}'
[ -s "$DIR/report.json" ] && report=$(cat "$DIR/report.json")
did=''
if [ -s "$DIR/page-did.jsonl" ]; then
  taken="$DIR/page-did.$$.reading"
  mv -f "$DIR/page-did.jsonl" "$taken" 2>/dev/null && did=$(grep -v '^[[:space:]]*$' "$taken" | paste -sd, -) && rm -f "$taken"
fi
if [ -z "$did" ]; then printf '%s\n' "$report"; exit 0; fi
body="${report%\}}"
body="${body%"${body##*[![:space:]]}"}"
if [ "$body" = '{' ]; then printf '{"page_did":[%s]}\n' "$did"
else printf '%s,"page_did":[%s]}\n' "$body" "$did"; fi
