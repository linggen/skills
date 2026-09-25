"""The scheduled mentions pass: a baseline first, then only what is new;
replies to the user become facts for Yinyue, never a sentence of the app's.
Run: python3 -m unittest discover -s pulse/tests
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "scripts", "mentions-pass.py")
sys.path.insert(0, os.path.dirname(SCRIPT))
import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location("mentions_pass", SCRIPT)
mp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mp)

CFG = {"sites": {"hackernews": {"enabled": True, "username": "me"},
                 "bluesky": {"enabled": True, "handle": ""},
                 "reddit": {"enabled": False, "username": "me"}}}


def run(d, found):
    env = {**os.environ, "PULSE_DIR": d, "PULSE_FAKE_MENTIONS": json.dumps(found), "PULSE_NO_TELL": "1"}
    out = subprocess.run([sys.executable, SCRIPT], capture_output=True, text=True, env=env, timeout=30).stdout
    return json.loads(out.strip().splitlines()[-1])


def item(url, kind="reply_to_me", author="alice", title="Show HN: X"):
    return {"kind": kind, "url": url, "author": author, "title": title}


class Pass(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        with open(os.path.join(self.d, "config.json"), "w") as f:
            json.dump(CFG, f)

    def test_only_lanes_that_are_on_and_named(self):
        self.assertEqual(mp.lanes_on(CFG), ["hn"])

    def test_first_pass_is_a_baseline_then_only_new(self):
        r = run(self.d, {"hn": {"items": [item("u1"), item("u2", kind="own_comment")]}})
        self.assertEqual((r.get("baseline"), r["new_replies"]), (True, 0))
        r = run(self.d, {"hn": {"items": [item("u1"), item("u3", author="bob"), item("u4", kind="mention")]}})
        self.assertNotIn("baseline", r)
        self.assertEqual((r["new_replies"], r["new_mentions"], r["by_source"]), (1, 1, {"hn": 2}))
        self.assertEqual(r["items"][0]["author"], "bob")
        r = run(self.d, {"hn": {"items": [item("u1"), item("u3")]}})
        self.assertEqual((r["new_replies"], r["new_mentions"]), (0, 0), "said once")

    def test_facts_name_who_and_where(self):
        text = mp.facts_for_yinyue([{"kind": "reply_to_me", "source": "hn", "author": "bob", "title": "Show HN: X", "url": "u"}])
        self.assertIn('Hacker News: 1 (bob on "Show HN: X")', text)


if __name__ == "__main__":
    unittest.main()
