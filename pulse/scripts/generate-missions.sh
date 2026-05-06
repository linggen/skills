#!/usr/bin/env bash
# generate-missions.sh — write one mission per enabled saved_run.
#
# Reads ~/.linggen/skills/pulse/config.json, finds entries in
# `saved_runs[]` where `enabled=true` AND `cadence` is non-empty, and
# generates a mission directory at ~/.linggen/missions/pulse-<id>/
# with mission.md (cron-scheduled) and scripts/run.sh.
#
# Idempotent: existing mission dirs whose saved_run is gone or now
# disabled are removed; existing dirs for still-enabled runs are
# rewritten in place.
#
# Called by install.sh on every install. Also called by the Settings
# page after editing saved_runs (via /api/bash) so changes take
# effect without re-running install.sh.

set -uo pipefail

LINGGEN_DIR="$HOME/.linggen"
SKILL_DIR="$LINGGEN_DIR/skills/pulse"
MISSIONS_DIR="$LINGGEN_DIR/missions"
CONFIG="$SKILL_DIR/config.json"

if [[ ! -f "$CONFIG" ]]; then
  echo "[generate-missions] config.json missing at $CONFIG; nothing to do" >&2
  exit 0
fi

# Compose the desired set of mission ids from enabled saved_runs.
desired_ids="$(jq -r '
  (.saved_runs // [])[]?
  | select(.enabled == true and (.cadence // "") != "")
  | .id
' "$CONFIG" 2>/dev/null)"

# Remove pulse-* mission dirs that are no longer desired.
if [[ -d "$MISSIONS_DIR" ]]; then
  for d in "$MISSIONS_DIR"/pulse-*; do
    [[ -d "$d" ]] || continue
    name="$(basename "$d")"
    id="${name#pulse-}"
    if ! grep -qx "$id" <<<"$desired_ids"; then
      rm -rf "$d"
      echo "  removed stale mission: $name"
    fi
  done
fi

# Generate a mission per desired id.
generate_one() {
  local entry="$1"
  local id name goal cadence
  id="$(echo "$entry"      | jq -r '.id')"
  name="$(echo "$entry"    | jq -r '.name')"
  goal="$(echo "$entry"    | jq -r '.goal')"
  cadence="$(echo "$entry" | jq -r '.cadence')"

  local mdir="$MISSIONS_DIR/pulse-$id"
  mkdir -p "$mdir/scripts"

  # Escape goal for embedding inside the dispatch line. Newlines and
  # quotes get stripped — saved-run goals are short prompts; carriage
  # returns and stray quotes don't belong in a shell-friendly id pass.
  local goal_esc
  goal_esc="$(printf '%s' "$goal" | tr -d '\r' | tr '\n' ' ' | sed 's/"/\\"/g')"

  cat > "$mdir/mission.md" <<EOF
---
name: pulse-$id
description: >-
  Pulse saved run "$name" — runs on cron $cadence. Dispatches the
  pulse skill with the goal recorded in config.saved_runs.
schedule: "$cadence"
enabled: true
cwd: ~/.linggen
entry: scripts/run.sh
allow-skills: [pulse]
requires: [pulse]
allowed-tools:
  - Skill
  - Bash
  - Read
  - Notify
permission:
  mode: admin
  paths:
    - ~/.linggen
    - ~/.claude/projects
    - ~/workspace
  warning: >-
    Triggers Pulse with the saved run "$name". Pulse reads sessions
    from \\\`~/.claude/projects\\\` and \\\`~/.linggen/sessions\\\`,
    git logs from \\\`~/workspace\\\` repos, and ling-mem rows. Writes
    body_patches into the day's session JSON. Does NOT post to any
    external service.
---

You are Ling, running Pulse's saved run **"$name"**.

## Steps

1. **Invoke the pulse skill** with the saved-run goal:

   \\\`\\\`\\\`
   Skill("pulse", "Run saved goal id=$id")
   \\\`\\\`\\\`

   Pulse reads its config to resolve the goal text + targets, runs
   the goal-dispatch protocol, emits body_patches into today's
   session, and returns a one-line status.

2. **Read the skill's status return** — exactly one of:
   - \\\`body_patches: N · drafts: M\\\` (success)
   - \\\`skipped: <reason>\\\` (no signal earned output)

3. **Fire one notification** via \\\`Notify\\\`:
   - On success: title *"Pulse — $name"*, body the status line,
     deep-link \\\`/skills/pulse/?source=mission\\\` so opening the
     link only displays existing data and never spawns a fresh run.
   - On skip: title *"Pulse — nothing to do"*, body the skip reason.

4. **Final agent message** — exactly one line: pulse's status verbatim.

## Hard rules

- DO NOT do drafting work in this mission. Pulse owns that.
- DO NOT call any posting API. Drafts and comments stay on disk; the
  user posts manually after reviewing.
EOF

  cat > "$mdir/scripts/run.sh" <<EOF
#!/usr/bin/env bash
# Mission entry for the "pulse-$id" saved run. Just stamps a manifest
# so the agent can find it; the actual dispatch happens in mission.md
# via the Skill tool.
set -uo pipefail
: "\${MISSION_OUTPUT_DIR:?MISSION_OUTPUT_DIR not set}"
cat > "\$MISSION_OUTPUT_DIR/manifest.json" <<JSON
{
  "saved_run_id": "$id",
  "saved_run_name": "$name",
  "cadence": "$cadence",
  "run_id": "\${MISSION_RUN_ID:-unknown}",
  "date": "\$(date +%Y-%m-%d)"
}
JSON
echo "manifest written" >&2
exit 0
EOF
  chmod +x "$mdir/scripts/run.sh"
  echo "  generated mission: pulse-$id (cron: $cadence)"
}

if [[ -n "$desired_ids" ]]; then
  jq -c '(.saved_runs // [])[]? | select(.enabled == true and (.cadence // "") != "")' "$CONFIG" \
    | while IFS= read -r entry; do
        generate_one "$entry"
      done
fi

echo "[generate-missions] done"
