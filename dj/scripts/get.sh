#!/usr/bin/env bash
# get.sh — download tracks into the library. Backs the GetTracks tool, so DJ can
# fill an order end to end when asked to instead of only proposing one.
#
# Reads a JSON array of {artist, title, year?} on stdin or as $1, and downloads
# each into the library folder with the same yt-dlp pipeline the page uses
# (scripts/download.js) — same search strategy, same tagging, same loudness
# normalization, and the same LRCLIB .lrc sidecars (scripts/lyrics.js). Kept in
# step with those files by hand; if you change one, change both.
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

# Where the songs are meant to end up. Downloading is the Mac's act — a phone
# carries only what something said it should — so the destination travels WITH
# the order instead of arriving as a second call the caller can forget. That
# forgetting is the whole failure this closes: a download asked for from the
# phone would land on the Mac and stop, with nobody wrong and nothing said.
FOR_PHONE="${2:-}"
case "$FOR_PHONE" in "{{"*"}}") FOR_PHONE="" ;; esac

# Captured, not streamed: the file list has to reach the phone-add below, and
# both subprocesses inside capture their own output, so this is the one JSON
# line and nothing else. It is printed at the end, unchanged. Via a file rather
# than $(…) because bash cannot parse a heredoc inside command substitution
# when the body has unbalanced quotes, and the python below is full of them.
OUT="$(mktemp -t dj-get)"
trap 'rm -f "$OUT"' EXIT

python3 - "$DIR" "$REQ" > "$OUT" <<'PY'
import json, os, re, subprocess, sys, time, urllib.parse, urllib.request

skill_dir, raw = sys.argv[1], sys.argv[2]

UA = "DJ (Linggen music app) https://linggen.dev"

def pick_source(yt_dlp, t):
    """Choose WHICH video this track comes from — scripts/pick-source.py, the
    same picker the page uses, so both paths agree on what a track is.

    Returns the picked dict or None; None means fall back to a plain search,
    because a picker that cannot reach the network must not stop a download.
    """
    req = json.dumps({
        "artist": t.get("artist") or "", "title": t.get("title") or "",
        "version": t.get("version") or "studio",
        "query_hints": t.get("query_hints") or [],
        "yt_dlp": yt_dlp,
    })
    try:
        r = subprocess.run(
            ["python3", os.path.join(skill_dir, "scripts/pick-source.py"), req],
            capture_output=True, text=True, timeout=180)
        picked = json.loads(r.stdout.strip().splitlines()[-1])
    except Exception:
        return None
    return picked if picked.get("ok") else None


def fetch_lrc(artist, title):
    # Mirror of lyrics.js fetchLyrics: LRCLIB free-text search (the exact
    # artist/track fields miss original-language titles), prefer synced.
    q = f"{artist} {title}".strip()
    if not q:
        return None
    req = urllib.request.Request(
        "https://lrclib.net/api/search?q=" + urllib.parse.quote(q),
        headers={"User-Agent": UA})
    try:
        arr = json.loads(urllib.request.urlopen(req, timeout=12).read().decode())
    except Exception:
        return None
    if not isinstance(arr, list):
        return None
    pick = (next((r for r in arr if r.get("syncedLyrics")), None)
            or next((r for r in arr if r.get("plainLyrics")), None))
    if not pick:
        return None
    return pick.get("syncedLyrics") or pick.get("plainLyrics")

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

    # Pick the source deliberately; fall back to ytsearch5 + --max-downloads 1
    # when the picker comes back empty, since the top hit is often region- or
    # label-blocked and that fallback takes the first that actually downloads.
    picked = pick_source(bins["yt_dlp"], t)
    target = picked["url"] if picked else f"ytsearch5:{artist} {title}".strip()

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
            target]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        got = [l for l in r.stdout.strip().splitlines() if l.endswith(".mp3")]
        if got:
            files.append(got[-1])
            # The page backfills lyrics after its downloads (lyrics.js); a
            # headless get must too, or agent-ordered songs reach the phone
            # bare while page-ordered ones carry their .lrc. The picker has
            # usually fetched them already — that is where the duration it
            # matched against came from — so only ask LRCLIB again if it did
            # not, which is the fallback-search case.
            try:
                body = (picked or {}).get("lyrics", {})
                body = body.get("body") if isinstance(body, dict) else None
                body = body or fetch_lrc(artist, title)
                if body and body.strip():
                    with open(os.path.splitext(got[-1])[0] + ".lrc", "w") as f:
                        f.write(body if body.endswith("\n") else body + "\n")
            except Exception:
                pass
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

# Ordered for the phone: put what actually landed into the phone view. It runs
# AFTER reconcile because phone-add resolves names against the library, and the
# songs are new — reconcile is what puts them there. phone-add tells the phone
# itself, so a connected one starts fetching without anything else being asked.
case "$FOR_PHONE" in
  true|True|1|yes)
    FILES="$(python3 -c \
      'import json,sys; print(json.dumps(json.load(open(sys.argv[1])).get("files") or []))' \
      "$OUT" 2>/dev/null || printf '[]')"
    if [ "$FILES" != "[]" ]; then
      bash "$DIR/scripts/run-js.sh" "$DIR/scripts/actions.mjs" phone-add "$FILES" >/dev/null 2>&1 || true
    fi
    ;;
esac

# The tool's one JSON line, exactly as python wrote it.
cat "$OUT"
