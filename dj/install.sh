#!/usr/bin/env bash
# install.sh — one-time DJ setup. Idempotent; runs with $SKILL_DIR set on every
# install path (ling init, WebUI Install, ling skills install, first startup).
# Binaries (yt-dlp/ffmpeg) are NOT fetched here — that's lazy on the first
# download (scripts/bin-setup.sh, called by the page) so install never blocks
# on a network pull.
set -euo pipefail

DIR="${SKILL_DIR:-$HOME/.linggen/skills/dj}"

# Seed the user's config from the shipped example — never overwrite an existing
# one (preserves their library path, bitrate, and saved phone-sync target).
if [ ! -f "$DIR/config.json" ] && [ -f "$DIR/config.example.json" ]; then
  cp "$DIR/config.example.json" "$DIR/config.json"
fi

# The library index the page maintains and the ListLibrary tool reads.
if [ ! -f "$DIR/library.json" ]; then
  printf '{"tracks":[],"playlists":[]}\n' > "$DIR/library.json"
fi

# Default music output dir (config may point elsewhere; this is the fallback).
mkdir -p "$HOME/Music/DJ"

echo "dj: ready ($DIR)"
