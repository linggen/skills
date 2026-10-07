#!/usr/bin/env bash
# Lists installed apps with last-used timestamp + size. Output format
# matches the `=== APPLICATIONS ===` section consumed by the agent:
#   <last-used>\t<size>\t<name>[\t<where>]     (one app per line)
#
# Installed apps (/Applications, ~/Applications) come first, oldest-used
# first, capped at 50. Then app bundles Spotlight finds elsewhere in $HOME
# (old build output, e.g. ~/workspace/unity/build/Foo.app) — biggest first,
# capped at 20 on their own so they never crowd out installed apps. Those
# rows carry a 4th field: `not installed · <folder>`.
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

# Outermost bundles only (a bundle inside another .app is part of it), and
# none from ~/Applications (listed above), ~/Library, the Trash or vendored
# node_modules tooling. No Spotlight → no rows, nothing else changes.
mdfind -onlyin "$HOME" 'kMDItemContentType == "com.apple.application-bundle"' 2>/dev/null \
  | grep -v -e "^$HOME/Applications/" -e "^$HOME/Library/" -e "^$HOME/\.Trash/" \
            -e '/node_modules/' -e '\.app/' \
  | tr '\n' '\0' \
  | xargs -0 -P 8 -n 1 "$SCRIPT_DIR/scan-app-meta.sh" --where \
  | cut -f2- | sort -t $'\t' -k2,2 -h -r | head -20
