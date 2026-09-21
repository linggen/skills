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


if __name__ == "__main__":
    unittest.main()
