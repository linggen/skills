#!/bin/bash

# Default Linggen Memory API URL (used for library packs)
API_URL=${LINGGEN_API_URL:-"http://localhost:8787"}

# Skills registry URLs
REGISTRY_URL=${LINGGEN_SKILLS_REGISTRY_URL:-"https://linggen-analytics.liangatbc.workers.dev"}
REGISTRY_LIMIT=${LINGGEN_SKILLS_REGISTRY_LIMIT:-200}
REGISTRY_API_KEY=${LINGGEN_SKILLS_REGISTRY_API_KEY:-}
REGISTRY_INSTALLER=${LINGGEN_SKILLS_REGISTRY_INSTALLER:-"linggen-skill"}
REGISTRY_INSTALLER_VERSION=${LINGGEN_SKILLS_REGISTRY_INSTALLER_VERSION:-"1.0.0"}
SKILLS_SH_URL=${LINGGEN_SKILLS_SH_URL:-"https://skills.sh/api/search"}

# Try to load workspace-level override if it exists.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../../../../" && pwd)"

if [ -f "$WORKSPACE_ROOT/.linggen/config" ]; then
    source "$WORKSPACE_ROOT/.linggen/config"
    API_URL=${LINGGEN_API_URL:-$API_URL}
fi

export API_URL REGISTRY_URL REGISTRY_LIMIT REGISTRY_API_KEY REGISTRY_INSTALLER REGISTRY_INSTALLER_VERSION SKILLS_SH_URL WORKSPACE_ROOT
