"""list_library.py — ListLibrary's slim rows, search and paging.
Run: python3 -m unittest discover -s dj/tests
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "scripts", "list_library.py")

LIB = {
    "tracks": [
        {"id": "beyond|海闊天空", "artist": "Beyond", "title": "海闊天空", "year": 1993,
         "file": "/m/Beyond - 海闊天空.mp3", "lrc": "/m/x.lrc", "on_phone": True, "plays": 3,
         "last_played": "2026-09-24T10:00:00.000Z", "playlists": ["HK"], "added_at": "x"},
        {"id": "faye wong|夢中人", "artist": "Faye Wong", "title": "夢中人",
         "file": "/m/Faye Wong - 夢中人.mp3", "karaoke_audio": "/m/.karaoke/k.mp3"},
        {"id": "b|c", "artist": "B", "title": "C", "file": "/m/B - C.mp3"},
    ],
    "playlists": [{"name": "HK", "files": ["Faye Wong - 夢中人.mp3", "Beyond - 海闊天空.mp3"]}],
    "phone": {"files": ["Beyond - 海闊天空.mp3"], "playlists": [{"name": "Car", "files": ["Beyond - 海闊天空.mp3"]}]},
}


def run(*args, lib=LIB):
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(lib, f)
    out = subprocess.run([sys.executable, SCRIPT, f.name, *args], capture_output=True, text=True).stdout
    return json.loads(out)


class ListLibrary(unittest.TestCase):
    def test_rows_are_slim(self):
        r = run()
        self.assertEqual(r["tracks"][0], {
            "artist": "Beyond", "title": "海闊天空", "year": 1993, "file": "Beyond - 海闊天空.mp3",
            "lyrics": True, "karaoke": False, "on_phone": True,
            "plays": 3, "last_played": "2026-09-24T10:00:00.000Z"})
        self.assertEqual(r["tracks"][1]["karaoke"], True)
        self.assertEqual(r["playlists"], [{"name": "HK", "count": 2}])
        self.assertEqual(r["phone"], {"track_count": 1, "playlists": [{"name": "Car", "count": 1}]})

    def test_counts_are_stamped_from_the_data(self):
        r = run("{{query}}", "{{limit}}", "{{offset}}", "{{playlist}}", "{{view}}")
        self.assertEqual((r["track_count"], r["playlist_count"], r["match_count"]), (3, 1, 3))

    def test_search_ignores_case_and_width(self):
        self.assertEqual([t["title"] for t in run("ＢＥＹＯＮＤ")["tracks"]], ["海闊天空"])
        r = run("faye")
        self.assertEqual((r["match_count"], r["track_count"]), (1, 3))

    def test_paging(self):
        r = run("", "2", "1")
        self.assertEqual([t["title"] for t in r["tracks"]], ["夢中人", "C"])
        self.assertFalse(r["has_more"])
        self.assertTrue(run("", "1")["has_more"])

    def test_a_playlist_in_its_running_order(self):
        self.assertEqual([t["title"] for t in run("", "", "", "HK")["tracks"]], ["夢中人", "海闊天空"])
        self.assertEqual([t["title"] for t in run("", "", "", "Car", "phone")["tracks"]], ["海闊天空"])

    def test_the_phone_view(self):
        self.assertEqual([t["title"] for t in run("", "", "", "", "phone")["tracks"]], ["海闊天空"])

    def test_an_empty_library(self):
        r = run(lib={})
        self.assertEqual((r["track_count"], r["tracks"], r["playlists"]), (0, [], []))


if __name__ == "__main__":
    unittest.main()
