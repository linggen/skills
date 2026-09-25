#!/usr/bin/env python3
"""fetch.py — every download DJ makes, whoever asks for it.

    fetch.py track <json>          one song, now (the karaoke page's on-the-fly get)
    fetch.py karaoke <json>        one karaoke render, now (the karaoke page)
    fetch.py queue <json> [phone]  QueueTracks: the user's Get from the phone —
                                   held songs skipped, the rest queued
    fetch.py karaoke-batch <json>  GetKaraoke
    fetch.py start-worker          launch the queue worker, detached; prints its pid
    fetch.py worker                drain data/queue.json (what start-worker runs)

Names and yt-dlp commands come from naming.py; the source from pick-source.py;
lyrics from lyrics_match.py; library writes go through actions.mjs, the one
writer. Every verb prints one JSON line.

The queue worker runs in its own session (setsid), so it outlives the page
that asked for it, the /api/bash call that started it, and that call's
timeout — the engine kills the command's process group, and this is not in it.

DJ_FAKE_FETCH=1 swaps yt-dlp, the picker and LRCLIB for a local stand-in that
writes a small file: tests drive the whole queue without a network.
"""
import json
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import cjk_fold  # noqa: E402
import naming  # noqa: E402

SKILL_DIR = os.environ.get("DJ_DIR") or os.path.dirname(HERE)
DATA = os.path.join(SKILL_DIR, "data")
QUEUE = os.path.join(DATA, "queue.json")
WORKER_LOCK = os.path.join(DATA, ".worker-lock")
WORKER_LOG = os.path.join(DATA, "worker.log")
FAKE = os.environ.get("DJ_FAKE_FETCH") == "1"
# pick-source.py's answer when every upload is named some other song: that is
# a fact to report, not a reason to fall back to a blind search.
NO_TITLE_MATCH = "no source matched the title"
WORKERS = max(1, int(os.environ.get("DJ_WORKERS") or 2))


# ── context ────────────────────────────────────────────────────────────────

def read_json(path, fallback):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return fallback


def load_config():
    cfg = read_json(os.path.join(SKILL_DIR, "config.json"), None)
    if not isinstance(cfg, dict):
        cfg = read_json(os.path.join(os.path.dirname(HERE), "config.example.json"), {})
    cfg["lib_dir"] = os.path.expanduser(cfg.get("library_dir") or "~/Music/DJ")
    return cfg


def load_bins():
    """yt-dlp and ffmpeg, fetched into ~/.linggen/bin on first use."""
    if FAKE:
        return {"ok": True, "yt_dlp": "yt-dlp", "ffmpeg": "ffmpeg"}
    try:
        r = subprocess.run(["bash", os.path.join(HERE, "bin-setup.sh")],
                           capture_output=True, text=True, timeout=600)
        return json.loads(r.stdout.strip().splitlines()[-1])
    except Exception as e:
        return {"ok": False, "note": f"yt-dlp/ffmpeg setup failed: {e}"}


def action(verb, *args):
    """One actions.mjs verb — the single writer of library.json and the queue."""
    try:
        r = subprocess.run(
            ["bash", os.path.join(HERE, "run-js.sh"), os.path.join(HERE, "actions.mjs"),
             verb, *[str(a) for a in args]],
            capture_output=True, text=True, timeout=60,
            env={**os.environ, "DJ_DIR": SKILL_DIR})
        line = (r.stdout.strip().splitlines() or [""])[-1]
        return json.loads(line)
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ── progress on the retained `tasks` topic ─────────────────────────────────

def publish(task_id, done, total, current, finished=False, kind="download", label="Downloads",
            got=None, failed=None):
    """Facts only — Yinyue and the agent word them, never this. A finished run
    carries `got` (songs that landed) and `failed` (["Artist - Title: why"]),
    so whoever tells the user names what did not come. Telemetry never breaks
    a download, so every failure is swallowed."""
    try:
        payload = {"app": "dj", "task_id": task_id, "kind": kind, "label": label,
                   "done": done, "total": total, "current": current,
                   "finished": finished, "at": int(time.time())}
        if finished and got is not None:
            payload["got"] = got
            payload["failed"] = list(failed or [])[:20]
        body = json.dumps({"topic": "tasks", "op": "dj", "retain": True,
                           "payload": payload}, ensure_ascii=False).encode()
        req = urllib.request.Request(
            "http://127.0.0.1:%s/api/topic/publish" % os.environ.get("LINGGEN_PORT", "9527"),
            data=body, headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=3).read()
    except Exception:
        pass


# ── running yt-dlp ─────────────────────────────────────────────────────────

def run_cmd(cmd, timeout, cancelled=None):
    """Run in its own process group so a cancel takes ffmpeg down with yt-dlp.
    Returns (stdout, outcome) — outcome is ok / cancelled / timeout."""
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                         stdin=subprocess.DEVNULL, text=True, start_new_session=True)
    deadline = time.time() + timeout
    while True:
        try:
            out, _ = p.communicate(timeout=1)
            return out, "ok"
        except subprocess.TimeoutExpired:
            stop = "cancelled" if cancelled and cancelled() else (
                "timeout" if time.time() > deadline else None)
            if stop:
                try:
                    os.killpg(p.pid, signal.SIGKILL)
                except Exception:
                    pass
                p.communicate()
                return "", stop


def fake_run(cmd, exts, cancelled=None):
    """The stand-in for yt-dlp under DJ_FAKE_FETCH: a title containing FAIL
    finds nothing, SLOW takes five seconds (cancellable), anything else lands."""
    template = cmd[cmd.index("-o") + 1]
    text = " ".join(cmd)
    if "FAIL" in text:
        return "", "ok"
    if "SLOW" in text:
        for _ in range(50):
            if cancelled and cancelled():
                return "", "cancelled"
            time.sleep(0.1)
    path = template.replace("%(ext)s", exts[0].lstrip("."))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write("ID3")
    return f"fake{abs(hash(path)) % 10**6} {path}\n", "ok"


def download(cmd, exts, timeout, cancelled=None):
    out, outcome = (fake_run(cmd, exts, cancelled) if FAKE
                    else run_cmd(cmd, timeout, cancelled))
    vid, path = naming.landed(out, exts)
    return vid, path, outcome


FAILURE = {"cancelled": "cancelled", "timeout": "timed out"}


# ── one song ───────────────────────────────────────────────────────────────

def pick_source(bins, track, exclude):
    """pick-source.py's ranked candidates, or None for a plain search — a
    picker that cannot reach the network must not stop a download."""
    if FAKE:
        return None
    req = json.dumps({
        "artist": track.get("artist") or "", "title": track.get("title") or "",
        "version": track.get("version") or "studio",
        "query_hints": track.get("query_hints") or [],
        "exclude": list(exclude or []), "yt_dlp": bins["yt_dlp"],
    })
    try:
        r = subprocess.run([sys.executable, os.path.join(HERE, "pick-source.py"), req],
                           capture_output=True, text=True, timeout=180)
        picked = json.loads(r.stdout.strip().splitlines()[-1])
    except Exception:
        return None
    if not picked.get("ok") and picked.get("error") == NO_TITLE_MATCH:
        return {"no_match": True}
    return picked if picked.get("ok") else None


def write_lyrics(track, path):
    """Lyrics fitted to the file that actually landed — yt-dlp may have walked
    past a dead first choice — asked under the song's title and then under the
    one it was requested by. Returns (lrc path or None, timed)."""
    if FAKE:
        return None, False
    try:
        import lyrics_match
        got = lyrics_match.for_file(naming.tag(track.get("artist")), naming.tag(track.get("title")),
                                    path, str(track.get("version") or "studio").lower(),
                                    [naming.tag(track.get("requested_title"))] if track.get("requested_title") else ())
    except Exception:
        return None, False
    body = got and got.get("body")
    if not body or not body.strip():
        return None, False
    lrc = os.path.splitext(path)[0] + ".lrc"
    with open(lrc, "w", encoding="utf-8") as f:
        f.write(body if body.endswith("\n") else body + "\n")
    return lrc, bool(got.get("synced"))


def fetch_track(bins, cfg, track, exclude=(), skip_first=False, dest=None, cancelled=None, guard=False):
    """Download one song. With `dest`, the new take REPLACES that file under the
    same name, so every playlist and phone reference to it holds.

    When the picker found the album track under another title (the agent asked
    for 風中密碼; the song is 風裡密碼), the song is named by the catalogue:
    file, tags and row, with the asked-for title kept as `requested_title`."""
    if not naming.tag(track.get("title")):
        return {"ok": False, "error": "no title"}
    picked = pick_source(bins, track, exclude)
    if (picked or {}).get("no_match"):
        return {"ok": False, "error": NO_TITLE_MATCH}
    track = canonical(track, picked, dest)
    if guard and track.get("requested_title"):
        # Asked for under one name, known to the catalogue by another — which
        # may be a song the library already holds (2026-09-24: 风里密码 asked,
        # 風中密碼 on disk since August).
        held = in_library(track, allow_near=True)
        if held:
            return {"ok": False, "skipped": held[0], "file": held[1]["file"]}
    stem = naming.track_stem(track, cfg.get("naming_template"))
    urls = list((picked or {}).get("urls") or [])
    if skip_first and len(urls) > 1:
        urls = urls[1:]
    query = f"ytsearch5:{naming.tag(track.get('artist'))} {naming.tag(track.get('title'))}".strip()
    out_dir = cfg["lib_dir"]
    if dest:
        out_dir = os.path.join(cfg["lib_dir"], f".dj-tmp-{os.getpid()}-{threading.get_ident()}")
    os.makedirs(out_dir, exist_ok=True)
    cmd = naming.audio_cmd(bins, cfg, track, f"{out_dir}/{stem}.%(ext)s", urls or [query], exclude)
    try:
        vid, path, outcome = download(cmd, (".mp3",), 600, cancelled)
        if not path:
            return {"ok": False, "error": FAILURE.get(outcome, "no playable source found")}
        if dest:
            os.replace(path, dest)
            path = dest
    finally:
        if dest:
            shutil.rmtree(out_dir, ignore_errors=True)
    lrc, timed = write_lyrics(track, path)
    named = {"title": track["title"], "requested_title": track["requested_title"]} if track.get("requested_title") else {}
    return {"ok": True, "file": path, "lrc": lrc, "lrc_timed": timed, "source_id": vid, **named}


def canonical(track, picked, dest=None):
    """The track renamed to the catalogue's title, when the picker has one. A
    replacement keeps its file's name, so it keeps its title too."""
    title = (picked or {}).get("canonical_title")
    if not title or dest or naming.tag(title) == naming.tag(track.get("title")):
        return track
    return {**track, "title": title, "requested_title": naming.tag(track.get("title"))}


def in_library(track, allow_near=False):
    """(reason, row) when the library already holds this song: the same one
    under any script or spacing ("already in library"), or — unless
    `allow_near` — one a single slip away ("near match"), which is asked about
    rather than fetched again. None when it is new."""
    rows = read_json(os.path.join(SKILL_DIR, "library.json"), {}).get("tracks") or []
    same, close = cjk_fold.find(rows, track)
    if same:
        return "already in library", same[0]
    if close and not allow_near:
        return "near match", close[0]
    return None


def library_file(track):
    """The file a library row names for this artist/title, read-only."""
    lib = read_json(os.path.join(SKILL_DIR, "library.json"), {})
    key = f"{naming.tag(track.get('artist')).lower()}|{naming.tag(track.get('title')).lower()}"
    for t in lib.get("tracks") or []:
        tk = f"{naming.tag(t.get('artist')).lower()}|{naming.tag(t.get('title')).lower()}"
        if t.get("file") and (t.get("id") == key or tk == key):
            return t["file"]
    return None


def fetch_karaoke(bins, cfg, track, kind, cancelled=None):
    kind = "video" if str(kind or "").lower() == "video" else "audio"
    row = {**track, "file": track.get("file") or library_file(track)}
    kdir = os.path.join(cfg["lib_dir"], ".karaoke")
    os.makedirs(kdir, exist_ok=True)
    cmd = naming.karaoke_cmd(bins, cfg, row, kind,
                             f"{kdir}/{naming.karaoke_stem(row, cfg.get('naming_template'))}.%(ext)s")
    _, path, outcome = download(cmd, naming.KARAOKE_EXTS[kind], 900, cancelled)
    if not path:
        return {"ok": False, "kind": kind, "error": FAILURE.get(outcome, f"no karaoke {kind} found")}
    return {"ok": True, "kind": kind, "file": path, "song": row.get("file")}


# ── GetKaraoke, and the phone's Get ────────────────────────────────────────

def label(track):
    return f"{naming.tag(track.get('artist'))} - {naming.tag(track.get('title'))}".strip(" -")


def as_tracks(raw):
    try:
        tracks = json.loads(raw or "[]")
    except Exception:
        return None
    if isinstance(tracks, dict):
        tracks = tracks.get("tracks") or []
    return [t for t in tracks if isinstance(t, dict)] if isinstance(tracks, list) else None


def skipped_row(t, reason, file):
    return {"artist": naming.tag(t.get("artist")), "title": naming.tag(t.get("title")),
            "reason": reason, "file": os.path.basename(str(file or ""))}


def karaoke_batch(tracks):
    """Karaoke renders of songs the library holds, now."""
    bins, cfg = load_bins(), load_config()
    if not bins.get("ok"):
        return {"got": 0, "failed": len(tracks), "files": [], "errors": [bins.get("note") or "yt-dlp/ffmpeg unavailable"]}
    task_id, total = int(time.time()), len(tracks)
    files, errors, skipped = [], [], []
    for i, t in enumerate(tracks):
        if not naming.tag(t.get("title")):
            errors.append("a track had no title")
            continue
        publish(task_id, i, total, label(t), kind="karaoke", label="Karaoke")
        res = fetch_karaoke(bins, cfg, t, t.get("kind"))
        if res.get("skipped"):
            skipped.append(skipped_row(t, res["skipped"], res.get("file")))
            continue
        if not res.get("ok"):
            errors.append(f"{label(t)}: {res.get('error')}")
            continue
        files.append(res["file"])
    publish(task_id, total, total, "", finished=True, kind="karaoke", label="Karaoke",
            got=len(files), failed=[e for e in errors])
    action("reconcile")  # lights 🎤 on the songs these belong to
    out = {"got": len(files), "failed": len(tracks) - len(files) - len(skipped),
           "files": files, "errors": errors}
    return {**out, "skipped": skipped} if skipped else out


def queue_tracks(tracks, for_phone):
    """The user's Get, from a door with no page (the phone's confirm card): the
    songs the library holds — in any script, or a slip away unless forced —
    are skipped with the reason, the rest go on the Mac's queue and the worker
    starts. Nothing downloads in this call."""
    todo, skipped, errors = [], [], []
    for t in tracks:
        if not naming.tag(t.get("title")):
            errors.append("a track had no title")
            continue
        held = in_library(t, allow_near=bool(t.get("force")))
        if held:
            skipped.append(skipped_row(t, held[0], held[1].get("file")))
            continue
        todo.append({**t, "for_phone": bool(for_phone) or t.get("for_phone") is True})
    r = action("queue-add", json.dumps(todo, ensure_ascii=False)) if todo else {"ok": True, "added": 0}
    if not r.get("ok"):
        return {"queued": 0, "errors": errors + [r.get("error") or "the queue refused"]}
    if r.get("added") and os.environ.get("DJ_NO_WORKER") != "1":
        start_worker()
    out = {"queued": int(r.get("added") or 0), "songs": [label(t) for t in todo], "errors": errors}
    return {**out, "skipped": skipped} if skipped else out


# ── the queue worker ───────────────────────────────────────────────────────

def pid_alive(pid):
    try:
        os.kill(int(pid), 0)
        return True
    except PermissionError:
        return True
    except Exception:
        return False


def take_worker_lock():
    """One worker at a time. A lock whose recorded pid is gone is stale."""
    os.makedirs(DATA, exist_ok=True)
    for _ in range(2):
        try:
            os.mkdir(WORKER_LOCK)
            with open(os.path.join(WORKER_LOCK, "pid"), "w") as f:
                f.write(str(os.getpid()))
            return True
        except FileExistsError:
            try:
                with open(os.path.join(WORKER_LOCK, "pid")) as f:
                    pid = f.read().strip()
            except Exception:
                pid = ""
            fresh = time.time() - os.path.getmtime(WORKER_LOCK) < 10
            if (pid and pid_alive(pid)) or (not pid and fresh):
                return False
            shutil.rmtree(WORKER_LOCK, ignore_errors=True)
    return False


def release_worker_lock():
    try:
        with open(os.path.join(WORKER_LOCK, "pid")) as f:
            if f.read().strip() == str(os.getpid()):
                shutil.rmtree(WORKER_LOCK, ignore_errors=True)
    except Exception:
        pass


def item_status(item_id):
    for it in read_json(QUEUE, {}).get("items") or []:
        if it.get("id") == item_id:
            return it.get("status")
    return None


class Progress:
    def __init__(self):
        self.task_id, self.done, self.left, self.current = int(time.time()), 0, 0, ""
        self.got, self.failed = 0, []
        self.lock = threading.Lock()

    def claimed(self, item, counts):
        with self.lock:
            self.current = label(item)
            self.left = int(counts.get("pending") or 0) + int(counts.get("running") or 0)
            publish(self.task_id, self.done, self.done + self.left, self.current)

    def finished(self, item=None, res=None):
        with self.lock:
            self.done += 1
            if res is not None and res.get("ok"):
                self.got += 1
            elif res is not None and not res.get("cancelled"):
                self.failed.append(f"{label(item or {})}: {res.get('error') or 'failed'}")
            self.left = max(0, self.left - 1)
            publish(self.task_id, self.done, self.done + self.left, self.current)

    def close(self):
        publish(self.task_id, self.done, self.done, "", finished=True, got=self.got, failed=self.failed)


def run_item(bins, cfg, item):
    if not bins.get("ok"):
        return {"ok": False, "error": bins.get("note") or "yt-dlp/ffmpeg unavailable"}
    cancelled = lambda: item_status(item["id"]) == "cancelling"  # noqa: E731
    if item.get("kind") == "redownload":
        return fetch_track(bins, cfg, item, exclude=item.get("exclude") or (),
                           skip_first=bool(item.get("skip_first")), dest=item.get("dest"),
                           cancelled=cancelled)
    res = fetch_track(bins, cfg, item, cancelled=cancelled, guard=True)
    if res.get("skipped"):
        # Known to the catalogue by a name the library already holds.
        return {"ok": False, "error": f"{res['skipped']} ({os.path.basename(str(res.get('file') or ''))})"}
    return res


def drain(bins, cfg, progress):
    while True:
        r = action("queue-claim")
        item = r.get("item") if r.get("ok") else None
        if not item:
            return
        progress.claimed(item, r)
        try:
            res = run_item(bins, cfg, item)
        except Exception as e:
            res = {"ok": False, "error": str(e)}
        if not res.get("ok") and item_status(item["id"]) == "cancelling":
            res = {"ok": False, "cancelled": True, "error": "cancelled"}
        action("queue-finish", item["id"], json.dumps(res))
        progress.finished(item, res)


def worker():
    if not take_worker_lock():
        return {"ok": True, "running": True}
    try:
        action("queue-reset")
        bins, cfg, progress = load_bins(), load_config(), Progress()
        threads = [threading.Thread(target=drain, args=(bins, cfg, progress)) for _ in range(WORKERS)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        progress.close()
        return {"ok": True, "done": progress.done}
    finally:
        release_worker_lock()


def start_worker():
    """Launch `worker` in a new session and return at once."""
    os.makedirs(DATA, exist_ok=True)
    try:
        if os.path.getsize(WORKER_LOG) > 1_000_000:
            os.remove(WORKER_LOG)
    except OSError:
        pass
    with open(WORKER_LOG, "a") as log:
        p = subprocess.Popen([sys.executable, os.path.abspath(__file__), "worker"],
                             stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                             start_new_session=True, close_fds=True,
                             env={**os.environ, "DJ_DIR": SKILL_DIR})
    return {"ok": True, "pid": p.pid}


# ── cli ────────────────────────────────────────────────────────────────────

def arg(i):
    raw = sys.argv[i] if len(sys.argv) > i else ""
    if not raw or (raw.startswith("{{") and raw.endswith("}}")):
        raw = "" if i > 2 else sys.stdin.read()
    return raw


def one(raw):
    try:
        obj = json.loads(raw or "{}")
    except Exception:
        return None
    return obj if isinstance(obj, dict) else None


def cli_track():
    t = one(arg(2))
    if not t:
        return {"ok": False, "error": "no track given"}
    bins = load_bins()
    if not bins.get("ok"):
        return {"ok": False, "error": bins.get("note") or "yt-dlp/ffmpeg unavailable"}
    return fetch_track(bins, load_config(), t)


def retag(bins, path, track):
    """The mp3's own title tag follows a rename (players and the phone read
    it). Stream copy, no re-encode; a failure leaves the file as it was."""
    if FAKE or not bins.get("ffmpeg") or not str(path).endswith(".mp3"):
        return False
    tmp = f"{path}.retag.mp3"
    cmd = [bins["ffmpeg"], "-y", "-v", "error", "-i", path, "-map", "0", "-c", "copy",
           "-id3v2_version", "3", "-metadata", "title=" + naming.tag(track.get("title")),
           "-metadata", "artist=" + naming.tag(track.get("artist")), tmp]
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=120)
        if r.returncode == 0 and os.path.getsize(tmp) > 0:
            os.replace(tmp, path)
            return True
    except Exception:
        pass
    try:
        os.remove(tmp)
    except OSError:
        pass
    return False


def cli_rename():
    """RenameTrack: the song takes its real name — file, sidecars, tags, row,
    lists and phone place — and its lyrics are looked up again under it."""
    t = one(arg(2))
    if not t or not t.get("file") or not naming.tag(t.get("title")):
        return {"ok": False, "error": "give { file, title }"}
    args = [t["file"], naming.tag(t["title"])] + ([naming.tag(t["artist"])] if t.get("artist") else [])
    r = action("track-rename", *args)
    if not r.get("ok"):
        return r
    path = r["path"]
    bins = load_bins()
    row = {"artist": r["artist"], "title": r["title"]}
    tagged = retag(bins, path, row) if bins.get("ok") else False
    lrc, timed = write_lyrics(row, path)
    if lrc:
        action("track-set-lrc", r["file"], lrc, "timed" if timed else "untimed")
    return {"ok": True, "file": r["file"], "was": r["was"], "tagged": tagged,
            "lyrics": bool(lrc), "lyrics_timed": bool(timed)}


def cli_karaoke():
    t = one(arg(2))
    if not t:
        return {"ok": False, "error": "no track given"}
    bins = load_bins()
    if not bins.get("ok"):
        return {"ok": False, "error": bins.get("note") or "yt-dlp/ffmpeg unavailable"}
    return fetch_karaoke(bins, load_config(), t, t.get("kind"))


def tracks_arg():
    tracks = as_tracks(arg(2))
    if tracks is None:
        return None, "couldn't read the track list"
    if not tracks:
        return None, "no tracks given"
    return tracks, None


def cli_karaoke_batch():
    tracks, why = tracks_arg()
    if why:
        return {"got": 0, "failed": 0, "files": [], "errors": [why]}
    return karaoke_batch(tracks)


def cli_queue():
    tracks, why = tracks_arg()
    if why:
        return {"queued": 0, "errors": [why]}
    return queue_tracks(tracks, arg(3).strip().lower() in ("true", "1", "yes"))


VERBS = {
    "track": cli_track,
    "rename": cli_rename,
    "karaoke": cli_karaoke,
    "queue": cli_queue,
    "karaoke-batch": cli_karaoke_batch,
    "worker": worker,
    "start-worker": start_worker,
}


def main():
    verb = sys.argv[1] if len(sys.argv) > 1 else ""
    run = VERBS.get(verb)
    out = run() if run else {"ok": False, "error": f"unknown verb {verb!r}"}
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
