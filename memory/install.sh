#!/usr/bin/env bash
set -euo pipefail
#
# install.sh — download the ling-mem binary for this platform into
# $SKILL_DIR/bin/ling-mem. Linggen calls this once when the memory skill
# is installed, then the Memory_* tool family shells out to the binary.
#
# Source + releases: https://github.com/linggen/linggen-memory

SKILL_DIR="${SKILL_DIR:-$(cd "$(dirname "$0")" && pwd)}"
REPO="linggen/linggen-memory"

# Version pin — bump in lockstep with a new linggen-memory release.
VERSION="${LING_MEM_VERSION:-v0.1.0}"

# Detect platform → release asset slug.
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$OS-$ARCH" in
  darwin-arm64|darwin-aarch64) TARGET="macos-aarch64" ;;
  darwin-x86_64|darwin-amd64)  TARGET="macos-x86_64" ;;
  linux-x86_64|linux-amd64)    TARGET="linux-x86_64" ;;
  linux-aarch64|linux-arm64)   TARGET="linux-aarch64" ;;
  *)
    echo "Error: unsupported platform $OS-$ARCH" >&2
    echo "  Manual install: https://github.com/${REPO}/releases/${VERSION}" >&2
    echo "  (or build from source: cargo install --git https://github.com/${REPO} --tag ${VERSION})" >&2
    exit 1
    ;;
esac

ASSET="ling-mem-${TARGET}.tar.gz"
URL="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET}"
BIN_DIR="$SKILL_DIR/bin"
mkdir -p "$BIN_DIR"

TMP_TAR="$(mktemp -t "ling-mem-XXXXXX.tar.gz")"
trap 'rm -f "$TMP_TAR"' EXIT

echo "Downloading ling-mem ${VERSION} (${TARGET})"
echo "  from $URL"
if ! curl -fsSL --retry 3 --retry-delay 2 "$URL" -o "$TMP_TAR"; then
  echo "Error: download failed." >&2
  echo "  Check releases: https://github.com/${REPO}/releases" >&2
  exit 1
fi

# Release tarballs contain: ling-mem + README.md + LICENSE. Extract only the binary.
echo "Extracting ling-mem → $BIN_DIR/"
tar -xzf "$TMP_TAR" -C "$BIN_DIR" ling-mem
chmod +x "$BIN_DIR/ling-mem"

# Verify it runs and reports the version we asked for.
BUILT_VER="$("$BIN_DIR/ling-mem" --version 2>/dev/null | awk '{print $2}' || true)"
EXPECTED="${VERSION#v}"
if [ "$BUILT_VER" != "$EXPECTED" ]; then
  echo "Warning: binary reports version '$BUILT_VER', expected '$EXPECTED'." >&2
fi

echo "Installed: $BIN_DIR/ling-mem (${BUILT_VER:-unknown})"

# Seed the core memory directory. The engine inlines identity.md / style.md
# into every session's system prompt; touching empty files is enough for the
# first run to succeed.
MEMORY_DIR="$HOME/.linggen/memory"
mkdir -p "$MEMORY_DIR"
[ -f "$MEMORY_DIR/identity.md" ] || : > "$MEMORY_DIR/identity.md"
[ -f "$MEMORY_DIR/style.md" ]    || : > "$MEMORY_DIR/style.md"

# Install the nightly extraction mission ("dream"). Skips if the user has
# already customized one — the cron scheduler picks up the file on next tick.
MISSION_DIR="$HOME/.linggen/missions/dream"
MISSION_SCRIPTS="$MISSION_DIR/scripts"
mkdir -p "$MISSION_SCRIPTS"
if [ ! -f "$MISSION_DIR/mission.md" ]; then
  cp "$SKILL_DIR/assets/mission.md" "$MISSION_DIR/mission.md"
  echo "Installed: $MISSION_DIR/mission.md (nightly at 23:00)"
fi
# Copy scripts the mission depends on into its own dir so the entry:
# "scripts/collect.sh" path in mission.md resolves correctly. Copy
# unconditionally so bug fixes in the skill propagate to existing installs.
cp "$SKILL_DIR/scripts/collect.sh" "$MISSION_SCRIPTS/collect.sh"
cp "$SKILL_DIR/scripts/collect_sessions.sh" "$MISSION_SCRIPTS/collect_sessions.sh"
chmod +x "$MISSION_SCRIPTS/collect.sh" "$MISSION_SCRIPTS/collect_sessions.sh"

# Clean up the legacy mission dir from the pre-redesign install (kept its
# config under ~/.linggen/missions/memory/). If the user never edited it,
# remove; otherwise leave alone.
LEGACY_DIR="$HOME/.linggen/missions/memory"
if [ -d "$LEGACY_DIR" ] && [ -f "$LEGACY_DIR/mission.md" ]; then
  # Only remove if it looks like the shipped template (contains "/memory" body).
  if grep -q "^/memory$" "$LEGACY_DIR/mission.md" 2>/dev/null; then
    rm -rf "$LEGACY_DIR"
    echo "Removed legacy mission dir: $LEGACY_DIR"
  fi
fi
