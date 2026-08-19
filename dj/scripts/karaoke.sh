#!/usr/bin/env bash
# karaoke.sh — fetch the karaoke version of songs ALREADY in the library. Backs
# the GetKaraoke tool, so "get the karaoke for X and sync it to my phone" is an
# order DJ can fill instead of a door with no room behind it (the phone's
# karaoke sheet offers exactly that ask).
#
# Reads a JSON array of {artist, title, kind?} on stdin or as $1 — kind is
# "audio" (instrumental mp3, the default) or "video" (lyrics-on-screen mp4).
# Files land in <library>/.karaoke named "Artist - Title (Karaoke).<ext>",
# exactly how the page's downloadKaraokeAudio/Video (download.js) name them —
# kept in step with that file by hand; if you change one, change both.
#
# It writes FILES ONLY, never library.json: reconcile adopts the sidecar on the
# page's next look, and the engine's watcher announces it so the phone that
# asked pulls it as a companion of the track it already carries.
#
# Emits one JSON line: {"got":N,"failed":M,"files":[…],"errors":[…]}
set -uo pipefail

DIR="${SKILL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
REQ="${1:-}"
case "$REQ" in "{{"*"}}"|"") REQ="$(cat)" ;; esac   # placeholder or stdin

OUT="$(mktemp -t dj-karaoke)"
trap 'rm -f "$OUT"' EXIT

"${LINGGEN_PY:-python3}" - "$DIR" "$REQ" > "$OUT" <<'PY'
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
                        "label": f"Fetching karaoke for {total} song" + ("s" if total != 1 else ""),
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

# Config, same defaults as library.js / get.sh.
cfg = {}
for name in ("config.json", "config.example.json"):
    try:
        with open(os.path.join(skill_dir, name)) as f:
            cfg = json.load(f)
        break
    except Exception:
        continue
lib_dir = os.path.expanduser(cfg.get("library_dir") or "~/Music/DJ")
kdir = os.path.join(lib_dir, ".karaoke")
bitrate = str(cfg.get("bitrate") or "320")
quality = "0" if bitrate == "best" else f"{bitrate}K"

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
# what a track is called, and the badge match is BY filename.
def safe(v):
    return re.sub(r'[\\/:*?"<>|]', "-", str(v or "")).strip()

os.makedirs(kdir, exist_ok=True)
files, errors = [], []
total = len(tracks)

for i, t in enumerate(tracks):
    if not isinstance(t, dict):
        continue
    artist, title = safe(t.get("artist")), safe(t.get("title"))
    if not title:
        errors.append("a track had no title")
        continue
    kind = str(t.get("kind") or "audio").lower()
    publish(i, total, f"{artist} - {title}".strip(" -"))
    name = f"{artist} - {title} (Karaoke)".strip(" -")
    query = f"{artist} {title} karaoke".strip()

    if kind == "video":
        # Pin H.264 + AAC at <=720p, merged to one .mp4 — same reasoning as
        # download.js: "best" picks AV1/Opus, which WKWebView can't decode on
        # pre-M3 Macs, and 720p keeps files phone-sized.
        cmd = [bins["yt_dlp"], "--no-warnings", "--ignore-errors", "--max-downloads", "1",
               "--socket-timeout", "15", "--retries", "3", "--fragment-retries", "3",
               "--concurrent-fragments", "4",
               "-f", "bv*[vcodec^=avc1][height<=720]+ba[ext=m4a]/bv*[vcodec^=avc1][height<=720]+ba/bv*[height<=720]+ba/b[height<=720]/b",
               "--merge-output-format", "mp4",
               "--ffmpeg-location", bins["ffmpeg"],
               "--print", "after_move:filepath",
               "-o", f"{kdir}/{name}.%(ext)s",
               f"ytsearch5:{query}"]
        want = (".mp4", ".mkv", ".webm")
    else:
        # Audio of a "<song> karaoke" upload (lead vocal already removed),
        # straight to mp3. Tagged as the karaoke cut so the library never
        # confuses it with the original. No loudnorm — karaoke uploads are
        # already mastered (same call download.js makes).
        cmd = [bins["yt_dlp"], "--no-warnings", "--ignore-errors", "--max-downloads", "1",
               "--socket-timeout", "15", "--retries", "3", "--fragment-retries", "3",
               "--concurrent-fragments", "4",
               "-x", "--audio-format", "mp3", "--audio-quality", quality,
               "--postprocessor-args",
               f'ffmpeg:-metadata artist="{artist}" -metadata title="{title} (Karaoke)"',
               "--ffmpeg-location", bins["ffmpeg"],
               "--print", "after_move:filepath",
               "-o", f"{kdir}/{name}.%(ext)s",
               f"ytsearch5:{query}"]
        want = (".mp3",)
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
        got = [l for l in r.stdout.strip().splitlines() if l.endswith(want)]
        if got:
            files.append(got[-1])
        else:
            errors.append(f"no karaoke {kind} found for {artist} - {title}".strip())
    except subprocess.TimeoutExpired:
        errors.append(f"timed out on {artist} - {title}".strip())
    except Exception as e:
        errors.append(f"{artist} - {title}: {e}".strip())

publish(total, total, "", finished=True)
out(got=len(files), failed=total - len(files), files=files, errors=errors)
PY

cat "$OUT"
