"""The weekly check reads, compares and hands on facts — it never deletes.

Run: python3 -m unittest discover -s apple-shifu/tests
"""

import importlib.util
import json
import os
import pathlib
import tempfile
import unittest

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("check", HERE.parent / "scripts" / "check.py")
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class CheckTest(unittest.TestCase):
    def test_clearable_totals_read_back(self):
        c = check.parse_clearable("Clearable scan · finished 2026-09-23 14:56 in 213s\nsafe 423.4 GB · review 517.0 GB · careful 0 KB\n")
        self.assertEqual(c, {"safe_gb": 423.4, "review_gb": 517.0, "finished": "2026-09-23 14:56"})
        self.assertIsNone(check.parse_clearable(""))

    def test_unbacked_counts_a_live_photo_once(self):
        manifest = [
            {"staged": "a/IMG_1.HEIC", "sha256": "s1"},
            {"staged": "a/IMG_1.MOV", "sha256": "m1"},
            {"staged": "a/IMG_2.JPG", "sha256": "s2"},
            {"staged": "a/clip.mp4", "sha256": "v1"},
            {"staged": "a/notes.txt", "sha256": "t1"},
        ]
        self.assertEqual(check.unbacked(manifest, [{"sha256": "s2"}]), 2)
        self.assertIsNone(check.unbacked(None, []))

    def test_low_disk_is_under_ten_percent_and_compares_with_last_week(self):
        prev = {"at": 1, "disk": {"free_gb": 80.0}}
        f = check.facts(100, {"total_gb": 1995.2, "free_gb": 63.1, "free_pct": 3.2}, {"safe_gb": 423.4, "review_gb": 0, "finished": None}, 0, prev)
        self.assertTrue(f["low_disk"])
        self.assertEqual(f["since_last"]["free_gb_change"], -16.9)
        text = check.moment_text(f)
        self.assertIn("63.1 GB of 2.0 TB", text)
        self.assertIn("423.4 GB safe to clear", text)
        roomy = check.facts(100, {"total_gb": 1000, "free_gb": 400, "free_pct": 40.0}, None, None, None)
        self.assertFalse(roomy["low_disk"])

    def test_dry_run_writes_nothing(self):
        with tempfile.TemporaryDirectory() as d:
            os.environ["SHIFU_DATA"] = d
            try:
                spec2 = importlib.util.spec_from_file_location("check2", HERE.parent / "scripts" / "check.py")
                mod = importlib.util.module_from_spec(spec2)
                spec2.loader.exec_module(mod)
                self.assertEqual(mod.main(["--dry"]), 0)
                self.assertEqual(os.listdir(d), [])
            finally:
                del os.environ["SHIFU_DATA"]

    def test_the_script_holds_no_delete(self):
        src = (HERE.parent / "scripts" / "check.py").read_text()
        for word in ("os.remove(", "unlink", "rmtree", "shutil", "subprocess"):
            self.assertNotIn(word, src)


if __name__ == "__main__":
    unittest.main()
