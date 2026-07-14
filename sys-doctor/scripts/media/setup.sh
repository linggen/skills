#!/bin/bash
# One-time setup for the Media tab: a private venv with the USB + imaging deps.
# Idempotent — safe to re-run. Progress lands in data/media/progress.json.
set -eu

DATA="$HOME/.linggen/skills/sys-doctor/data/media"
VENV="$DATA/venv"
mkdir -p "$DATA"

note() {
  printf '{"op":"setup","phase":"%s","status":"%s","note":"%s","ts":%s}\n' \
    "$1" "${3:-running}" "${2:-}" "$(date +%s)" > "$DATA/progress.json"
}

if ! command -v python3 >/dev/null; then
  note deps "python3 not found — install Xcode Command Line Tools" error
  exit 1
fi

note venv "creating virtualenv"
python3 -m venv "$VENV"

note pip "installing pymobiledevice3 + imaging libraries (a few minutes)"
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet pymobiledevice3 Pillow pillow-heif numpy

if command -v ffprobe >/dev/null; then
  note done "ready (ffprobe found — video durations enabled)" done
else
  note done "ready (no ffprobe — videos ranked by size only; brew install ffmpeg to enable)" done
fi
