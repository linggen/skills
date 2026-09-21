#!/usr/bin/env python3
# lyrics_match.py — which lyrics belong to which recording. The one place DJ
# decides it: pick-source.py pairs each video with the lyrics that fit it, and
# every lyric lookup after a download (get.sh, lyrics.js → attachLyrics) fits
# the file on disk through here. The phone's DjEnrich runs the same rule.
#
# A .lrc is a clock for ONE recording: `[00:32.68] 笑你我枉花光心計` means "32.68 s
# into this file". A live take, an MV with a spoken intro, a TV cut all run on
# other clocks, so their lyrics never line up with the album track. What
# LRCLIB offers per entry is a duration, and that duration is only a claim —
# the same timings get re-uploaded under many lengths (李香蘭: one set at 13
# lengths from 60 s to 400 s). So a set fits a file only when its length is
# within FIT_SECONDS of the file AND its last line starts before the file
# ends; 像我这样的人 on a 168 s TV cut carried a set "171 s" long whose last
# line sings at 3:13.
#
# When nothing timed fits, the words are still saved, without timings — the
# recording was chosen for its sound, and every player shows words-only
# sidecars as such.
#
# CLI: one JSON object (argv[1] or stdin) → one JSON line.
#   in : {artist, title, file, version?}
#   out: {ok, body, synced, duration, gap, seconds} — or {ok:false, error}

import concurrent.futures
import json
import re
import subprocess
import sys
import unicodedata
import urllib.parse
import urllib.request

UA = "DJ (Linggen music app) https://linggen.dev"

FIT_SECONDS = 5  # a set timed within this of the file is timed for the file
TITLE_OVERLAP = 2 / 3  # share of a title's characters another must carry

# Words that mark a DIFFERENT RECORDING than the album track — in a video
# title, and in a lyrics entry's track or album name alike. Each row is tagged
# with the version it describes: asked for that version, the picker turns the
# penalty into a bonus of the same size.
TITLE_TERMS = [
    (45, "live", ["live", "现场", "現場", "演唱会", "演唱會", "concert",
                  "tour", "unplugged", "巡回", "巡迴", "live版"]),
    (45, "cover", ["cover", "翻唱", "cover版", "reaction", "reacts", "解说", "解說"]),
    (45, "instrumental", ["instrumental", "伴奏", "纯音乐", "純音樂", "karaoke",
                          "卡拉ok", "off vocal", "无人声", "無人聲"]),
    (40, "remix", ["remix", "混音", "dj版", "sped up", "slowed", "nightcore",
                   "8d", "bass boosted", "抖音版", "摇滚版", "搖滾版", "钢琴版",
                   "鋼琴版", "acoustic", "acoustic version"]),
    # The MV cut often opens on a scene or a spoken line, which moves every
    # lyric; a small push toward the album track, never a veto.
    (10, "mv", ["mv", "music video", "m/v"]),
    # Never wanted, under any `version`: these are not the song at all. The
    # tag is None so no request can turn them into a bonus.
    (90, None, ["medley", "串烧", "串燒", "合集", "全集", "精选集", "精選集",
                "mix", "megamix", "1 hour", "一小时", "一小時", "loop"]),
]

_STAMP = re.compile(r"\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]")
_BRACKETED = re.compile(r"[(（\[【].*?[)）\]】]")


# ------------------------------------------------------------------- utilities

def fold(s):
    """Lowercase + strip punctuation so term matching survives 【】 and dashes."""
    s = unicodedata.normalize("NFKC", str(s or "")).lower()
    return re.sub(r"[\s\-_/|·・,，.。:：!！?？'\"“”‘’()（）\[\]【】]+", " ", s).strip()


def is_cjk(s):
    return any("一" <= c <= "鿿" or "぀" <= c <= "ヿ"
               for c in str(s or ""))


def simplified(texts):
    """Traditional → simplified through macOS's own ICU, one call for the lot.
    LRCLIB and YouTube Music file Chinese songs under either script, and ICU
    also folds variants (難唸的經 → 难念的经). Anything it can't do, the texts
    come back as they went in."""
    texts = [str(t or "").replace("\n", " ") for t in texts]
    if not any(is_cjk(t) for t in texts):
        return texts
    js = ("ObjC.import('Foundation');"
          f" var s = $.NSMutableString.stringWithString({json.dumps(chr(10).join(texts))});"
          " s.applyTransformReverseRangeUpdatedRange("
          "$.NSString.stringWithString('Traditional-Simplified'),"
          " false, $.NSMakeRange(0, s.length), $());"
          " ObjC.unwrap(s)")
    try:
        out = subprocess.run(["osascript", "-l", "JavaScript", "-e", js],
                             capture_output=True, text=True, timeout=15).stdout
    except Exception:
        return texts
    lines = out.rstrip("\n").split("\n")
    return lines if len(lines) == len(texts) else texts


def cluster(values, width):
    """Largest group of numbers within `width` of each other, and its median —
    the length several sources agree on, rather than the first one offered."""
    vals = sorted(v for v in values if isinstance(v, (int, float)) and v > 0)
    if not vals:
        return None
    best = []
    for v in vals:
        group = [w for w in vals if abs(w - v) <= width]
        if len(group) > len(best):
            best = group
    return best[len(best) // 2]


def _tokens(name):
    """What a title is made of, brackets aside: its characters for CJK (no
    word breaks to split on), its words otherwise."""
    core = fold(_BRACKETED.sub(" ", str(name or "")))
    return set(core.replace(" ", "")) if is_cjk(core) else set(core.split())


def same_title(a, b):
    """Two names for the same song? Pass both through `simplified` first.
    Title variants differ by a character (講你知 / 講妳知), so the bar is a
    share of characters, not equality; the bracketed part — an English
    translation, a version tag — is left out of the comparison."""
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return False
    return len(ta & tb) / max(len(ta), len(tb)) >= TITLE_OVERLAP - 1e-9


def same_artist(a, b):
    """Do two artist names share a run of characters? 周杰伦 and 周杰倫 Jay
    Chou share no whole word but are one artist. Simplify both first."""
    a, b = fold(a).replace(" ", ""), fold(b).replace(" ", "")
    n = 2 if is_cjk(a) else 4
    if not a or not b:
        return False
    if len(a) < n:
        return a in b
    return any(a[i:i + n] in b for i in range(len(a) - n + 1))


def other_take(name, version="studio"):
    """Does this name mark a recording other than the one asked for?"""
    folded = fold(name)
    return any(tag != version and any(t in folded for t in terms)
               for _, tag, terms in TITLE_TERMS)


def last_line_at(body):
    """Seconds at which the last timed line starts; 0 for an untimed body."""
    last = 0.0
    for m in _STAMP.finditer(str(body or "")):
        frac = m.group(3) or "0"
        last = max(last, int(m.group(1)) * 60 + int(m.group(2))
                   + int(frac) / (10 ** len(frac)))
    return last


def file_seconds(path):
    """The file's own length from `afinfo` (macOS's own); 0 when it can't say."""
    try:
        out = subprocess.run(["afinfo", path], capture_output=True, text=True,
                             timeout=20).stdout
    except Exception:
        return 0
    m = re.search(r"estimated duration:\s*([\d.]+)", out)
    return float(m.group(1)) if m else 0


# ---------------------------------------------------------------------- lrclib

def lrclib_search(q, timeout=12):
    """Free-text LRCLIB search. The exact artist/track fields miss
    original-language titles; `q=` is far more forgiving."""
    if not q:
        return []
    url = "https://lrclib.net/api/search?q=" + urllib.parse.quote(q)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        arr = json.loads(urllib.request.urlopen(req, timeout=timeout).read().decode())
    except Exception:
        return []
    return arr if isinstance(arr, list) else []


def lyric_sets(artist, title, version="studio"):
    """Every LRCLIB entry for this song, from all four ways it can be filed:
    artist+title, the same in simplified, the title alone, the title
    simplified. LRCLIB indexes Chinese songs under simplified characters, and
    an artist filed in English poisons the query, so each asks something the
    others miss. The union is kept — pairing needs every length on offer.

    Entries come back annotated: `_artist` (the artist matches) and `_other`
    (the names mark another take). Entries for a different song are dropped.
    """
    artist, title = str(artist or "").strip(), str(title or "").strip()
    both = f"{artist} {title}".strip()
    if not both:
        return []
    simp_both, simp_title, simp_artist = simplified([both, title, artist])
    queries = list(dict.fromkeys(q for q in (both, simp_both, title, simp_title) if q))
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(queries)) as pool:
        answers = list(pool.map(lrclib_search, queries))
    seen = {}
    for arr in answers:
        for e in arr:
            if isinstance(e, dict) and e.get("id") is not None and e["id"] not in seen:
                seen[e["id"]] = e
    entries = list(seen.values())
    if not entries:
        return []
    names = simplified([x for e in entries
                        for x in (e.get("trackName"), e.get("artistName"))])
    kept = []
    for i, e in enumerate(entries):
        track, who = names[2 * i], names[2 * i + 1]
        # The title-alone queries find every song of that name; a different
        # song is dropped here, a different singer is only ranked lower.
        if simp_title and not same_title(track, simp_title):
            continue
        e["_artist"] = not simp_artist or same_artist(simp_artist, who)
        e["_other"] = other_take(f"{e.get('trackName')} {e.get('albumName')}", version)
        kept.append(e)
    return kept


# ------------------------------------------------------------------------- fit

def _rank(e, seconds):
    """Right singer first, then an entry not marked as another take, then the
    closest length."""
    return (not e.get("_artist", True), bool(e.get("_other")),
            abs((e.get("duration") or 0) - seconds))


def timed_fit(entries, seconds):
    """The timed set that belongs to a recording `seconds` long, or None.

    Fits = within FIT_SECONDS of the file and its last line starts before the
    file ends. With no length to go on (a file afinfo can't read), the length
    the right singer's entries agree on stands in for it.
    """
    timed = [e for e in entries
             if e.get("syncedLyrics") and not e.get("instrumental")]
    if not timed:
        return None
    if not seconds:
        pool = [e for e in timed if e.get("_artist", True) and not e.get("_other")] or timed
        seconds = cluster([e.get("duration") for e in pool], 2) or 0
        if not seconds:
            return None
    fits = [e for e in timed
            if abs((e.get("duration") or 0) - seconds) <= FIT_SECONDS
            and last_line_at(e["syncedLyrics"]) < seconds]
    return min(fits, key=lambda e: _rank(e, seconds)) if fits else None


def fit(entries, seconds):
    """Lyrics for a recording `seconds` long: the timed set that fits it, else
    the words alone. {body, synced, duration, gap} or None."""
    e = timed_fit(entries, seconds)
    if e:
        return {"body": e["syncedLyrics"], "synced": True,
                "duration": round(e.get("duration") or 0),
                "gap": round(abs((e.get("duration") or 0) - seconds), 1) if seconds else None}
    words = [e for e in entries if (e.get("plainLyrics") or "").strip()]
    if not words:
        return None
    e = min(words, key=lambda e: _rank(e, seconds or 0))
    return {"body": e["plainLyrics"], "synced": False,
            "duration": round(e.get("duration") or 0), "gap": None}


def for_file(artist, title, path, version="studio"):
    """The lyrics to write next to an audio file already on disk."""
    seconds = file_seconds(path) if path else 0
    got = fit(lyric_sets(artist, title, version), seconds)
    if got:
        got["seconds"] = round(seconds, 1)
    return got


# ------------------------------------------------------------------------- cli

def main():
    raw = sys.argv[1] if len(sys.argv) > 1 else ""
    if not raw or raw.startswith("{{"):
        raw = sys.stdin.read()
    try:
        req = json.loads(raw or "{}")
    except Exception:
        print(json.dumps({"ok": False, "error": "couldn't read the request"}))
        return
    got = for_file(req.get("artist"), req.get("title"), req.get("file"),
                   str(req.get("version") or "studio").lower())
    print(json.dumps({"ok": True, **got} if got else
                     {"ok": False, "error": "no lyrics found"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
