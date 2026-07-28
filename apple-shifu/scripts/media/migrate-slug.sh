#!/usr/bin/env bash
# One-time data migration for the 2026-07-28 mac-shifu → apple-shifu rename.
#
# The skill folder is replaced on every install, but data/ is the user's:
# the archive ledger, the 30-day trash, the Mac index, thumbnails. Renaming
# the slug without moving it would silently start everyone from empty.
#
# removals.jsonl stores ABSOLUTE trash paths, so a plain move leaves restore
# and purge pointing at a directory that no longer exists — that is exactly
# what the sys-doctor → mac-shifu sweep got wrong in 2026-07. Rewrite them.
#
# Idempotent and silent: sourced or run by media.sh and setup.sh before they
# touch DATA, and a no-op once the new directory exists.

set -uo pipefail

_old="$HOME/.linggen/skills/mac-shifu/data"
_new="$HOME/.linggen/skills/apple-shifu/data"

if [ -d "$_old" ] && [ ! -d "$_new" ]; then
  mkdir -p "$(dirname "$_new")" || exit 0
  if mv "$_old" "$_new" 2>/dev/null; then
    # Same-volume rename keeps inodes, so the venv and thumbnails survive;
    # only the recorded paths need fixing.
    for _f in "$_new"/media/*.jsonl "$_new"/media/*.json; do
      [ -f "$_f" ] || continue
      grep -q "skills/mac-shifu/" "$_f" 2>/dev/null || continue
      sed -i '' 's|skills/mac-shifu/|skills/apple-shifu/|g' "$_f" 2>/dev/null \
        || sed -i 's|skills/mac-shifu/|skills/apple-shifu/|g' "$_f" 2>/dev/null
    done
    printf 'migrated data/ from mac-shifu\n' >&2
  fi
fi

exit 0
