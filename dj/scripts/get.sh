#!/usr/bin/env bash
# get.sh — backs QueueTracks, the user's Get from a door with no page (the
# phone's confirm card). Never the model's: DJ proposes, the user's tap fetches.
#
# Takes a JSON array of {artist, title, year?, version?, query_hints?, force?}
# as $1 (or on stdin) and `for_phone` as $2. scripts/fetch.py `queue` skips the
# songs the library already holds, queues the rest on the Mac's download
# worker — the same queue the page's Get fills — and starts it. Nothing
# downloads in this call; with for_phone each song goes to the phone as it
# lands.
#
# Emits one JSON line: {"queued":N,"songs":[…],"errors":[…],"skipped"?:[…]}
set -uo pipefail

DIR="${SKILL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
REQ="${1:-}"
case "$REQ" in "{{"*"}}"|"") REQ="$(cat)" ;; esac   # placeholder or stdin
FOR_PHONE="${2:-}"
case "$FOR_PHONE" in "{{"*"}}") FOR_PHONE="" ;; esac

DJ_DIR="${DJ_DIR:-$DIR}" exec "${LINGGEN_PY:-python3}" "$DIR/scripts/fetch.py" queue "$REQ" "$FOR_PHONE"
