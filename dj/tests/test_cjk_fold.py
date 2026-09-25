"""cjk_fold.py and the Get guard built on it.

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


def queue(tracks, lib, phone="", into=None):
    """fetch.py queue in a throwaway DJ_DIR, the worker left unstarted."""
    d = into or tempfile.mkdtemp()
    with open(os.path.join(d, "library.json"), "w", encoding="utf-8") as f:
        json.dump(lib, f, ensure_ascii=False)
    with open(os.path.join(d, "config.json"), "w") as f:
        json.dump({"library_dir": os.path.join(d, "music")}, f)
    env = {**os.environ, "DJ_DIR": d, "DJ_FAKE_FETCH": "1", "DJ_NO_WORKER": "1", "LINGGEN_PORT": "1"}
    out = subprocess.run([sys.executable, os.path.join(SCRIPTS, "fetch.py"), "queue",
                          json.dumps(tracks, ensure_ascii=False), phone],
                         capture_output=True, text=True, env=env, timeout=120).stdout
    return json.loads(out.strip().splitlines()[-1])


class Guard(unittest.TestCase):
    LIB = {"tracks": [HELD]}

    def test_held_song_in_another_script_is_skipped(self):
        r = queue([{"artist": "郭富城", "title": "风中密码"}], self.LIB)
        self.assertEqual(r["queued"], 0)
        self.assertEqual(r["skipped"], [{"artist": "郭富城", "title": "风中密码",
                                         "reason": "already in library", "file": "郭富城 - 風中密碼.mp3"}])

    def test_near_match_is_skipped_unless_forced(self):
        r = queue([{"artist": "郭富城", "title": "风里密码"}], self.LIB)
        self.assertEqual((r["queued"], r["skipped"][0]["reason"]), (0, "near match"))
        r = queue([{"artist": "郭富城", "title": "风里密码", "force": True}], self.LIB)
        self.assertEqual(r["queued"], 1)
        self.assertNotIn("skipped", r)

    def test_new_song_is_queued_for_the_phone(self):
        d = tempfile.mkdtemp()
        r = queue([{"artist": "郭富城", "title": "對你愛不完"}], self.LIB, phone="true", into=d)
        self.assertEqual((r["queued"], r["songs"]), (1, ["郭富城 - 對你愛不完"]))
        with open(os.path.join(d, "data", "queue.json"), encoding="utf-8") as f:
            [item] = json.load(f)["items"]
        self.assertEqual((item["status"], item["for_phone"]), ("pending", True))


class TwoCharacterTitles(unittest.TestCase):
    def test_no_slip_allowed(self):
        self.assertFalse(cf.near({"artist": "A", "title": "愛我"}, {"artist": "A", "title": "愛你", "file": "x"}))


def picker():
    import importlib.util
    spec = importlib.util.spec_from_file_location("pick_source_t", os.path.join(SCRIPTS, "pick-source.py"))
    ps = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ps)
    return ps


class TitleGate(unittest.TestCase):
    """The case: asked for 郭富城 风中密码, the picker chose 「听风的歌 郭富城
    (歌词版)」 — another song — and it landed as 风中密码."""
    ps = picker()

    def test_another_song_is_refused(self):
        self.assertFalse(self.ps.title_matches({"title": "听风的歌 郭富城 (歌词版)"}, ["风中密码"]))
        self.assertFalse(self.ps.title_matches({"title": "郭富城 對你愛不完"}, ["风中密码"]))

    def test_decorations_and_scripts_pass(self):
        for t in ["郭富城 Aaron Kwok - 風中密碼 (Official MV)", "风中密码 Live",
                  "郭富城 - 風中密碼【歌詞版】", "風中密碼"]:
            self.assertTrue(self.ps.title_matches({"title": t}, ["风中密码"]), t)

    def test_the_catalogue_name_passes(self):
        self.assertTrue(self.ps.title_matches({"title": "Aaron Kwok", "track": "風裡密碼"}, ["风中密码", "风里密码"]))
        self.assertTrue(self.ps.title_matches({"title": "郭富城 風裡密碼"}, ["风中密码"]))  # one slip

    def test_latin(self):
        self.assertTrue(self.ps.title_matches({"title": "Beyond - Amani (Live 1991)"}, ["Amani"]))
        self.assertFalse(self.ps.title_matches({"title": "Beyond - 海闊天空"}, ["Amani"]))


class NoMatchIsReported(unittest.TestCase):
    def test_fetch_reports_it_instead_of_searching(self):
        sys.path.insert(0, SCRIPTS)
        import fetch
        orig = fetch.pick_source
        fetch.pick_source = lambda *a, **k: {"no_match": True}
        try:
            r = fetch.fetch_track({"ok": True, "yt_dlp": "x", "ffmpeg": "y"}, {"lib_dir": tempfile.mkdtemp()},
                                  {"artist": "郭富城", "title": "风中密码"})
        finally:
            fetch.pick_source = orig
        self.assertEqual(r, {"ok": False, "error": "no source matched the title"})


class Rename(unittest.TestCase):
    def test_rename_moves_file_sidecar_lists_and_phone(self):
        d = tempfile.mkdtemp()
        music = os.path.join(d, "music")
        os.makedirs(music)
        mp3 = os.path.join(music, "郭富城 - 風中密碼.mp3")
        lrc = os.path.join(music, "郭富城 - 風中密碼.lrc")
        for p in (mp3, lrc):
            open(p, "w").write("x")
        lib = {"tracks": [{"id": "郭富城|風中密碼", "artist": "郭富城", "title": "風中密碼", "file": mp3,
                           "lrc": lrc, "plays": 4}],
               "playlists": [{"name": "江湖", "files": ["郭富城 - 風中密碼.mp3"]}],
               "phone": {"files": ["郭富城 - 風中密碼.mp3"], "playlists": []}}
        with open(os.path.join(d, "library.json"), "w", encoding="utf-8") as f:
            json.dump(lib, f, ensure_ascii=False)
        env = {**os.environ, "DJ_DIR": d, "LINGGEN_PORT": "1"}
        out = subprocess.run(["bash", os.path.join(SCRIPTS, "run-js.sh"), os.path.join(SCRIPTS, "actions.mjs"),
                              "track-rename", "郭富城 - 風中密碼.mp3", "風裡密碼"],
                             capture_output=True, text=True, env=env).stdout
        r = json.loads(out.strip().splitlines()[-1])
        self.assertEqual((r["ok"], r["file"], r["was"]), (True, "郭富城 - 風裡密碼.mp3", "郭富城 - 風中密碼.mp3"))
        got = json.load(open(os.path.join(d, "library.json"), encoding="utf-8"))
        row = got["tracks"][0]
        self.assertEqual((row["title"], row["id"], row["plays"], row["requested_title"]),
                         ("風裡密碼", "郭富城|風裡密碼", 4, "風中密碼"))
        self.assertTrue(os.path.exists(os.path.join(music, "郭富城 - 風裡密碼.mp3")))
        self.assertTrue(os.path.exists(os.path.join(music, "郭富城 - 風裡密碼.lrc")))
        self.assertFalse(os.path.exists(mp3))
        self.assertEqual(got["playlists"][0]["files"], ["郭富城 - 風裡密碼.mp3"])
        self.assertEqual(got["phone"]["files"], ["郭富城 - 風裡密碼.mp3"])
        self.assertTrue(row["on_phone"])


class ConcertAlbum(unittest.TestCase):
    def test_a_concert_album_is_another_take(self):
        import lyrics_match as lm
        self.assertTrue(lm.other_take("郭富城舞林正傳演唱會 07/08"))
        self.assertFalse(lm.other_take("風中密碼"))


if __name__ == "__main__":
    unittest.main()
