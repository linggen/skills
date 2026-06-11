#!/usr/bin/env bash
# latest.sh — emit the most recently imported (REDACTED) rollup JSON, or {} if
# nothing has been imported. Backs the LatestAnalysis tool so the agent fetches
# the current numbers on demand — import itself stays zero-AI. Coreutils only.
set -uo pipefail
DIR="${SKILL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}/data"
# The reconciled (transfers-excluded, multi-account) report, refreshed by the
# page on every import and on open. {} until the first import.
if [ -f "$DIR/report.json" ]; then cat "$DIR/report.json"; else echo '{}'; fi
