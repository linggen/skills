#!/usr/bin/env bash
# karaoke.sh — backs the GetKaraoke tool: fetch karaoke renders of songs
# already in the library.
#
# Takes a JSON array of {artist, title, kind?} as $1 (or on stdin); kind is
# "audio" (instrumental mp3, the default) or "video" (lyrics-on-screen mp4).
# scripts/fetch.py `karaoke-batch` names each "<song file stem> (Karaoke)" in
# <library>/.karaoke — the pairing the engine serves as a companion — then
# reconciles, which lights 🎤 on the song.
#
# Emits one JSON line: {"got":N,"failed":M,"files":[…],"errors":[…]}
set -uo pipefail

DIR="${SKILL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
REQ="${1:-}"
case "$REQ" in "{{"*"}}"|"") REQ="$(cat)" ;; esac   # placeholder or stdin

DJ_DIR="${DJ_DIR:-$DIR}" exec "${LINGGEN_PY:-python3}" "$DIR/scripts/fetch.py" karaoke-batch "$REQ"
