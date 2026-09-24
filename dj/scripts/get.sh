#!/usr/bin/env bash
# get.sh — backs the GetTracks tool: download songs into the library, now.
#
# Takes a JSON array of {artist, title, year?, version?, query_hints?} as $1 (or
# on stdin) and `for_phone` as $2. The work is scripts/fetch.py `batch` — the
# same naming, source picker, yt-dlp command and lyrics chooser the page's
# queue worker runs, so a song fetched by the agent and one fetched by a button
# are the same file. Each song lands as a library row with its lyrics; with
# for_phone the phone view gains what landed and the phone is told.
#
# Emits one JSON line: {"got":N,"failed":M,"files":[…],"errors":[…]}
set -uo pipefail

DIR="${SKILL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
REQ="${1:-}"
case "$REQ" in "{{"*"}}"|"") REQ="$(cat)" ;; esac   # placeholder or stdin
FOR_PHONE="${2:-}"
case "$FOR_PHONE" in "{{"*"}}") FOR_PHONE="" ;; esac

DJ_DIR="${DJ_DIR:-$DIR}" exec "${LINGGEN_PY:-python3}" "$DIR/scripts/fetch.py" batch "$REQ" "$FOR_PHONE"
