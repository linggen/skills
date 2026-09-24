"""naming.py — one name per song, whichever door downloads it.

The phone matches songs, lyrics and karaoke companions BY FILENAME, so these
names are pinned: changing one renames every future download.
Run: python3 -m unittest discover -s dj/tests
"""
import os
import re
import shlex
import sys
import unittest

HERE = os.path.dirname(__file__)
SCRIPTS = os.path.join(HERE, "..", "scripts")
sys.path.insert(0, SCRIPTS)
import naming  # noqa: E402

BINS = {"yt_dlp": "/bin/yt-dlp", "ffmpeg": "/bin/ffmpeg"}


class Names(unittest.TestCase):
    def test_pinned_stems(self):
        cases = [
            ({"artist": "Beyond", "title": "海闊天空"}, "Beyond - 海闊天空"),
            ({"artist": "AC/DC", "title": "Back In Black"}, "AC-DC - Back In Black"),
            ({"artist": "Guns N' Roses", "title": 'Sweet Child O" Mine'}, "Guns N' Roses - Sweet Child O- Mine"),
            ({"artist": "  Faye   Wong ", "title": "夢中人\t(Live)"}, "Faye Wong - 夢中人 (Live)"),
            ({"artist": "A", "title": "Why? / How: *|<>"}, "A - Why- - How- ----"),
            ({"artist": "$(rm -rf ~)", "title": "`x`"}, "$(rm -rf ~) - `x`"),
        ]
        for track, stem in cases:
            self.assertEqual(naming.track_stem(track), stem)

    def test_the_template_decides_the_order(self):
        t = {"artist": "Beyond", "title": "海闊天空", "year": 1993}
        self.assertEqual(naming.track_stem(t, "%(year)s %(title)s"), "1993 海闊天空")

    def test_karaoke_is_named_after_the_song_file(self):
        # Renamed or templated songs keep their companion: the engine pairs by stem.
        t = {"artist": "Beyond", "title": "海闊天空", "file": "/m/1993 海闊天空.mp3"}
        self.assertEqual(naming.karaoke_stem(t), "1993 海闊天空 (Karaoke)")
        self.assertEqual(naming.karaoke_stem({"artist": "A", "title": "B"}), "A - B (Karaoke)")


class Commands(unittest.TestCase):
    def ppa(self, cmd, key):
        return [cmd[i + 1] for i, a in enumerate(cmd) if a == "--postprocessor-args" and cmd[i + 1].startswith(key)]

    def test_tags_carry_the_curated_text_through_ytdlps_split(self):
        t = {"artist": "Guns N' Roses", "title": 'Say "Hi" / AC/DC', "year": 1987}
        cmd = naming.audio_cmd(BINS, {}, t, "/m/x.%(ext)s", ["url"])
        meta = self.ppa(cmd, "ffmpeg:")[0][len("ffmpeg:"):]
        self.assertEqual(shlex.split(meta), [
            "-metadata", "artist=Guns N' Roses",
            "-metadata", 'title=Say "Hi" / AC/DC',
            "-metadata", "date=1987"])

    def test_loudnorm_is_scoped_to_extraction(self):
        cmd = naming.audio_cmd(BINS, {"loudnorm_lufs": -16}, {"title": "t"}, "/m/x.%(ext)s", ["u"])
        self.assertEqual(self.ppa(cmd, "ExtractAudio"), ["ExtractAudio+ffmpeg:-af loudnorm=I=-16:TP=-1.5:LRA=11"])
        off = naming.audio_cmd(BINS, {"loudnorm": False}, {"title": "t"}, "/m/x.%(ext)s", ["u"])
        self.assertEqual(self.ppa(off, "ExtractAudio"), [])

    def test_tried_sources_are_filtered_out(self):
        cmd = naming.audio_cmd(BINS, {}, {"title": "t"}, "/m/x.%(ext)s", ["u"], exclude=["abc", "d-e_f"])
        self.assertEqual(cmd[cmd.index("--match-filters") + 1], "id!='abc' & id!='d-e_f'")

    def test_the_landed_line_is_id_then_path(self):
        out = "junk\nabc123 /m/A - B.mp3\n"
        self.assertEqual(naming.landed(out, (".mp3",)), ("abc123", "/m/A - B.mp3"))
        self.assertEqual(naming.landed("", (".mp3",)), (None, None))

    def test_karaoke_video_is_h264(self):
        cmd = naming.karaoke_cmd(BINS, {}, {"artist": "A", "title": "B"}, "video", "/k/x.%(ext)s")
        self.assertIn("avc1", cmd[cmd.index("-f") + 1])
        self.assertEqual(cmd[-1], "ytsearch5:A B karaoke")


class OneBuilder(unittest.TestCase):
    """Every door goes through fetch.py; no other file builds a yt-dlp
    download or a filename of its own."""

    def test_no_other_door_names_or_downloads(self):
        doors = ["get.sh", "karaoke.sh", "download.js", "karaoke.js", "set-panel.js", "fetch.py"]
        for name in doors:
            with open(os.path.join(SCRIPTS, name), encoding="utf-8") as f:
                src = f.read()
            self.assertIsNone(re.search(r"--audio-format|--embed-thumbnail|def safe\(|const safe\s*=", src), name)

    def test_the_shell_doors_call_fetch_py(self):
        for name, verb in (("get.sh", "batch"), ("karaoke.sh", "karaoke-batch")):
            with open(os.path.join(SCRIPTS, name), encoding="utf-8") as f:
                self.assertIn(f'fetch.py" {verb}', f.read())


if __name__ == "__main__":
    unittest.main()
