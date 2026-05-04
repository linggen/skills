#!/usr/bin/env bash
# Per-app metadata used by scan-applications.sh.
# Output: <sort-key>\t<last-used>\t<size>\t<name>  (tab-separated)
# Designed to run in parallel via xargs -P. Uses Spotlight's pre-computed
# size and a multi-source last-used signal (Spotlight + Containers + Saved
# State + Preferences + Application Support, max wins).
set -u
app="${1:-}"
[ -d "$app" ] || exit 0

# Bundle ID via plutil (~3ms vs ~40ms for mdls).
bid=$(plutil -extract CFBundleIdentifier raw "$app/Contents/Info.plist" 2>/dev/null)

# Convert "YYYY-MM-DD HH:MM:SS +0000" to a sortable epoch number, or 0 if blank/null.
to_epoch() {
  local s="$1"
  [ -z "$s" ] || [ "$s" = "(null)" ] && { echo 0; return; }
  date -j -f "%Y-%m-%d %H:%M:%S %z" "$s" +%s 2>/dev/null || echo 0
}

# Source 1: Spotlight last-used. -raw avoids the alignment-spacing in
# mdls's default output (which broke the previous awk parser).
spot=$(mdls -name kMDItemLastUsedDate -raw "$app" 2>/dev/null)

# Sources 2-5: mtime of various per-app state directories.
mtime_at() {
  local p="$1"
  [ -e "$p" ] || { echo 0; return; }
  stat -f "%m" "$p" 2>/dev/null || echo 0
}

best_epoch=0
best_str=""
update_best() {
  local epoch="$1" pretty="$2"
  [ "$epoch" -gt "$best_epoch" ] || return 0
  best_epoch="$epoch"
  best_str="$pretty"
}

# Spotlight signal
spot_epoch=$(to_epoch "$spot")
[ -n "$spot" ] && [ "$spot" != "(null)" ] && update_best "$spot_epoch" "$spot"

# State-directory signals — only meaningful when bundle id is known.
if [ -n "$bid" ] && [ "$bid" != "(null)" ]; then
  for p in \
    "$HOME/Library/Containers/$bid" \
    "$HOME/Library/Group Containers/group.$bid" \
    "$HOME/Library/Saved Application State/$bid.savedState" \
    "$HOME/Library/Preferences/$bid.plist" \
    "$HOME/Library/Application Support/$bid"
  do
    e=$(mtime_at "$p")
    if [ "$e" != "0" ]; then
      pretty=$(date -r "$e" "+%Y-%m-%d %H:%M:%S %z" 2>/dev/null)
      update_best "$e" "$pretty"
    fi
  done
fi

if [ "$best_epoch" = "0" ]; then
  last="never"
  key="0000-00-00"
else
  last="$best_str"
  key="${last:0:10}"
fi

# Size from Spotlight (instant — no bundle walk like du -sh).
size_bytes=$(mdls -name kMDItemFSSize -raw "$app" 2>/dev/null)
if [ -n "$size_bytes" ] && [ "$size_bytes" != "(null)" ]; then
  size=$(awk -v n="$size_bytes" 'BEGIN{
    if (n >= 1073741824) printf "%.1fG", n/1073741824
    else if (n >= 1048576)   printf "%.0fM", n/1048576
    else if (n >= 1024)      printf "%.0fK", n/1024
    else                      printf "%dB",   n
  }')
else
  size="?"
fi

printf "%s\t%s\t%s\t%s\n" "$key" "$last" "$size" "$(basename "$app")"
