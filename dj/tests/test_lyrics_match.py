"""lyrics_match.py — the rules that decide which lyrics belong to a recording.

Offline: no LRCLIB, no YouTube. Run: python3 -m unittest discover -s dj/tests
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import lyrics_match as lm  # noqa: E402


def timed(duration, last, artist=True, other=False, lines=3):
    """An LRCLIB entry whose last line starts at `last` seconds."""
    step = last / max(1, lines - 1)
    body = "\n".join(f"[{int(i * step // 60):02d}:{i * step % 60:05.2f}] line {i}"
                     for i in range(lines))
    return {"duration": duration, "syncedLyrics": body, "plainLyrics": "words",
            "_artist": artist, "_other": other}


class Titles(unittest.TestCase):
    def test_one_variant_character_is_the_same_song(self):
        self.assertTrue(lm.same_title("讲妳知", "讲你知"))

    def test_a_different_song_sharing_characters_is_not(self):
        self.assertFalse(lm.same_title("你知不知道", "讲你知"))

    def test_the_bracketed_translation_is_left_out(self):
        self.assertTrue(lm.same_title("难念的经 (A HARD SCRIPTURE TO READ)", "难念的经"))

    def test_latin_titles_compare_by_word(self):
        self.assertTrue(lm.same_title("Someone Like You", "someone like you"))
        self.assertFalse(lm.same_title("Rolling in the Deep", "Someone Like You"))


class Artists(unittest.TestCase):
    def test_a_shared_run_is_the_same_artist(self):
        self.assertTrue(lm.same_artist("周杰伦", "周杰伦 jay chou"))

    def test_another_singer_of_the_same_title_is_not(self):
        self.assertFalse(lm.same_artist("毛不易", "姜育恒 - topic"))


class Takes(unittest.TestCase):
    def test_live_marks_another_take(self):
        self.assertTrue(lm.other_take("像我这样的人 (Live)"))

    def test_a_translation_does_not(self):
        self.assertFalse(lm.other_take("難唸的經 (A HARD SCRIPTURE TO READ)"))

    def test_asking_for_live_makes_live_the_take(self):
        self.assertFalse(lm.other_take("像我这样的人 (Live)", version="live"))


class Fit(unittest.TestCase):
    def test_word_stamps_never_reach_the_sidecar(self):
        # 青花瓷 (2026-10-03): LRCLIB timed every word; the car printed the stamps.
        body = "[00:21.98]<00:21.975>素<00:22.207>胚<00:22.423>勾<00:22.736>勒<00:23.071>"
        self.assertEqual(lm.line_stamps_only(body), "[00:21.98]素胚勾勒")

    def test_last_line_at_reads_the_latest_stamp(self):
        self.assertAlmostEqual(lm.last_line_at("[00:10.50] a\n[03:13.00] b"), 193.0)
        self.assertEqual(lm.last_line_at("words only"), 0)

    def test_a_set_whose_last_line_runs_past_the_end_does_not_fit(self):
        # 像我这样的人 on a 168 s TV cut: a set filed at 171 s sang to 3:13.
        self.assertIsNone(lm.timed_fit([timed(171, 193)], 168))

    def test_the_closest_fitting_length_wins(self):
        got = lm.timed_fit([timed(212, 200), timed(207, 200)], 207)
        self.assertEqual(got["duration"], 207)

    def test_beyond_five_seconds_is_another_recording(self):
        self.assertIsNone(lm.timed_fit([timed(288, 270)], 267))

    def test_the_right_singer_outranks_a_closer_length(self):
        right, wrong = timed(209, 200), timed(207, 200, artist=False)
        self.assertIs(lm.timed_fit([wrong, right], 207), right)

    def test_an_unmarked_entry_outranks_a_live_one(self):
        studio, live = timed(206, 200), timed(207, 200, other=True)
        self.assertIs(lm.timed_fit([live, studio], 207), studio)

    def test_nothing_timed_fits_so_the_words_are_kept(self):
        got = lm.fit([timed(288, 270)], 267)
        self.assertEqual(got, {"body": "words", "synced": False,
                               "duration": 288, "gap": None})

    def test_no_file_length_falls_back_to_what_the_sets_agree_on(self):
        got = lm.timed_fit([timed(268, 262), timed(268, 262), timed(289, 280)], 0)
        self.assertEqual(got["duration"], 268)


def copies(lengths, last=262.57, other=False, artist=True):
    """One set of timings re-filed at each of `lengths`."""
    return [timed(d, last, artist=artist, other=other, lines=40) for d in lengths]


class Copies(unittest.TestCase):
    """A set's length is where most believable copies of it are filed."""

    def test_a_copy_away_from_home_fits_nothing(self):
        # 難念的經: one set, filed at 268 ×5 and 287–289 ×7 — timed for 289.
        sets = copies([227, 268, 268, 268, 268, 268, 287, 288, 288, 289, 289, 289, 289])
        self.assertIsNone(lm.timed_fit(sets, 268.0))
        self.assertEqual(lm.timed_fit(sets, 289.0)["duration"], 289)

    def test_a_copy_too_short_for_its_own_last_line_is_no_vote(self):
        # 像我这样的人: the set sings to 3:13, so its 171–172 copies can't be.
        sets = copies([171, 172, 172, 172, 207, 207], last=193.0)
        self.assertEqual(lm.timed_fit(sets, 207.0)["duration"], 207)

    def test_live_copies_sit_out_when_a_plain_one_votes(self):
        sets = copies([265, 265, 265], last=220.0, other=True) + copies([232], last=220.0)
        self.assertEqual(lm.timed_fit(sets, 231.0)["duration"], 232)

    def test_a_tie_keeps_both_lengths(self):
        sets = copies([200, 200, 240, 240], last=190.0)
        self.assertIsNotNone(lm.timed_fit(sets, 200.0))
        self.assertIsNotNone(lm.timed_fit(sets, 240.0))


class BrokenClock(unittest.TestCase):
    def test_lines_crammed_under_a_second_apart_fit_nothing(self):
        # 如果·愛's bad upload: five lines inside two seconds at 1:09.
        body = "\n".join(f"[01:{9 + i * 0.6:05.2f}] line {i}" for i in range(5))
        body += "\n[03:31.77] last"
        e = {"duration": 230.0, "syncedLyrics": body, "plainLyrics": "words",
             "_artist": True, "_other": False}
        self.assertTrue(lm.crammed(body))
        self.assertIsNone(lm.timed_fit([e], 230.0))
        self.assertFalse(lm.fit([e], 230.0)["synced"])

    def test_an_ordinary_set_is_not_crammed(self):
        self.assertFalse(lm.crammed(timed(230, 220, lines=40)["syncedLyrics"]))


NE_BODY = ("[00:00.000] 作词 : 小美\n[00:01.000] 作曲 : 谭国政\n"
           "[00:02.000] 编曲 : 谭国政\n[00:03.000] 制作人 : 小美/谭国政/郭富城\n"
           + "\n".join(f"[{(20 + i * 5) // 60:02d}:{(20 + i * 5) % 60:02d}.600]line {i}"
                       for i in range(36)))


def ne_song(duration_ms, name="风里密码", artist="郭富城", id=88393):
    return {"id": id, "name": name, "artists": [{"name": artist}],
            "album": {"name": "风里密码"}, "duration": duration_ms, "alias": []}


class NetEase(unittest.TestCase):
    """NetEase is asked only when LRCLIB has no timed set that fits."""

    def setUp(self):
        self.saved = {k: getattr(lm, k) for k in
                      ("simplified", "file_seconds", "lyric_sets", "_netease_get")}
        lm.simplified = lambda xs: list(xs)
        lm.file_seconds = lambda path: 221.067
        self.lrclib = [{"id": 1, "duration": 221, "plainLyrics": "words",
                        "_artist": True, "_other": False}]
        lm.lyric_sets = lambda artist, title, version="studio": self.lrclib
        self.calls = []
        self.songs = [ne_song(240000, id=1), ne_song(221066)]

        def get(path, params):
            self.calls.append(path)
            if path == "search/get":
                return {"code": 200, "result": {"songs": self.songs}}
            return {"lrc": {"lyric": NE_BODY}} if params["id"] == 88393 else {}
        lm._netease_get = get

    def tearDown(self):
        for k, v in self.saved.items():
            setattr(lm, k, v)

    def ask(self):
        return lm.for_file("郭富城", "风里密码", "/x.mp3")

    def test_lrclib_timed_fit_never_asks_netease(self):
        self.lrclib = [timed(221, 200)]
        got = self.ask()
        self.assertEqual((got["synced"], got["source"]), (True, "lrclib"))
        self.assertEqual(self.calls, [])

    def test_no_timed_fit_on_lrclib_takes_the_netease_set_of_this_length(self):
        got = self.ask()
        self.assertEqual((got["synced"], got["source"], got["duration"]), (True, "netease", 221))
        self.assertEqual(self.calls, ["search/get", "song/lyric"])

    def test_credit_lines_are_stripped(self):
        body = self.ask()["body"]
        self.assertTrue(body.startswith("[00:20.600]line 0"))
        for word in ("作词", "作曲", "编曲", "制作人"):
            self.assertNotIn(word, body)

    def test_no_netease_song_of_this_length_keeps_the_lrclib_words(self):
        self.songs = [ne_song(240000), ne_song(180000)]
        got = self.ask()
        self.assertEqual((got["body"], got["synced"], got["source"]), ("words", False, "lrclib"))
        self.assertEqual(self.calls, ["search/get"])

    def test_another_song_of_the_same_length_is_not_taken(self):
        self.songs = [ne_song(221066, name="恋爱态度1998")]
        self.assertFalse(self.ask()["synced"])

    def test_a_set_that_runs_past_the_file_does_not_fit(self):
        self.lrclib = []
        lm._netease_get = lambda path, params: (
            {"result": {"songs": [ne_song(221066)]}} if path == "search/get"
            else {"lrc": {"lyric": "[00:20.00]a\n[03:50.00]b"}})
        self.assertIsNone(self.ask())

    def test_a_netease_failure_falls_back_to_the_words(self):
        lm._netease_get = lambda path, params: None
        got = self.ask()
        self.assertEqual((got["body"], got["synced"]), ("words", False))

    def test_a_real_failure_inside_the_helper_returns_none(self):
        lm._netease_get = self.saved["_netease_get"]
        lm.NETEASE, saved = "http://127.0.0.1:9/api", lm.NETEASE
        try:
            self.assertIsNone(lm._netease_get("search/get", {"s": "x"}))
        finally:
            lm.NETEASE = saved

    def test_nothing_anywhere_is_nothing(self):
        self.lrclib = []
        lm._netease_get = lambda path, params: {"result": {}}
        self.assertIsNone(self.ask())

    def test_no_file_length_never_asks_netease(self):
        lm.file_seconds = lambda path: 0
        self.assertFalse(self.ask()["synced"])
        self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
