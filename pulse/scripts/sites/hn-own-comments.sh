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
import json, os, re, sys, urllib.parse, urllib.request

comments = []   # newest first: [{url, body, created_iso}] — the page counts
                # product mentions among the newest ten (self-promo budget)

def out(username="", urls=None, err=None):
    print(json.dumps({"username": username, "urls": urls or [],
                      "count": len(urls or []), "comments": comments,
                      "errors": [err] if err else []}))
    sys.exit(0)

try:
    with open(os.environ["CONFIG"]) as f:
        hn = (json.load(f).get("sites", {}).get("hackernews", {}) or {})
except Exception:
    out()

username = (hn.get("username") or "").strip().lstrip("@")
if not username:
    out()

seen, urls, errs = set(), [], []

# 1. Algolia author search — one call, gets all INDEXED comments. But Algolia
#    DROPS flagged/dead comments from its index, so a flagged reply is invisible
#    here (the Firebase pass below recovers it). Non-fatal on error.
try:
    params = urllib.parse.urlencode({"tags": f"comment,author_{username}", "hitsPerPage": 100})
    req = urllib.request.Request(
        f"https://hn.algolia.com/api/v1/search_by_date?{params}",
        headers={"User-Agent": "pulse/1.0"})
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.load(r)
    for h in data.get("hits", []) or []:
        if len(comments) < 25 and h.get("objectID"):
            comments.append({
                "url": f"https://news.ycombinator.com/item?id={h['objectID']}",
                "body": re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ",
                               h.get("comment_text") or "")).strip()[:300],
                "created_iso": h.get("created_at") or "",
            })
        sid = h.get("story_id")
        if sid and sid not in seen:
            seen.add(sid)
            urls.append(f"https://news.ycombinator.com/item?id={sid}")
except Exception as e:
    errs.append(f"algolia: {e}")

# 2. Firebase pass — the official API lists ALL my submitted items, INCLUDING
#    flagged/dead comments Algolia hides. Walk each recent comment up to its
#    root story so a flagged reply still suppresses the discovery card.
#    Bounded by a fetch budget (Firebase is free, no auth, CDN-fast).
def fb(path):
    try:
        with urllib.request.urlopen(
                f"https://hacker-news.firebaseio.com/v0/{path}.json", timeout=8) as r:
            return json.load(r)
    except Exception:
        return None

prof = fb(f"user/{username}")
budget = 60
for item_id in ((prof or {}).get("submitted") or [])[:25]:
    cur, hops = item_id, 0
    while cur is not None and hops < 6 and budget > 0:
        it = fb(f"item/{cur}")
        budget -= 1
        if not it:
            break
        if it.get("type") == "story":
            sid = it.get("id")
            if sid and sid not in seen:
                seen.add(sid)
                urls.append(f"https://news.ycombinator.com/item?id={sid}")
            break
        cur = it.get("parent")
        hops += 1
    if budget <= 0:
        break

out(username, urls, errs[0] if errs else None)
PY
