#!/usr/bin/env bash
# rss.sh — registered as the FetchRSS tool.
#
# Fetches each RSS/Atom feed listed in
# ~/.linggen/skills/composer/config.json under sites.rss.feeds.
# Output: JSON array of {feed, title, url, summary, date}.
# The agent filters by today's themes after this runs.

set -uo pipefail

CONFIG="$HOME/.linggen/skills/composer/config.json"
if [[ ! -f "$CONFIG" ]]; then
  echo "[]"
  exit 0
fi

feeds=$(jq -r '.sites.rss.feeds[]?' "$CONFIG" 2>/dev/null)
if [[ -z "$feeds" ]]; then
  echo "[]"
  exit 0
fi

parse_one() {
  local feed_url="$1"
  local xml
  xml=$(curl -fsS --max-time 10 -A "linggen-composer/0.1" "$feed_url" 2>/dev/null) || return 0

  python3 - "$xml" "$feed_url" <<'PY' 2>/dev/null
import sys, json, xml.etree.ElementTree as ET
xml_text, feed_url = sys.argv[1], sys.argv[2]
try:
    root = ET.fromstring(xml_text)
except Exception:
    print("[]")
    sys.exit(0)

items = []
# RSS 2.0 — items live anywhere under <channel>
for item in root.iter("item"):
    items.append({
        "feed": feed_url,
        "title": (item.findtext("title") or "").strip(),
        "url": (item.findtext("link") or "").strip(),
        "summary": (item.findtext("description") or "").strip()[:500],
        "date": (item.findtext("pubDate") or "").strip(),
    })

# Atom
ns = {"a": "http://www.w3.org/2005/Atom"}
for entry in root.findall("a:entry", ns):
    link_el = entry.find("a:link", ns)
    href = link_el.get("href") if link_el is not None else ""
    items.append({
        "feed": feed_url,
        "title": (entry.findtext("a:title", default="", namespaces=ns) or "").strip(),
        "url": href.strip(),
        "summary": (entry.findtext("a:summary", default="", namespaces=ns) or "").strip()[:500],
        "date": (entry.findtext("a:published", default="", namespaces=ns) or "").strip(),
    })

print(json.dumps(items[:25]))
PY
}

(
  for feed in $feeds; do
    parse_one "$feed"
  done
) | jq -s 'add // []' 2>/dev/null || echo "[]"
