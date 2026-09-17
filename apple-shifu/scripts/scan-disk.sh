#!/usr/bin/env bash
# Disk + garbage scan. Output is plain text the agent parses to build a page block.
#
# Every size below is Apple's GB — 10^9 bytes, the unit Finder, About This Mac
# and this app's own header chip use. `df` and `du` count 1024-byte blocks, so
# we read -k/-sk and convert here rather than printing their -h strings: those
# are 1024-based, and "63Gi" relabelled "63 GB" reads ~7% short of the 67.7 GB
# the chip beside it shows for the same volume. Same rule as scan.js kbToGb.

set -u

# A command with a time limit. macOS ships no `timeout`, and an unbounded walk
# on a big, full disk is what used to cost the caller its whole answer: the
# tool call died and every section went with it. Prints nothing when it runs
# over, and the caller reports that folder as not measured.
limited() { perl -e 'alarm shift; exec @ARGV' "$@"; }

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
# Every folder in $HOME, each measured on its own with its own budget: one du
# over a fixed list lost the whole breakdown whenever a single tree ran long,
# and it left out wherever the user actually keeps their files. Whatever is
# measured in time is printed; the rest are named under UNMEASURED below, so
# the reader can tell "small" from "not looked at". macOS has no `timeout`,
# hence perl's alarm.
DIR_BUDGET=${SHIFU_DIR_BUDGET:-240}          # seconds one folder may take
DIRS_BUDGET=${SHIFU_DIRS_BUDGET:-300}        # seconds for the whole sweep
DIR_LANES=${SHIFU_DIR_LANES:-4}              # folders measured at once
# Real files, not shell variables: a loop that feeds a pipe — or a background
# job — runs in a subshell, and anything it collected would be gone by the
# next line. Each line is one short append, so the lanes can share a file.
WORK=$(mktemp -d); MEASURED="$WORK/measured"; SKIPPED="$WORK/skipped"
: > "$MEASURED"; : > "$SKIPPED"
trap 'rm -rf "$WORK"' EXIT

measure_dir() {
  local name="$1" out err rc
  err="$WORK/err.$$"
  out=$(limited "$DIR_BUDGET" du -sk "$HOME/$name" 2>"$err"); rc=$?
  if [ -n "$out" ]; then
    printf '%s\n' "$out" >> "$MEASURED"
  elif [ "$rc" -gt 128 ]; then
    printf '%s\tstill going after %ss\n' "$name" "$DIR_BUDGET" >> "$SKIPPED"
  elif grep -qi 'not permitted\|permission denied' "$err" 2>/dev/null; then
    # macOS guards ~/.Trash and a few others: the app needs Full Disk Access
    # in System Settings → Privacy & Security to read them.
    printf '%s\tmacOS will not let this app read it\n' "$name" >> "$SKIPPED"
  else
    printf '%s\tcould not be read\n' "$name" >> "$SKIPPED"
  fi
  rm -f "$err"
}

DEADLINE=$(( $(date +%s) + DIRS_BUDGET ))
# Your own folders first, the tools' dot-folders after: when the clock runs
# out it should be a cache that went unmeasured, not where you keep your work.
# read, not `for … in $(…)`: a folder named "VR Room Project" is one folder,
# and word splitting turned it into three.
while IFS= read -r name; do
  [ -n "$name" ] || continue
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    printf '%s\tthe scan ran out of time\n' "$name" >> "$SKIPPED"
    continue
  fi
  measure_dir "$name" &
  while [ "$(jobs -rp | wc -l)" -ge "$DIR_LANES" ]; do sleep 0.3; done   # bash 3.2: no `wait -n`
done < <({ ls -1p ~ | grep '/$'; ls -1Ap ~ | grep '/$' | grep '^\.'; } | sed 's:/$::')
wait

gb_lines < "$MEASURED"

echo ""
echo "=== UNMEASURED ==="
echo "# Folders skipped, with the reason. Report them as not measured — never guess a size."
cat "$SKIPPED"

echo ""
echo "=== CACHES ==="
{
  limited 15 du -sk ~/.Trash 2>/dev/null
  limited 15 du -sk ~/Library/Caches 2>/dev/null
  limited 15 du -sk ~/Library/Developer/Xcode/DerivedData 2>/dev/null
  limited 15 du -sk ~/Library/Developer/CoreSimulator 2>/dev/null
} | gb_lines

echo ""
echo "=== NODE_MODULES (top 10) ==="
limited 40 bash -c 'find ~ -maxdepth 4 -name node_modules -type d -prune 2>/dev/null \
  | while read -r d; do du -sk "$d" 2>/dev/null; done' 2>/dev/null | gb_lines | head -10

echo ""
echo "=== RUST_TARGET (top 5) ==="
limited 30 bash -c 'find ~ -maxdepth 3 -name target -type d -prune 2>/dev/null \
  | while read -r d; do du -sk "$d" 2>/dev/null; done' 2>/dev/null | gb_lines | head -5

echo ""
echo "=== OLD_DOWNLOADS_COUNT ==="
limited 15 bash -c 'find ~/Downloads -maxdepth 1 -mtime +180 -type f 2>/dev/null | wc -l' 2>/dev/null | tr -d ' '

echo ""
echo "=== APPLICATIONS ==="
echo "# REQUIRED: emit 'Apps to Review' recommendations widget from these rows."
echo "# Format per line: <last-used>\\t<size>\\t<name>. last-used='never' = no usage signal."
"$(dirname "$0")/scan-applications.sh"

# The finished scan is the quest fact other apps may count. Silent.
"$(dirname "$0")/quest.sh"
