#!/usr/bin/env bash
# rename.sh — backs the RenameTrack tool: a song takes its real name. Takes a
# JSON { file, title, artist? } as $1 (or on stdin). The work is scripts/fetch.py
# `rename`: actions.mjs moves the file, sidecars, lists and phone place; the
# mp3's tags follow; the lyrics are looked up again under the new name.
set -uo pipefail
DIR="${SKILL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
REQ="${1:-}"
case "$REQ" in "{{"*"}}"|"") REQ="$(cat)" ;; esac
DJ_DIR="${DJ_DIR:-$DIR}" exec "${LINGGEN_PY:-python3}" "$DIR/scripts/fetch.py" rename "$REQ"
