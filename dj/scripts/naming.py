"""naming.py — what a song is called on disk, and the yt-dlp command that puts
it there. ONE copy, used by every door: the page (via fetch.py over
/api/bash), GetTracks (get.sh), GetKaraoke (karaoke.sh) and the download
queue worker. The phone matches songs, lyrics and karaoke companions BY
FILENAME, so two doors naming one song two ways is two songs.

Pure: no network, no disk. tests/test_naming.py pins the names.
"""
import re
import shlex

DEFAULT_TEMPLATE = "%(artist)s - %(title)s"
UNSAFE = re.compile(r'[\\/:*?"<>|]')
KARAOKE_SUFFIX = " (Karaoke)"

# Fail fast on a stalled source (the default is effectively no timeout, which
# let one dead candidate hang for 30+ min), pull fragments in parallel, and take
# the FIRST candidate that actually downloads: callers hand over a ranked list
# and a region-blocked winner must fall through to the next one.
COMMON = ["--no-warnings", "--ignore-errors", "--max-downloads", "1",
          "--socket-timeout", "15", "--retries", "3", "--fragment-retries", "3",
          "--concurrent-fragments", "4"]

# One line per landed file: "<video id> <final path>". The id is recorded on
# the track so "find another source" can skip it.
PRINT = ["--print", "after_move:%(id)s %(filepath)s"]

# H.264 + AAC at <=720p: "best" picks AV1/Opus, which WKWebView cannot decode
# on pre-M3 Macs, and 720p keeps a clip phone-sized.
VIDEO_FORMAT = ("bv*[vcodec^=avc1][height<=720]+ba[ext=m4a]/"
                "bv*[vcodec^=avc1][height<=720]+ba/bv*[height<=720]+ba/"
                "b[height<=720]/b")


def safe(value):
    """A filename component: no path or shell-hostile characters, one space
    between words."""
    text = "" if value is None else str(value)
    return re.sub(r"\s+", " ", UNSAFE.sub("-", text)).strip()


def tag(value):
    """An ID3 value: the curated text as given, whitespace tidied. Quoting is
    the command builder's job, so "AC/DC" stays "AC/DC"."""
    return re.sub(r"\s+", " ", "" if value is None else str(value)).strip()


def track_stem(track, template=None):
    """The file stem for a song, from the curated artist and title — never
    from yt-dlp's own fields, which name the uploading channel."""
    artist, title = safe(track.get("artist")), safe(track.get("title"))
    name = ((template or DEFAULT_TEMPLATE)
            .replace("%(artist)s", artist)
            .replace("%(title)s", title)
            .replace("%(year)s", safe(track.get("year")))).strip()
    return name or f"{artist} - {title}".strip()


def karaoke_stem(track, template=None):
    """A karaoke render is named after the song FILE it belongs to — that is
    how the engine pairs companions — and after the curated name only when
    the song has no file yet."""
    f = str(track.get("file") or "")
    base = f.rsplit("/", 1)[-1]
    stem = base.rsplit(".", 1)[0] if "." in base else base
    return (stem or track_stem(track, template)) + KARAOKE_SUFFIX


def quality(cfg):
    bitrate = str(cfg.get("bitrate") or "320")
    return "0" if bitrate == "best" else f"{bitrate}K"


def loudnorm(cfg):
    """Single-pass EBU R128 to ~-14 LUFS with a -1.5 dB true-peak ceiling, so
    quiet sources stop sounding quiet in the car. Off with loudnorm:false."""
    if cfg.get("loudnorm") is False:
        return ""
    lufs = cfg.get("loudnorm_lufs")
    target = lufs if isinstance(lufs, (int, float)) and not isinstance(lufs, bool) else -14
    return f"-af loudnorm=I={target}:TP=-1.5:LRA=11"


def meta_args(track, title_suffix=""):
    """ffmpeg -metadata flags. yt-dlp shell-splits postprocessor args, so each
    value is shell-quoted rather than stripped of the characters that would
    break a naive split."""
    parts = ["-metadata", "artist=" + tag(track.get("artist")),
             "-metadata", "title=" + tag(track.get("title")) + title_suffix]
    if track.get("year"):
        parts += ["-metadata", "date=" + tag(track.get("year"))]
    return " ".join(shlex.quote(p) for p in parts)


def match_filter(exclude):
    ids = [str(i) for i in exclude or () if str(i or "").strip()]
    return ["--match-filters", " & ".join(f"id!='{i}'" for i in ids)] if ids else []


def audio_cmd(bins, cfg, track, out_template, sources, exclude=()):
    """The song itself: tagged, cover embedded, loudness-normalized mp3.

    loudnorm is scoped to the extraction step (ExtractAudio+ffmpeg): on the
    bare ffmpeg key it also hits --embed-thumbnail's image conversion, which
    has no audio stream, and cover art silently breaks (2026-06-30)."""
    cmd = [bins["yt_dlp"], *COMMON,
           "-x", "--audio-format", "mp3", "--audio-quality", quality(cfg),
           "--embed-thumbnail"]
    norm = loudnorm(cfg)
    if norm:
        cmd += ["--postprocessor-args", f"ExtractAudio+ffmpeg:{norm}"]
    cmd += ["--postprocessor-args", "ffmpeg:" + meta_args(track)]
    cmd += match_filter(exclude)
    return cmd + ["--ffmpeg-location", bins["ffmpeg"], *PRINT,
                  "-o", out_template, *sources]


def karaoke_query(track):
    return f"ytsearch5:{tag(track.get('artist'))} {tag(track.get('title'))} karaoke".replace("  ", " ")


def karaoke_cmd(bins, cfg, track, kind, out_template):
    """A "<song> karaoke" upload: its audio as an instrumental mp3 (no
    loudnorm — already mastered), or the clip itself with lyrics on screen."""
    if kind == "video":
        cmd = [bins["yt_dlp"], *COMMON, "-f", VIDEO_FORMAT,
               "--merge-output-format", "mp4"]
    else:
        cmd = [bins["yt_dlp"], *COMMON,
               "-x", "--audio-format", "mp3", "--audio-quality", quality(cfg),
               "--embed-thumbnail",
               "--postprocessor-args", "ffmpeg:" + meta_args(track, KARAOKE_SUFFIX)]
    return cmd + ["--ffmpeg-location", bins["ffmpeg"], *PRINT,
                  "-o", out_template, karaoke_query(track)]


KARAOKE_EXTS = {"video": (".mp4", ".mkv", ".webm"), "audio": (".mp3",)}


def landed(stdout, exts):
    """The last (id, path) yt-dlp printed for a file with one of `exts`."""
    hits = []
    for line in str(stdout or "").splitlines():
        vid, _, path = line.strip().partition(" ")
        if path.endswith(exts):
            hits.append((vid, path))
    return hits[-1] if hits else (None, None)
