#!/usr/bin/env bash
# get.sh — download tracks into the library. Backs the GetTracks tool, so DJ can
# fill an order end to end when asked to instead of only proposing one.
#
# Reads a JSON array of {artist, title, year?} on stdin or as $1, and downloads
# each into the library folder with the same yt-dlp pipeline the page uses
# (scripts/download.js) — same search strategy, same tagging, same loudness
# normalization. Kept in step with that file by hand; if you change one, change
# both.
#
# It writes FILES ONLY, never library.json. The folder is ground truth for what
# exists: the page's reconcile adopts new files on its next look, and the
# engine's directory watcher announces them so a paired phone syncs itself. So
# this stays out of the register's way entirely.
#
# Emits one JSON line: {"got":N,"failed":M,"files":[…],"errors":[…]}
set -uo pipefail

DIR="${SKILL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
REQ="${1:-}"
case "$REQ" in "{{"*"}}"|"") REQ="$(cat)" ;; esac   # placeholder or stdin

python3 - "$DIR" "$REQ" <<'PY'
import json, os, re, subprocess, sys, time, urllib.request

skill_dir, raw = sys.argv[1], sys.argv[2]

TASK_ID = int(time.time())

def publish(done, total, current, finished=False):
    # Progress rides the retained `tasks` topic — the phone's relay card and
    # the DJ page both read it. Telemetry must never break a download, so
    # every failure here is swallowed.
    try:
        body = json.dumps({
            "topic": "tasks", "op": "dj", "retain": True,
            "payload": {"app": "dj", "task_id": TASK_ID,
                        "label": f"Downloading {total} songs",
                        "done": done, "total": total, "current": current,
                        "finished": finished, "at": int(time.time())},
        }).encode()
        req = urllib.request.Request(
            "http://127.0.0.1:%s/api/topic/publish"
            % os.environ.get("LINGGEN_PORT", "9527"),
            data=body, headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=3).read()
    except Exception:
        pass

def out(**kw):
    print(json.dumps(kw))
    sys.exit(0)

try:
    tracks = json.loads(raw or "[]")
except Exception:
    out(got=0, failed=0, files=[], errors=["couldn't read the track list"])
if isinstance(tracks, dict):
    tracks = tracks.get("tracks") or []
if not isinstance(tracks, list) or not tracks:
    out(got=0, failed=0, files=[], errors=["no tracks given"])

# Config, same defaults as library.js.
cfg = {}
for name in ("config.json", "config.example.json"):
    try:
        with open(os.path.join(skill_dir, name)) as f:
            cfg = json.load(f)
        break
    except Exception:
        continue
lib_dir = os.path.expanduser(cfg.get("library_dir") or "~/Music/DJ")
bitrate = str(cfg.get("bitrate") or "320")
quality = "0" if bitrate == "best" else f"{bitrate}K"
template = cfg.get("naming_template") or "%(artist)s - %(title)s"
target = cfg.get("loudnorm_lufs")
target = float(target) if isinstance(target, (int, float)) else -14.0
loudnorm = None if cfg.get("loudnorm") is False else f"-af loudnorm=I={target}:TP=-1.5:LRA=11"

# Binaries: fetched into ~/.linggen/bin on first use, never a system install.
try:
    setup = subprocess.run(["bash", os.path.join(skill_dir, "scripts/bin-setup.sh")],
                           capture_output=True, text=True, timeout=600)
    bins = json.loads(setup.stdout.strip().splitlines()[-1])
except Exception as e:
    out(got=0, failed=len(tracks), files=[], errors=[f"couldn't set up yt-dlp/ffmpeg: {e}"])
if not bins.get("ok"):
    out(got=0, failed=len(tracks), files=[], errors=[bins.get("note") or "yt-dlp/ffmpeg unavailable"])

# Filenames: the page's `safe()` — keep it identical or the two disagree about
# what a track is called, and the phone matches playlists BY filename.
def safe(v):
    return re.sub(r'[\\/:*?"<>|]', "-", str(v or "")).strip()

os.makedirs(lib_dir, exist_ok=True)
files, errors = [], []
total = len(tracks)

for i, t in enumerate(tracks):
    if not isinstance(t, dict):
        continue
    artist, title = safe(t.get("artist")), safe(t.get("title"))
    if not title:
        errors.append("a track had no title")
        continue
    publish(i, total, f"{artist} - {title}".strip(" -"))
    name = (template.replace("%(artist)s", artist)
                    .replace("%(title)s", title)
                    .replace("%(year)s", safe(t.get("year")))).strip() or f"{artist} - {title}"
    meta = f'-metadata artist="{artist}" -metadata title="{title}"'
    if t.get("year"):
        meta += f' -metadata date="{safe(t["year"])}"'

    # ytsearch5 + --max-downloads 1: the top hit is often region- or
    # label-blocked, so take the first that actually downloads.
    cmd = [bins["yt_dlp"], "--no-warnings", "--ignore-errors", "--max-downloads", "1",
           "--socket-timeout", "15", "--retries", "3", "--fragment-retries", "3",
           "--concurrent-fragments", "4",
           "-x", "--audio-format", "mp3", "--audio-quality", quality,
           "--embed-thumbnail"]
    if loudnorm:
        # Scoped to the extraction step only — on the bare `ffmpeg` key it also
        # hits --embed-thumbnail's image conversion, which has no audio stream,
        # and silently breaks cover art (learned the hard way 2026-06-30).
        cmd += ["--postprocessor-args", f"ExtractAudio+ffmpeg:{loudnorm}"]
    cmd += ["--postprocessor-args", f"ffmpeg:{meta}",
            "--ffmpeg-location", bins["ffmpeg"],
            "--print", "after_move:filepath",
            "-o", f"{lib_dir}/{name}.%(ext)s",
            f"ytsearch5:{artist} {title}".strip()]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        got = [l for l in r.stdout.strip().splitlines() if l.endswith(".mp3")]
        if got:
            files.append(got[-1])
        else:
            errors.append(f"{artist} - {title}: no playable source found")
    except subprocess.TimeoutExpired:
        errors.append(f"{artist} - {title}: timed out")
    except Exception as e:
        errors.append(f"{artist} - {title}: {e}")

publish(total, total, "", finished=True)
out(got=len(files), failed=len(errors), files=files, errors=errors)
PY

# Register what landed without waiting for a page visit — the reconcile verb
# adopts the new files into library.json (and clears any old delete tombstones)
# so ListLibrary and a paired phone see them immediately. Best-effort: the next
# page open reconciles anyway.
bash "$DIR/scripts/run-js.sh" "$DIR/scripts/actions.mjs" reconcile >/dev/null 2>&1 || true
