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
# Output: JSON array of {sub, title, url, author, comments, age_hours,
#                        summary, mode, score}. `author` is the OP's handle
#                        (u/<name>). RSS doesn't expose comment count /
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
import json, os, re, sys, time
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

# Reddit rate-limits anon .rss hard (~10/min; bursts trip 429). Looping subs
# back-to-back let the 1st sub succeed while every later sub got 429 — which
# the old bare `except: continue` swallowed, so discovery came from ONLY the
# first sub. Space requests out + retry 429/transient with backoff so each sub
# gets a fair pull, and surface failures on stderr (never silently empty).
REQUEST_GAP = 4.0  # seconds between subs — anon .rss tolerates ~1 req/few sec

def fetch_feed(url, tries=3):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=15) as r:
                return ET.fromstring(r.read())
        except Exception as ex:
            last = ex
            if i + 1 < tries:
                time.sleep(4 * (i + 1))  # 4s, 8s backoff on 429/transient
    raise last

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

out, errors = [], []
for i, sub in enumerate(subs):
    if i:
        time.sleep(REQUEST_GAP)  # spacing so sub 2+ isn't rate-limited
    url = f"https://www.reddit.com/r/{sub}/{endpoint}"
    try:
        root = fetch_feed(url)
    except Exception as ex:
        errors.append(f"r/{sub}: {type(ex).__name__} {ex}")
        continue
    for e in root.findall("a:entry", NS):
        link_el = e.find("a:link", NS)
        href = link_el.get("href") if link_el is not None else ""
        updated = (e.findtext("a:updated", "", NS) or "").strip()
        author = (e.findtext("a:author/a:name", "", NS) or "").strip()
        author = author.split("/")[-1]  # "/u/Name" -> "Name"
        out.append({
            "sub": sub,
            "mode": mode,
            "title": (e.findtext("a:title", "", NS) or "").strip(),
            "url": href,
            "author": ("u/" + author) if author else "",
            "comments": 0,
            "score": 0,
            "age_hours": age_hours(updated),
            "summary": strip_html(e.findtext("a:content", "", NS) or "")[:600],
        })

print(json.dumps(out))
if errors:
    sys.stderr.write("[reddit.sh] " + "; ".join(errors) + "\n")
PY
