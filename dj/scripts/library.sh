#!/usr/bin/env bash
# library.sh — backs the ListLibrary tool: the library as slim rows, with
# optional search and paging. Args: query limit offset playlist view (each may
# be its literal {{placeholder}} when omitted). See list_library.py.
set -uo pipefail
DIR="${SKILL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
exec "${LINGGEN_PY:-python3}" "$DIR/scripts/list_library.py" "$DIR/library.json" "${1:-}" "${2:-}" "${3:-}" "${4:-}" "${5:-}"
