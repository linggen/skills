#!/bin/bash
# Live readings for the System tab's top row — one call, about 1–2 s.
#
# Prints one JSON object of raw lines, not numbers: the page parses them with
# the same parsers the full scan uses (scan.js), so a live figure and a scan
# figure for the same reading can never disagree by parse. Fields:
#   cpu       the second "CPU usage" line of a two-sample `top` (the first
#             sample is a since-boot average, not now)
#   memsize   hw.memsize in bytes
#   vm        vm_stat (page size + page counts)
#   pressure  kern.memorystatus_vm_pressure_level (1 normal, 2 warn, 4 critical)
#   df        `df -k` of the data volume (1024-byte blocks)
#   batt      `pmset -g batt` — no InternalBattery line on a desktop Mac
#   iostat    header + the second one-second sample of `iostat -d`
#   iface     the default route's interface
#   net       `netstat -ibn` header + that interface's Link row (byte counters)
# GPU, the health score and battery cycles stay on the full scan.

export LC_ALL=C
tmp=$(mktemp -d /tmp/shifu-live.XXXXXX) || exit 1
trap 'rm -rf "$tmp"' EXIT

# The two one-second samplers run side by side; everything else is instant.
top -l 2 -n 0 -s 1 2>/dev/null | grep "CPU usage" | tail -1 > "$tmp/cpu" &
iostat -d -c 2 -w 1 2>/dev/null | sed -n '1,2p;4p' > "$tmp/iostat" &

memsize=$(sysctl -n hw.memsize 2>/dev/null)
vm=$(vm_stat 2>/dev/null)
pressure=$(sysctl -n kern.memorystatus_vm_pressure_level 2>/dev/null)
df_out=$(df -k /System/Volumes/Data 2>/dev/null || df -k /)
batt=$(pmset -g batt 2>/dev/null)
wait

# Byte counters last, so they are read as close to the reply as possible —
# the page times its rate from when the reply lands.
iface=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
net=""
[ -n "$iface" ] && net=$(netstat -ibn -I "$iface" 2>/dev/null | awk 'NR==1 || /<Link/' | head -2)

# A JSON string from raw text: escape \, ", tab, and join lines with \n.
json_str() {
  printf '%s' "$1" | awk 'BEGIN { ORS = ""; printf "\"" }
    { gsub(/\\/, "\\\\"); gsub(/"/, "\\\""); gsub(/\t/, "\\t"); if (NR > 1) printf "%s", "\\n"; print }
    END { printf "\"" }'
}

printf '{"cpu":%s,"memsize":%s,"vm":%s,"pressure":%s,"df":%s,"batt":%s,"iostat":%s,"iface":%s,"net":%s}\n' \
  "$(json_str "$(cat "$tmp/cpu")")" \
  "$(json_str "$memsize")" \
  "$(json_str "$vm")" \
  "$(json_str "$pressure")" \
  "$(json_str "$df_out")" \
  "$(json_str "$batt")" \
  "$(json_str "$(cat "$tmp/iostat")")" \
  "$(json_str "$iface")" \
  "$(json_str "$net")"
