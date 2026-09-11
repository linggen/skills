#!/bin/bash
# run-js.sh — run a JS script under whatever runtime this machine has.
# Preference order: the bundled bun (~/.linggen/bin/bun, installed by
# install.sh), then bun/node on PATH, then the usual Homebrew/system spots —
# the daemon's PATH is minimal when launched from the app, so PATH alone
# can't be trusted.
set -euo pipefail

for rt in "$HOME/.linggen/bin/bun" \
          "$(command -v bun 2>/dev/null || true)" \
          "$(command -v node 2>/dev/null || true)" \
          /opt/homebrew/bin/node /usr/local/bin/node; do
  if [ -n "$rt" ] && [ -x "$rt" ]; then
    exec "$rt" "$@"
  fi
done

echo '{"ok":false,"error":"no JS runtime found — install.sh bundles bun into ~/.linggen/bin"}'
exit 1
