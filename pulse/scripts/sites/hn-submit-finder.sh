#!/usr/bin/env bash
# hn-submit-finder.sh — registered as the FetchHNSubmitCandidates tool.
#
# Finds GOOD third-party articles to SUBMIT to Hacker News — the counterpart
# to the comment lane (hn-search.sh). Submitting other people's interesting
# links lowers an account's "own-post ratio"; HN's software auto-kills your
# submissions once too high a share of them are your own. (Confirmed by an HN
# moderator: "It's ok to submit your own stuff part of the time, but … must be
# interspersed with interesting posts from unrelated sources.") Comments build
# karma; only third-party SUBMISSIONS move that ratio.
#
# Strategy: curated, HN-taste SOURCES (not keyword search), broad topic.
#   - lobste.rs front page (hottest) — a HN-style community's already-curated
#     links to external articles; its taste ≈ HN's.
#   - quality tech subreddits — LOWER HN audience overlap, so they surface
#     good articles HN hasn't seen yet (better non-dupe yield).
# Then the deciding step: DEDUP each candidate URL against HN via the public
# Algolia API and DROP anything already submitted — reposts get auto-killed.
#
# Config (sites.hackernews.submit_sources in config.json):
#   { "lobsters": true,
#     "subreddits": ["programming","rust","MachineLearning","compsci","selfhosted"] }
# Falls back to those defaults when absent. linggen.dev (own domain) is always
# dropped — you submit OTHERS' work here, not your own (that's a Show HN).
#
# Usage:  hn-submit-finder.sh [max]      # max cards to return, default 5
#   (kept short on purpose: HN tolerates only a couple of your own
#   submissions a day before the own-post-ratio filter bites — the list is
#   ideas to pick from, not a queue to drain.)
#
# Output (JSON array, exit 0), newest/best first:
#   [ { title, url, source, score, age_hours, comments_url,
#       hn_status } , … ]
#   hn_status: "fresh" (no HN submission found) | "unchecked" (Algolia
#   unreachable — glance at hn.algolia.com before posting).
#
# Deps: python3 (stdlib only — urllib + json + xml).

set -uo pipefail

if ! command -v python3 &>/dev/null; then
  echo "[]"; exit 0
fi

MAX="${1:-5}" CONFIG="$HOME/.linggen/skills/pulse/config.json" python3 <<'PY'
import json, os, re, sys, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

UA = "linggen-pulse/0.1 (hn-submit-finder)"
NOW = datetime.now(timezone.utc).timestamp()
MAX_AGE_DAYS = 21          # stale links are likely already on HN / past their moment
CANDIDATE_CAP = 30         # how many to spend an Algolia dedup check on
SELF_DOMAINS = {"linggen.dev"}  # never submit your own work via this lane

# Reddit rate-limits .rss hard, and these requests went out back-to-back: one
# sub answered and the rest got 429, so the whole candidate list came from a
# single subreddit (2026-08-12: all of it r/rust, all of it images). Same fix
# reddit.sh already carries — pace the requests, rotate which sub goes first so
# the budget doesn't always land in the same place, and fall back to the
# last-good feed for a sub that gets refused.
REQUEST_GAP = 6.0
CACHE = os.path.expanduser("~/.linggen/skills/pulse/state/hn-submit-cache.json")

try:
    max_cards = max(1, int(os.environ.get("MAX", "5") or 5))
except ValueError:
    max_cards = 5

# ---- config / sources -------------------------------------------------------
DEFAULT_SUBS = ["programming", "rust", "MachineLearning", "compsci", "selfhosted"]
lobsters_on, subs = True, DEFAULT_SUBS
reddit_cfg = {}
try:
    cfg = json.load(open(os.environ["CONFIG"]))
    hn = (cfg.get("sites") or {}).get("hackernews") or {}
    src = hn.get("submit_sources") or {}
    if "lobsters" in src:
        lobsters_on = bool(src.get("lobsters"))
    if isinstance(src.get("subreddits"), list):
        subs = [s for s in src["subreddits"] if s]
    reddit_cfg = (cfg.get("sites") or {}).get("reddit") or {}
except Exception:
    pass

# Ride the account's private RSS feed (old.reddit.com/prefs/feeds) like
# reddit.sh does: anonymous .rss shares one per-IP budget that 429s after two
# or three subs, and this lane was spending it blind — the token moves the
# whole run onto the per-account budget instead. Same forgiving parse (a whole
# pasted feed URL works as well as the bare token).
def _reddit_auth():
    user = (reddit_cfg.get("username") or "").strip().lstrip("u/").lstrip("/")
    token = (reddit_cfg.get("private_rss_feed_token") or "").strip()
    if "feed=" in token:
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(token).query)
        token = (q.get("feed") or [token])[0]
        user = user or (q.get("user") or [""])[0]
    if not (user and token):
        return ""
    return f"&feed={urllib.parse.quote(token)}&user={urllib.parse.quote(user)}"

REDDIT_AUTH = _reddit_auth()

def get(url, timeout=12):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def host(u):
    try:
        h = urllib.parse.urlsplit(u).netloc.lower()
        return h[4:] if h.startswith("www.") else h
    except Exception:
        return ""

def host_is(h, domain):
    """Host match that includes subdomains — `i.redd.it` IS `redd.it`."""
    return h == domain or h.endswith("." + domain)

# A submission has to be something to READ. These are neither article nor
# discussion: Reddit's own hosts (a self-post, or its media CDNs i.redd.it /
# v.redd.it / preview.redd.it) and bare image / video files anywhere.
# 2026-08-12: every candidate in a rescan was an `i.redd.it` .png — the host
# check meant to stop them compared `host(u) in ("", "redd.it")`, which an
# `i.redd.it` URL passes, and nothing looked at the file extension at all.
NOT_ARTICLE_DOMAINS = ("redd.it", "reddit.com", "imgur.com")
MEDIA_EXTS = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg",
              ".mp4", ".webm", ".mov", ".m4v", ".avi", ".mp3", ".wav")

def submittable(u):
    h = host(u)
    if not u or not h:
        return False
    if any(host_is(h, d) for d in NOT_ARTICLE_DOMAINS):
        return False
    # imgur gallery links carry no extension, hence the domain rule above; a
    # PDF stays allowed on purpose — papers are a normal HN submission.
    return not urllib.parse.urlsplit(u).path.lower().endswith(MEDIA_EXTS)

def url_key(u):
    """Normalize for dedup: scheme/www/trailing-slash/fragment insensitive."""
    try:
        p = urllib.parse.urlsplit(u.strip())
        h = p.netloc.lower()
        if h.startswith("www."):
            h = h[4:]
        path = p.path.rstrip("/") or "/"
        return f"{h}{path}?{p.query}" if p.query else f"{h}{path}"
    except Exception:
        return u.strip().lower()

def age_hours(iso):
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return int((NOW - dt.timestamp()) // 3600)
    except Exception:
        return None

cands = []  # {title,url,source,score,age_hours,comments_url}

# ---- lobste.rs front page (external links, already community-curated) --------
if lobsters_on:
    try:
        for it in json.loads(get("https://lobste.rs/hottest.json")):
            u = (it.get("url") or "").strip()
            # text/ask posts have no external url; the rest must be readable
            if host_is(host(u), "lobste.rs") or not submittable(u):
                continue
            cands.append({
                "title": (it.get("title") or "").strip(),
                "url": u,
                "source": "lobste.rs",
                "score": it.get("score") or 0,
                "age_hours": age_hours(it.get("created_at")),
                "comments_url": it.get("comments_url") or "",
            })
    except Exception:
        pass

# ---- quality subreddits via public RSS (top of week = vetted) ---------------
NS = {"a": "http://www.w3.org/2005/Atom"}
LINK_RE = re.compile(r'href="([^"]+)">\[link\]')

try:
    cache = json.load(open(CACHE))
except Exception:
    cache = {}

errors = []

def links_from(root, sub):
    """The submittable [link] posts in one sub's feed, as cacheable rows."""
    rows = []
    for e in root.findall("a:entry", NS):
        m = LINK_RE.search(e.findtext("a:content", "", NS) or "")
        u = (m.group(1) if m else "").strip()
        # No [link] anchor, a link back at reddit (self-post or reddit-hosted
        # media), or a bare image/video => nothing to submit.
        if not submittable(u):
            continue
        rows.append({
            "title": (e.findtext("a:title", "", NS) or "").strip(),
            "url": u,
            "updated_iso": (e.findtext("a:updated", "", NS) or "").strip(),
        })
    return rows

# Stalest sub first, so a run that gets refused partway still moves coverage
# forward instead of refreshing the same head of the list every time.
subs = sorted(subs, key=lambda s: (cache.get(s) or {}).get("fetched_iso", ""))

for i, sub in enumerate(subs):
    if i:
        time.sleep(REQUEST_GAP)
    try:
        root = ET.fromstring(get(
            f"https://www.reddit.com/r/{sub}/top/.rss?t=week&limit=25{REDDIT_AUTH}"))
        rows = links_from(root, sub)
        cache[sub] = {
            "fetched_iso": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "links": rows,
        }
    except Exception as ex:
        cached = cache.get(sub) or {}
        rows = cached.get("links") or []
        errors.append(f"r/{sub}: {type(ex).__name__} {ex}"
                      + (f" — served last-good cache from {cached['fetched_iso']}"
                         if rows else ""))
    for row in rows:
        cands.append({
            "title": row["title"],
            "url": row["url"],
            "source": f"r/{sub}",
            "score": 0,  # reddit RSS exposes no score
            # Recomputed from the post's own timestamp, so a cached row ages
            # honestly and the MAX_AGE_DAYS gate below still applies to it.
            "age_hours": age_hours(row.get("updated_iso")),
            "comments_url": "",
        })

try:
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    tmp = CACHE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(cache, f)
    os.replace(tmp, CACHE)
except Exception as ex:
    errors.append(f"cache write: {type(ex).__name__} {ex}")

# ---- dedup within candidates, drop own domain + stale -----------------------
seen, uniq = set(), []
for c in cands:
    k = url_key(c["url"])
    if k in seen:
        continue
    if host(c["url"]) in SELF_DOMAINS:
        continue
    if c["age_hours"] is not None and c["age_hours"] > MAX_AGE_DAYS * 24:
        continue
    seen.add(k)
    uniq.append(c)

# Group by source, sort each by its own best signal (lobsters by score, reddit
# by freshness), then ROUND-ROBIN interleave so low-volume / score-less sources
# (reddit) aren't buried under lobsters' scored items — diversity is the whole
# reason for multiple sources (lower HN overlap = more non-dupe gems).
from collections import defaultdict, deque
groups = defaultdict(list)
for c in uniq:
    groups[c["source"]].append(c)
for g in groups.values():
    g.sort(key=lambda c: (-(c["score"] or 0), c["age_hours"] if c["age_hours"] is not None else 1e9))
queues = [deque(g) for g in groups.values()]
inter = []
while queues and len(inter) < CANDIDATE_CAP:
    for q in queues:
        if q:
            inter.append(q.popleft())
            if len(inter) >= CANDIDATE_CAP:
                break
    queues = [q for q in queues if q]
uniq = inter

# ---- DEDUP AGAINST HN (the deciding step) -----------------------------------
def on_hn(u):
    """Return (already_on_hn, points|None). Fail-open -> (None,None).

    The URL is passed QUOTED: unquoted, Algolia tokenizes it and ranks by
    popularity, so a generic prefix (youtube.com/watch) returns 10 mega-hit
    videos and never the actual 1-point match — and a token with a leading
    hyphen (video id "-0HRzXk8vlk") is treated as an EXCLUDE operator,
    guaranteeing a miss. Quoting forces phrase matching on the url attribute,
    which returns only true submissions of this exact URL. (Bit us 2026-07-09:
    a video already submitted twice kept coming back as "not on HN".)
    """
    try:
        q = urllib.parse.urlencode({
            "query": f'"{u}"', "restrictSearchableAttributes": "url",
            "tags": "story", "hitsPerPage": 10,
        })
        data = json.loads(get(f"https://hn.algolia.com/api/v1/search?{q}", timeout=10))
    except Exception:
        return None, None
    target = url_key(u)
    pts = None
    for h in data.get("hits", []) or []:
        if h.get("url") and url_key(h["url"]) == target:
            p = h.get("points") or 0
            pts = p if pts is None else max(pts, p)
    return (pts is not None), pts

out = []
for c in uniq:
    if len(out) >= max_cards:
        break
    dup, _pts = on_hn(c["url"])
    if dup is True:
        continue                      # already on HN -> repost would be killed
    c["hn_status"] = "unchecked" if dup is None else "fresh"
    out.append(c)

print(json.dumps(out))
if errors:
    sys.stderr.write("[hn-submit-finder] " + "; ".join(errors) + "\n")
PY