#!/bin/bash
# Search for skills via skills.sh (GitHub-based registry).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

QUERY="$*"
if [ -z "$QUERY" ]; then
    echo "Usage: $0 <skill name or keyword>"
    exit 1
fi

echo "## Skills matching: $QUERY"
echo ""

ENC_QUERY=$(python3 - "$QUERY" <<'PY'
import sys, urllib.parse
print(urllib.parse.quote(sys.argv[1], safe=""))
PY
)

SKILLS_SH_RESPONSE=$(curl -s -X GET "$SKILLS_SH_URL?q=$ENC_QUERY&limit=20" | tr -d '\000')
if [ $? -ne 0 ]; then
    echo "Error: Could not connect to skills.sh at $SKILLS_SH_URL"
    exit 1
fi
if ! echo "$SKILLS_SH_RESPONSE" | jq -e . >/dev/null 2>&1; then
    echo "Error: skills.sh returned invalid JSON"
    exit 1
fi

echo "$SKILLS_SH_RESPONSE" | jq -r '
    def skills:
        if type=="array" then .
        elif type=="object" and (.skills|type=="array") then .skills
        elif type=="object" and (.results|type=="array") then .results
        elif type=="object" and (.data|type=="array") then .data
        else []
        end;
    skills
    | .[0:20]
    | if length == 0 then
        "No matching skills found."
      else
        .[] | "### \(.name // .id)\n- URL: https://github.com/\(.topSource)\n- Skill: \(.id)\n- Installs: \(.installs)\n"
      end
'

# Also try local library packs if server is running
LIB_RESPONSE=$(curl -s -X GET "$API_URL/api/library" 2>/dev/null | tr -d '\000' || true)
if [ -n "$LIB_RESPONSE" ] && echo "$LIB_RESPONSE" | jq -e . >/dev/null 2>&1; then
    PACK_MATCHES=$(echo "$LIB_RESPONSE" | jq -r --arg q "$QUERY" '
        def packs:
            if type=="array" then .
            elif type=="object" and (.packs|type=="array") then .packs
            else []
            end;
        def q: ($q | ascii_downcase);
        def match(s): (s | tostring | ascii_downcase | contains(q));
        packs
        | map(select(
            ((.folder // "") | ascii_downcase | contains("skills")) or
            ((.id // "") | ascii_downcase | contains("/skills/"))
        ))
        | map(select(
            match(.name // "") or match(.id // "") or match(.description // "")
        ))
        | .[0:10]
        | if length == 0 then
            ""
          else
            .[] | "### \(.name)\n- ID: \(.id)\n- Folder: \(.folder // "root")\n- Description: \(.description // "No description")\n"
          end
    ')
    if [ -n "$PACK_MATCHES" ]; then
        echo ""
        echo "## Local Library Packs matching: $QUERY"
        echo ""
        echo "$PACK_MATCHES"
    fi
fi
