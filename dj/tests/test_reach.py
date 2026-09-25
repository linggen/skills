"""Where YouTube is unreachable, DJ's download doors refuse with a fact.

The node side (actions.mjs queue-add) is tested in reach.test.mjs; this is
fetch.py's: the env fact, the engine's /api/reach, and the refusal passing
through QueueTracks and GetKaraoke untouched.
Run: python3 -m unittest discover -s dj/tests
"""
import os
import sys
import tempfile
import unittest

SCRIPTS = os.path.join(os.path.dirname(__file__), "..", "scripts")
os.environ.setdefault("DJ_DIR", tempfile.mkdtemp(prefix="dj-reach-"))
sys.path.insert(0, SCRIPTS)
import fetch  # noqa: E402

REFUSAL = {"unavailable": "download", "reason": "youtube_unreachable"}


class Reach(unittest.TestCase):
    def test_env_fact_wins(self):
        def never(_):
            raise AssertionError("no fetch when env says")
        self.assertEqual(fetch.restricted({"LINGGEN_RESTRICTED": "youtube, google"}, never), ["youtube", "google"])
        self.assertEqual(fetch.restricted({"LINGGEN_RESTRICTED": ""}, never), [])

    def test_engine_answer_or_try(self):
        self.assertEqual(fetch.restricted({}, lambda _: {"restricted": ["youtube"]}), ["youtube"])

        def down(_):
            raise OSError("refused")
        self.assertEqual(fetch.restricted({}, down), [])

    def test_only_youtube_refuses(self):
        self.assertEqual(fetch.download_refusal({"LINGGEN_RESTRICTED": "youtube,google"}), REFUSAL)
        self.assertIsNone(fetch.download_refusal({"LINGGEN_RESTRICTED": "google"}))

    def test_doors_pass_the_refusal_through(self):
        old = os.environ.get("LINGGEN_RESTRICTED")
        os.environ["LINGGEN_RESTRICTED"] = "youtube,google"
        try:
            q = fetch.queue_tracks([{"artist": "A", "title": "B"}], False)
            self.assertEqual((q["queued"], q["unavailable"], q["reason"]), (0, "download", "youtube_unreachable"))
            k = fetch.karaoke_batch([{"artist": "A", "title": "B"}])
            self.assertEqual((k["got"], k["unavailable"], k["reason"]), (0, "download", "youtube_unreachable"))
        finally:
            if old is None:
                del os.environ["LINGGEN_RESTRICTED"]
            else:
                os.environ["LINGGEN_RESTRICTED"] = old


if __name__ == "__main__":
    unittest.main()
