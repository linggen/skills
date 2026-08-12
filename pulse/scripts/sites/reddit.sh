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
#   bash reddit.sh             # default — /new.rss AND /top.rss?t=day, merged
#   bash reddit.sh --new       # /new.rss only
#   bash reddit.sh --rising    # /rising.rss only
#   bash reddit.sh --top       # /top.rss?t=day only
#
# The default pulls TWO passes per sub because /new alone is the freshest and
# least-vetted end of a subreddit — the agent then scores titles that nobody
# upvoted. A thread in top-of-day earned its way there, and since RSS omits
# score and comment count entirely, `mode: "top"` is the ONLY heat signal
# available for Reddit. Both passes are capped per mode (below) so a wider
# pull doesn't cost the agent its context window.
#
# Output: JSON array of {sub, title, url, author, comments, age_hours,
#                        summary, mode, score}. `author` is the OP's handle
#                        (u/<name>). RSS doesn't expose comment count /
#                        score, so those are 0; the agent scores by
#                        title/summary relevance, and treats mode:"top" as
#                        traction. Items served from the last-good cache (sub
#                        was rate-limited this run) carry `stale: true` with
#                        age_hours recomputed. A thread in both passes appears
#                        once, as "top".
#
# Deps: python3 (stdlib only).

set -uo pipefail

# No flag = both passes. A flag pins one mode (kept for a targeted re-pull).
MODES="new,top"
for arg in "$@"; do
  case "$arg" in
    --rising) MODES="rising" ;;
    --top)    MODES="top"    ;;
    --new)    MODES="new"    ;;
  esac
done

CONFIG="$HOME/.linggen/skills/pulse/config.json"
if ! command -v python3 &>/dev/null || [ ! -f "$CONFIG" ]; then
  echo "[]"
  exit 0
fi

CONFIG="$CONFIG" MODES="$MODES" python3 <<'PY'
import json, os, re, sys, time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

cfg = json.load(open(os.environ["CONFIG"]))
modes = [m for m in (os.environ.get("MODES") or "new").split(",") if m]
reddit = (cfg.get("sites") or {}).get("reddit") or {}
subs = [s for s in (reddit.get("subs") or []) if s]
if not subs:
    print("[]"); sys.exit(0)

# Per-mode fetch size. The feed serves up to 100 per request, but every item
# spends the agent's context: Pulse runs on a 128K model, and at 600-char
# summaries a 9-sub run already handed it ~47K tokens of raw feed — most of
# the room the drafting step needs. So take MORE threads and spend LESS on
# each: 40 per sub (28 newest + 12 top-of-day) at a 200-char summary costs
# less than the old 25-newest-at-600 did, and the summary only has to carry
# enough to score topical fit — grounding comes from FetchRedditThread.
LIMITS = {"new": 28, "top": 12, "rising": 25}
SUMMARY_CHARS = 200

UA = "pulse/0.1 (public-rss; reddit-discovery)"
NS = {"a": "http://www.w3.org/2005/Atom"}
# The account's private RSS feed token (old.reddit.com/prefs/feeds) rides the
# per-account budget instead of the shared anonymous IP pool that 429s after
# ~2-3 subs per run. Any .rss URL accepts ?feed=<token>&user=<name>.
from urllib.parse import quote, urlparse, parse_qs
_user = (reddit.get("username") or "").strip().lstrip("u/").lstrip("/")
_token = (reddit.get("private_rss_feed_token") or "").strip()
if "feed=" in _token:  # forgiving: whole pasted feed URL (same as reddit-mentions.sh)
    _q = parse_qs(urlparse(_token).query)
    _token = (_q.get("feed") or [_token])[0]
    if not _user:
        _user = (_q.get("user") or [""])[0]
AUTH = f"&feed={quote(_token)}&user={quote(_user)}" if _user and _token else ""

def endpoint(mode):
    limit = LIMITS.get(mode, 25)
    return (f"{mode}.rss?limit={limit}"
            + ("&t=day" if mode == "top" else "") + AUTH)

# Reddit rate-limits anon .rss hard (~10/min; bursts trip 429). Looping subs
# back-to-back let the 1st sub succeed while every later sub got 429 — which
# the old bare `except: continue` swallowed, so discovery came from ONLY the
# first sub. Pacing alone isn't enough with many subs, and retrying a 429
# burns the same shared budget the NEXT sub needs (observed: one sub's
# retries starved the three after it). So: no in-run 429 retry — a
# rate-limited sub serves its last-good cached feed instead (stale-but-real
# beats missing; same pattern as reddit-account.sh), and failures still go
# to stderr (never silently empty).
REQUEST_GAP = 6.0  # seconds between subs — paced to the ~10/min anon budget
CACHE = os.path.expanduser("~/.linggen/skills/pulse/state/reddit-feed-cache.json")

def fetch_feed(url):
    for attempt in (0, 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=15) as r:
                return ET.fromstring(r.read())
        except urllib.error.HTTPError as ex:
            if ex.code == 429 or attempt:  # 429: straight to cache fallback
                raise
            time.sleep(4)  # one quick retry for non-429 transient errors
        except Exception:
            if attempt:
                raise
            time.sleep(4)

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
    cache = json.load(open(CACHE))
except Exception:
    cache = {}

# One request per (sub, mode). The anon budget favors the first requests of a
# run, so a fixed order starves the tail systematically (observed: sub 1 fresh
# every run, later subs 429 → stale). Refresh the stalest pairs first —
# never-fetched (""), then oldest cache — so fresh pulls rotate across the
# whole roster instead of always spending the budget in the same place.
pulls = [(sub, mode) for sub in subs for mode in modes]
pulls.sort(key=lambda p: (cache.get(f"{p[0]}/{p[1]}") or {}).get("fetched_iso", ""))

def parse_items(root, sub, mode):
    items = []
    for e in root.findall("a:entry", NS):
        link_el = e.find("a:link", NS)
        href = link_el.get("href") if link_el is not None else ""
        updated = (e.findtext("a:updated", "", NS) or "").strip()
        author = (e.findtext("a:author/a:name", "", NS) or "").strip()
        author = author.split("/")[-1]  # "/u/Name" -> "Name"
        items.append({
            "sub": sub,
            "mode": mode,
            "title": (e.findtext("a:title", "", NS) or "").strip(),
            "url": href,
            "author": ("u/" + author) if author else "",
            "comments": 0,
            "score": 0,
            "age_hours": age_hours(updated),
            "updated_iso": updated,
            "summary": strip_html(e.findtext("a:content", "", NS) or "")[:SUMMARY_CHARS],
        })
    return items

out, errors = [], []
for i, (sub, mode) in enumerate(pulls):
    if i:
        time.sleep(REQUEST_GAP)  # spacing so request 2+ isn't rate-limited
    url = f"https://www.reddit.com/r/{sub}/{endpoint(mode)}"
    key = f"{sub}/{mode}"
    try:
        root = fetch_feed(url)
    except Exception as ex:
        cached = cache.get(key) or {}
        if cached.get("items"):
            for it in cached["items"]:
                it = dict(it, stale=True)
                it["age_hours"] = age_hours(it.get("updated_iso", ""))
                out.append(it)
            errors.append(f"r/{sub} ({mode}): {type(ex).__name__} {ex} — served "
                          f"last-good cache from {cached.get('fetched_iso', '?')}")
        else:
            errors.append(f"r/{sub} ({mode}): {type(ex).__name__} {ex}")
        continue
    items = parse_items(root, sub, mode)
    out.extend(items)
    cache[key] = {
        "fetched_iso": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "items": items,
    }

# A thread can sit in both /new and /top-of-day. Emit it once and keep the
# "top" copy — that mode IS the heat signal, and dropping it would hand the
# agent the same thread twice with the traction marker missing from one.
best = {}
for it in out:
    prev = best.get(it["url"])
    if prev is None or (it.get("mode") == "top" and prev.get("mode") != "top"):
        best[it["url"]] = it
out = list(best.values())

try:
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    tmp = CACHE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(cache, f)
    os.replace(tmp, CACHE)
except Exception as ex:
    errors.append(f"cache write: {type(ex).__name__} {ex}")

print(json.dumps(out))
if errors:
    sys.stderr.write("[reddit.sh] " + "; ".join(errors) + "\n")
PY
