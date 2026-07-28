#!/usr/bin/env bash
# Security check. Output is plain text the agent parses.

set -u
echo "=== GATEKEEPER ==="
spctl --status 2>/dev/null

echo "=== SIP ==="
csrutil status 2>/dev/null

echo "=== FIREWALL ==="
/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null

echo "=== FILEVAULT ==="
fdesetup status 2>/dev/null

echo "=== OPEN_PORTS ==="
lsof -iTCP -sTCP:LISTEN -nP 2>/dev/null | tail -n +2 | head -20

echo "=== REMOTE_LOGIN ==="
systemsetup -getremotelogin 2>/dev/null
