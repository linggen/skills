#!/bin/bash
# Install a skill from skills.sh (GitHub-based registry).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

QUERY="$*"
if [ -z "$QUERY" ]; then
    echo "Usage: $0 <skill name or keyword>"
    exit 1
fi

ENC_QUERY=$(python3 - "$QUERY" <<'PY'
import sys, urllib.parse
print(urllib.parse.quote(sys.argv[1], safe=""))
PY
)

SKILLS_SH_RESPONSE=$(curl -s -X GET "$SKILLS_SH_URL?q=$ENC_QUERY&limit=10" | tr -d '\000')
if [ $? -ne 0 ]; then
    echo "Error: Could not connect to skills.sh at $SKILLS_SH_URL"
    exit 1
fi
if ! echo "$SKILLS_SH_RESPONSE" | jq -e . >/dev/null 2>&1; then
    echo "Error: skills.sh returned invalid JSON"
    exit 1
fi

TMP_JSON=$(mktemp)
echo "$SKILLS_SH_RESPONSE" > "$TMP_JSON"

PY_SCRIPT=$(mktemp)
cat > "$PY_SCRIPT" <<'PY'
import json
import sys

query = sys.argv[1].lower()
path = sys.argv[2]
target = (sys.argv[3] if len(sys.argv) > 3 else "").lower().strip()

with open(path, "r", encoding="utf-8", errors="ignore") as f:
    data = json.load(f)

skills = data.get("skills") or data.get("results") or data.get("data") or []

def match(s: str) -> bool:
    return query in (s or "").lower()

matches = [
    s for s in skills
    if match(s.get("id", "")) or match(s.get("name", "")) or match(s.get("topSource", ""))
]

selected = None
if target:
    for s in matches:
        if (s.get("id") or "").lower() == target or (s.get("name") or "").lower() == target:
            selected = s
            break

if not selected and matches:
    selected = matches[0]

if not selected:
    print("", end="")
    sys.exit(0)

repo_url = f"https://github.com/{selected.get('topSource', '')}".strip()
print(json.dumps({
    "skill": selected.get("id"),
    "url": repo_url,
    "ref": "main",
    "display_name": selected.get("name") or selected.get("id")
}))
PY

TARGET_NAME=${LINGGEN_SKILL_NAME:-}
SELECTED_JSON=$(python3 "$PY_SCRIPT" "$QUERY" "$TMP_JSON" "$TARGET_NAME")

rm -f "$TMP_JSON" "$PY_SCRIPT"

if [ -z "$SELECTED_JSON" ]; then
    echo "No matching skill found for: $QUERY"
    exit 0
fi

if ! echo "$SELECTED_JSON" | jq -e . >/dev/null 2>&1; then
    echo "Error: Invalid selection data."
    exit 1
fi

SKILL_NAME=$(echo "$SELECTED_JSON" | jq -r '.skill // empty')
SKILL_URL=$(echo "$SELECTED_JSON" | jq -r '.url // empty')
SKILL_REF=$(echo "$SELECTED_JSON" | jq -r '.ref // "main"')

if [ -z "$SKILL_NAME" ] || [ -z "$SKILL_URL" ]; then
    echo "Error: Selected skill is missing required fields."
    exit 1
fi

URL_CLEAN=$(echo "$SKILL_URL" | sed -e 's/\.git$//' -e 's/\/$//')
REPO_PATH=$(echo "$URL_CLEAN" | sed -e 's#^https://github.com/##')
OWNER=$(echo "$REPO_PATH" | cut -d'/' -f1)
REPO=$(echo "$REPO_PATH" | cut -d'/' -f2)

if [ -z "$OWNER" ] || [ -z "$REPO" ]; then
    echo "Error: Invalid GitHub URL: $SKILL_URL"
    exit 1
fi

ZIP_URL="https://codeload.github.com/$OWNER/$REPO/zip/$SKILL_REF"
TMP_ZIP=$(mktemp)

spinner() {
    local pid="$1"
    local msg="$2"
    local spin='|/-\\'
    local i=0
    printf "%s " "$msg"
    while kill -0 "$pid" 2>/dev/null; do
        i=$(( (i + 1) % 4 ))
        printf "\b%s" "${spin:$i:1}"
        sleep 0.1
    done
    printf "\b done\n"
}

curl -s -L -o "$TMP_ZIP" "$ZIP_URL" &
DL_PID=$!
spinner "$DL_PID" "Downloading skill archive"
wait "$DL_PID"
if [ $? -ne 0 ] || [ ! -s "$TMP_ZIP" ]; then
    echo "Error: Failed to download $ZIP_URL"
    rm -f "$TMP_ZIP"
    exit 1
fi

TARGET_DIR="$WORKSPACE_ROOT/.claude/skills/$SKILL_NAME"
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"

PY_EXTRACT=$(mktemp)
cat > "$PY_EXTRACT" <<'PY'
import os
import sys
import zipfile

zip_path = sys.argv[1]
skill_name = sys.argv[2]
target_dir = sys.argv[3]

with zipfile.ZipFile(zip_path, "r") as zf:
    entries = zf.namelist()
    skill_root = None
    for name in entries:
        lower = name.lower()
        if (lower.endswith("/skill.md") or lower.endswith("/skill.md".lower())) and f"/{skill_name}/" in lower:
            skill_root = os.path.dirname(name)
            break
        if (name.endswith("/SKILL.md") or name.endswith("/skill.md")) and f"/{skill_name}/" in name:
            skill_root = os.path.dirname(name)
            break

    if not skill_root:
        raise SystemExit(f"Could not find skill '{skill_name}' in the repository (missing SKILL.md).")

    prefix = skill_root + "/"
    for name in entries:
        if not name.startswith(prefix):
            continue
        if name.endswith("/"):
            continue
        rel = name[len(prefix):]
        if not rel or ".." in rel or rel.startswith("/"):
            continue
        dest = os.path.join(target_dir, rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with zf.open(name) as src, open(dest, "wb") as dst:
            dst.write(src.read())
PY

python3 "$PY_EXTRACT" "$TMP_ZIP" "$SKILL_NAME" "$TARGET_DIR" &
EX_PID=$!
spinner "$EX_PID" "Extracting skill files"
wait "$EX_PID"
RESULT=$?

rm -f "$TMP_ZIP" "$PY_EXTRACT"

if [ $RESULT -ne 0 ]; then
    echo "Error: Failed to extract skill. Ensure the repo contains $SKILL_NAME/SKILL.md."
    exit 1
fi

echo "Skill installed to .claude/skills/$SKILL_NAME"
