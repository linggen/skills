#!/usr/bin/env bash
# latest.sh — emit everything the agent needs to answer without guessing: who
# the user is, what today asks of them, and what this mirror actually holds.
# Backs the Report tool. Coreutils plus the JS runtime shim; no network.
#
# A key comes back null when the mirror has not been given that file — no
# iPhone paired, or the pass that writes it has not run. Null is the honest
# answer, and SKILL.md tells the agent to read it as one rather than as a zero.
set -uo pipefail
DIR="${SKILL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
bash "$DIR/scripts/run-js.sh" "$DIR/scripts/ingest.mjs" report 2>/dev/null \
  || echo '{"ok":false,"error":"the Health mirror could not be read"}'
