#!/usr/bin/env bash
# Lists installed apps with last-used timestamp + size. Output format
# matches the `=== APPLICATIONS ===` section consumed by the agent:
#   <last-used>\t<size>\t<name>     (one app per line)
#
# Used by both the initial-scan path (scan.js, on dashboard load) and the
# rescan path (scan-disk.sh, when user clicks Rescan Disk). Per-app work
# happens in scan-app-meta.sh and runs in parallel via xargs -P.
#
# `-print0` + `xargs -0` is required: many app bundles have spaces in their
# names (e.g. "Microsoft Teams.app").
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
find /Applications ~/Applications -maxdepth 2 -name "*.app" -prune -print0 2>/dev/null \
  | xargs -0 -P 8 -n 1 "$SCRIPT_DIR/scan-app-meta.sh" \
  | sort | cut -f2- | head -50
