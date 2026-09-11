#!/usr/bin/env bash
# Shifu's quest fact, for any app that counts real-life practice (Lingjing
# reads ~/.linggen/quests/*.json). Called when a disk scan completes, so
# `done_at` is Shifu's own record of that scan. Only the fact crosses — due,
# done, when — never what the scan found. Prints nothing; a failure here
# never fails the scan.

set -u

dir="$HOME/.linggen/quests"
file="$dir/apple-shifu.json"
at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "$dir" 2>/dev/null || exit 0
tmp="$file.$$.tmp"
cat > "$tmp" <<EOF || exit 0
{ "app": "apple-shifu", "quests": [
  { "id": "shifu-scan", "period": "week", "due": true, "done_at": "$at", "reward": 30,
    "title": { "zh": "清扫洞府 · 用 Shifu 扫描一次磁盘", "en": "Tidy your cave abode · scan your disk in Shifu" } } ] }
EOF
mv -f "$tmp" "$file" 2>/dev/null || rm -f "$tmp"
exit 0
