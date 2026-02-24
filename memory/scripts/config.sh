#!/bin/bash

# Default Linggen Memory API URL
API_URL=${LINGGEN_API_URL:-"http://localhost:8787"}

# Try to load workspace-level override if it exists.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../../../../" && pwd)"

if [ -f "$WORKSPACE_ROOT/.linggen/config" ]; then
    source "$WORKSPACE_ROOT/.linggen/config"
    API_URL=${LINGGEN_API_URL:-$API_URL}
fi

export API_URL
