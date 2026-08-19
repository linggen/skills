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
# The engine's managed runtime carries yt-dlp as a thin script — no ~10s
# PyInstaller unpack-and-validate on every exec, engine-managed updates.
RUNTIME_YTDLP="$HOME/.linggen/runtime/envs/tools/bin/yt-dlp"

emit() { printf '{"yt_dlp":"%s","ffmpeg":"%s","ok":%s,"note":"%s"}\n' "$1" "$2" "$3" "${4:-}"; }

# ── yt-dlp: managed runtime first; standalone binary as the fallback ──────────
if [ -x "$RUNTIME_YTDLP" ]; then
  YTDLP="$RUNTIME_YTDLP"   # updates are the engine prewarm's job, skip -U
elif [ ! -x "$YTDLP" ]; then
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
  # No system ffmpeg → fetch a PINNED, checksum-verified static build into
  # ~/.linggen/bin so a fresh user needs nothing pre-installed (no Homebrew).
  # Native per-arch builds from ffmpeg.martin-riedl.de, version-pinned; the
  # SHA-256 is verified before use, so we never run an unexpected binary.
  case "$(uname -m)" in
    arm64)
      FF_URL="https://ffmpeg.martin-riedl.de/download/macos/arm64/1778761665_8.1.1/ffmpeg.zip"
      FF_SHA="a05b1a47bb3ac89a95a55eec713f8bbb347051bb07015f3b7d08fb62ed81a21e" ;;
    x86_64)
      FF_URL="https://ffmpeg.martin-riedl.de/download/macos/amd64/1778768838_8.1.1/ffmpeg.zip"
      FF_SHA="8cb711bfa6f66033112d708dc275220419d0fdb49c5b752f8db25f11a92d321f" ;;
    *)
      emit "$YTDLP" "" false "unsupported arch $(uname -m) — run: brew install ffmpeg"; exit 1 ;;
  esac

  ZIP="$BIN/ffmpeg.zip"
  if ! curl -fsSL "$FF_URL" -o "$ZIP"; then
    rm -f "$ZIP"; emit "$YTDLP" "" false "ffmpeg download failed — or run: brew install ffmpeg"; exit 1
  fi
  GOT="$(shasum -a 256 "$ZIP" | cut -d' ' -f1)"
  if [ "$GOT" != "$FF_SHA" ]; then
    rm -f "$ZIP"; emit "$YTDLP" "" false "ffmpeg checksum mismatch — refusing (got ${GOT:-none})"; exit 1
  fi
  if ! unzip -oq "$ZIP" ffmpeg -d "$BIN"; then
    rm -f "$ZIP"; emit "$YTDLP" "" false "ffmpeg unzip failed"; exit 1
  fi
  rm -f "$ZIP"
  chmod +x "$BIN/ffmpeg"
  # Let Gatekeeper run a binary we downloaded + verified ourselves.
  xattr -d com.apple.quarantine "$BIN/ffmpeg" 2>/dev/null || true
  codesign --force -s - "$BIN/ffmpeg" 2>/dev/null || true
  FFMPEG="$BIN/ffmpeg"
fi

emit "$YTDLP" "$FFMPEG" true ""
