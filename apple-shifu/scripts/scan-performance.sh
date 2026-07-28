#!/usr/bin/env bash
# Performance scan. Output is plain text the agent parses.

set -u
echo "=== TOP_MEMORY (RSS KB, name) ==="
ps axo rss,comm 2>/dev/null | sort -k1 -rn | head -10

echo "=== TOP_CPU (%, name) ==="
ps axo %cpu,comm 2>/dev/null | sort -k1 -rn | head -10

echo "=== LAUNCH_AGENTS_COUNT ==="
ls ~/Library/LaunchAgents 2>/dev/null | wc -l | tr -d ' '

echo "=== SWAP_USAGE ==="
sysctl vm.swapusage 2>/dev/null
