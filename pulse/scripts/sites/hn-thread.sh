#!/usr/bin/env bash
# hn-thread.sh — registered as the FetchHNThread tool.
#
# Pulls one HN thread's OP + comment tree via the public Algolia HN API
# (`/items/<id>`, no auth). Used by discover-customers to read the real
# discussion before drafting a comment, and to pick a single specific
# comment to reply to (reply_target) instead of dropping a top-level reply.
# Mirrors reddit-thread.sh's output shape so the agent treats both uniformly.
#
# Usage:
#   hn-thread.sh <hn-item-url-or-id>
#     e.g. hn-thread.sh https://news.ycombinator.com/item?id=39000000
#          hn-thread.sh 39000000
#
# Output (JSON, exit 0):
#   { thread_url, thread_title,
#     op:       {author, body, url, age_hours},
#     comments: [{author, body, url, age_hours}],   # cap 25, HTML stripped
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
import json, os, re, sys, urllib.request
from datetime import datetime, timezone

arg = os.environ["ARG"].strip()
m = re.search(r"id=(\d+)", arg) or re.search(r"(\d+)", arg)
item_id = m.group(1) if m else ""

def out(thread_url="", thread_title="", op=None, comments=None, err=None):
    print(json.dumps({
        "thread_url": thread_url, "thread_title": thread_title,
        "op": op, "comments": comments or [],
        "errors": [err] if err else [],
    }))
    sys.exit(0)

if not item_id:
    out(err="could not parse an HN item id")

TAG_RE = re.compile(r"<[^>]+>")
def strip_html(s):
    if not s:
        return ""
    s = s.replace("<p>", "\n\n").replace("</p>", "")
    s = TAG_RE.sub("", s)
    # Unescape the handful of entities Algolia emits.
    for a, b in [("&#x27;", "'"), ("&quot;", '"'), ("&amp;", "&"),
                 ("&lt;", "<"), ("&gt;", ">"), ("&#x2F;", "/")]:
        s = s.replace(a, b)
    return s.strip()

now = datetime.now(timezone.utc).timestamp()
def age_hours(ts):
    return int((now - ts) // 3600) if ts else None

try:
    url = f"https://hn.algolia.com/api/v1/items/{item_id}"
    req = urllib.request.Request(url, headers={"User-Agent": "pulse/1.0"})
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.load(r)
except Exception as e:
    out(err=f"HN item fetch failed: {e}")

hn_url = f"https://news.ycombinator.com/item?id={item_id}"
op = {
    "author": data.get("author") or "",
    "body": strip_html(data.get("text") or "") or (data.get("url") or ""),
    "url": hn_url,
    "age_hours": age_hours(data.get("created_at_i")),
}

# Flatten the comment tree depth-first, capped at 25. HN's best replies
# aren't always top-level, so we walk children too (shallow — depth ≤ 2).
comments = []
def walk(node, depth):
    if len(comments) >= 25:
        return
    for c in (node.get("children") or []):
        if c.get("type") != "comment" or not c.get("text"):
            continue
        cid = c.get("id")
        comments.append({
            "author": c.get("author") or "",
            "body": strip_html(c.get("text") or ""),
            "url": f"https://news.ycombinator.com/item?id={cid}" if cid else hn_url,
            "age_hours": age_hours(c.get("created_at_i")),
        })
        if depth < 2:
            walk(c, depth + 1)
        if len(comments) >= 25:
            return

walk(data, 0)
out(thread_url=hn_url, thread_title=(data.get("title") or ""), op=op, comments=comments)
PY
