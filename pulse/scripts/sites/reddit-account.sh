#!/usr/bin/env bash
# reddit-account.sh — page-side data source for the Reddit tab dashboard
# (NOT a SKILL.md tool; the agent never calls it — same pattern as
# hn-account.sh).
#
# Post-lockdown Reddit exposes NO karma/scores/comment counts anonymously —
# the only honest account signal left is the user's own public RSS feeds:
#   /user/<u>/comments.rss   — own comments (title, sub, link, timestamp)
#   /user/<u>/submitted.rss  — own posts
# Each feed returns the ~25 newest items; that bounds every count here.
#
# Output (JSON, exit 0):
#   { "username": "...",
#     "comments": [ { "sub","title","url","created_iso" }, … ],
#     "posts":    [ { "sub","title","url","created_iso" }, … ],
#     "errors":   [ "..." ] }        # e.g. rate-limited feeds — fail soft
#
# Deps: python3 stdlib only (urllib + xml).

set -uo pipefail

if ! command -v python3 &>/dev/null; then
  echo '{"username":"","comments":[],"posts":[],"errors":["python3 missing"]}'
  exit 0
fi

CONFIG="$HOME/.linggen/skills/pulse/config.json" \
CACHE="$HOME/.linggen/skills/pulse/state/reddit-account-cache.json" python3 <<'PY'
import json, os, re, urllib.request
import xml.etree.ElementTree as ET

UA = "linggen-pulse/0.1 (reddit-account)"
NS = {"a": "http://www.w3.org/2005/Atom"}
CACHE = os.environ.get("CACHE", "")

def out(username, comments, posts, errors):
    print(json.dumps({
        "username": username, "comments": comments,
        "posts": posts, "errors": errors,
    }))
    raise SystemExit(0)

username = ""
try:
    cfg = json.load(open(os.environ["CONFIG"]))
    username = ((cfg.get("sites") or {}).get("reddit") or {}).get("username") or ""
    username = username.strip().lstrip("u/").lstrip("/")
except Exception:
    pass
if not username:
    out("", [], [], ["sites.reddit.username not set"])

errors = []

def feed(kind):
    url = f"https://www.reddit.com/user/{username}/{kind}.rss?limit=25"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=12) as r:
            body = r.read()
        if not body.strip():
            errors.append(f"{kind}.rss returned empty (likely rate-limited)")
            return []
        root = ET.fromstring(body)
    except Exception as e:
        errors.append(f"{kind}.rss failed: {e}")
        return []
    items = []
    for e in root.findall("a:entry", NS):
        cat = e.find("a:category", NS)
        link = e.find("a:link", NS)
        title = (e.findtext("a:title", "", NS) or "").strip()
        # Comment titles read "/u/<name> on <thread title>" — keep the thread.
        title = re.sub(rf"^/u/{re.escape(username)} on ", "", title)
        items.append({
            "sub": (cat.get("label") if cat is not None else "") or "",
            "title": title,
            "url": (link.get("href") if link is not None else "") or "",
            "created_iso": (e.findtext("a:updated", "", NS) or "").strip(),
        })
    return items

comments = feed("comments")
posts = feed("submitted")

# Reddit's anonymous rate limit trips easily; a 429'd load would render an
# all-zero dashboard. Keep the last good fetch on disk and serve it (flagged
# stale) whenever the live comments feed fails — stale-but-real beats zeros.
if comments:
    try:
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        json.dump({"username": username, "comments": comments, "posts": posts},
                  open(CACHE, "w"))
    except Exception:
        pass
elif errors and CACHE and os.path.exists(CACHE):
    try:
        c = json.load(open(CACHE))
        if c.get("username") == username and c.get("comments"):
            errors.append("showing cached data from the last good fetch")
            out(username, c["comments"], posts or c.get("posts") or [], errors)
    except Exception:
        pass

out(username, comments, posts, errors)
PY
