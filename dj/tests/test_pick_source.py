"""pick-source.py's canonical title, and lyrics_match's retry under it.

The case (2026-09-24): the agent asked for 郭富城「風中密碼」. The song is
「風裡密碼」 — YouTube Music lists it as 风里密码 at 221.066 s, the file runs
221.07 s — and LRCLIB has nothing under the asked-for title and seven entries
under the real one. Offline: script conversion and LRCLIB are stubbed.
Run: python3 -m unittest discover -s dj/tests
"""
import importlib.util
import os
import sys
import unittest

SCRIPTS = os.path.join(os.path.dirname(__file__), "..", "scripts")
sys.path.insert(0, SCRIPTS)
import lyrics_match as lm  # noqa: E402

spec = importlib.util.spec_from_file_location("pick_source", os.path.join(SCRIPTS, "pick-source.py"))
ps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ps)

# What macOS's ICU transform does for the strings in play.
TO_SIMP = {"風中密碼": "风中密码", "風裡密碼": "风里密码", "海闊天空": "海阔天空"}
TO_TRAD = {"风里密码": "風裡密碼", "风中密码": "風中密碼"}

ALBUM = {"id": "x", "track": "风里密码", "title": "风里密码", "artist": "郭富城",
         "duration": 221.066, "_album": True}

PLAIN = {"id": 18929827, "trackName": "風裡密碼", "artistName": "郭富城",
         "duration": 221.100408, "syncedLyrics": None, "plainLyrics": "words",
         "_artist": True, "_other": False}


class Stubbed(unittest.TestCase):
    def setUp(self):
        self.saved = (lm.simplified, lm.traditional, lm.lyric_sets, lm.file_seconds)
        lm.simplified = lambda texts: [TO_SIMP.get(t, t) for t in texts]
        lm.traditional = lambda texts: [TO_TRAD.get(t, t) for t in texts]

    def tearDown(self):
        lm.simplified, lm.traditional, lm.lyric_sets, lm.file_seconds = self.saved


class CanonicalTitle(Stubbed):
    def test_the_album_track_names_the_song_in_the_asked_script(self):
        self.assertEqual(ps.canonical_title(ALBUM, "郭富城", "風中密碼"), "風裡密碼")

    def test_the_same_name_in_another_script_is_not_a_rename(self):
        album = {**ALBUM, "track": "海阔天空", "artist": "Beyond"}
        self.assertIsNone(ps.canonical_title(album, "Beyond", "海闊天空"))

    def test_another_singer_is_not_this_song(self):
        self.assertIsNone(ps.canonical_title({**ALBUM, "artist": "黎明"}, "郭富城", "風中密碼"))

    def test_a_length_agreeing_with_a_lyrics_set_is_enough(self):
        album = {**ALBUM, "track": "完全不同", "artist": "someone"}
        self.assertEqual(ps.canonical_title(album, "郭富城", "風中密碼", [{"duration": 219.5}]), "完全不同")
        self.assertIsNone(ps.canonical_title(album, "郭富城", "風中密碼", [{"duration": 300}]))

    def test_a_bracketed_translation_is_not_part_of_the_title(self):
        album = {**ALBUM, "track": "风里密码 (Code in the Wind)"}
        self.assertEqual(ps.canonical_title(album, "郭富城", "風中密碼"), "風裡密碼")


class LyricsUnderTheRealTitle(Stubbed):
    def test_nothing_under_the_asked_title_so_the_real_one_is_asked(self):
        asked = []

        def sets(artist, title, version="studio"):
            asked.append(title)
            return [PLAIN] if title == "風裡密碼" else []

        lm.lyric_sets = sets
        lm.file_seconds = lambda path: 221.07
        got = lm.for_file("郭富城", "風中密碼", "/m/x.mp3", other_titles=["風裡密碼"])
        self.assertEqual(asked, ["風中密碼", "風裡密碼"])
        self.assertEqual((got["title"], got["synced"], got["body"]), ("風裡密碼", False, "words"))

    def test_found_under_the_first_title_the_ladder_stops(self):
        asked = []
        lm.lyric_sets = lambda a, t, v="studio": asked.append(t) or [PLAIN]
        lm.file_seconds = lambda path: 221.07
        lm.for_file("郭富城", "風裡密碼", "/m/x.mp3", other_titles=["風中密碼"])
        self.assertEqual(asked, ["風裡密碼"])

    def test_nowhere_under_any_title_is_none(self):
        lm.lyric_sets = lambda a, t, v="studio": []
        lm.file_seconds = lambda path: 221.07
        self.assertIsNone(lm.for_file("郭富城", "風中密碼", "/m/x.mp3", other_titles=["風裡密碼"]))


class Downloader(Stubbed):
    def test_fetch_names_the_song_by_the_catalogue_and_keeps_the_ask(self):
        import fetch
        t = fetch.canonical({"artist": "郭富城", "title": "風中密碼"}, {"canonical_title": "風裡密碼"})
        self.assertEqual((t["title"], t["requested_title"]), ("風裡密碼", "風中密碼"))
        self.assertIs(fetch.canonical(t, {"canonical_title": None}), t)
        kept = {"artist": "A", "title": "B"}
        self.assertIs(fetch.canonical(kept, {"canonical_title": "C"}, dest="/m/A - B.mp3"), kept,
                      "a replacement keeps its file's name")


if __name__ == "__main__":
    unittest.main()
