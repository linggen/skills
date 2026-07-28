#!/bin/bash
# Media tab dispatcher — the UI calls this over /api/bash.
# Usage: media.sh <info|progress|flags|state|verified|remove-result|setup|start <op...>|cancel>
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
# Carry a pre-rename install's data/ over before we touch it (no-op after).
[ -x "$HERE/migrate-slug.sh" ] && bash "$HERE/migrate-slug.sh" 2>/dev/null

DATA="$HOME/.linggen/skills/apple-shifu/data/media"
VENV="$DATA/venv"
PY="$VENV/bin/python"
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
  volumes)
    # writable external volumes usable as a backup destination (JSON array)
    list=$(for d in /Volumes/*/; do
      name="$(basename "$d")"
      [ "$name" = "Macintosh HD" ] && continue
      [ -w "$d" ] && printf '%s\n' "$name"
    done 2>/dev/null | sed 's/\\/\\\\/g; s/"/\\"/g; s/^/"/; s/$/"/' | paste -sd, -)
    printf '[%s]\n' "$list"
    ;;
  purge)
    require_venv
    if [ "${1:-}" = "all" ]; then
      "$PY" "$PIPELINE" purge --all 2>/dev/null || echo '{"error":"purge_failed"}'
    else
      "$PY" "$PIPELINE" purge 2>/dev/null || echo '{"error":"purge_failed"}'
    fi
    ;;
  restore)
    require_venv
    "$PY" "$PIPELINE" restore --sha "${1:?sha required}" 2>/dev/null || echo '{"error":"restore_failed"}'
    ;;
  get-dest)
    # remembered backup destination ('' = This Mac default)
    require_venv
    d=$(cat "$DATA/backup-dest" 2>/dev/null || true)
    "$PY" -c "import json,sys; print(json.dumps({'dest': sys.argv[1]}))" "$d" 2>/dev/null || echo '{"dest":""}'
    ;;
  set-dest)
    printf '%s' "${1:-}" > "$DATA/backup-dest"
    echo '{"ok":true}'
    ;;
  choose-dest)
    # native macOS folder picker → POSIX path (blocks until the user picks)
    require_venv
    p=$(osascript -e 'POSIX path of (choose folder with prompt "Choose a backup destination for your iPhone photos")' 2>/dev/null)
    if [ -n "$p" ]; then
      p="${p%/}"
      "$PY" -c "import json,sys; print(json.dumps({'path': sys.argv[1]}))" "$p"
    else
      echo '{"canceled":true}'
    fi
    ;;
  remove-one)
    # synchronous single-item trash-delete for the lightbox (blocks ~1-2s)
    require_venv
    id="${1:?id required}"
    printf '{"ids":["%s"]}' "$id" > "$DATA/selection.json"
    if "$PY" "$PIPELINE" remove --confirm --trash >"$DATA/op.log" 2>&1; then
      cat "$DATA/remove-result.json" 2>/dev/null || echo '{"error":"no result"}'
    else
      # connect/AFC failure — surface the reason the pipeline wrote to progress
      "$PY" -c "import json,sys; p=json.load(open('$DATA/progress.json')); print(json.dumps({'error': p.get('error','remove failed')}))" 2>/dev/null || echo '{"error":"remove failed"}'
    fi
    ;;
  setup)
    nohup "$HERE/setup.sh" >"$DATA/setup.log" 2>&1 &
    echo "{\"started\":\"setup\",\"pid\":$!}"
    ;;
  start)
    # start scan-all | index | scan | backup <dest|-> | remove-trash
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
      scan)
        # analyzers only, over what is already staged — the wireless path's
        # Sync (no phone walk, so no cable and no AFC needed)
        printf '%s\n' '{"op":"scan","status":"running","phase":"starting"}' >"$DATA/progress.json"
        nohup "$PY" "$PIPELINE" scan >"$DATA/op.log" 2>&1 &
        ;;
      remove-trash)
        # cleanup delete: staged copies move to the 30-day restore area.
        # reset progress first so a poller can't latch onto a prior op's 'done'
        printf '%s\n' '{"op":"remove","status":"running","phase":"starting"}' >"$DATA/progress.json"
        nohup "$PY" "$PIPELINE" remove --confirm --trash >"$DATA/op.log" 2>&1 &
        ;;
      backup)
        # archive selection.json to dest — copy-only, never deletes. The UI
        # writes the work-list (checked items, else everything unarchived).
        dest="${1:--}"
        printf '%s\n' '{"op":"backup","status":"running","phase":"starting"}' >"$DATA/progress.json"
        cmd="'$PY' '$PIPELINE' backup --selection '$DATA/backup-selection.json'"
        if [ "$dest" != "-" ]; then
          dest_esc=$(printf %s "$dest" | sed "s/'/'\\\\''/g")  # volume names can hold apostrophes
          cmd="$cmd --dest '$dest_esc'"
        fi
        nohup bash -c "$cmd" >"$DATA/op.log" 2>&1 &
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
