#!/usr/bin/env python3
"""list_library.py — backs the ListLibrary tool: the library, slim.

    list_library.py <library.json> [query] [limit] [offset] [playlist] [view]

Every omitted arg may arrive as its literal {{placeholder}}; that means absent.
Rows carry what a model needs to curate and to name a song back to the write
tools — never paths, ids or the page's bookkeeping. `track_count` is the whole
library, stamped from the data: the model quotes it instead of tallying rows
(an agent once listed all 55 songs and still wrote "50").
"""
import json
import sys
import unicodedata

DEFAULT_LIMIT = 100


def given(i):
    v = sys.argv[i].strip() if len(sys.argv) > i else ""
    return "" if v.startswith("{{") and v.endswith("}}") else v


def number(v, fallback, lo, hi):
    try:
        return max(lo, min(hi, int(float(v))))
    except (TypeError, ValueError):
        return fallback


def fold(s):
    """Case- and width-insensitive: ＢＥＹＯＮＤ matches beyond."""
    return unicodedata.normalize("NFKC", str(s or "")).casefold()


def base(p):
    return str(p or "").rsplit("/", 1)[-1]


def row(t):
    r = {"artist": t.get("artist") or "", "title": t.get("title") or ""}
    if t.get("year"):
        r["year"] = t["year"]
    r.update(file=base(t.get("file")), lyrics=bool(t.get("lrc")),
             karaoke=bool(t.get("karaoke_audio") or t.get("karaoke_video")),
             on_phone=bool(t.get("on_phone")))
    if t.get("plays"):
        r["plays"] = t["plays"]
        r["last_played"] = t.get("last_played")
    return r


def lists(pls):
    return [{"name": p.get("name"), "count": len(p.get("files") or [])} for p in pls or []]


def scope(lib, playlist, view):
    """The rows asked about: one playlist in its running order, the phone's
    songs, or the whole library."""
    tracks = [t for t in lib.get("tracks") or [] if t.get("file")]
    phone = lib.get("phone") or {}
    if playlist:
        pls = phone.get("playlists") if view == "phone" else lib.get("playlists")
        files = next((p.get("files") or [] for p in pls or [] if p.get("name") == playlist), [])
        by = {base(t["file"]): t for t in tracks}
        return [by[f] for f in files if f in by]
    if view == "phone":
        return [t for t in tracks if t.get("on_phone")]
    return tracks


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        with open(path, encoding="utf-8") as f:
            lib = json.load(f)
    except FileNotFoundError:
        lib = {}
    except Exception:
        print(json.dumps({"ok": False, "error": "library.json is unreadable"}))
        return
    query, playlist, view = fold(given(2)).strip(), given(5), given(6).lower()
    limit = number(given(3), DEFAULT_LIMIT, 1, 1000)
    offset = number(given(4), 0, 0, 10**6)

    rows = scope(lib, playlist, view)
    if query:
        rows = [t for t in rows if query in fold(f"{t.get('artist', '')} {t.get('title', '')}")]
    page = rows[offset:offset + limit]
    phone = lib.get("phone") or {}
    print(json.dumps({
        "track_count": len([t for t in lib.get("tracks") or [] if t.get("file")]),
        "playlist_count": len(lib.get("playlists") or []),
        "match_count": len(rows),
        "offset": offset,
        "has_more": offset + len(page) < len(rows),
        "tracks": [row(t) for t in page],
        "playlists": lists(lib.get("playlists")),
        "phone": {"track_count": len(phone.get("files") or []), "playlists": lists(phone.get("playlists"))},
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
