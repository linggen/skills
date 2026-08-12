#!/usr/bin/env bash
# reddit-thread.sh — registered as the FetchRedditThread tool.
#
# Pulls one thread's OP + comments via Reddit's PUBLIC `.rss` feed
# (`/comments/<id>/.rss`) — no auth (Reddit closed the .json API Nov
# 2025, but comment RSS still works). Used by discover-customers to read
# the actual discussion before drafting a comment-starter, instead of
# guessing from the thread title alone.
#
# Usage:
#   reddit-thread.sh <thread-url-or-id>
#   e.g. reddit-thread.sh https://www.reddit.com/r/macapps/comments/1tkfpke/slug/
#        reddit-thread.sh 1tkfpke
#
# Output (JSON, exit 0):
#   { thread_url, thread_title,
#     op:       {author, body, url, age_hours},
#     comments: [{author, body, url, age_hours}],   # cap 25
#     errors:   [...] }
#
# Deps: python3 (stdlib only).

set -uo pipefail

# The engine passes the literal '{{arg}}' when the agent omits an arg.
ARG="${1:-}"; case "$ARG" in "{{"*"}}") ARG="";; esac
if [ -z "$ARG" ]; then
  printf '%s\n' '{"thread_url":"","thread_title":"","op":null,"comments":[],"errors":["no thread url/id given"]}'
  exit 0
fi
if ! command -v python3 &>/dev/null; then
  printf '%s\n' '{"thread_url":"","thread_title":"","op":null,"comments":[],"errors":["python3 missing"]}'
  exit 0
fi

ARG="$ARG" python3 <<'PY'
import json, os, re, sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

arg = os.environ["ARG"].strip()
# Accept a full URL or a bare post id. Reddit post ids are base36.
m = re.search(r"/comments/([0-9a-z]+)", arg) or re.fullmatch(r"([0-9a-z]{4,10})", arg)
post_id = m.group(1) if m else None

def fail(msg):
    print(json.dumps({"thread_url": arg, "thread_title": "", "op": None,
                      "comments": [], "errors": [msg]}))
    sys.exit(0)

if not post_id:
    fail("could not extract a Reddit post id from input")

UA = "pulse/0.1 (public-rss; reddit-thread)"
NS = {"a": "http://www.w3.org/2005/Atom"}
# Ride the account's private-feed budget when configured (see reddit.sh) —
# thread grounding burns the same anonymous pool as the sub feeds otherwise.
AUTH = ""
try:
    from urllib.parse import quote, urlparse, parse_qs
    _r = (json.load(open(os.path.expanduser(
        "~/.linggen/skills/pulse/config.json"))).get("sites") or {}).get("reddit") or {}
    _tok = (_r.get("private_rss_feed_token") or "").strip()
    _usr = (_r.get("username") or "").strip().lstrip("u/").lstrip("/")
    if "feed=" in _tok:  # forgiving: whole pasted feed URL (same as reddit-mentions.sh)
        _q = parse_qs(urlparse(_tok).query)
        _tok = (_q.get("feed") or [_tok])[0]
        if not _usr:
            _usr = (_q.get("user") or [""])[0]
    if _tok and _usr:
        AUTH = f"&feed={quote(_tok)}&user={quote(_usr)}"
except Exception:
    pass
url = f"https://www.reddit.com/comments/{post_id}/.rss?limit=50{AUTH}"

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

try:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    root = ET.fromstring(urllib.request.urlopen(req, timeout=15).read())
except Exception as ex:
    fail(f"thread fetch failed: {str(ex)[:90]}")

thread_title = (root.findtext("a:title", "", NS) or "").strip()
# Comment entry titles look like "/u/<author> on <thread title>".
COMMENT_TITLE = re.compile(r"^/u/\S+\s+on\s+", re.I)

op = None
comments = []
for e in root.findall("a:entry", NS):
    title = (e.findtext("a:title", "", NS) or "").strip()
    author = (e.findtext("a:author/a:name", "", NS) or "").strip()
    link_el = e.find("a:link", NS)
    href = link_el.get("href") if link_el is not None else ""
    body = strip_html(e.findtext("a:content", "", NS) or "")
    updated = (e.findtext("a:updated", "", NS) or "").strip()
    node = {"author": author, "body": body[:1200], "url": href, "age_hours": age_hours(updated)}
    if op is None and not COMMENT_TITLE.match(title):
        op = node            # first non-"X on Y" entry = the submission
    else:
        comments.append(node)
        if len(comments) >= 25:
            break

print(json.dumps({
    "thread_url": (op or {}).get("url") or url,
    "thread_title": thread_title,
    "op": op,
    "comments": comments,
    "errors": [],
}))
PY
