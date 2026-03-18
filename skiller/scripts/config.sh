#!/bin/bash

# Default Linggen Memory API URL (used for library packs)
API_URL=${LINGGEN_API_URL:-"http://localhost:8787"}

# Skills search via skills.sh (GitHub-based registry)
SKILLS_SH_URL=${LINGGEN_SKILLS_SH_URL:-"https://skills.sh/api/search"}

# ClawHub registry
CLAWHUB_URL=${LINGGEN_CLAWHUB_URL:-"https://clawhub.ai/api/v1"}

# Try to load workspace-level override if it exists.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../../../../" && pwd)"

if [ -f "$WORKSPACE_ROOT/.linggen/config" ]; then
    source "$WORKSPACE_ROOT/.linggen/config"
    API_URL=${LINGGEN_API_URL:-$API_URL}
fi

export API_URL SKILLS_SH_URL CLAWHUB_URL WORKSPACE_ROOT
