#!/usr/bin/env bash
set -euo pipefail
#
# install.sh — install the composer skill into Linggen, plus install
# the influencer mission so it runs daily at 08:00.
#
# Composer is Linggen-only — the influencer mission depends on
# Linggen's mission scheduler. Claude Code / Codex can read the skill
# but the daily auto-drafting requires Linggen as the runtime.
#
# Usage:
#   bash install.sh
#
# Source: https://github.com/linggen/skills/tree/main/composer

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd 2>/dev/null)" || SOURCE_DIR=""

# Self-bootstrap when invoked via curl|bash with no local SKILL.md.
if [ -z "$SOURCE_DIR" ] || [ ! -f "$SOURCE_DIR/SKILL.md" ]; then
  BOOTSTRAP_REPO="${COMPOSER_SKILLS_REPO:-linggen/skills}"
  BOOTSTRAP_REF="${COMPOSER_REPO_REF:-main}"
  BOOTSTRAP_URL="https://github.com/${BOOTSTRAP_REPO}/archive/${BOOTSTRAP_REF}.tar.gz"
  BOOTSTRAP_TMP="$(mktemp -d -t composer-bootstrap-XXXXXX)"
  trap 'rm -rf "$BOOTSTRAP_TMP"' EXIT

  echo "Fetching composer skill from ${BOOTSTRAP_REPO}@${BOOTSTRAP_REF}..."
  if ! curl -fsSL --retry 3 --retry-delay 2 "$BOOTSTRAP_URL" | tar -xz -C "$BOOTSTRAP_TMP"; then
    echo "Error: failed to download $BOOTSTRAP_URL" >&2
    exit 1
  fi
  SOURCE_DIR="$(find "$BOOTSTRAP_TMP" -maxdepth 3 -type d -name composer | head -n1)"
  if [ -z "$SOURCE_DIR" ] || [ ! -f "$SOURCE_DIR/SKILL.md" ]; then
    echo "Error: composer/SKILL.md not found in tarball" >&2
    exit 1
  fi
fi

# Composer is Linggen-only.
LINGGEN_DIR="$HOME/.linggen"
if [ ! -d "$LINGGEN_DIR" ]; then
  echo "Error: ~/.linggen not found. Composer requires Linggen as the runtime" >&2
  echo "  (the influencer mission depends on Linggen's mission scheduler)." >&2
  echo "  Install Linggen first, then re-run this script." >&2
  exit 1
fi

SKILL_DIR="$LINGGEN_DIR/skills/composer"
MISSION_DIR="$LINGGEN_DIR/missions/influencer"
DATA_DIR="$LINGGEN_DIR/skills/composer/data"

echo "Installing composer skill to $SKILL_DIR/"
mkdir -p "$SKILL_DIR/scripts" "$SKILL_DIR/references" "$SKILL_DIR/assets" "$DATA_DIR"

# Skill files.
install -m 0644 "$SOURCE_DIR/SKILL.md"    "$SKILL_DIR/SKILL.md"
install -m 0644 "$SOURCE_DIR/index.html"  "$SKILL_DIR/index.html"
for f in composer.html composer-app.js style.css; do
  install -m 0644 "$SOURCE_DIR/scripts/$f" "$SKILL_DIR/scripts/$f"
done
for f in run.sh collect.sh; do
  install -m 0755 "$SOURCE_DIR/scripts/$f" "$SKILL_DIR/scripts/$f"
done
for f in voice-samples.md style-guide.md lane-templates.md source-blogs.md; do
  install -m 0644 "$SOURCE_DIR/references/$f" "$SKILL_DIR/references/$f"
done

# Mission file (referenced by the install_mission step below).
install -m 0644 "$SOURCE_DIR/assets/mission.md" "$SKILL_DIR/assets/mission.md"

echo "Installing influencer mission to $MISSION_DIR/"
mkdir -p "$MISSION_DIR/scripts"
if [ ! -f "$MISSION_DIR/mission.md" ]; then
  cp "$SOURCE_DIR/assets/mission.md" "$MISSION_DIR/mission.md"
  echo "  Installed: $MISSION_DIR/mission.md (cron 0 8 * * *)"
else
  echo "  Existing mission.md left alone — edit by hand if you want to update."
fi
cp "$SOURCE_DIR/scripts/run.sh" "$MISSION_DIR/scripts/run.sh"
chmod +x "$MISSION_DIR/scripts/run.sh"

echo ""
echo "Done. Composer skill ready at $SKILL_DIR"
echo "Influencer mission scheduled at $MISSION_DIR (next run 08:00 local)"
echo ""
echo "Next step: paste 10-20 of your past tweets/posts into"
echo "  $SKILL_DIR/references/voice-samples.md"
echo "Without samples, drafts will read as generic LLM voice."
