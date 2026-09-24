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
# The album track itself comes first when it can be found. YouTube Music's
# Songs shelf lists the label's own uploads with their album, so the CD take
# is named outright instead of inferred — and its length beats the lyrics
# consensus, which a popular TV performance can outvote (像我这样的人: seven
# sets at the 172 s 明日之子 take against six at the 207 s album track).
# Each video is then scored WITH the lyrics that fit it (lyrics_match.py), so
# the pick is a pair. The album track wins over a better lyrics fit: the
# recording is kept for its sound, and words without timings are still shown.
#
# Reads one JSON object (argv[1] or stdin), writes one JSON line:
#   in : {artist, title, year?, version?, query_hints?, exclude?, yt_dlp, results?}
#   out: {ok, urls[], url, id, duration, video_title, channel, album, anchor,
#         canonical_title,
#         lyrics: {synced, duration, gap}, runners_up[], notes[]}
#         — or {ok:false, error}
#
# Caller: scripts/fetch.py — every download door goes through it.

import concurrent.futures
import json
import os
import subprocess
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cjk_fold  # noqa: E402
import lyrics_match as lm  # noqa: E402  (a sibling script, not a package)
from lyrics_match import TITLE_TERMS, cluster, fold, is_cjk  # noqa: E402

# ---------------------------------------------------------------- declarations
#
# Everything the scorer knows lives in these tables. Adding a signal means
# adding a row, never a branch — the scoring loop below never names a term.

# The words that mark a different recording (TITLE_TERMS) live in
# lyrics_match.py: a lyrics entry's track and album names are judged by them
# too.

# Marks of the upload we want: the label's or the artist's own copy.
# ("official music video" is gone: an MV is the take with the intro.)
OFFICIAL_TERMS = ["official", "官方", "topic", "vevo", "original", "原版",
                  "official audio", "官方版"]

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
    "album_track": 60,         # YouTube Music's own album upload — the CD take
    "lyrics_exact": 25,        # a timed lyrics set fits within 2s
    "lyrics_close": 12,        # ... within lyrics_match.FIT_SECONDS
    "channel_is_artist": 45,   # channel name carries the artist's name
    "official_term": 20,
    "duration_exact": 60,      # within 1s of the anchor
    "duration_close": 35,      # within 5s
    "views_max": 15,           # log-scaled, a tiebreaker and nothing more
}

MAX_QUERIES = 3               # each costs a network round trip (~12s, parallel)
ALBUM_LOOKUPS = 3             # album tracks whose details are fetched (~3s, parallel)
ANCHOR_TOLERANCE = 12         # seconds; beyond this a candidate is not the song
POOL_TOLERANCE_PCT = 0.20     # looser when the anchor is only the pool's guess


# ------------------------------------------------------------------- utilities

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


def ytmusic_songs(yt_dlp, query, timeout=60):
    """YouTube Music's Songs shelf for a query — the label's own album tracks.
    Flat entries carry an id and a title and nothing else."""
    url = ("https://music.youtube.com/search?q=" + urllib.parse.quote(query)
           + "#songs")
    cmd = [yt_dlp, "--flat-playlist", "-J", "--no-warnings",
           "--socket-timeout", "15", "--playlist-end", "8", url]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        data = json.loads(r.stdout or "{}")
    except Exception:
        return []
    return [e for e in (data.get("entries") or []) if isinstance(e, dict)]


def video_details(yt_dlp, video_id, timeout=60):
    """One video's own metadata: length, channel, and for an album track its
    artist and album."""
    cmd = [yt_dlp, "-J", "--skip-download", "--no-warnings",
           "--socket-timeout", "15", f"https://www.youtube.com/watch?v={video_id}"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        data = json.loads(r.stdout or "{}")
    except Exception:
        return None
    return data if isinstance(data, dict) and data.get("id") else None


def album_tracks(yt_dlp, artist, title):
    """The album take, named outright: Songs-shelf entries whose title is this
    song and carries no version tag, by this artist, from an album that is not
    a concert recording, with their lengths.
    Another singer's song of the same name (姜育恒 also sang 像我这样的人) is
    dropped by the artist check."""
    found = ytmusic_songs(yt_dlp, f"{artist} {title}".strip())
    if not found:
        return []
    names = lm.simplified([title, artist] + [e.get("title") or "" for e in found])
    simp_title, simp_artist = names[0], names[1]
    picks = [e for e, name in zip(found, names[2:])
             if e.get("id") and lm.same_title(name, simp_title)
             and not lm.other_take(e.get("title"))][:ALBUM_LOOKUPS]
    if not picks:
        return []
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(picks)) as pool:
        details = [d for d in pool.map(lambda e: video_details(yt_dlp, e["id"]), picks)
                   if d and d.get("duration")]
    singers = lm.simplified([f"{d.get('artist') or ''} {d.get('channel') or ''}"
                             for d in details])
    return [{
        "id": d["id"],
        "url": f"https://www.youtube.com/watch?v={d['id']}",
        "title": d.get("title"),
        "channel": d.get("channel") or d.get("uploader"),
        "duration": d["duration"],
        "view_count": d.get("view_count"),
        "album": d.get("album"),
        # The catalogue's own names for the song, when YouTube Music has them.
        "track": d.get("track"),
        "artist": d.get("artist"),
        "_album": True,
    } for d, who in zip(details, singers)
        if (not simp_artist or lm.same_artist(simp_artist, who))
        # A concert album's track is a live take under the plain title:
        # 郭富城 風裡密碼 from 舞林正傳演唱會 07/08 was fetched as the studio
        # song and renamed after it (2026-09-24).
        and not lm.other_take(d.get("album"))]


def corroborated(albums, entries, candidates):
    """Album tracks whose length a second source agrees with — a lyrics entry
    or another upload within FIT_SECONDS. A title match allows one differing
    character (講你知 / 講妳知), so a lone album track of a different song
    could otherwise pass; two sources agreeing on its length is the guard."""
    def agrees(a):
        others = [e.get("duration") for e in entries]
        others += [c.get("duration") for c in candidates if c.get("id") != a["id"]]
        return any(isinstance(x, (int, float))
                   and abs(x - a["duration"]) <= lm.FIT_SECONDS for x in others)
    return [a for a in albums if agrees(a)]


def in_script_of(requested, name):
    """`name` written the way `requested` is: a song asked for in traditional
    characters keeps them, one asked for in simplified keeps those."""
    if not lm.is_cjk(requested) or not lm.is_cjk(name):
        return name
    if lm.is_traditional(requested):
        return lm.traditional([name])[0]
    return lm.simplified([name])[0]


def canonical_title(album, artist, title, lyric_entries=()):
    """The song's real title when the album track names it differently from the
    request — the agent asked for 郭富城 風中密碼, the catalogue says 风里密码,
    and LRCLIB only knows 風裡密碼. None when it is the same name (in any
    script) or when the album track can't be shown to be this song: its title
    must share the request's characters (and its artist the requested one's),
    or its length must agree with a lyrics set for the request."""
    name = lm._BRACKETED.sub("", str(album.get("track") or album.get("title") or "")).strip()
    if not name or not title:
        return None
    simp_name, simp_title, simp_artist, simp_who = lm.simplified(
        [name, title, artist or "", album.get("artist") or album.get("channel") or ""])
    if fold(simp_name).replace(" ", "") == fold(simp_title).replace(" ", ""):
        return None
    same = lm.same_title(simp_name, simp_title) and (not simp_artist or lm.same_artist(simp_artist, simp_who))
    seconds = album.get("duration") or 0
    agrees = any(isinstance(e.get("duration"), (int, float)) and abs(e["duration"] - seconds) <= lm.FIT_SECONDS
                 for e in lyric_entries)
    return in_script_of(title, name) if same or agrees else None


def lyrics_anchor(entries):
    """The length the right singer's timed lyrics agree on, when no album
    track was found. Entries marked as another take sit out the vote."""
    for pool in ([e for e in entries if e.get("syncedLyrics")
                  and e.get("_artist") and not e.get("_other")],
                 [e for e in entries if e.get("syncedLyrics")],
                 [e for e in entries if e.get("plainLyrics")]):
        seconds = cluster([e.get("duration") for e in pool], 2)
        if seconds:
            return round(seconds)
    return None


def title_matches(entry, names):
    """Is this upload the song asked for? Its title (or the catalogue's track
    name) must carry one of `names` — folded across case, width and script,
    decorations such as (歌词版), Live, MV or Official around it allowed, one
    slipped character tolerated. 「听风的歌 郭富城 (歌词版)」 carries no 风中密码
    and was fetched in its place (2026-09-24)."""
    hay = cjk_fold.key(f"{entry.get('title') or ''} {entry.get('track') or ''}")
    for name in names:
        k = cjk_fold.key(name)
        if not k:
            continue
        if k in hay:
            return True
        allow = cjk_fold.slips(name)
        if allow and len(hay) >= len(k) - allow:
            for size in {len(k) - 1, len(k), len(k) + 1}:
                if size <= 0:
                    continue
                for i in range(0, max(1, len(hay) - size + 1)):
                    if cjk_fold.distance(k, hay[i:i + size], allow) <= allow:
                        return True
    return False


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


def score_candidate(entry, artist, anchor, tolerance, version, lyric_entries=()):
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

    if entry.get("_album") and version == "studio":
        total += SCORE["album_track"]
        reasons.append("+album")

    # The pair: this video with the lyrics that fit IT. Worth less than the
    # album track by design — the recording is chosen for its sound.
    fitted = lm.timed_fit(lyric_entries, duration)
    if fitted:
        gap = abs((fitted.get("duration") or 0) - duration)
        total += SCORE["lyrics_exact"] if gap <= 2 else SCORE["lyrics_close"]
        reasons.append("+lyrics" if gap <= 2 else "+lyrics~")

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

    queries = build_queries(artist, title, req.get("query_hints"), version)
    if not queries:
        fail("nothing to search for")

    # Three lists at once: every lyrics set on offer, the album track, and the
    # uploads. Each is its own network round trip; together they cost the
    # slowest one (~12s), not the sum.
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        f_lyrics = pool.submit(lm.lyric_sets, artist, title, version)
        # Album tracks are the studio takes, so only a studio order asks.
        f_album = (pool.submit(album_tracks, yt_dlp, artist, title)
                   if version == "studio" else None)
        f_probe = pool.submit(probe, yt_dlp, queries, results)
        lyric_entries = f_lyrics.result()
        candidates = f_probe.result()
        albums = f_album.result() if f_album else []
    albums = corroborated(albums, lyric_entries, candidates)
    album_ids = {a["id"] for a in albums}
    candidates = albums + [c for c in candidates if c.get("id") not in album_ids]
    # "Find another source": the uploads already tried are out of the running.
    exclude = {str(x) for x in (req.get("exclude") or [])}
    candidates = [c for c in candidates if str(c.get("id")) not in exclude]
    if not candidates:
        fail("no candidates found")
    # Only the song asked for: its title, or the catalogue's name for it (the
    # album track that was corroborated), must be in the upload's title.
    names = [title] + [a.get("track") or a.get("title") or "" for a in albums]
    off_title = [c.get("title") for c in candidates if not title_matches(c, names)]
    candidates = [c for c in candidates if title_matches(c, names)]
    if off_title:
        notes.append(f"{len(off_title)} upload(s) named another song were left out")
    if not candidates:
        fail("no source matched the title")

    # The length to hold uploads to: the album track's own when there is one,
    # else what the lyrics agree on, else what the uploads agree on.
    if albums:
        anchor, anchor_source = round(albums[0]["duration"]), "album"
    else:
        anchor = lyrics_anchor(lyric_entries)
        anchor_source = "lrclib" if anchor else None
    if not anchor:
        anchor = cluster([c.get("duration") for c in candidates], 3)
        anchor_source = "pool" if anchor else "none"
        notes.append("no album track or lyrics — using the candidates' own consensus")

    tolerance = (ANCHOR_TOLERANCE if anchor_source in ("album", "lrclib")
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
        s, reasons = score_candidate(c, artist, anchor, tolerance, version,
                                     lyric_entries)
        if s is None:
            continue
        ranked.append({
            "id": c["id"],
            "url": c.get("url") or f"https://www.youtube.com/watch?v={c['id']}",
            "duration": round(c.get("duration") or 0),
            "video_title": c.get("title"),
            "channel": c.get("channel") or c.get("uploader"),
            "album": c.get("album"),
            "score": s,
            "why": reasons,
        })

    # Everything gated out means the anchor and the pool disagree — a
    # mis-tagged LRCLIB entry, or a song whose only uploads are live. Better a
    # scored guess than nothing, but say so.
    if not ranked:
        notes.append("nothing matched the expected length — picking on title alone")
        for c in candidates:
            s, reasons = score_candidate(c, artist, None, 0, version,
                                         lyric_entries)
            if s is not None:
                ranked.append({
                    "id": c["id"],
                    "url": c.get("url") or f"https://www.youtube.com/watch?v={c['id']}",
                    "duration": round(c.get("duration") or 0),
                    "video_title": c.get("title"),
                    "channel": c.get("channel") or c.get("uploader"),
                    "album": c.get("album"),
                    "score": s,
                    "why": reasons,
                })
    if not ranked:
        fail("no usable candidate")

    ranked.sort(key=lambda r: r["score"], reverse=True)
    win = ranked[0]
    album = next((c for c in candidates if c.get("_album") and c["id"] == win["id"]), None)
    canonical = canonical_title(album, artist, title, lyric_entries) if album else None
    # What the winner's lyrics are expected to be. Callers fit again against
    # the file that actually lands (lyrics_match.for_file): yt-dlp walks down
    # `urls` when a video is dead, and the one that downloads is the one the
    # lyrics must match.
    plan = lm.fit(lyric_entries, win["duration"])
    print(json.dumps({
        "ok": True,
        # Ordered, best first. Callers hand the WHOLE list to yt-dlp with
        # --ignore-errors --max-downloads 1 so it walks down on a dead video,
        # the way it used to walk down a search. Ranking decides the order;
        # it must not cost the resilience of having somewhere to fall back to.
        "urls": [r["url"] for r in ranked[:4]],
        "url": win["url"],
        "id": win["id"],
        "duration": win["duration"],
        "video_title": win["video_title"],
        "channel": win["channel"],
        "score": win["score"],
        "why": win["why"],
        "anchor": {"seconds": anchor, "source": anchor_source},
        "album": win["album"],
        # Name the song by this, not the request, when set: filename, tags,
        # library row and the lyrics lookup.
        "canonical_title": canonical,
        "lyrics": ({k: plan[k] for k in ("synced", "duration", "gap")}
                   if plan else None),
        "runners_up": ranked[1:4],
        "considered": len(candidates),
        "queries": queries,
        "notes": notes,
    }))


if __name__ == "__main__":
    main()
