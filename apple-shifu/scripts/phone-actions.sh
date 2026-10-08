#!/bin/bash
# phone-actions.sh — the Mac side of the typed cross-device action lane
# (app-action-spec.md). The paired phone publishes its action catalog as a
# retained `phone/tools` topic on every connect; requests ride the `actions`
# topic with the op = the tool's name (`photos_backup`, `dj_play`); the phone
# publishes `<op>-done` back. A phone from before the `<app>_<verb>` rename
# lists unprefixed names and only knows the old `<app>-<tool>` op —
# `op_for` picks that form from its catalog, so either phone answers.
# This script only talks to the local daemon's topic API — it never reaches
# the phone directly (the phone may be away; retained topics are the queue).
#
# Verbs: list | request <tool> [params-json] | result <tool>
set -euo pipefail

PORT="${LINGGEN_PORT:-9527}"
BASE="http://127.0.0.1:$PORT"

# Tool cmd template args arrive as the literal {{arg}} when the model omits
# them — treat placeholder-shaped values as absent.
clean() {
  case "${1:-}" in "{{"*"}}") echo "" ;; *) echo "${1:-}" ;; esac
}

# The op a request rides on: the tool's name, or `<app>-<name>` when the
# phone's catalog shows an old, unprefixed name. An op already in the dash
# form, or a name the catalog lacks, goes as given.
op_for() {
  local catalog
  catalog=$(curl -s -m 5 "$BASE/api/topic/latest?topic=phone&op=tools" || true)
  python3 - "$1" "$catalog" <<'PYOP'
import json, sys
action, raw = sys.argv[1], sys.argv[2]
op = action
try:
    payload = json.loads(raw).get("payload") or {}
    tools = payload.get("tools") if isinstance(payload, dict) else None
    for t in tools or []:
        app, name = t.get("app", ""), t.get("name", "")
        if name == action and "-" not in action and not name.startswith(app + "_"):
            op = f"{app}-{name}"
except Exception:
    pass
print(op)
PYOP
}

case "${1:-}" in
  list)
    out=$(curl -s -m 5 "$BASE/api/topic/latest?topic=phone&op=tools" || true)
    if [ -z "$out" ] || [ "$out" = "null" ] || ! echo "$out" | grep -q '"tools"'; then
      echo '{"tools":[],"note":"no phone has published its actions yet — it does so each time it connects"}'
    else
      echo "$out"
    fi
    ;;
  request)
    ACTION=$(clean "${2:-}")
    PARAMS=$(clean "${3:-}")
    [ -n "$ACTION" ] || { echo '{"ok":false,"error":"missing action — use a tool name from PhoneActions"}'; exit 1; }
    [ -n "$PARAMS" ] || PARAMS='{}'
    ACTION=$(op_for "$ACTION")
    now=$(date +%s)
    # Compose in python so a malformed params JSON fails here, loudly, instead
    # of poisoning the retained topic the phone will honor later.
    body=$(python3 - "$ACTION" "$PARAMS" "$now" <<'PY'
import json, sys
action, params, now = sys.argv[1], sys.argv[2], int(sys.argv[3])
try:
    p = json.loads(params)
except Exception:
    print(json.dumps({"error": "params is not valid JSON"}))
    sys.exit(1)
print(json.dumps({"topic": "actions", "op": action,
                  "payload": {"params": p, "requested_at": now}, "retain": True}))
PY
) || { echo '{"ok":false,"error":"params is not valid JSON"}'; exit 1; }
    if curl -s -m 5 -X POST "$BASE/api/topic/publish" \
        -H 'Content-Type: application/json' -d "$body" | grep -q '"ok"'; then
      echo "{\"requested\":\"$ACTION\",\"requested_at\":$now}"
    else
      echo '{"ok":false,"error":"publish_failed"}'
      exit 1
    fi
    ;;
  result)
    ACTION=$(clean "${2:-}")
    [ -n "$ACTION" ] || { echo '{"ok":false,"error":"missing action"}'; exit 1; }
    ACTION=$(op_for "$ACTION")
    out=$(curl -s -m 5 "$BASE/api/topic/latest?topic=actions&op=$ACTION-done" || true)
    if [ -z "$out" ] || [ "$out" = "null" ] || echo "$out" | grep -q 'nothing retained'; then
      echo '{"done":false,"note":"no result yet — a connected phone answers in seconds, an away phone on its next connect"}'
    else
      echo "$out"
    fi
    ;;
  *)
    echo '{"ok":false,"error":"verb must be list, request or result"}'
    exit 1
    ;;
esac
