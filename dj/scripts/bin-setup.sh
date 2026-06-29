#!/usr/bin/env bash
# bin-setup.sh — ensure yt-dlp + ffmpeg are available for DJ, WITHOUT a
# system install. yt-dlp is fetched into ~/.linggen/bin (self-updating, never
# bundled — YouTube breaks it often). ffmpeg is preferred from the system (PATH
# or Homebrew) and only downloaded as a fallback.
#
# Emits a single JSON line on stdout with the resolved paths:
#   {"yt_dlp":"/Users/x/.linggen/bin/yt-dlp","ffmpeg":"/opt/homebrew/bin/ffmpeg","ok":true}
# The page reads this before its first download. Re-runnable; only fetches what
# is missing. Pass `update` to refresh yt-dlp (yt-dlp -U).
set -uo pipefail

BIN="$HOME/.linggen/bin"
mkdir -p "$BIN"
MODE="${1:-ensure}"

YTDLP="$BIN/yt-dlp"
YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos"

emit() { printf '{"yt_dlp":"%s","ffmpeg":"%s","ok":%s,"note":"%s"}\n' "$1" "$2" "$3" "${4:-}"; }

# ── yt-dlp: official standalone macOS binary into ~/.linggen/bin ──────────────
if [ ! -x "$YTDLP" ]; then
  if ! curl -fsSL "$YTDLP_URL" -o "$YTDLP.tmp"; then
    emit "" "" false "yt-dlp download failed"; exit 1
  fi
  mv "$YTDLP.tmp" "$YTDLP"
  chmod +x "$YTDLP"
  # Let Gatekeeper run a binary we downloaded ourselves under the notarized app.
  xattr -d com.apple.quarantine "$YTDLP" 2>/dev/null || true
  codesign --force -s - "$YTDLP" 2>/dev/null || true
elif [ "$MODE" = "update" ]; then
  "$YTDLP" -U >/dev/null 2>&1 || true
fi

# ── ffmpeg: prefer system / Homebrew; download only as a last resort ──────────
FFMPEG=""
if command -v ffmpeg >/dev/null 2>&1; then
  FFMPEG="$(command -v ffmpeg)"
elif [ -x "$BIN/ffmpeg" ]; then
  FFMPEG="$BIN/ffmpeg"
elif [ -x /opt/homebrew/bin/ffmpeg ]; then
  FFMPEG="/opt/homebrew/bin/ffmpeg"
elif [ -x /usr/local/bin/ffmpeg ]; then
  FFMPEG="/usr/local/bin/ffmpeg"
fi

if [ -z "$FFMPEG" ]; then
  # No system ffmpeg. We DON'T silently grab an unverified static build here —
  # surface a clear, honest instruction instead. (A pinned, checksummed arm64
  # static-build URL is the fast-follow; until then `brew install ffmpeg`.)
  emit "$YTDLP" "" false "ffmpeg not found — run: brew install ffmpeg"; exit 1
fi

emit "$YTDLP" "$FFMPEG" true ""
