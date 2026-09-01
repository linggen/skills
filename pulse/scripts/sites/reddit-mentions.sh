#!/usr/bin/env bash
# reddit-mentions.sh — registered as the FetchRedditMentions tool.
#
# Reddit closed self-service Data API access (Nov 2025): the `.json`
# endpoints are bot-walled (403 "you've been blocked") and creating a new
# OAuth app needs manual approval. BUT Reddit's per-user **private RSS
# feeds** still work over plain HTTPS with no OAuth — they authenticate
# with a per-account feed TOKEN the user enables once at
# old.reddit.com/prefs (options → "enable private RSS feeds", grab the
# token from the RSS-feeds tab). That token unlocks the real inbox
# signals this tool needs:
#   comment_replies → someone replied to one of your comments
#   self_replies    → someone replied to one of your posts
#   mentions        → someone wrote u/<you>
#
# Config (sites.reddit in ~/.linggen/skills/pulse/config.json):
#   username                 — your Reddit handle (no u/)
#   private_rss_feed_token   — the feed token from prefs (Settings → Reddit)
#
# Without a token we fall back to the PUBLIC search RSS for u/<username>
# mentions (no replies — public search doesn't index comment replies).
#
# Output (always JSON, exit 0):
#   { items: [{kind, title, body, url, author, sub, created_iso, score,
#              num_comments, watched_term,
#              parent_comment_body?, parent_comment_url?}], count, errors }
#   kind ∈ "reply_to_me" | "mention" | "own_comment"
#
# `own_comment` rows are page-side plumbing, never cards: they are the
# threads the user has already commented in, unioned across runs in
# state/reddit-own-threads.json so a 429 (or Reddit's ~100-comment RSS
# window) can never silently empty the discovery already-commented filter.
#
# For "reply_to_me" items we pre-walk the thread (the reply's permalink
# `.rss?context=1`) to recover the parent comment — i.e. YOUR comment that
# got replied to — since the inbox RSS item carries only the reply itself.
# All permalinks are normalized to www.reddit.com whatever host the feed
# emits. The inbox feeds themselves are fetched from www.reddit.com — as of
# 2026-09-01 old.reddit.com redirects /message/*/.rss to its login page even
# with a valid token (see the feeds list below).
#
# Deps: python3 (stdlib only). No jq/curl needed here.

set -uo pipefail

CONFIG="$HOME/.linggen/skills/pulse/config.json"

if ! command -v python3 &>/dev/null; then
  printf '%s\n' '{"items":[],"count":0,"errors":["python3 missing"]}'
  exit 0
fi
if [ ! -f "$CONFIG" ]; then
  printf '%s\n' '{"items":[],"count":0,"errors":["no config.json"]}'
  exit 0
fi

CONFIG="$CONFIG" python3 <<'PY'
import json, os, re, sys, time
from datetime import datetime
import urllib.request, urllib.parse
import xml.etree.ElementTree as ET

cfg = json.load(open(os.environ["CONFIG"]))
reddit = (cfg.get("sites") or {}).get("reddit") or {}
username = (reddit.get("username") or "").strip().lstrip("u/").lstrip("/")
token = (reddit.get("private_rss_feed_token") or "").strip()
# Be forgiving: users may paste the whole feed URL instead of just the
# token. Extract the feed= param (and the user= if username is blank).
if "feed=" in token:
    import urllib.parse as _up
    q = _up.parse_qs(_up.urlparse(token).query)
    if q.get("feed"):
        token = q["feed"][0]
    if not username and q.get("user"):
        username = q["user"][0]

UA = "pulse/0.1 (private-rss; reddit-mentions)"
NS = {"a": "http://www.w3.org/2005/Atom"}
items, errors = [], []
# thread_id -> latest ISO timestamp of MY comments in that thread. Built from
# the own-comments feed; used as an order-independent "already answered"
# fallback when the per-reply context walk fails (rate limit / timeout).
my_thread_ts = {}

def out(extra_err=None):
    if extra_err:
        errors.append(extra_err)
    print(json.dumps({"items": items, "count": len(items), "errors": errors}))
    sys.exit(0)

if not username:
    out("no reddit username in config — set it in Settings → Reddit")

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=8) as r:
        body = r.read()
        # A feed URL that answers with HTML is Reddit's login page (it
        # redirects there with a 200 when the token isn't honored) — name
        # it, instead of letting the XML parser report "invalid token".
        if r.headers.get("Content-Type", "").lower().startswith("text/html"):
            raise Exception("got HTML (login page), not a feed — token not honored at this URL")
        return body

def fetch_retry(url, tries=2, pause=0.7):
    """fetch() with one retry — the per-reply walk competes with the inbox
    feeds for Reddit's ~10/min anon budget, and a transient 429/timeout must
    NOT silently default a reply to 'unanswered'."""
    last = None
    for i in range(tries):
        try:
            return fetch(url)
        except Exception as ex:
            last = ex
            if i + 1 < tries:
                time.sleep(pause)
    raise last

def thread_id(u):
    m = re.search(r"/comments/([^/?#]+)", u or "")
    return m.group(1) if m else ""

def parse_ts(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.strip().replace("Z", "+00:00"))
    except Exception:
        return None

def strip_html(s):
    s = re.sub(r"(?is)<(script|style).*?>.*?</\1>", "", s or "")
    s = re.sub(r"(?s)<[^>]+>", " ", s)
    s = (s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
           .replace("&quot;", '"').replace("&#39;", "'").replace("&nbsp;", " "))
    return re.sub(r"\s+", " ", s).strip()

def to_www(u):
    # The inbox feeds link to old.reddit.com; the user wants the modern UI.
    return re.sub(r"https?://(old|np|new|www)\.reddit\.com",
                  "https://www.reddit.com", u or "")

def comment_id(href):
    return href.split("?")[0].rstrip("/").split("/")[-1]

# Reddit's private-feed entry titles look like:
#   "from <actor> via <subreddit> sent <when>: comment reply"
TITLE_RE = re.compile(r"from\s+(?P<actor>[^\s]+)\s+via\s+(?P<sub>[^\s]+)\s+sent", re.I)
# Comment (not submission) entries in a thread feed: "/u/<author> on <title>".
COMMENT_TITLE_RE = re.compile(r"^/u/\S+\s+on\s+", re.I)

def walk_reply(reply_url, me):
    """Pre-walk a reply permalink's thread context.

    The reply's `.rss?context=1` returns OP + ancestor chain + the reply's
    subtree as a flat list (ancestors before the reply, descendants after).
    Returns (parent_body, parent_url, already_replied):
      - parent_*  : the comment immediately above the reply — i.e. YOUR
        comment that got replied to.
      - already_replied: True if `me` authored anything below the reply, i.e.
        you've already answered it. Each further back-and-forth arrives as its
        own inbox notification, so a handled reply shouldn't keep nagging."""
    base = to_www(reply_url).split("?")[0].rstrip("/")
    reply_id = base.split("/")[-1]
    try:
        root = ET.fromstring(fetch_retry(base + "/.rss?context=1&limit=50"))
    except Exception:
        return "", "", False
    ents = []
    for e in root.findall("a:entry", NS):
        t = (e.findtext("a:title", "", NS) or "").strip()
        l = e.find("a:link", NS)
        h = l.get("href") if l is not None else ""
        author = (e.findtext("a:author/a:name", "", NS) or "").strip()
        author = author.split("/")[-1].lower()  # "/u/Name" -> "name"
        c = strip_html(e.findtext("a:content", "", NS) or "")
        ents.append((t, h, author, c))
    ids = [comment_id(h) for _, h, _, _ in ents]
    if reply_id not in ids:
        return "", "", False
    pos = ids.index(reply_id)
    # Parent = entry just above the reply, if it's a comment (not the OP).
    parent_body, parent_url = "", ""
    if pos > 0 and COMMENT_TITLE_RE.match(ents[pos - 1][0]):
        parent_body, parent_url = ents[pos - 1][3][:1500], to_www(ents[pos - 1][1])
    # Already replied = you authored any comment in the reply's subtree.
    me = me.lower()
    already_replied = any(a == me for _, _, a, _ in ents[pos + 1:])
    return parent_body, parent_url, already_replied

# Cap the per-reply context-walk fetches across ALL feeds. Each walk is a
# rate-limited Reddit RSS call (~10/min anon budget) and is the gather's
# latency bottleneck (~2 min for ~16 replies). Walk only the most recent few;
# the my_thread_ts fallback below still suppresses already-answered replies
# WITHOUT a walk, so over-budget replies are emitted without the parent-comment
# preview rather than dropped. Feeds are processed newest-first, so the budget
# lands on the freshest replies.
WALK_BUDGET = 5
_walks_left = [WALK_BUDGET]

def parse_feed(xml_bytes, kind, watched_term=None, cap=15):
    root = ET.fromstring(xml_bytes)
    n = 0
    for e in root.findall("a:entry", NS):
        if n >= cap:
            break
        title = (e.findtext("a:title", "", NS) or "").strip()
        link_el = e.find("a:link", NS)
        url = link_el.get("href") if link_el is not None else ""
        author = (e.findtext("a:author/a:name", "", NS) or "").strip()
        updated = (e.findtext("a:updated", "", NS) or "").strip()
        body = strip_html(e.findtext("a:content", "", NS) or "")
        m = TITLE_RE.search(title)
        actor = (m.group("actor") if m else author) or author
        sub = (m.group("sub") if m else "") or ""
        if sub and not sub.startswith("r/"):
            sub = "r/" + sub
        www_url = to_www(url)
        # For replies, pre-walk to recover YOUR comment (the parent) and to
        # tell whether you've already answered. Mentions have no parent
        # comment (someone wrote u/<you> in their own comment).
        parent_body, parent_url = ("", "")
        if kind == "reply_to_me" and www_url:
            if _walks_left[0] > 0:
                parent_body, parent_url, already_replied = walk_reply(www_url, username)
                _walks_left[0] -= 1
            else:
                # Over the walk budget — skip the rate-limited context fetch
                # (the gather bottleneck). Emit without the parent preview; the
                # my_thread_ts fallback below still suppresses answered ones.
                parent_body, parent_url, already_replied = "", "", False
            # Fallback (order-independent, no extra fetch): if I have a comment
            # in the SAME thread that is NEWER than this reply, I've already
            # engaged after it — suppress even if the per-reply walk failed and
            # defaulted to not-replied. This is what stops an answered reply
            # from resurfacing when the walk hits a rate limit.
            if not already_replied:
                mine_ts = parse_ts(my_thread_ts.get(thread_id(www_url)))
                reply_ts = parse_ts(updated)
                if mine_ts and reply_ts and mine_ts > reply_ts:
                    already_replied = True
            # You already replied below this comment — not actionable. Skip it
            # so it stops showing as an unanswered mention. (Any newer reply
            # arrives as its own inbox notification.)
            if already_replied:
                continue
            # Your comment was deleted/removed — the reply chain is dead, there's
            # nothing to reply to. Drop it.
            if parent_body.strip().lower() in ("[deleted]", "[removed]"):
                continue
        items.append({
            "kind": kind,
            "title": title[:300],
            "body": body[:1500],
            "url": www_url,
            "author": actor if actor.startswith("/u/") or actor.startswith("u/") else ("u/" + actor if actor else ""),
            "sub": sub,
            "created_iso": updated or None,
            "score": 0,
            "num_comments": 0,
            "watched_term": watched_term or ("u/" + username),
            "parent_comment_body": parent_body,
            "parent_comment_url": parent_url,
        })
        n += 1

# Durable record of threads I've commented in, unioned across runs.
# Two reasons the live feed alone is not enough, both of which silently
# emptied SKIP_URLS and made discovery re-propose threads I'd answered
# (observed 2026-07-28: two r/LLMDevs threads I'd already replied to came
# back as discovery cards and were only caught by the render-time filter):
#   1. Reddit's anonymous rate limit trips constantly — a 429 here meant
#      ZERO own_comment rows, so the whole suppression list vanished.
#   2. comments.rss only returns my last ~100 comments; older threads fall
#      out of the window and become "never commented" again forever.
OWN_CACHE = os.path.expanduser(
    "~/.linggen/skills/pulse/state/reddit-own-threads.json")
OWN_CACHE_CAP = 500   # newest N threads kept; well past the RSS window

def load_own_cache():
    try:
        c = json.load(open(OWN_CACHE))
    except Exception:
        return {}
    if (c.get("username") or "").lower() != username.lower():
        return {}          # handle changed — the cache is someone else's
    t = c.get("threads")
    return t if isinstance(t, dict) else {}

def save_own_cache(threads):
    try:
        newest = sorted(threads.items(),
                        key=lambda kv: (kv[1].get("ts") or ""),
                        reverse=True)[:OWN_CACHE_CAP]
        os.makedirs(os.path.dirname(OWN_CACHE), exist_ok=True)
        tmp = OWN_CACHE + ".tmp"
        with open(tmp, "w") as f:
            json.dump({"username": username, "threads": dict(newest)}, f)
        os.replace(tmp, OWN_CACHE)
    except Exception as ex:
        errors.append(f"own-threads cache write: {type(ex).__name__}")

def fetch_own_comments(cap=100):
    # Public feed of MY recent comments — the authoritative "threads I've
    # already commented in" source for the discovery already-commented
    # filter (refreshCommentedThreadUrls reads kind=="own_comment"). Works
    # WITHOUT a token. Each entry links to my comment permalink, which
    # carries the thread id (/comments/<id>/), so it dedups against the
    # discovery card's thread_url. This was lost in the .json→RSS migration
    # (old.reddit /user/<u>/comments.json is now bot-walled); restored here.
    # The live feed is UNIONED into the on-disk cache, and a failed fetch
    # falls back to the cache alone — suppression must never silently empty.
    threads = load_own_cache()
    url = (f"https://www.reddit.com/user/{urllib.parse.quote(username)}"
           f"/comments.rss?limit={cap}")
    live = 0
    try:
        root = ET.fromstring(fetch(url))
        for e in root.findall("a:entry", NS):
            link_el = e.find("a:link", NS)
            href = link_el.get("href") if link_el is not None else ""
            if not href:
                continue
            www = to_www(href)
            ts = (e.findtext("a:updated", "", NS) or "").strip()
            m = re.search(r"/comments/([^/?#]+)", www)
            key = m.group(1) if m else www
            if not key:
                continue
            live += 1
            prev = threads.get(key) or {}
            # Feed is newest-first, so the first hit per thread is my latest
            # comment there; keep the newest timestamp we've ever seen.
            if not prev or (ts or "") > (prev.get("ts") or ""):
                threads[key] = {
                    "url": www,
                    "ts": ts,
                    "title": (e.findtext("a:title", "", NS) or "").strip()[:300],
                }
        save_own_cache(threads)
    except Exception as ex:
        errors.append(f"own-comments feed failed: {str(ex)[:80]}")
        if threads:
            errors.append(
                f"using {len(threads)} cached own-comment threads "
                "(already-commented suppression still active)")

    for key, rec in threads.items():
        ts = rec.get("ts") or ""
        # Latest comment time per thread — the answered-fallback signal.
        if ts:
            cur = my_thread_ts.get(key)
            if not cur or ts > cur:
                my_thread_ts[key] = ts
        items.append({
            "kind": "own_comment",
            "title": rec.get("title") or "",
            "url": rec.get("url") or "",
            "created_iso": ts or None,
        })

# Always pull my own comments — drives the discovery already-commented
# filter — independent of whether the private inbox token is set.
fetch_own_comments()

if token:
    # Authenticated private feeds — the real inbox signal.
    # www, not old: since 2026-09-01 old.reddit.com bounces /message/*/.rss
    # to /login/?reason=lor2 even with a valid feed token (HTTP 200, HTML),
    # while www.reddit.com still serves the Atom feed for the same token.
    feeds = [
        ("https://www.reddit.com/message/comments/.rss",   "reply_to_me"),
        ("https://www.reddit.com/message/selfreply/.rss",  "reply_to_me"),
        ("https://www.reddit.com/message/mentions/.rss",   "mention"),
    ]
    for base, kind in feeds:
        url = f"{base}?feed={urllib.parse.quote(token)}&user={urllib.parse.quote(username)}"
        try:
            parse_feed(fetch(url), kind)
        except Exception as ex:
            errors.append(f"{base.rsplit('/',2)[-2]} feed failed: {str(ex)[:80]}")
    out()
else:
    # No token → public search RSS for username mentions only (no replies).
    url = ("https://www.reddit.com/search.rss?q="
           + urllib.parse.quote(f"u/{username}") + "&sort=new&limit=25")
    try:
        parse_feed(fetch(url), "mention", cap=25)
    except Exception as ex:
        errors.append(f"public mention search failed: {str(ex)[:80]}")
    errors.append("no private_rss_feed_token set — only public username mentions available, not comment replies. Add a token in Settings → Reddit (enable private RSS feeds at old.reddit.com/prefs).")
    out()
PY
