#!/bin/bash
# Ensure ling CLI is installed, then start server and check status.
set -euo pipefail

if command -v ling >/dev/null 2>&1; then
    echo "ling CLI found: $(ling --version 2>/dev/null || echo "version unknown")"
elif command -v linggen >/dev/null 2>&1; then
    echo "linggen CLI found (legacy): $(linggen --version 2>/dev/null || echo "version unknown")"
    echo "Consider upgrading: curl -fsSL https://linggen.dev/install-cli.sh | bash"
    alias ling=linggen
else
    echo "Linggen CLI not found. Installing..."
    curl -fsSL https://linggen.dev/install-cli.sh | bash
fi

CLI_CMD="ling"
command -v ling >/dev/null 2>&1 || CLI_CMD="linggen"

echo ""
echo "Running: $CLI_CMD doctor"
if ! "$CLI_CMD" doctor; then
    echo "Warning: doctor reported issues."
fi

echo ""
echo "Starting Linggen server..."
"$CLI_CMD" start

echo ""
echo "Running: $CLI_CMD status"
"$CLI_CMD" status
