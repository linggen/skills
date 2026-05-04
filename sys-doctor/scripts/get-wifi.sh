#!/usr/bin/env bash
# Get the current Wi-Fi SSID, with a fallback chain for macOS 14+ where
# `networksetup -getairportnetwork` started returning "You are not
# associated with an AirPort network" even when on Wi-Fi.
# Output (when found): the line `Current Wi-Fi Network: <ssid>` so the
# existing parser in scan.js keeps working unchanged.
set -u
iface=$(route -n get default 2>/dev/null | awk '/interface:/ {print $2}')
iface="${iface:-en0}"

# Primary: networksetup (works on older macOS).
ssid=$(networksetup -getairportnetwork "$iface" 2>/dev/null | sed -n 's/^Current Wi-Fi Network: //p')

# Fallback: ipconfig getsummary (works without Location Services permission).
if [ -z "$ssid" ]; then
  ssid=$(ipconfig getsummary "$iface" 2>/dev/null \
    | awk -F ' : ' '/ SSID/ {gsub(/^[[:space:]]+|[[:space:]]+$/,"",$2); print $2; exit}')
fi

# macOS 14+ returns the literal string "<redacted>" instead of the SSID
# unless the daemon has been granted Location Services permission. Don't
# pass that through to the dashboard — it confuses users into thinking
# something's broken. Treat it as "unknown" and let the renderer show
# "Connected" with the IP.
if [ -n "$ssid" ] && [ "$ssid" != "<redacted>" ]; then
  echo "Current Wi-Fi Network: $ssid"
fi
