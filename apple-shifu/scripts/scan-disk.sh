#!/usr/bin/env bash
# Disk + garbage scan. Output is plain text the agent parses to build a page block.
#
# Every size below is Apple's GB — 10^9 bytes, the unit Finder, About This Mac
# and this app's own header chip use. `df` and `du` count 1024-byte blocks, so
# we read -k/-sk and convert here rather than printing their -h strings: those
# are 1024-based, and "63Gi" relabelled "63 GB" reads ~7% short of the 67.7 GB
# the chip beside it shows for the same volume. Same rule as scan.js kbToGb.

set -u

# `<kb>\t<path>` from `du -sk` → `<n.nn> GB\t<path>`, biggest first.
gb_lines() {
  awk -F'\t' '{ printf "%.2f GB\t%s\n", ($1 * 1024) / 1e9, $2 }' | sort -rn
}

echo "=== DISK ==="
{ df -k /System/Volumes/Data 2>/dev/null || df -k /; } | awk 'NR == 2 {
  printf "Total: %.1f GB\nUsed: %.1f GB\nFree: %.1f GB\nCapacity: %s\nVolume: %s\n", \
    ($2 * 1024) / 1e9, ($3 * 1024) / 1e9, ($4 * 1024) / 1e9, $5, $NF }'

echo ""
echo "=== HOME DIRS ==="
du -sk ~/Desktop ~/Documents ~/Downloads ~/Library ~/Pictures ~/Music ~/Movies 2>/dev/null | gb_lines

echo ""
echo "=== CACHES ==="
{
  du -sk ~/.Trash 2>/dev/null
  du -sk ~/Library/Caches 2>/dev/null
  du -sk ~/Library/Developer/Xcode/DerivedData 2>/dev/null
  du -sk ~/Library/Developer/CoreSimulator 2>/dev/null
} | gb_lines

echo ""
echo "=== NODE_MODULES (top 10) ==="
find ~ -maxdepth 4 -name node_modules -type d -prune 2>/dev/null \
  | while read -r d; do du -sk "$d" 2>/dev/null; done | gb_lines | head -10

echo ""
echo "=== RUST_TARGET (top 5) ==="
find ~ -maxdepth 3 -name target -type d -prune 2>/dev/null \
  | while read -r d; do du -sk "$d" 2>/dev/null; done | gb_lines | head -5

echo ""
echo "=== OLD_DOWNLOADS_COUNT ==="
find ~/Downloads -maxdepth 1 -mtime +180 -type f 2>/dev/null | wc -l | tr -d ' '

echo ""
echo "=== APPLICATIONS ==="
echo "# REQUIRED: emit 'Apps to Review' recommendations widget from these rows."
echo "# Format per line: <last-used>\\t<size>\\t<name>. last-used='never' = no usage signal."
"$(dirname "$0")/scan-applications.sh"
