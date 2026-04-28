#!/usr/bin/env bash
set -euo pipefail
#
# install.sh — install the ling-mem skill into whichever host runtimes
# the user has on this machine.
#
# Detects:
#   ~/.linggen/  → install to ~/.linggen/skills/ling-mem/
#   ~/.claude/   → install to ~/.claude/skills/ling-mem/
#
# If both exist, install to both. If neither, default to ~/.linggen/.
# Override with `--host=linggen|claude|both` if you want explicit control.
#
# Source + releases: https://github.com/linggen/linggen-memory

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="linggen/linggen-memory"
VERSION="${LING_MEM_VERSION:-latest}"

# -------------------------------------------------------------------
# Parse --host flag (optional)
# -------------------------------------------------------------------

HOST_OVERRIDE=""
for arg in "$@"; do
  case "$arg" in
    --host=*) HOST_OVERRIDE="${arg#--host=}" ;;
    -h|--help)
      cat <<EOF
Usage: install.sh [--host=linggen|claude|both]

Without --host: installs to whichever of ~/.linggen and ~/.claude exist.
If neither exists, defaults to ~/.linggen.

  LING_MEM_VERSION=v0.2.0  pin a specific binary version (default: latest)
  LING_MEM_FORCE_DOWNLOAD=1  re-fetch the binary even if present
EOF
      exit 0
      ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

# -------------------------------------------------------------------
# Decide which host(s) to install to
# -------------------------------------------------------------------

INSTALL_LINGGEN=0
INSTALL_CLAUDE=0

case "$HOST_OVERRIDE" in
  linggen)         INSTALL_LINGGEN=1 ;;
  claude)          INSTALL_CLAUDE=1 ;;
  both)            INSTALL_LINGGEN=1; INSTALL_CLAUDE=1 ;;
  "")
    [ -d "$HOME/.linggen" ] && INSTALL_LINGGEN=1
    [ -d "$HOME/.claude"  ] && INSTALL_CLAUDE=1
    if [ "$INSTALL_LINGGEN" -eq 0 ] && [ "$INSTALL_CLAUDE" -eq 0 ]; then
      echo "No host detected (~/.linggen or ~/.claude). Defaulting to ~/.linggen."
      INSTALL_LINGGEN=1
    fi
    ;;
  *)
    echo "--host must be one of: linggen, claude, both (got: $HOST_OVERRIDE)" >&2
    exit 1
    ;;
esac

# -------------------------------------------------------------------
# Detect platform → release asset slug
# -------------------------------------------------------------------

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$OS-$ARCH" in
  darwin-arm64|darwin-aarch64) TARGET="macos-aarch64" ;;
  darwin-x86_64|darwin-amd64)  TARGET="macos-x86_64" ;;
  linux-x86_64|linux-amd64)    TARGET="linux-x86_64" ;;
  linux-aarch64|linux-arm64)   TARGET="linux-aarch64" ;;
  *)
    echo "Error: unsupported platform $OS-$ARCH" >&2
    echo "  Manual install: https://github.com/${REPO}/releases" >&2
    exit 1
    ;;
esac

# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------

# Download the ling-mem binary to <bin_dir>/ling-mem (if not already
# present, or if LING_MEM_FORCE_DOWNLOAD=1, or if a specific version is
# pinned).
download_binary() {
  local bin_dir="$1"
  local bin="$bin_dir/ling-mem"
  mkdir -p "$bin_dir"

  if [ -x "$bin" ] && [ "${LING_MEM_FORCE_DOWNLOAD:-}" != "1" ] && [ "$VERSION" = "latest" ]; then
    echo "  ling-mem already at $bin — skipping download"
    return
  fi

  local asset="ling-mem-${TARGET}.tar.gz"
  local url
  if [ "$VERSION" = "latest" ]; then
    url="https://github.com/${REPO}/releases/latest/download/${asset}"
  else
    url="https://github.com/${REPO}/releases/download/${VERSION}/${asset}"
  fi

  local tmp_tar
  tmp_tar="$(mktemp -t "ling-mem-XXXXXX.tar.gz")"
  trap 'rm -f "$tmp_tar"' RETURN

  echo "  Downloading ling-mem ${VERSION} (${TARGET})"
  if ! curl -fsSL --retry 3 --retry-delay 2 "$url" -o "$tmp_tar"; then
    echo "Error: download failed. See https://github.com/${REPO}/releases" >&2
    exit 1
  fi

  tar -xzf "$tmp_tar" -C "$bin_dir" ling-mem
  chmod +x "$bin"

  local built_ver
  built_ver="$("$bin" --version 2>/dev/null | awk '{print $2}' || true)"
  if [ "$VERSION" != "latest" ]; then
    local expected="${VERSION#v}"
    if [ "$built_ver" != "$expected" ]; then
      echo "  Warning: binary reports '$built_ver', expected '$expected'." >&2
    fi
  fi
  echo "  Installed: $bin (${built_ver:-unknown})"
}

# Copy SKILL.md + references + scripts (full set) into <skill_dir>.
# Linggen install gets everything; CC install gets the same set (the
# unified SKILL.md works in both — CC ignores Linggen-only frontmatter
# fields).
copy_skill_files() {
  local skill_dir="$1"
  mkdir -p "$skill_dir/scripts" "$skill_dir/references" "$skill_dir/assets" "$skill_dir/bin"

  install -m 0644 "$SOURCE_DIR/SKILL.md" "$skill_dir/SKILL.md"
  install -m 0644 "$SOURCE_DIR/index.html" "$skill_dir/index.html"

  # Reference files.
  for ref in routing-rules.md scan-flow.md dashboard.md extractor-prompt.md; do
    install -m 0644 "$SOURCE_DIR/references/$ref" "$skill_dir/references/$ref"
  done

  # Mission file (used by Linggen's mission scheduler; harmless in CC).
  install -m 0644 "$SOURCE_DIR/assets/mission.md" "$skill_dir/assets/mission.md"

  # Scripts: shells the agent shells out to + dashboard JS/CSS for Linggen.
  for f in collect.sh collect_sessions.sh extract_session.sh; do
    install -m 0755 "$SOURCE_DIR/scripts/$f" "$skill_dir/scripts/$f"
  done
  for f in api.js chat-bridge.js memory-app.js memory.css memory.html page-renderer.js style.css widget-renderers.js; do
    install -m 0644 "$SOURCE_DIR/scripts/$f" "$skill_dir/scripts/$f"
  done
}

# Seed the core memory directory. Engine inlines identity.md / style.md
# into every session's system prompt; touching empty files is enough.
seed_core_memory() {
  local memory_dir="$HOME/.linggen/memory"
  mkdir -p "$memory_dir"
  [ -f "$memory_dir/identity.md" ] || : > "$memory_dir/identity.md"
  [ -f "$memory_dir/style.md" ]    || : > "$memory_dir/style.md"
}

# Linggen-only: install the dream mission so the cron scheduler picks it
# up. Keep user customizations untouched on existing installs.
install_dream_mission() {
  local skill_dir="$1"
  local mission_dir="$HOME/.linggen/missions/dream"
  local mission_scripts="$mission_dir/scripts"
  mkdir -p "$mission_scripts"
  if [ ! -f "$mission_dir/mission.md" ]; then
    cp "$skill_dir/assets/mission.md" "$mission_dir/mission.md"
    echo "  Installed: $mission_dir/mission.md (nightly at 23:00)"
  fi
  cp "$skill_dir/scripts/collect.sh" "$mission_scripts/collect.sh"
  cp "$skill_dir/scripts/collect_sessions.sh" "$mission_scripts/collect_sessions.sh"
  chmod +x "$mission_scripts/collect.sh" "$mission_scripts/collect_sessions.sh"
}

# CC-only: append a guarded @-import block to ~/.claude/CLAUDE.md so the
# core memory files land in every CC session's system prompt.
configure_claude_md() {
  local claude_md="${CLAUDE_MD:-$HOME/.claude/CLAUDE.md}"
  local marker_start="<!-- ling-mem:core-start -->"
  local marker_end="<!-- ling-mem:core-end -->"

  local block="$marker_start
## Who I am

@~/.linggen/memory/identity.md

## How I work

@~/.linggen/memory/style.md

## Memory

Durable facts live in a RAG store. The \`ling-mem\` skill at \`~/.claude/skills/ling-mem/\` manages scans and dashboards; for ad-hoc retrieval, call \`ling-mem search \"<query>\" --format json | jq -c 'del(.vector)'\` (binary at \`~/.claude/skills/ling-mem/bin/ling-mem\`) **before** answering when the user's question could connect to past preferences / decisions / gotchas. Mention relevant hits inline — *\"From memory: you prefer X …\"*. The \`del(.vector)\` filter is mandatory — raw output includes 384-dim embeddings that blow up context.
$marker_end"

  mkdir -p "$(dirname "$claude_md")"
  touch "$claude_md"

  # Strip any existing block (under the new ling-mem markers OR the old
  # linggen-memory:core markers from previous installs) + trailing blanks,
  # then append the fresh block.
  local tmp_md
  tmp_md="$(mktemp -t "claude-md-XXXXXX")"
  awk -v s_new="$marker_start" -v e_new="$marker_end" \
      -v s_old="<!-- linggen-memory:core-start -->" \
      -v e_old="<!-- linggen-memory:core-end -->" '
    BEGIN            { skip = 0; blanks = 0 }
    $0 == s_new      { skip = 1; next }
    $0 == s_old      { skip = 1; next }
    $0 == e_new      { skip = 0; next }
    $0 == e_old      { skip = 0; next }
    skip             { next }
    /^[[:space:]]*$/ { blanks++; next }
                     { while (blanks--) print ""; blanks = 0; print }
  ' "$claude_md" > "$tmp_md"
  if [ -s "$tmp_md" ]; then
    printf '\n%s\n' "$block" >> "$tmp_md"
  else
    printf '%s\n' "$block" > "$tmp_md"
  fi
  mv "$tmp_md" "$claude_md"
  echo "  Updated: $claude_md (core @-imports + memory hint)"
}

# -------------------------------------------------------------------
# Install
# -------------------------------------------------------------------

if [ "$INSTALL_LINGGEN" -eq 1 ]; then
  echo "Installing to ~/.linggen/skills/ling-mem/"
  LINGGEN_SKILL_DIR="$HOME/.linggen/skills/ling-mem"
  copy_skill_files "$LINGGEN_SKILL_DIR"
  download_binary "$LINGGEN_SKILL_DIR/bin"
  seed_core_memory
  install_dream_mission "$LINGGEN_SKILL_DIR"

  # Clean up the legacy `memory` skill dir if present and shipped (untouched user content stays).
  if [ -d "$HOME/.linggen/skills/memory" ]; then
    echo "  Removing legacy ~/.linggen/skills/memory/"
    rm -rf "$HOME/.linggen/skills/memory"
  fi
fi

if [ "$INSTALL_CLAUDE" -eq 1 ]; then
  echo "Installing to ~/.claude/skills/ling-mem/"
  CLAUDE_SKILL_DIR="$HOME/.claude/skills/ling-mem"
  copy_skill_files "$CLAUDE_SKILL_DIR"
  download_binary "$CLAUDE_SKILL_DIR/bin"
  seed_core_memory
  configure_claude_md

  # Clean up the legacy `linggen-memory` skill dir if present.
  if [ -d "$HOME/.claude/skills/linggen-memory" ]; then
    echo "  Removing legacy ~/.claude/skills/linggen-memory/"
    rm -rf "$HOME/.claude/skills/linggen-memory"
  fi
fi

echo ""
echo "Done. To browse / edit rows: run 'ling-mem start' then open http://127.0.0.1:9888"
