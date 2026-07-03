#!/usr/bin/env bash
# hn-mentions.sh — registered as the FetchHNMentions tool.
#
# The HN inbox signal HN itself never sends: comments on YOUR submissions.
# HN's "threads" page only shows replies to your *comments* — a comment on
# your *story* is invisible unless you revisit the item page. This tool
# closes that gap, plus the other two inbox lanes, via the public Algolia
# API (no auth):
#   reply_to_me — new comments on your recent stories, and replies to
#                 your recent comments (parent_comment_body = your text)
#   mention     — someone wrote your username in a comment
#
# Username comes from sites.hackernews.username in config.json (Settings).
# No username → empty result (tool simply off).
#
# Arg: [hours=336] — look-back window for the comments themselves.
#
# Output (always JSON, exit 0), same shape as FetchRedditMentions:
#   { username, items:[{kind, title, body, url, author, created_iso,
#                       story_url, parent_comment_body?}], count, errors }
#
# Deps: python3 (stdlib only).

set -uo pipefail

if ! command -v python3 &>/dev/null; then
  printf '%s\n' '{"username":"","items":[],"count":0,"errors":["python3 missing"]}'
  exit 0
fi

HOURS="${1:-336}" CONFIG="$HOME/.linggen/skills/pulse/config.json" python3 <<'PY'
import html, json, os, re, sys, time, urllib.parse, urllib.request

API = "https://hn.algolia.com/api/v1"
ITEM = "https://news.ycombinator.com/item?id="

def get(url, timeout=10):
    req = urllib.request.Request(url, headers={"User-Agent": "pulse-skill/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))

def strip_html(s):
    return html.unescape(re.sub(r"<[^>]+>", " ", s or "")).strip()

def out(username="", items=None, errors=None):
    print(json.dumps({"username": username, "items": items or [],
                      "count": len(items or []), "errors": errors or []}))
    sys.exit(0)

try:
    with open(os.environ["CONFIG"]) as f:
        hn = (json.load(f).get("sites", {}).get("hackernews", {}) or {})
except Exception:
    out()

username = (hn.get("username") or "").strip().lstrip("@")
if not username:
    out()

# The engine passes the literal '{{hours}}' when the agent omits the arg.
try:
    hours = max(1, int(os.environ.get("HOURS") or 336))
except Exception:
    hours = 336
cutoff = int(time.time()) - hours * 3600
errors, items, seen = [], [], set()

def add(kind, c, story_title, story_id, parent_body=None):
    cid = str(c.get("objectID") or c.get("id") or "")
    if not cid or cid in seen or (c.get("author") or "") == username:
        return
    created = c.get("created_at_i") or 0
    if created < cutoff:
        return
    seen.add(cid)
    items.append({
        "kind": kind,
        "title": story_title or "",
        "body": strip_html(c.get("comment_text") or c.get("text") or "")[:1200],
        "url": f"{ITEM}{cid}",
        "author": c.get("author") or "",
        "created_iso": c.get("created_at") or "",
        "story_url": f"{ITEM}{story_id}" if story_id else "",
        **({"parent_comment_body": parent_body} if parent_body else {}),
    })

# ── 1. comments on own recent stories (the invisible lane) ──────────────────
try:
    q = urllib.parse.urlencode({"tags": f"story,author_{username}", "hitsPerPage": 20})
    stories = get(f"{API}/search_by_date?{q}").get("hits", []) or []
    month_old = int(time.time()) - 45 * 86400
    for s in [s for s in stories if (s.get("created_at_i") or 0) > month_old][:10]:
        sid, stitle = s.get("objectID"), s.get("title") or ""
        cq = urllib.parse.urlencode({
            "tags": f"comment,story_{sid}", "hitsPerPage": 50,
            "numericFilters": f"created_at_i>{cutoff}",
        })
        for c in get(f"{API}/search_by_date?{cq}").get("hits", []) or []:
            add("reply_to_me", c, stitle, sid)
except Exception as e:
    errors.append(f"story-comments: {e}")

# ── 2. replies to own recent comments ────────────────────────────────────────
try:
    q = urllib.parse.urlencode({"tags": f"comment,author_{username}", "hitsPerPage": 20})
    own = get(f"{API}/search_by_date?{q}").get("hits", []) or []
    month_old = int(time.time()) - 30 * 86400
    for oc in [c for c in own if (c.get("created_at_i") or 0) > month_old][:10]:
        node = get(f"{API}/items/{oc.get('objectID')}")
        for child in node.get("children", []) or []:
            add("reply_to_me", child, oc.get("story_title") or "",
                oc.get("story_id"), parent_body=strip_html(oc.get("comment_text") or "")[:400])
except Exception as e:
    errors.append(f"comment-replies: {e}")

# ── 3. username written in comments ──────────────────────────────────────────
try:
    q = urllib.parse.urlencode({
        "query": username, "tags": "comment", "hitsPerPage": 30,
        "numericFilters": f"created_at_i>{cutoff}",
    })
    pat = re.compile(rf"\b{re.escape(username)}\b", re.I)
    for c in get(f"{API}/search_by_date?{q}").get("hits", []) or []:
        if pat.search(strip_html(c.get("comment_text") or "")):
            add("mention", c, c.get("story_title") or "", c.get("story_id"))
except Exception as e:
    errors.append(f"mentions: {e}")

items.sort(key=lambda i: i.get("created_iso") or "", reverse=True)
out(username, items, errors)
PY
