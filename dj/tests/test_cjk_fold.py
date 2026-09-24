"""cjk_fold.py and the GetTracks guard built on it.

The case (2026-09-24): the library held 郭富城 - 風中密碼. Asked for 风里密码 and
then 风中密码, GetTracks fetched twice more — a plain substring test matched
neither the other script nor the one-character slip.
Run: python3 -m unittest discover -s dj/tests
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

SCRIPTS = os.path.join(os.path.dirname(__file__), "..", "scripts")
sys.path.insert(0, SCRIPTS)
import cjk_fold as cf  # noqa: E402

HELD = {"artist": "郭富城", "title": "風中密碼", "file": "/m/郭富城 - 風中密碼.mp3"}


class Fold(unittest.TestCase):
    def test_scripts_fold_to_one(self):
        self.assertEqual(cf.key("風中密碼"), cf.key("风中密码"))
        self.assertEqual(cf.key("難唸的經"), cf.key("难念的经"))
        self.assertEqual(cf.key("ＢＥＹＯＮＤ"), cf.key("beyond"))

    def test_tags_and_punctuation_drop_out(self):
        self.assertEqual(cf.key("風中密碼 (Live)"), cf.key("风中密码"))
        self.assertEqual(cf.key("Don't Stop"), cf.key("dont stop"))

    def test_exact_across_scripts(self):
        self.assertTrue(cf.exact({"artist": "郭富城", "title": "风中密码"}, HELD))
        self.assertFalse(cf.exact({"artist": "張學友", "title": "风中密码"}, HELD))

    def test_one_slip_is_near(self):
        self.assertTrue(cf.near({"artist": "郭富城", "title": "风里密码"}, HELD))
        self.assertFalse(cf.near({"artist": "郭富城", "title": "风中密码"}, HELD))  # exact, not near
        self.assertFalse(cf.near({"artist": "郭富城", "title": "对你爱不完"}, HELD))
        self.assertFalse(cf.near({"artist": "張學友", "title": "风里密码"}, HELD))

    def test_short_and_latin_titles(self):
        self.assertFalse(cf.near({"artist": "B", "title": "C"}, {"artist": "B", "title": "D", "file": "x"}))
        self.assertTrue(cf.near({"artist": "Beyond", "title": "Amani"},
                                {"artist": "Beyond", "title": "Amanl", "file": "x"}))

    def test_find(self):
        same, close = cf.find([HELD, {"artist": "郭富城", "title": "對你愛不完", "file": "y"}],
                              {"artist": "郭富城", "title": "风里密码"})
        self.assertEqual((same, [r["file"] for r in close]), ([], [HELD["file"]]))


def batch(tracks, lib):
    """fetch.py batch in a throwaway DJ_DIR with the fake downloader."""
    d = tempfile.mkdtemp()
    with open(os.path.join(d, "library.json"), "w", encoding="utf-8") as f:
        json.dump(lib, f, ensure_ascii=False)
    with open(os.path.join(d, "config.json"), "w") as f:
        json.dump({"library_dir": os.path.join(d, "music")}, f)
    env = {**os.environ, "DJ_DIR": d, "DJ_FAKE_FETCH": "1", "LINGGEN_PORT": "1"}
    out = subprocess.run([sys.executable, os.path.join(SCRIPTS, "fetch.py"), "batch",
                          json.dumps(tracks, ensure_ascii=False), ""],
                         capture_output=True, text=True, env=env, timeout=120).stdout
    return json.loads(out.strip().splitlines()[-1])


class Guard(unittest.TestCase):
    LIB = {"tracks": [HELD]}

    def test_held_song_in_another_script_is_skipped(self):
        r = batch([{"artist": "郭富城", "title": "风中密码"}], self.LIB)
        self.assertEqual(r["got"], 0)
        self.assertEqual(r["failed"], 0)
        self.assertEqual(r["skipped"], [{"artist": "郭富城", "title": "风中密码",
                                         "reason": "already in library", "file": "郭富城 - 風中密碼.mp3"}])

    def test_near_match_is_skipped_unless_forced(self):
        r = batch([{"artist": "郭富城", "title": "风里密码"}], self.LIB)
        self.assertEqual((r["got"], r["skipped"][0]["reason"]), (0, "near match"))
        r = batch([{"artist": "郭富城", "title": "风里密码", "force": True}], self.LIB)
        self.assertEqual(r["got"], 1)
        self.assertNotIn("skipped", r)

    def test_new_song_downloads(self):
        r = batch([{"artist": "郭富城", "title": "對你愛不完"}], self.LIB)
        self.assertEqual((r["got"], r["failed"]), (1, 0))


class ConcertAlbum(unittest.TestCase):
    def test_a_concert_album_is_another_take(self):
        import lyrics_match as lm
        self.assertTrue(lm.other_take("郭富城舞林正傳演唱會 07/08"))
        self.assertFalse(lm.other_take("風中密碼"))


if __name__ == "__main__":
    unittest.main()
