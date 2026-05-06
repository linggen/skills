#!/usr/bin/env bash
# run.sh — influencer mission entry script.
#
# The mission's job is small: ensure the pulse skill's data dir
# exists (so the skill can write to it), then return. The agent prompt
# in mission.md handles dispatching to the pulse skill via the
# Skill tool.
#
# Env vars from Linggen mission scheduler:
#   MISSION_ID, MISSION_DIR, MISSION_CWD, MISSION_OUTPUT_DIR,
#   MISSION_LAST_RUN_AT, MISSION_RUN_ID

set -uo pipefail

: "${MISSION_OUTPUT_DIR:?MISSION_OUTPUT_DIR not set}"

# The pulse skill writes draft JSON to its own data dir.
PULSE_DATA="$HOME/.linggen/skills/pulse/data"
mkdir -p "$PULSE_DATA"

# Pass the data dir path to the agent via the manifest.
# The agent reads this and invokes the pulse skill.
cat > "$MISSION_OUTPUT_DIR/manifest.json" <<EOF
{
  "run_id": "${MISSION_RUN_ID:-unknown}",
  "date": "$(date +%Y-%m-%d)",
  "pulse_data_dir": "$PULSE_DATA",
  "today_output": "$PULSE_DATA/$(date +%Y-%m-%d).json"
}
EOF

echo "manifest written to $MISSION_OUTPUT_DIR/manifest.json" >&2
exit 0
