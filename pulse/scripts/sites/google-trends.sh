#!/usr/bin/env bash
# google-trends.sh — registered as the FetchGoogleTrendsDaily tool.
#
# Fetches today's trending searches in a region (default US) from
# Google Trends' public daily RSS endpoint. Free, no auth, no API key.
# Reads ~/.linggen/skills/pulse/config.json for the region.
#
# Output: JSON array of {title, traffic, source, news_url, age_hours}.

set -uo pipefail

CONFIG="$HOME/.linggen/skills/pulse/config.json"
REGION="US"
if [[ -f "$CONFIG" ]]; then
  REGION_CFG="$(jq -r '.sites["google-trends"].region // empty' "$CONFIG" 2>/dev/null)"
  [[ -n "$REGION_CFG" ]] && REGION="$REGION_CFG"
fi

URL="https://trends.google.com/trending/rss?geo=${REGION}"

xml="$(curl -fsS --max-time 15 -A "linggen-pulse/0.1" "$URL" 2>/dev/null)" || {
  echo "[]"
  exit 0
}

python3 - "$xml" <<'PY' 2>/dev/null || echo "[]"
import sys, json, xml.etree.ElementTree as ET
from datetime import datetime, timezone
ns = {"ht": "https://trends.google.com/trending/rss"}
try:
    root = ET.fromstring(sys.argv[1])
except Exception:
    print("[]")
    sys.exit(0)
out = []
now = datetime.now(timezone.utc)
for item in root.iter("item"):
    title = (item.findtext("title") or "").strip()
    pub = (item.findtext("pubDate") or "").strip()
    age_hours = None
    if pub:
        try:
            dt = datetime.strptime(pub, "%a, %d %b %Y %H:%M:%S %z")
            age_hours = int((now - dt).total_seconds() // 3600)
        except Exception:
            pass
    traffic = (item.findtext("ht:approx_traffic", default="", namespaces=ns) or "").strip()
    news_url = ""
    news_items = item.findall("ht:news_item", ns)
    if news_items:
        link_el = news_items[0].find("ht:news_item_url", ns)
        if link_el is not None and link_el.text:
            news_url = link_el.text.strip()
    out.append({
        "title": title,
        "traffic": traffic,
        "source": "google-trends",
        "news_url": news_url,
        "age_hours": age_hours,
    })
print(json.dumps(out[:25]))
PY
