#!/usr/bin/env bash
# Disk + garbage scan. Output is plain text the agent parses to build a page block.

set -u
echo "=== DISK ==="
df -h /System/Volumes/Data 2>/dev/null || df -h /

echo ""
echo "=== HOME DIRS ==="
du -sh ~/Desktop ~/Documents ~/Downloads ~/Library ~/Pictures ~/Music ~/Movies 2>/dev/null | sort -rh

echo ""
echo "=== CACHES ==="
du -sh ~/.Trash 2>/dev/null
du -sh ~/Library/Caches 2>/dev/null
du -sh ~/Library/Developer/Xcode/DerivedData 2>/dev/null
du -sh ~/Library/Developer/CoreSimulator 2>/dev/null

echo ""
echo "=== NODE_MODULES (top 10) ==="
find ~ -maxdepth 4 -name node_modules -type d -prune 2>/dev/null \
  | while read -r d; do du -sh "$d" 2>/dev/null; done | sort -rh | head -10

echo ""
echo "=== RUST_TARGET (top 5) ==="
find ~ -maxdepth 3 -name target -type d -prune 2>/dev/null \
  | while read -r d; do du -sh "$d" 2>/dev/null; done | sort -rh | head -5

echo ""
echo "=== OLD_DOWNLOADS_COUNT ==="
find ~/Downloads -maxdepth 1 -mtime +180 -type f 2>/dev/null | wc -l | tr -d ' '

echo ""
echo "=== APPLICATIONS ==="
echo "# REQUIRED: emit 'Apps to Review' recommendations widget from these rows."
echo "# Format per line: <last-used>\\t<size>\\t<name>. last-used='never' = no usage signal."
"$(dirname "$0")/scan-applications.sh"
