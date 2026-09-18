#!/bin/bash
# Thumbnails for wirelessly synced photos, with nothing installed.
#
# Wireless items arrive through the daemon, not the USB pipeline, so they are
# here whether or not the Media tools are — but the tools' Pillow is what drew
# their thumbnails, which left the review screen blank without them. macOS
# already ships both halves: sips reads HEIC, qlmanage draws a frame for video.
# A staged file is named after its content hash, which is exactly how the page
# names a thumbnail, so nothing needs the manifest to line the two up.
#
# Usage: thumbs.sh [limit]  →  {"made":N,"failed":N,"remaining":N}
# The page calls this in a loop: one batch stays well inside the daemon's
# 30 s ceiling, and `remaining` says whether to come back.
set -u

DATA="$HOME/.linggen/skills/apple-shifu/data/media"
SRC="$DATA/staging/wireless"
OUT="$DATA/thumbs"
TMP="$OUT/.tmp"
limit="${1:-16}"

[ -d "$SRC" ] || { echo '{"made":0,"failed":0,"remaining":0}'; exit 0; }
mkdir -p "$OUT" "$TMP" || { echo '{"made":0,"failed":0,"remaining":0}'; exit 0; }

made=0
failed=0
remaining=0

for f in "$SRC"/*; do
  [ -f "$f" ] || continue
  b="$(basename "$f")"
  key="${b%%-*}"
  # Anything not named after its hash isn't ours to thumbnail.
  [ "${#key}" -eq 12 ] || continue
  [ -s "$OUT/$key.jpg" ] && continue
  # A format neither tool can read is remembered, so a loop can finish.
  [ -f "$OUT/$key.fail" ] && continue
  if [ "$made" -ge "$limit" ]; then
    remaining=$((remaining + 1))
    continue
  fi
  case "$b" in
    *.MOV|*.mov|*.MP4|*.mp4|*.M4V|*.m4v|*.AVI|*.avi)
      rm -f "$TMP/$b.png"
      # macOS has no timeout(1); a wedged QuickLook must not hold the batch.
      perl -e 'alarm 20; exec @ARGV' qlmanage -t -s 480 -o "$TMP" "$f" >/dev/null 2>&1
      if [ -s "$TMP/$b.png" ]; then
        sips -s format jpeg "$TMP/$b.png" --out "$OUT/$key.jpg" >/dev/null 2>&1
      fi
      rm -f "$TMP/$b.png"
      ;;
    *)
      sips -s format jpeg -Z 480 "$f" --out "$OUT/$key.jpg" >/dev/null 2>&1
      ;;
  esac
  if [ -s "$OUT/$key.jpg" ]; then
    made=$((made + 1))
  else
    rm -f "$OUT/$key.jpg"
    : > "$OUT/$key.fail"
    failed=$((failed + 1))
  fi
done

printf '{"made":%d,"failed":%d,"remaining":%d}\n' "$made" "$failed" "$remaining"
