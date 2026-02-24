#!/bin/bash
# Start the Linggen Memory server if not already running.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# Check if already running
if curl -sf "$API_URL/api/status" >/dev/null 2>&1; then
    echo "Memory server already running at $API_URL"
    curl -s "$API_URL/api/status" | jq -r '"Status: \(.status)"' 2>/dev/null || true
    exit 0
fi

# Try ling-mem first (standalone binary)
if command -v ling-mem >/dev/null 2>&1; then
    echo "Starting memory server via ling-mem..."
    ling-mem serve --daemon
    echo "Memory server started at $API_URL"
    exit 0
fi

# Try ling (Linggen Agent) as fallback
if command -v ling >/dev/null 2>&1; then
    echo "Starting memory server via ling..."
    ling memory start
    echo "Memory server started at $API_URL"
    exit 0
fi

# Neither found — guide the user
echo "Error: Neither ling-mem nor ling found in PATH."
echo ""
echo "Install ling-mem (standalone):"
echo "  curl -fsSL https://linggen.dev/install-mem.sh | bash"
echo ""
echo "Or install ling (Linggen Agent, includes memory management):"
echo "  curl -fsSL https://linggen.dev/install-cli.sh | bash"
exit 1
