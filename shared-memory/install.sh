#!/usr/bin/env bash
set -euo pipefail
#
# install.sh — place the shared-memory skill bundle. Nothing else.
#
# Layout — ONE canonical bundle, and that is the whole story:
#
#   ~/.linggen/skills/shared-memory/   ← CANONICAL. All references/,
#                                        scripts/, hooks/, plus SKILL.md.
#
# This script installs SKILL FILES ONLY. It writes nothing outside
# ~/.linggen, installs no binary, and wires no host. Both of those were
# removed for the same reason: something else already owns them, and a
# second owner does not add redundancy, it adds a conflict.
#
#   ~/.local/bin/ling-mem   ← the ONE binary, owned by install-bin.sh
#                             (linggen-memory/plugins/*/scripts/install-bin.sh),
#                             driven by the plugin's autostart.sh hook and
#                             the SKILL.md first-use gate.
#
# Why the binary is not ours to write: it is a singleton shared by every
# host and channel, so exactly one installer may place it. install-bin.sh
# is that installer — it resolves a semver RANGE (`^1`) to the highest
# matching release, verifies SHA-256, and REFUSES TO DOWNGRADE. This
# script used to install the binary itself, to /usr/local/bin, pinned at
# v1.0.0, with a skip-guard that only fired when the version was
# "latest" — so on every fresh Linggen it shadowed the correct binary
# with an ancient one that first-match-wins resolvers then preferred.
#
# Why no host wiring: each host's own managed channel owns its wiring.
# The Claude Code / Codex plugin registers its UserPromptSubmit recall
# hook from its own hooks.json; OpenClaw ships its own plugin. This
# script used to ALSO patch ~/.claude/CLAUDE.md and settings.json,
# rewrite ~/.codex/config.toml and hooks.json, append to OpenClaw's
# USER.md, and drop SKILL.md stubs into all three hosts' skills dirs.
# Its settings.json entry could not replace the plugin's hook (that one
# lives in the plugin, not in settings.json) — it only added a SECOND
# one, so recall was injected twice per turn. The stubs collided too:
# ~/.claude/skills/ is Claude Code's native personal-skills folder, so a
# stub there loads the skill a second time, and clashes with the symlink
# `npx skills add` puts at the same path. linggen.dev retired its
# one-shot multi-host installer for exactly these collisions; this is
# the same lane, and it is now closed here too.
#
# Why this shape:
# - Single source of truth — edit content once at ~/.linggen/skills/
#   shared-memory/ and every host reading it sees the change.
# - SKILL.md uses absolute paths (~/.linggen/skills/shared-memory/...)
#   for cross-tree reads, so a host that discovers the skill by another
#   route still finds references/ and scripts/.
#
# Supply-chain posture: no downloads, no remote code execution, no
# writes outside ~/.linggen — this script only copies files already on
# disk. No data leaves the machine. Source:
# https://github.com/linggen/linggen-memory
# https://github.com/linggen/skills

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd 2>/dev/null)" || SOURCE_DIR=""

# The one binary, for the report at the end. This script never writes
# it — install-bin.sh owns it.
BIN_DIR="$HOME/.local/bin"

# Canonical layout — one bundle, on disk under ~/.linggen.
CANONICAL_DIR="$HOME/.linggen/skills/shared-memory"

# Self-bootstrap: when invoked via `curl ... | bash`, $0 is bash itself
# and $SOURCE_DIR ends up pointing at the user's cwd — there is no local
# clone with SKILL.md, scripts/, references/, etc. Detect this and fetch
# the canonical skill tree from GitHub into a temp dir, then re-target
# SOURCE_DIR.
if [ -z "$SOURCE_DIR" ] || [ ! -f "$SOURCE_DIR/SKILL.md" ]; then
  BOOTSTRAP_REPO="${LING_MEM_SKILLS_REPO:-linggen/skills}"
  # Pinned to a per-skill scoped tag so a `curl | bash` one-liner
  # fetches a known revision, not whatever main currently points at.
  # Users can override with LING_MEM_REPO_REF=main for HEAD.
  BOOTSTRAP_REF="${LING_MEM_REPO_REF:-shared-memory-v0.7.2}"
  BOOTSTRAP_URL="https://github.com/${BOOTSTRAP_REPO}/archive/${BOOTSTRAP_REF}.tar.gz"
  BOOTSTRAP_TMP="$(mktemp -d -t shared-memory-bootstrap-XXXXXX)"
  BOOTSTRAP_TAR="$BOOTSTRAP_TMP/skills.tar.gz"
  trap 'rm -rf "$BOOTSTRAP_TMP"' EXIT

  echo "Fetching shared-memory skill from ${BOOTSTRAP_REPO}@${BOOTSTRAP_REF}..."
  if ! curl -fsSL --retry 3 --retry-delay 2 "$BOOTSTRAP_URL" -o "$BOOTSTRAP_TAR"; then
    echo "Error: failed to download $BOOTSTRAP_URL" >&2
    exit 1
  fi

  echo "Extracting skill tree..."
  if ! tar -xzf "$BOOTSTRAP_TAR" -C "$BOOTSTRAP_TMP"; then
    echo "Error: failed to extract $BOOTSTRAP_TAR" >&2
    exit 1
  fi
  rm -f "$BOOTSTRAP_TAR"

  SOURCE_DIR="$(find "$BOOTSTRAP_TMP" -maxdepth 3 -type d -name shared-memory | head -n1)"
  if [ -z "$SOURCE_DIR" ] || [ ! -f "$SOURCE_DIR/SKILL.md" ]; then
    echo "Error: shared-memory/SKILL.md not found in tarball" >&2
    exit 1
  fi
fi

# -------------------------------------------------------------------
# Args
# -------------------------------------------------------------------

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      cat <<EOF
Usage: install.sh

Installs the shared-memory skill, one canonical copy at
~/.linggen/skills/shared-memory/. Each detected host (~/.claude/,
~/.codex/, ~/.openclaw/) gets a thin SKILL.md stub that points back
to the canonical bundle.

Skill files only — nothing is written outside ~/.linggen.

The \`ling-mem\` binary is NOT installed here: it is a singleton at
~/.local/bin/ling-mem, placed by install-bin.sh via the plugin's
autostart hook or the SKILL.md first-use gate (semver range \`^1\`,
SHA-256 verified, never downgraded).

Host wiring is NOT done here either: install the memory plugin from
your agent's own marketplace and it registers its own recall hook.

  LING_MEM_REPO_REF=<ref>    skills repo ref for curl|bash bootstrap
                             (default: shared-memory-v0.7.2)
EOF
      exit 0
      ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

# -------------------------------------------------------------------
# Canonical bundle — every file lives once at ~/.linggen/skills/shared-memory/
# -------------------------------------------------------------------

install_canonical_bundle() {
  echo "Installing canonical bundle at $CANONICAL_DIR/"

  if [ "$SOURCE_DIR" = "$CANONICAL_DIR" ]; then
    echo "  Files already in place — skipping copy"
    return
  fi

  mkdir -p "$CANONICAL_DIR/scripts" \
           "$CANONICAL_DIR/references" \
           "$CANONICAL_DIR/hooks"

  install -m 0644 "$SOURCE_DIR/SKILL.md"  "$CANONICAL_DIR/SKILL.md"
  install -m 0644 "$SOURCE_DIR/index.html" "$CANONICAL_DIR/index.html"
  install -m 0644 "$SOURCE_DIR/LICENSE"    "$CANONICAL_DIR/LICENSE"

  for ref in routing-rules.md dream-flow.md dashboard.md extractor-prompt.md; do
    install -m 0644 "$SOURCE_DIR/references/$ref" "$CANONICAL_DIR/references/$ref"
  done

  for f in collect.sh collect_sessions.sh extract_session.sh; do
    install -m 0755 "$SOURCE_DIR/scripts/$f" "$CANONICAL_DIR/scripts/$f"
  done
  for f in api.js chat-bridge.js memory-app.js memory.css memory.html \
           page-renderer.js style.css widget-renderers.js; do
    install -m 0644 "$SOURCE_DIR/scripts/$f" "$CANONICAL_DIR/scripts/$f"
  done

  install -m 0755 "$SOURCE_DIR/hooks/recall.sh" "$CANONICAL_DIR/hooks/recall.sh"
}

# -------------------------------------------------------------------
# Binary — NOT INSTALLED HERE. See the header: ~/.local/bin/ling-mem is
# a singleton owned by install-bin.sh. All this does is report whether
# it is already present, so a user running install.sh by hand knows
# whether anything is still missing.
# -------------------------------------------------------------------

report_binary() {
  local bin="$BIN_DIR/ling-mem"
  if [ -x "$bin" ]; then
    echo "Binary: $bin ($("$bin" --version 2>/dev/null | awk '{print $2}' || echo unknown))"
    return
  fi
  echo "Binary: not installed yet — the plugin's autostart hook or the"
  echo "        SKILL.md first-use gate installs it to $bin on next use."
}

# -------------------------------------------------------------------
# Memory dir
# -------------------------------------------------------------------
#
# Note: `dream` ships as a `/shared-memory dream` slash command, not a
# cron mission. Missions are owned by the engine (Linggen seeds its own
# built-in `~/.linggen/missions/dream/`); skills should not install
# missions. See the design doc for the rationale.

seed_memory_dir() {
  mkdir -p "$HOME/.linggen/memory"
}

# No install-source marker is written here. install-bin.sh writes
# ~/.linggen/.ling-mem-install-source itself as part of placing the
# binary — provenance belongs to whoever actually installed it, and a
# second writer would just overwrite the truth with a guess.

# -------------------------------------------------------------------
# Main
# -------------------------------------------------------------------

install_canonical_bundle
seed_memory_dir
report_binary

echo ""
echo "Done. Canonical bundle: $CANONICAL_DIR"
echo ""
echo "Host wiring is not done here — install the memory plugin from your"
echo "agent's own marketplace and it registers its own recall hook:"
echo "  Claude Code   /plugin marketplace add linggen/linggen-memory"
echo "  Codex         codex plugin marketplace add linggen/linggen-memory"
echo "  OpenClaw      clawhub install linggen"
echo ""
echo "Browse / edit rows: run 'ling-mem start' then open http://127.0.0.1:9528"
echo ""
echo "Note: ling-mem sends anonymous usage pings (install, daily-active, command"
echo "      name) to help improve it. No content, no identity. Disable any time:"
echo "        touch ~/.linggen/no-telemetry"
