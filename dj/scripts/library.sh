#!/usr/bin/env bash
# library.sh — emit the DJ library index JSON (tracks + playlists), or an empty
# library if nothing has been downloaded yet. Backs the ListLibrary tool so the
# agent always curates against what the user actually owns. Coreutils only.
set -uo pipefail
DIR="${SKILL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
if [ -f "$DIR/library.json" ]; then
  cat "$DIR/library.json"
else
  echo '{"tracks":[],"playlists":[]}'
fi
