#!/usr/bin/env bash
# reddit.sh — registered as the FetchReddit tool.
#
# Fetches newest threads from each subreddit in sites.reddit.subs.
#
# Reddit closed self-service Data API access (Nov 2025) and bot-walls the
# `.json` endpoints (403), but the public `.rss` feeds still work over
# plain HTTPS with no auth. So we read `/r/<sub>/<mode>.rss` and parse the
# Atom feed instead of the old `.json`.
#
# Modes:
#   bash reddit.sh             # /new.rss (default — newest threads)
#   bash reddit.sh --rising    # /rising.rss
#   bash reddit.sh --top       # /top.rss?t=day
#
# Output: JSON array of {sub, title, url, comments, age_hours, summary,
#                        mode, score}. RSS doesn't expose comment count /
#                        score, so those are 0; the agent scores by
#                        title/summary relevance anyway.
#
# Deps: python3 (stdlib only).

set -uo pipefail

MODE="new"
for arg in "$@"; do
  case "$arg" in
    --rising) MODE="rising" ;;
    --top)    MODE="top"    ;;
    --new)    MODE="new"    ;;
  esac
done

CONFIG="$HOME/.linggen/skills/pulse/config.json"
if ! command -v python3 &>/dev/null || [ ! -f "$CONFIG" ]; then
  echo "[]"
  exit 0
fi

CONFIG="$CONFIG" MODE="$MODE" python3 <<'PY'
import json, os, re, sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

cfg = json.load(open(os.environ["CONFIG"]))
mode = os.environ.get("MODE", "new")
reddit = (cfg.get("sites") or {}).get("reddit") or {}
subs = [s for s in (reddit.get("subs") or []) if s]
if not subs:
    print("[]"); sys.exit(0)

UA = "pulse/0.1 (public-rss; reddit-discovery)"
NS = {"a": "http://www.w3.org/2005/Atom"}
endpoint = f"{mode}.rss?limit=25" + ("&t=day" if mode == "top" else "")

def strip_html(s):
    s = re.sub(r"(?is)<(script|style).*?>.*?</\1>", "", s or "")
    s = re.sub(r"(?s)<[^>]+>", " ", s)
    for a, b in [("&amp;","&"),("&lt;","<"),("&gt;",">"),("&quot;",'"'),("&#39;","'"),("&nbsp;"," ")]:
        s = s.replace(a, b)
    return re.sub(r"\s+", " ", s).strip()

def age_hours(iso):
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return int((datetime.now(timezone.utc) - dt).total_seconds() // 3600)
    except Exception:
        return None

out = []
for sub in subs:
    url = f"https://www.reddit.com/r/{sub}/{endpoint}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=15) as r:
            root = ET.fromstring(r.read())
    except Exception:
        continue
    for e in root.findall("a:entry", NS):
        link_el = e.find("a:link", NS)
        href = link_el.get("href") if link_el is not None else ""
        updated = (e.findtext("a:updated", "", NS) or "").strip()
        out.append({
            "sub": sub,
            "mode": mode,
            "title": (e.findtext("a:title", "", NS) or "").strip(),
            "url": href,
            "comments": 0,
            "score": 0,
            "age_hours": age_hours(updated),
            "summary": strip_html(e.findtext("a:content", "", NS) or "")[:600],
        })

print(json.dumps(out))
PY
