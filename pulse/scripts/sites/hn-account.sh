#!/usr/bin/env bash
# hn-account.sh — page-side HN account snapshot for the HN dashboard.
#
# One free public Firebase user lookup (/v0/user/<username>.json, no auth) plus
# concurrent per-item lookups (/v0/item/<id>.json) for the account's recent
# submitted items, using sites.hackernews.username. Returns karma + the recent
# SUBMISSIONS (stories) with their live points + comment counts, so pulse-app.js
# can render the HN dashboard KPIs, the karma-vs-activity chart, and the
# per-submission outcome list.
#
# Invoked page-side via /api/bash, gated on sites.hackernews.enabled and
# throttled by the caller. No SKILL.md tool entry — the agent never calls this.
#
# Output (always JSON, exit 0):
#   { "username": "<handle>", "karma": <int|null>,
#     "total_submitted": <int>, "window": <int>, "capped": <bool>,
#     "counts": { "stories": <int>, "comments": <int> },
#     "submissions": [ { "id","title","url","points","comments",
#                        "age_hours","created_iso" }, ... ],   // newest first
#     "errors": [ ... ] }
# karma is null + a clear error when no username is configured or the lookup
# fails; submissions is [] on any failure.
#
# Deps: python3 stdlib only (urllib + json + concurrent.futures).

set -uo pipefail

# Most-recent submitted items to inspect. Young accounts fetch everything;
# busy accounts get the freshest window (capped=true). Kept modest so the
# concurrent fetch stays snappy.
MAX_ITEMS="${1:-100}"
case "$MAX_ITEMS" in "{{"*"}}"|*[!0-9]*) MAX_ITEMS=100 ;; esac

if ! command -v python3 &>/dev/null; then
  printf '%s\n' '{"username":"","karma":null,"total_submitted":0,"window":0,"capped":false,"counts":{"stories":0,"comments":0},"submissions":[],"errors":["python3 missing"]}'
  exit 0
fi

CONFIG="$HOME/.linggen/skills/pulse/config.json" MAX_ITEMS="$MAX_ITEMS" python3 <<'PY'
import json, os, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

MAX_ITEMS = int(os.environ.get("MAX_ITEMS") or 100)

def out(username="", karma=None, total=0, window=0, capped=False,
        stories=0, comments=0, subs=None, err=None):
    print(json.dumps({
        "username": username, "karma": karma,
        "total_submitted": total, "window": window, "capped": capped,
        "counts": {"stories": stories, "comments": comments},
        "submissions": subs or [],
        "errors": [err] if err else [],
    }))
    sys.exit(0)

def get(url):
    with urllib.request.urlopen(url, timeout=8) as r:
        return json.load(r)

try:
    with open(os.environ["CONFIG"]) as f:
        hn = (json.load(f).get("sites", {}).get("hackernews", {}) or {})
except Exception:
    out()

username = (hn.get("username") or "").strip().lstrip("@")
if not username:
    out()

try:
    u = urllib.parse.quote(username)
    prof = get(f"https://hacker-news.firebaseio.com/v0/user/{u}.json")
except Exception as e:
    out(username, None, err=f"HN user lookup failed: {e}")

if not isinstance(prof, dict):
    out(username, None, err=f"no HN user '{username}'")

karma = prof.get("karma")
karma = karma if isinstance(karma, int) else None
submitted = prof.get("submitted") or []
total = len(submitted)
window_ids = submitted[:MAX_ITEMS]          # submitted is newest-first
capped = total > MAX_ITEMS

def fetch_item(iid):
    try:
        return get(f"https://hacker-news.firebaseio.com/v0/item/{iid}.json")
    except Exception:
        return None

items = []
if window_ids:
    with ThreadPoolExecutor(max_workers=12) as ex:
        items = list(ex.map(fetch_item, window_ids))

now = time.time()
stories = comments = 0
subs = []
for it in items:
    # Deleted items carry no title/fields at all — nothing to render. Dead
    # (killed/flagged) stories keep their fields, so keep them WITH a flag:
    # a killed submission is outcome signal the dashboard should show, not
    # silently hide.
    if not isinstance(it, dict) or it.get("deleted"):
        continue
    t = it.get("type")
    if t == "comment":
        comments += 1
        continue
    if t != "story":
        continue
    stories += 1
    ts = it.get("time") or 0
    subs.append({
        "id": it.get("id"),
        "title": it.get("title") or "",
        "url": it.get("url") or f"https://news.ycombinator.com/item?id={it.get('id')}",
        "points": it.get("score") if isinstance(it.get("score"), int) else 0,
        "comments": it.get("descendants") if isinstance(it.get("descendants"), int) else 0,
        "dead": bool(it.get("dead")),
        "age_hours": round((now - ts) / 3600, 1) if ts else None,
        "created_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts)) if ts else None,
    })

# Newest first (submitted order already is, but items came back via map order).
subs.sort(key=lambda s: s.get("created_iso") or "", reverse=True)

out(username, karma, total, len(window_ids), capped, stories, comments, subs)
PY
