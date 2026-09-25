#!/usr/bin/env python3
"""The weekly disk and backup check — read-only, and never a walk.

    python3 check.py            measure, save data/check.json, hand it on, print it
    python3 check.py --dry      measure and print; save and send nothing

What it reads, all of it already on disk or one statvfs away:
  - the data volume's free space (Apple's decimal GB, as Finder shows it);
  - the Files tab's Clearable totals as that tab last wrote them — no rescan;
  - the iPhone items with no verified copy on this Mac, from the Media
    manifest and the archive ledger, a Live Photo counted once (the header
    badge's rule, media.js foldLiveMovs).

Where the facts go:
  - data/check.json — the last check, which the next one compares with;
  - the retained `shifu/check` topic — the paired phone reads it on its next
    connect and, for a warning, has Yinyue say it on the lock screen;
  - a warning (under 10% free) also goes to Yinyue on this Mac as a moment —
    facts, which she words, never a sentence written here for the user.

It deletes nothing, moves nothing, and starts no scan.
"""

import json
import os
import re
import sys
import time
import urllib.request

HOME = os.path.expanduser("~")
DATA = os.environ.get("SHIFU_DATA", os.path.join(HOME, ".linggen/skills/apple-shifu/data"))
PORT = os.environ.get("LINGGEN_PORT", "9527")
LOW_DISK_PCT = 10

IMAGE_RE = re.compile(r"\.(heic|heif|jpg|jpeg|png|gif|tiff|webp|dng)$", re.I)
VIDEO_RE = re.compile(r"\.(mov|mp4|m4v|avi|3gp)$", re.I)
UNITS = {"KB": 1e-6, "MB": 1e-3, "GB": 1.0, "TB": 1e3}


def disk_usage(paths=("/System/Volumes/Data", "/")):
    for p in paths:
        try:
            st = os.statvfs(p)
        except OSError:
            continue
        total = st.f_blocks * st.f_frsize / 1e9
        free = st.f_bavail * st.f_frsize / 1e9
        return {"total_gb": round(total, 1), "free_gb": round(free, 1),
                "free_pct": round(free / total * 100, 1) if total else None}
    return None


def parse_clearable(text):
    """First two lines of files/clearables/summary.txt → totals, or None."""
    lines = (text or "").split("\n")
    head = lines[0] if lines else ""
    totals = lines[1] if len(lines) > 1 else ""

    def size(label):
        m = re.search(label + r" ([\d.]+) (KB|MB|GB|TB)", totals)
        return float(m.group(1)) * UNITS[m.group(2)] if m else None

    safe = size("safe")
    if safe is None:
        return None
    at = re.search(r"finished (\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)", head)
    return {"safe_gb": round(safe, 1), "review_gb": round(size("review") or 0, 1),
            "finished": at.group(1) if at else None}


def read_jsonl(path):
    rows = []
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    pass
    except OSError:
        return None
    return rows


def unbacked(manifest, archive):
    """Items on the phone's roll with no archived copy here; None before any
    sync. A Live Photo's movie half is folded into its still."""
    if manifest is None:
        return None
    rows = [r for r in manifest if r.get("staged") and (IMAGE_RE.search(r["staged"]) or VIDEO_RE.search(r["staged"]))]
    if not rows:
        return None

    def stem(p):
        return p[: p.rfind(".")].lower()

    stills = {stem(r["staged"]) for r in rows if IMAGE_RE.search(r["staged"])}
    items = [r for r in rows if not (r["staged"].lower().endswith(".mov") and stem(r["staged"]) in stills)]
    have = {r.get("sha256") for r in (archive or [])}
    return sum(1 for r in items if r.get("sha256") not in have)


def facts(now, disk, clearable, pending, prev):
    f = {"at": int(now), "disk": disk, "clearable": clearable, "unbacked": pending}
    f["low_disk"] = bool(disk and disk.get("free_pct") is not None and disk["free_pct"] < LOW_DISK_PCT)
    if prev and disk and (prev.get("disk") or {}).get("free_gb") is not None:
        f["since_last"] = {"at": prev.get("at"), "free_gb_change": round(disk["free_gb"] - prev["disk"]["free_gb"], 1)}
    return f


def gb(x):
    return f"{x / 1000:.1f} TB" if x >= 1000 else f"{x:.1f} GB"


def moment_text(f):
    """The warning as facts for Yinyue — she writes the words."""
    d = f["disk"]
    parts = [f"Mac disk under {LOW_DISK_PCT}% free: {gb(d['free_gb'])} of {gb(d['total_gb'])} left ({d['free_pct']}%)."]
    if f.get("since_last"):
        parts.append(f"Change since last week's check: {f['since_last']['free_gb_change']:+.1f} GB.")
    if f.get("clearable") and f["clearable"]["safe_gb"] > 0:
        parts.append(f"Apple Shifu marks {gb(f['clearable']['safe_gb'])} safe to clear (Files → Clearable).")
    return " ".join(parts)[:300]


def post(path, body):
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}{path}", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status < 300
    except Exception:
        return False


def load_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def main(argv):
    dry = "--dry" in argv
    prev = load_json(os.path.join(DATA, "check.json"))
    try:
        with open(os.path.join(DATA, "files/clearables/summary.txt"), encoding="utf-8") as fh:
            clearable = parse_clearable(fh.read())
    except OSError:
        clearable = None
    pending = unbacked(read_jsonl(os.path.join(DATA, "media/manifest.jsonl")),
                       read_jsonl(os.path.join(DATA, "media/archive.jsonl")))
    f = facts(time.time(), disk_usage(), clearable, pending, prev)
    if not dry:
        os.makedirs(DATA, exist_ok=True)
        tmp = os.path.join(DATA, f"check.json.tmp.{os.getpid()}")
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(f, fh, indent=1)
            fh.write("\n")
        os.replace(tmp, os.path.join(DATA, "check.json"))
        f["sent_to_phone"] = post("/api/topic/publish", {"topic": "shifu", "op": "check", "payload": f, "retain": True})
        if f["low_disk"]:
            f["sent_to_yinyue"] = post("/api/yinyue/event", {"app": "apple-shifu", "text": moment_text(f), "big": True})
    print(json.dumps(f, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
