#!/bin/bash
# install-skill.sh — install one skill from a COMMITTED ref into
# ~/.linggen/skills/<skill>/, whole, after a syntax + import/export link check.
#
#   scripts/install-skill.sh <skill> [--ref <git-ref>] [--check] [--dry-run]
#
#   --ref      source commit (default origin/main, fetched first; HEAD for a local commit)
#   --check    install nothing; report files that differ from the ref, missing
#              files and link problems (non-zero exit if any)
#   --dry-run  run the pre-flight and print what would change
#
# Never deletes anything in the install; never touches user state (data/,
# state/, config.json, sessions/, the SKILL.md's cloud.save/skip paths).
# Env: LINGGEN_SKILLS_DIR (default ~/.linggen/skills), LINGGEN_PORT (9527).
# The work is in install-skill.mjs; this only finds node (the daemon-style
# lookup of lingjing/scripts/run-js.sh, minus bun: the checks run node --check).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
for rt in "$(command -v node 2>/dev/null || true)" \
          "$HOME/.linggen/bin/node" \
          /opt/homebrew/bin/node /usr/local/bin/node; do
  if [ -n "$rt" ] && [ -x "$rt" ]; then
    exec "$rt" "$here/install-skill.mjs" "$@"
  fi
done

echo "install-skill: node not found (PATH, ~/.linggen/bin, /opt/homebrew/bin, /usr/local/bin)" >&2
exit 1
