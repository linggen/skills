#!/usr/bin/env bash
set -euo pipefail
#
# install.sh — install the pulse skill into Linggen.
#
# Pulse is Linggen-only — runtime, settings page, and saved-run
# scheduling depend on Linggen. Claude Code / Codex can read the skill
# but the on-demand UI requires Linggen.
#
# Usage:
#   bash install.sh
#
# Source: https://github.com/linggen/skills/tree/main/pulse

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd 2>/dev/null)" || SOURCE_DIR=""

# Self-bootstrap when invoked via curl|bash with no local SKILL.md.
if [ -z "$SOURCE_DIR" ] || [ ! -f "$SOURCE_DIR/SKILL.md" ]; then
  BOOTSTRAP_REPO="${PULSE_SKILLS_REPO:-linggen/skills}"
  BOOTSTRAP_REF="${PULSE_REPO_REF:-main}"
  BOOTSTRAP_URL="https://github.com/${BOOTSTRAP_REPO}/archive/${BOOTSTRAP_REF}.tar.gz"
  BOOTSTRAP_TMP="$(mktemp -d -t pulse-bootstrap-XXXXXX)"
  trap 'rm -rf "$BOOTSTRAP_TMP"' EXIT

  echo "Fetching pulse skill from ${BOOTSTRAP_REPO}@${BOOTSTRAP_REF}..."
  if ! curl -fsSL --retry 3 --retry-delay 2 "$BOOTSTRAP_URL" | tar -xz -C "$BOOTSTRAP_TMP"; then
    echo "Error: failed to download $BOOTSTRAP_URL" >&2
    exit 1
  fi
  SOURCE_DIR="$(find "$BOOTSTRAP_TMP" -maxdepth 3 -type d -name pulse | head -n1)"
  if [ -z "$SOURCE_DIR" ] || [ ! -f "$SOURCE_DIR/SKILL.md" ]; then
    echo "Error: pulse/SKILL.md not found in tarball" >&2
    exit 1
  fi
fi

# Pulse is Linggen-only.
LINGGEN_DIR="$HOME/.linggen"
if [ ! -d "$LINGGEN_DIR" ]; then
  echo "Error: ~/.linggen not found. Pulse requires Linggen as the runtime." >&2
  echo "  Install Linggen first, then re-run this script." >&2
  exit 1
fi

SKILL_DIR="$LINGGEN_DIR/skills/pulse"
DATA_DIR="$SKILL_DIR/data"
STATE_DIR="$SKILL_DIR/state"

mkdir -p "$SKILL_DIR/scripts" "$SKILL_DIR/scripts/sites" "$SKILL_DIR/references" "$DATA_DIR" "$STATE_DIR"

# When invoked by `ling init`, Linggen has already copied the skill tree
# into $SKILL_DIR before running this script — so $SOURCE_DIR and
# $SKILL_DIR point at the same files and `install` would abort with
# "same file" (BSD exit 64). Skip the copy block in that case and just
# run the seeding/missions step below.
SOURCE_REAL="$(cd "$SOURCE_DIR" 2>/dev/null && pwd -P)" || SOURCE_REAL="$SOURCE_DIR"
SKILL_REAL="$(cd "$SKILL_DIR" 2>/dev/null && pwd -P)" || SKILL_REAL="$SKILL_DIR"

if [ "$SOURCE_REAL" != "$SKILL_REAL" ]; then
  echo "Installing pulse skill to $SKILL_DIR/"
  install -m 0644 "$SOURCE_DIR/SKILL.md"    "$SKILL_DIR/SKILL.md"
  install -m 0644 "$SOURCE_DIR/index.html"  "$SKILL_DIR/index.html"
  install -m 0644 "$SOURCE_DIR/product-spec.md" "$SKILL_DIR/product-spec.md"
  for f in pulse.html pulse-app.js chat-bridge.js api.js page-render.js \
           pulse.css style.css \
           settings.html settings.js settings.css; do
    install -m 0644 "$SOURCE_DIR/scripts/$f" "$SKILL_DIR/scripts/$f"
  done
  install -m 0755 "$SOURCE_DIR/scripts/collect.sh" "$SKILL_DIR/scripts/collect.sh"
  install -m 0755 "$SOURCE_DIR/scripts/generate-missions.sh" "$SKILL_DIR/scripts/generate-missions.sh"

  # Site adapters — registered as skill tools (FetchHackerNews, FetchReddit, ...)
  for f in hackernews.sh reddit.sh lobsters.sh arxiv.sh rss.sh \
           google-trends.sh github-trending.sh product-hunt.sh wikipedia-pageviews.sh; do
    install -m 0755 "$SOURCE_DIR/scripts/sites/$f" "$SKILL_DIR/scripts/sites/$f"
  done

  for f in voice-samples.md style-guide.md lane-templates.md source-blogs.md brief.example.md; do
    install -m 0644 "$SOURCE_DIR/references/$f" "$SKILL_DIR/references/$f"
  done
else
  echo "Skill files already in place at $SKILL_DIR/ (skipping copy)."
fi

# Seed config.json from the example on first install. On upgrades,
# merge in any new top-level keys (e.g. new sites added, saved_runs
# block introduced) without overwriting the user's existing values.
if [ "$SOURCE_REAL" != "$SKILL_REAL" ]; then
  install -m 0644 "$SOURCE_DIR/config.example.json" "$SKILL_DIR/config.example.json"
fi
if [ ! -f "$SKILL_DIR/config.json" ]; then
  cp "$SOURCE_DIR/config.example.json" "$SKILL_DIR/config.json"
  echo "  Seeded $SKILL_DIR/config.json from example. Edit in Settings to configure."
else
  # Forward-compat merge: example provides defaults for any top-level
  # keys the user's config is missing. User's values win where both
  # have a key. Top-level only — nested merging would surprise users
  # whose intentional removals would be undone.
  if command -v jq >/dev/null 2>&1; then
    merged="$(jq -s '.[0] * .[1]' "$SOURCE_DIR/config.example.json" "$SKILL_DIR/config.json")"
    if [ -n "$merged" ]; then
      printf '%s\n' "$merged" > "$SKILL_DIR/config.json"
      echo "  Merged new top-level keys into $SKILL_DIR/config.json (existing values preserved)."
    fi
  fi
fi

# Seed brief.md from the example on first install. Brief is the user's
# editable persona/style/purpose document — always preserved on upgrade.
if [ ! -f "$SKILL_DIR/references/brief.md" ]; then
  cp "$SOURCE_DIR/references/brief.example.md" "$SKILL_DIR/references/brief.md"
  echo "  Seeded $SKILL_DIR/references/brief.md from example. Edit in Settings."
else
  echo "  Existing $SKILL_DIR/references/brief.md left alone."
fi


# Generate cron-scheduled missions for any enabled saved_runs in
# config.json. Idempotent — also called by Settings on save so changes
# to saved_runs take effect immediately.
echo "Generating missions from saved_runs[]..."
bash "$SKILL_DIR/scripts/generate-missions.sh"

echo ""
echo "Done. Pulse skill ready at $SKILL_DIR"
echo ""
echo "Next step: open Pulse, click Settings, edit your brief and select sources/targets."
echo "Optionally paste your past writing into:"
echo "  $SKILL_DIR/references/voice-samples.md"
echo "Without voice samples, drafts will read as generic LLM voice."
