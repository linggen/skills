"""The Media pane's one-line fact for the activity log is posted under the skill's
own name, with a verb SKILL.md declares, and a refusal is said on stderr.

Run: python3 -m unittest discover -s apple-shifu/tests
"""

import contextlib
import importlib.util
import io
import json
import os
import pathlib
import re
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("media_pipeline", HERE.parent / "scripts" / "media" / "media_pipeline.py")
mp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mp)


def declared_verbs():
    text = (HERE.parent / "SKILL.md").read_text()
    return re.search(r"^activity-verbs: \[(.*)\]$", text, re.M).group(1).replace(" ", "").split(",")


class Door:
    """A stand-in for POST /api/activity that takes or refuses by a status."""

    def __init__(self, status, body=None):
        self.seen = []
        door = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                door.seen.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
                self.send_response(status)
                self.end_headers()
                self.wfile.write(json.dumps(body or {"ok": True}).encode())

            def log_message(self, *a):
                pass

        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()


class PerceptionTest(unittest.TestCase):
    def tell(self, door, *args):
        err = io.StringIO()
        old = os.environ.get("LINGGEN_PORT")
        os.environ["LINGGEN_PORT"] = str(door.port)
        try:
            with contextlib.redirect_stderr(err):
                mp.tell_perception(*args)
        finally:
            door.close()
            if old is None:
                os.environ.pop("LINGGEN_PORT")
            else:
                os.environ["LINGGEN_PORT"] = old
        return err.getvalue()

    def test_record_names_the_skill_and_a_declared_verb(self):
        for kind, verb in (("phone_mac", "backup"), ("mac_disk", "backup"), ("clean", "clean")):
            r = mp.perception_record(kind, 3, 2_500_000_000)
            self.assertEqual(r["app"], "apple-shifu")
            self.assertEqual(r["verb"], verb)
            self.assertIn(verb, declared_verbs())
        self.assertEqual(mp.perception_record("phone_mac", 1, 1_000_000_000)["object"], "1 file (1.0 GB) from the phone")

    def test_a_finished_run_is_posted_and_says_nothing(self):
        door = Door(200)
        err = self.tell(door, "phone_mac", 12, 3_000_000_000, "done")
        self.assertEqual(err, "")
        self.assertEqual(door.seen[0]["app"], "apple-shifu")
        self.assertEqual(door.seen[0]["verb"], "backup")

    def test_a_refusal_leaves_one_plain_line(self):
        door = Door(400, {"error": "skill 'apple-shifu' does not declare the verb 'backup'"})
        err = self.tell(door, "phone_mac", 12, 3_000_000_000, "done")
        self.assertEqual(err.count("\n"), 1)
        self.assertIn("activity log refused the backup record", err)
        self.assertIn("does not declare the verb", err)

    def test_no_engine_leaves_one_plain_line(self):
        door = Door(200)
        door.close()
        err = self.tell(door, "clean", 4, 1_000_000_000, "done")
        self.assertEqual(err.count("\n"), 1)
        self.assertIn("activity log not told of the clean", err)

    def test_an_unfinished_or_empty_run_posts_nothing(self):
        for args in (("phone_mac", 5, 10, "error"), ("phone_mac", 0, 0, "done")):
            door = Door(200)
            self.assertEqual(self.tell(door, *args), "")
            self.assertEqual(door.seen, [])


if __name__ == "__main__":
    unittest.main()
