#!/bin/bash
# Media tab dispatcher — the UI calls this over /api/bash.
# Usage: media.sh <info|progress|flags|state|verified|remove-result|setup|start <op...>|cancel>
set -u

DATA="$HOME/.linggen/skills/sys-doctor/data/media"
VENV="$DATA/venv"
PY="$VENV/bin/python"
HERE="$(cd "$(dirname "$0")" && pwd)"
PIPELINE="$HERE/media_pipeline.py"
mkdir -p "$DATA"

cmd="${1:-info}"; shift || true

require_venv() {
  if [ ! -x "$PY" ]; then
    echo '{"error":"setup_required"}'
    exit 0
  fi
}

case "$cmd" in
  info)
    require_venv
    "$PY" "$PIPELINE" info 2>/dev/null || echo '{"error":"info_failed"}'
    ;;
  progress)      cat "$DATA/progress.json" 2>/dev/null || echo '{}' ;;
  flags)         cat "$DATA/flags.json" 2>/dev/null || echo '{}' ;;
  state)         cat "$DATA/state.json" 2>/dev/null || echo '{}' ;;
  verified)      cat "$DATA/verified.json" 2>/dev/null || echo '{}' ;;
  removals)      cat "$DATA/removals.jsonl" 2>/dev/null || true ;;
  mac-index)     cat "$DATA/mac-index.jsonl" 2>/dev/null || true ;;
  trash)
    require_venv
    sel="${1:-$DATA/trash-selection.json}"
    "$PY" "$PIPELINE" trash --selection "$sel" 2>/dev/null || echo '{"error":"trash_failed"}'
    ;;
  remove-result) cat "$DATA/remove-result.json" 2>/dev/null || echo '{}' ;;
  setup)
    nohup "$HERE/setup.sh" >"$DATA/setup.log" 2>&1 &
    echo "{\"started\":\"setup\",\"pid\":$!}"
    ;;
  start)
    # start scan-all | backup <selection.json> | remove
    require_venv
    op="${1:-scan-all}"; shift || true
    case "$op" in
      scan-all)
        nohup bash -c "'$PY' '$PIPELINE' index && '$PY' '$PIPELINE' pull && '$PY' '$PIPELINE' scan" \
          >"$DATA/op.log" 2>&1 &
        ;;
      index)
        nohup "$PY" "$PIPELINE" index >"$DATA/op.log" 2>&1 &
        ;;
      backup)
        sel="${1:-$DATA/selection.json}"
        nohup "$PY" "$PIPELINE" backup --selection "$sel" >"$DATA/op.log" 2>&1 &
        ;;
      remove)
        nohup "$PY" "$PIPELINE" remove --confirm >"$DATA/op.log" 2>&1 &
        ;;
      remove-only)
        nohup "$PY" "$PIPELINE" remove --confirm --unverified >"$DATA/op.log" 2>&1 &
        ;;
      *) echo '{"error":"unknown op"}'; exit 0 ;;
    esac
    echo $! > "$DATA/op.pid"
    echo "{\"started\":\"$op\",\"pid\":$(cat "$DATA/op.pid")}"
    ;;
  cancel)
    if [ -f "$DATA/op.pid" ]; then
      pid=$(cat "$DATA/op.pid")
      pkill -P "$pid" 2>/dev/null; kill "$pid" 2>/dev/null
      rm -f "$DATA/op.pid"
      echo '{"cancelled":true}'
    else
      echo '{"cancelled":false}'
    fi
    ;;
  *) echo '{"error":"unknown command"}' ;;
esac
