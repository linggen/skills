#!/usr/bin/env bash
# hn-own-comments.sh — the HN already-commented source.
#
# Returns the thread URLs the user has already commented in, so discovery
# never resurfaces a thread they've engaged (mirrors Reddit own_comment +
# X replied_to). Reads the user's recent HN comments via the public Algolia
# API (tags=comment,author_<username>) and maps each to its STORY url.
#
# Username comes from sites.hackernews.username in config.json (set on the
# Settings page). No username → empty list (filter simply off).
#
# Output (JSON, exit 0):
#   { username, urls:[ "https://news.ycombinator.com/item?id=<story_id>", … ],
#     count, errors }
#
# Deps: python3 (stdlib only).

set -uo pipefail

if ! command -v python3 &>/dev/null; then
  printf '%s\n' '{"username":"","urls":[],"count":0,"errors":["python3 missing"]}'
  exit 0
fi

CONFIG="$HOME/.linggen/skills/pulse/config.json" python3 <<'PY'
import json, os, sys, urllib.parse, urllib.request

def out(username="", urls=None, err=None):
    print(json.dumps({"username": username, "urls": urls or [],
                      "count": len(urls or []), "errors": [err] if err else []}))
    sys.exit(0)

try:
    with open(os.environ["CONFIG"]) as f:
        hn = (json.load(f).get("sites", {}).get("hackernews", {}) or {})
except Exception:
    out()

username = (hn.get("username") or "").strip().lstrip("@")
if not username:
    out()

params = urllib.parse.urlencode({
    "tags": f"comment,author_{username}",
    "hitsPerPage": 100,
})
url = f"https://hn.algolia.com/api/v1/search_by_date?{params}"
try:
    req = urllib.request.Request(url, headers={"User-Agent": "pulse/1.0"})
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.load(r)
except Exception as e:
    out(username, err=f"HN own-comments fetch failed: {e}")

seen, urls = set(), []
for h in data.get("hits", []) or []:
    sid = h.get("story_id")
    if sid and sid not in seen:
        seen.add(sid)
        urls.append(f"https://news.ycombinator.com/item?id={sid}")

out(username, urls)
PY
