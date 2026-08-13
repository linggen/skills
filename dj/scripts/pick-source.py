#!/usr/bin/env python3
# pick-source.py — decide WHICH video a track should be downloaded from.
#
# Both download paths used to hand yt-dlp a `ytsearch5:` query with
# `--max-downloads 1`, which takes the first result that downloads — YouTube's
# relevance order, not quality order. For "周杰伦 稻香" that pool holds the
# 224s official master alongside a 153s 搖滾版, a 206s concert cut, and a 948s
# six-song medley, and any of the three could win. This picks deliberately.
#
# The strongest signal by far is DURATION. A live take, a rock arrangement and
# a medley all announce themselves by being the wrong length, and we can know
# the right length before downloading anything: LRCLIB records a duration for
# every set of lyrics, so the same call that fetches the .lrc sidecar also
# tells us how long the studio recording runs. That anchor turns a fuzzy "does
# this look right" into arithmetic. When LRCLIB has nothing — common for niche
# CJK tracks — the candidates vote instead, since the correct length is usually
# the one several uploads agree on.
#
# It also means the lyrics and the audio are chosen against the SAME number,
# which is what stops a .lrc timed to the studio master landing next to a live
# recording it will never line up with.
#
# Reads one JSON object (argv[1] or stdin), writes one JSON line:
#   in : {artist, title, year?, version?, query_hints?, yt_dlp, results?}
#   out: {ok, url, id, duration, video_title, channel, anchor, lyrics,
#         runners_up[], notes[]}   — or {ok:false, error}
#
# Callers: scripts/get.sh (agent path) and scripts/download.js (page path).
# It exists so those two stop reimplementing the same search by hand.

import concurrent.futures
import json
import re
import subprocess
import sys
import unicodedata
import urllib.parse
import urllib.request

UA = "DJ (Linggen music app) https://linggen.dev"

# ---------------------------------------------------------------- declarations
#
# Everything the scorer knows lives in these tables. Adding a signal means
# adding a row, never a branch — the scoring loop below never names a term.

# Words in a video title that mark a DIFFERENT RECORDING than the studio
# master. Each row is tagged with the version it describes: when the caller
# asks for that version the penalty becomes a bonus of the same size, so
# "the live one" is one field on the order rather than a second code path.
TITLE_TERMS = [
    (45, "live", ["live", "现场", "現場", "演唱会", "演唱會", "concert",
                  "tour", "unplugged", "巡回", "巡迴", "live版"]),
    (45, "cover", ["cover", "翻唱", "cover版", "reaction", "reacts", "解说", "解說"]),
    (45, "instrumental", ["instrumental", "伴奏", "纯音乐", "純音樂", "karaoke",
                          "卡拉ok", "off vocal", "无人声", "無人聲"]),
    (40, "remix", ["remix", "混音", "dj版", "sped up", "slowed", "nightcore",
                   "8d", "bass boosted", "抖音版", "摇滚版", "搖滾版", "钢琴版",
                   "鋼琴版", "acoustic", "acoustic version"]),
    # Never wanted, under any `version`: these are not the song at all. The
    # tag is None so no request can turn them into a bonus.
    (90, None, ["medley", "串烧", "串燒", "合集", "全集", "精选集", "精選集",
                "mix", "megamix", "1 hour", "一小时", "一小時", "loop"]),
]

# Marks of the upload we want: the label's or the artist's own copy.
OFFICIAL_TERMS = ["official", "官方", "topic", "vevo", "original", "原版",
                  "official music video", "official audio", "官方版"]

# Search phrasings worth trying beyond the bare "artist title", per requested
# version and per script. CJK studio searches lean on the 歌词版 family because
# on Chinese repertoire the plain query fills with variety-show performances
# while 歌词版 uploads carry the studio audio — their value is less the file
# than the CONSENSUS they establish and the fallbacks they supply when the
# official upload is region-blocked. Asking for a live take has to search for
# one: the studio phrasings actively bury it.
QUERY_VARIANTS = {
    "studio": {"cjk": ["歌词版", "官方版"], "latin": ["official audio", "topic"]},
    "live": {"cjk": ["现场", "演唱会"], "latin": ["live", "live performance"]},
    "mv": {"cjk": ["官方mv", "完整版"], "latin": ["official music video"]},
}

SCORE = {
    "channel_is_artist": 45,   # channel name carries the artist's name
    "official_term": 20,
    "duration_exact": 60,      # within 1s of the anchor
    "duration_close": 35,      # within 5s
    "views_max": 15,           # log-scaled, a tiebreaker and nothing more
}

MAX_QUERIES = 3               # each costs a network round trip (~12s, parallel)
ANCHOR_TOLERANCE = 12         # seconds; beyond this a candidate is not the song
POOL_TOLERANCE_PCT = 0.20     # looser when the anchor is only the pool's guess


# ------------------------------------------------------------------- utilities

def fold(s):
    """Lowercase + strip punctuation so term matching survives 【】 and dashes."""
    s = unicodedata.normalize("NFKC", str(s or "")).lower()
    return re.sub(r"[\s\-_/|·・,，.。:：!！?？'\"“”‘’()（）\[\]【】]+", " ", s).strip()


def is_cjk(s):
    return any("一" <= c <= "鿿" or "぀" <= c <= "ヿ"
               for c in str(s or ""))


def name_overlap(a, b, minimum):
    """Do two names share a run of `minimum` characters?

    Plain containment is too strict across scripts: the request says 周杰伦
    and the official channel is 周杰倫 Jay Chou, which share no whole word but
    are obviously the same artist. A shared run catches that without carrying
    a simplified/traditional table around. This only ever grants a bonus, so a
    loose match costs a few points, never a wrong pick.
    """
    a, b = fold(a).replace(" ", ""), fold(b).replace(" ", "")
    if not a or not b or minimum <= 0:
        return False
    return any(a[i:i + minimum] in b for i in range(len(a) - minimum + 1))


def cluster(values, width):
    """Largest group of numbers within `width` of each other, and its median.

    LRCLIB durations come from user submissions and candidate durations come
    from different uploads of the same song, so neither agrees exactly. The
    number several sources cluster around is the one to trust — not the first
    one, which is the mistake this whole file exists to stop making.
    """
    vals = sorted(v for v in values if isinstance(v, (int, float)) and v > 0)
    if not vals:
        return None
    best = []
    for v in vals:
        group = [w for w in vals if abs(w - v) <= width]
        if len(group) > len(best):
            best = group
    return best[len(best) // 2]


# ---------------------------------------------------------------------- lrclib

def lrclib_search(artist, title, timeout=12):
    """Free-text LRCLIB search. The exact artist/track fields miss
    original-language titles; `q=` is far more forgiving (same call
    lyrics.js and get.sh already make, just made earlier)."""
    q = f"{artist} {title}".strip()
    if not q:
        return []
    url = "https://lrclib.net/api/search?q=" + urllib.parse.quote(q)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        arr = json.loads(urllib.request.urlopen(req, timeout=timeout).read().decode())
    except Exception:
        return []
    return arr if isinstance(arr, list) else []


def anchor_from_lyrics(entries):
    """Studio duration + the lyric body to reuse, from LRCLIB's results.

    Never the first hit — that is the known failure. Synced entries vote on
    the duration, the winning cluster defines the length, and the lyrics come
    from an entry that actually sits at that length.
    """
    synced = [e for e in entries if e.get("syncedLyrics") and not e.get("instrumental")]
    pool = synced or [e for e in entries if e.get("plainLyrics")]
    if not pool:
        return None, None
    seconds = cluster([e.get("duration") for e in pool], 2)
    if not seconds:
        return None, None
    at_length = [e for e in pool if abs((e.get("duration") or 0) - seconds) <= 2]
    pick = at_length[0] if at_length else pool[0]
    body = pick.get("syncedLyrics") or pick.get("plainLyrics") or ""
    lyrics = {
        "body": body,
        "synced": bool(pick.get("syncedLyrics")),
        "duration": round(pick.get("duration") or seconds),
    } if body.strip() else None
    return round(seconds), lyrics


# ----------------------------------------------------------------------- probe

def build_queries(artist, title, hints, version="studio"):
    """The bare query first, then the caller's hints, then the defaults for
    this version and script."""
    base = f"{artist} {title}".strip()
    if not base:
        return []
    by_script = QUERY_VARIANTS.get(version) or QUERY_VARIANTS["studio"]
    variants = by_script["cjk" if is_cjk(base) else "latin"]
    queries = [base]
    for extra in list(hints or []) + variants:
        q = f"{base} {extra}".strip()
        if q not in queries:
            queries.append(q)
    return queries[:MAX_QUERIES]


def search(yt_dlp, query, results, timeout=90):
    """One flat search — metadata only, no media fetched."""
    cmd = [yt_dlp, "--flat-playlist", "-J", "--no-warnings",
           "--socket-timeout", "15", f"ytsearch{results}:{query}"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        data = json.loads(r.stdout or "{}")
    except Exception:
        return []
    return [e for e in (data.get("entries") or []) if isinstance(e, dict)]


def probe(yt_dlp, queries, results):
    """Every query at once — they are independent HTTP calls, and run serially
    a three-variant probe would cost ~35s per song instead of ~12s."""
    pooled = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(queries)) as pool:
        for entries in pool.map(lambda q: search(yt_dlp, q, results), queries):
            for e in entries:
                if e.get("id") and e["id"] not in pooled:
                    pooled[e["id"]] = e
    return list(pooled.values())


# ---------------------------------------------------------------------- scoring

def title_score(folded_title, version):
    """Sum of the declared term rows. A row tagged with the requested version
    scores positive instead of negative — same table, no second path."""
    total, hits = 0, []
    for weight, tag, terms in TITLE_TERMS:
        if not any(t in folded_title for t in terms):
            continue
        wanted = tag is not None and tag == version
        total += weight if wanted else -weight
        hits.append(("+" if wanted else "-") + (tag or "junk"))
    return total, hits


def score_candidate(entry, artist, anchor, tolerance, version):
    """Rank one candidate. Returns (score, reasons) or (None, reasons) when the
    duration gate rejects it outright."""
    folded = fold(entry.get("title"))
    channel = fold(entry.get("channel") or entry.get("uploader"))
    duration = entry.get("duration")
    reasons = []

    # The gate. A missing duration means a live stream or a broken entry.
    if not isinstance(duration, (int, float)) or duration <= 0:
        return None, ["no duration"]
    if anchor:
        delta = abs(duration - anchor)
        if delta > tolerance:
            return None, [f"off by {round(delta)}s"]

    total, hits = title_score(folded, version)
    reasons += hits

    # Only the studio request rewards matching the anchor. For any other
    # version, running exactly as long as the master is evidence AGAINST being
    # the take that was asked for, so the title terms decide alone.
    if anchor and version == "studio":
        delta = abs(duration - anchor)
        if delta <= 1:
            total += SCORE["duration_exact"]
            reasons.append("+exact")
        elif delta <= 5:
            total += SCORE["duration_close"]
            reasons.append("+close")

    # "— Topic" is a Latin-repertoire heuristic; the official upload of a
    # Mandarin track sits on a channel called 周杰倫 Jay Chou. What generalises
    # is that the channel carries the artist's name.
    if name_overlap(artist, channel, 2 if is_cjk(artist) else 4):
        total += SCORE["channel_is_artist"]
        reasons.append("+artist channel")
    if any(t in folded or t in channel for t in OFFICIAL_TERMS):
        total += SCORE["official_term"]
        reasons.append("+official")

    views = entry.get("view_count") or 0
    if views > 0:
        # log10(1M) = 6 → the full tiebreaker; nothing below 1k moves at all.
        total += min(SCORE["views_max"], max(0, (len(str(int(views))) - 3)) * 3)

    return total, reasons


# ------------------------------------------------------------------------- main

def fail(msg):
    print(json.dumps({"ok": False, "error": msg}))
    sys.exit(0)


def main():
    raw = sys.argv[1] if len(sys.argv) > 1 else ""
    if not raw or raw.startswith("{{"):
        raw = sys.stdin.read()
    try:
        req = json.loads(raw or "{}")
    except Exception:
        fail("couldn't read the request")

    artist = str(req.get("artist") or "").strip()
    title = str(req.get("title") or "").strip()
    yt_dlp = req.get("yt_dlp")
    if not title:
        fail("no title given")
    if not yt_dlp:
        fail("no yt-dlp path given")

    version = str(req.get("version") or "studio").lower()
    results = int(req.get("results") or 5)
    notes = []

    # Lyrics first: they carry the length the audio has to match, and the
    # caller reuses the body for the .lrc so nothing fetches it twice.
    anchor, lyrics = anchor_from_lyrics(lrclib_search(artist, title))
    anchor_source = "lrclib" if anchor else None

    queries = build_queries(artist, title, req.get("query_hints"), version)
    if not queries:
        fail("nothing to search for")
    candidates = probe(yt_dlp, queries, results)
    if not candidates:
        fail("no candidates found")

    # No lyrics on file: let the uploads vote. Several of them agreeing on a
    # length is weaker than LRCLIB but much better than trusting position 1.
    if not anchor:
        anchor = cluster([c.get("duration") for c in candidates], 3)
        anchor_source = "pool" if anchor else "none"
        notes.append("no LRCLIB entry — using the candidates' own consensus")

    tolerance = (ANCHOR_TOLERANCE if anchor_source == "lrclib"
                 else (anchor or 0) * POOL_TOLERANCE_PCT)
    if version != "studio" and anchor:
        # The anchor is the STUDIO length, so it cannot gate a request for
        # another version — a concert take runs long, an acoustic re-cut runs
        # short, and gating on the master's length rejects the very thing that
        # was asked for. Here it only rules out what is not the song at all
        # (the 948s medley, the 30s clip) and the title terms decide the rest.
        tolerance = max(anchor * 0.6, 45)

    ranked = []
    for c in candidates:
        s, reasons = score_candidate(c, artist, anchor, tolerance, version)
        if s is None:
            continue
        ranked.append({
            "id": c["id"],
            "url": c.get("url") or f"https://www.youtube.com/watch?v={c['id']}",
            "duration": round(c.get("duration") or 0),
            "video_title": c.get("title"),
            "channel": c.get("channel") or c.get("uploader"),
            "score": s,
            "why": reasons,
        })

    # Everything gated out means the anchor and the pool disagree — a
    # mis-tagged LRCLIB entry, or a song whose only uploads are live. Better a
    # scored guess than nothing, but say so.
    if not ranked:
        notes.append("nothing matched the expected length — picking on title alone")
        for c in candidates:
            s, reasons = score_candidate(c, artist, None, 0, version)
            if s is not None:
                ranked.append({
                    "id": c["id"],
                    "url": c.get("url") or f"https://www.youtube.com/watch?v={c['id']}",
                    "duration": round(c.get("duration") or 0),
                    "video_title": c.get("title"),
                    "channel": c.get("channel") or c.get("uploader"),
                    "score": s,
                    "why": reasons,
                })
    if not ranked:
        fail("no usable candidate")

    ranked.sort(key=lambda r: r["score"], reverse=True)
    win = ranked[0]
    print(json.dumps({
        "ok": True,
        "url": win["url"],
        "id": win["id"],
        "duration": win["duration"],
        "video_title": win["video_title"],
        "channel": win["channel"],
        "score": win["score"],
        "why": win["why"],
        "anchor": {"seconds": anchor, "source": anchor_source},
        "lyrics": lyrics,
        "runners_up": ranked[1:4],
        "considered": len(candidates),
        "queries": queries,
        "notes": notes,
    }))


if __name__ == "__main__":
    main()
