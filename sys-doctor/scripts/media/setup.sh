#!/bin/bash
# One-time setup for the Media tab: a private venv with the USB + imaging deps.
# Self-contained: fetches uv + a pinned standalone CPython under ~/.linggen —
# no system Python, CLT, or brew needed. Idempotent — safe to re-run.
set -eu

DATA="$HOME/.linggen/skills/sys-doctor/data/media"
VENV="$DATA/venv"
BIN="$HOME/.linggen/bin"
UV="$BIN/uv"
export UV_PYTHON_INSTALL_DIR="$HOME/.linggen/tools/uv/python"
export UV_CACHE_DIR="$HOME/.linggen/tools/uv/cache"
export UV_PYTHON_PREFERENCE=only-managed
mkdir -p "$DATA" "$BIN"

note() {
  printf '{"op":"setup","phase":"%s","status":"%s","note":"%s","ts":%s}\n' \
    "$1" "${3:-running}" "${2:-}" "$(date +%s)" > "$DATA/progress.json"
}

if [ -x "$VENV/bin/python" ] && "$VENV/bin/python" -c 'import pymobiledevice3' 2>/dev/null; then
  note done "ready" done
  exit 0
fi

if [ ! -x "$UV" ]; then
  note uv "fetching uv (package manager, one binary)"
  case "$(uname -m)" in
    arm64) arch=aarch64 ;;
    *)     arch=x86_64 ;;
  esac
  tmp="$(mktemp -d)"
  curl -fsSL "https://github.com/astral-sh/uv/releases/latest/download/uv-${arch}-apple-darwin.tar.gz" \
    | tar -xz -C "$tmp"
  mv "$tmp"/*/uv "$UV"
  rm -rf "$tmp"
  xattr -d com.apple.quarantine "$UV" 2>/dev/null || true
  chmod +x "$UV"
fi

note venv "creating virtualenv (downloads Python 3.12 once)"
"$UV" venv --quiet --python 3.12 "$VENV"

note pip "installing pymobiledevice3 + imaging libraries (a few minutes)"
"$UV" pip install --quiet --python "$VENV/bin/python" 'pymobiledevice3==9.*' Pillow pillow-heif numpy

if command -v ffprobe >/dev/null; then
  note done "ready (ffprobe found — video durations enabled)" done
else
  note done "ready (no ffprobe — videos ranked by size only; brew install ffmpeg to enable)" done
fi
