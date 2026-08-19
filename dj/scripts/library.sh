#!/usr/bin/env bash
# library.sh — emit the DJ library index JSON (tracks + playlists), or an empty
# library if nothing has been downloaded yet. Backs the ListLibrary tool so the
# agent always curates against what the user actually owns.
#
# `track_count` is stamped in here, derived from the data: the model must
# quote it instead of tallying rows itself — an agent once enumerated all
# 55 tracks correctly and still wrote "50 songs" in its confirmation.
set -uo pipefail
DIR="${SKILL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
if [ -f "$DIR/library.json" ]; then
  "${LINGGEN_PY:-python3}" -c '
import json, sys
d = json.load(open(sys.argv[1]))
d["track_count"] = len(d.get("tracks", []))
d["playlist_count"] = len(d.get("playlists", []))
print(json.dumps(d, ensure_ascii=False))
' "$DIR/library.json" 2>/dev/null || cat "$DIR/library.json"
else
  echo '{"tracks":[],"playlists":[],"track_count":0,"playlist_count":0}'
fi
