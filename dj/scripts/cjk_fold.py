"""cjk_fold.py — one song, whatever script or slip it is named in.

A library row keeps the name it landed under: 郭富城 - 風中密碼 in traditional.
A request can arrive in simplified (风中密码) or with one character slipped
(风里密码), and a plain substring test answered "not in the library" to both —
so GetTracks fetched the song twice more (2026-09-24). Everything that asks
"do I have this song" folds through here: case, width, script (traditional →
simplified from t2s.json, a table made from macOS ICU so it works anywhere),
spacing and punctuation.

    exact(a, b)  same artist and same title once folded
    near(a, b)   same artist, titles one slip apart — worth asking about

Pure: no network. tests/test_cjk_fold.py pins it.
"""
import json
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
_TABLE = None
_PUNCT = re.compile(r"[\s\-_/|·・,，.。:：;；!！?？'\"“”‘’`~()（）\[\]【】{}<>《》「」『』]+")
_BRACKETED = re.compile(r"[(（\[【].*?[)）\]】]")


def _table():
    global _TABLE
    if _TABLE is None:
        try:
            with open(os.path.join(HERE, "t2s.json"), encoding="utf-8") as f:
                d = json.load(f)
            _TABLE = str.maketrans(d["t"], d["s"])
        except Exception:
            _TABLE = {}
    return _TABLE


def is_cjk(s):
    return any("一" <= c <= "鿿" or "㐀" <= c <= "䶿" for c in str(s or ""))


def fold(s):
    """Case, width and script folded; spacing kept (for substring search)."""
    s = unicodedata.normalize("NFKC", str(s or "")).casefold()
    return re.sub(r"\s+", " ", s.translate(_table())).strip()


def key(s):
    """The comparable core of a name: folded, bracketed tags and punctuation
    gone. 「風中密碼 (Live)」 and 「风中密码」 have one key."""
    s = _BRACKETED.sub("", unicodedata.normalize("NFKC", str(s or "")))
    return _PUNCT.sub("", fold(s))


def distance(a, b, cap=3):
    """Edit distance, stopping early past `cap`."""
    if abs(len(a) - len(b)) > cap:
        return cap + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        if min(cur) > cap:
            return cap + 1
        prev = cur
    return prev[-1]


def slips(title):
    """How many slips a title may carry and still be the same song: one
    character for a CJK title of three or more, a little more for a long
    Latin one. A title of one or two characters allows none — 愛你 and 愛我
    are two songs."""
    k = key(title)
    if len(k) < 2:
        return 0
    if is_cjk(k):
        return 1 if len(k) >= 3 else 0
    return 1 if len(k) <= 12 else 2


def same_artist(a, b):
    ka, kb = key(a), key(b)
    return bool(ka) and bool(kb) and (ka == kb or ka in kb or kb in ka)


def exact(a, b):
    """Same song: same artist (or one unnamed) and the same title, folded."""
    if not key(a.get("title")) or key(a.get("title")) != key(b.get("title")):
        return False
    return not key(a.get("artist")) or not key(b.get("artist")) or same_artist(a.get("artist"), b.get("artist"))


def near(a, b):
    """Not the same name, but one slip from it, by the same artist."""
    if exact(a, b) or not same_artist(a.get("artist"), b.get("artist")):
        return False
    ta, tb = key(a.get("title")), key(b.get("title"))
    allow = min(slips(a.get("title")), slips(b.get("title")))
    return bool(allow) and distance(ta, tb, allow) <= allow


def find(tracks, want):
    """(exact rows, near rows) in `tracks` for the song `want`."""
    rows = [t for t in tracks or [] if t.get("file")]
    return [t for t in rows if exact(want, t)], [t for t in rows if near(want, t)]


def regen():
    """Rebuild t2s.json from macOS ICU (the one-time source of the table)."""
    sys.path.insert(0, HERE)
    import lyrics_match as lm
    chars = ([chr(c) for c in range(0x3400, 0x4DC0)] + [chr(c) for c in range(0x4E00, 0xA000)]
             + [chr(c) for c in range(0xF900, 0xFB00)])
    out = lm.simplified(["".join(chars)])[0]
    if len(out) != len(chars):
        raise SystemExit("ICU changed the text length; table not written")
    pairs = [(a, b) for a, b in zip(chars, out) if a != b and len(b) == 1] + [("妳", "你")]
    with open(os.path.join(HERE, "t2s.json"), "w", encoding="utf-8") as f:
        json.dump({"about": "Traditional→simplified, one character each, from macOS ICU's "
                            "Traditional-Simplified transform (U+3400–4DBF, U+4E00–9FFF, "
                            "U+F900–FAFF) plus 妳→你. Regenerate with scripts/cjk_fold.py --regen on a Mac.",
                   "t": "".join(a for a, _ in pairs), "s": "".join(b for _, b in pairs)},
                  f, ensure_ascii=False)
    print(len(pairs))


if __name__ == "__main__" and "--regen" in sys.argv:
    regen()
