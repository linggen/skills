#!/usr/bin/env python3
"""Media pipeline for Sys Doctor's Media tab.

Subcommands (all write machine-readable JSON; long ops stream progress to
data/media/progress.json and are launched in the background by media.sh):

  info     device + Mac disk snapshot (fast, safe to poll)
  index    build/refresh the Mac photo index (SHA-256 + dHash, incremental)
  pull     incremental camera-roll pull over USB (manifest-driven)
  scan     analyze staged files -> flags.json (hash/pHash/blur/luma/ffprobe)
  backup   offload: copy selected files to an archive root (--dest, default
           ~/Pictures/iPhone Backup) with per-copy re-hash verify
  remove   delete from the iPhone over AFC (requires --confirm). Default reads
           the backup-verified set; --trash reads the raw selection and moves
           each staged copy into the 30-day restore area instead
  purge    drop expired restore-area files (--all empties it now)
  restore  move one restore-area file back out to ~/Pictures/iPhone Restored
  trash    move selected Mac files to the macOS Trash (recoverable) + prune index

Detection is pure scripts — no LLM anywhere in this pipeline.
"""

import argparse
import asyncio
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

HOME = Path.home()
DATA_DIR = HOME / '.linggen' / 'skills' / 'sys-doctor' / 'data' / 'media'
STAGING_DIR = DATA_DIR / 'staging'
THUMBS_DIR = DATA_DIR / 'thumbs'
MANIFEST = DATA_DIR / 'manifest.jsonl'
MAC_INDEX = DATA_DIR / 'mac-index.jsonl'
FLAGS = DATA_DIR / 'flags.json'
PROGRESS = DATA_DIR / 'progress.json'
STATE = DATA_DIR / 'state.json'
BACKUP_ROOT = HOME / 'Pictures' / 'iPhone Backup'
TRASH_DIR = DATA_DIR / 'trash'          # restore area: staged copies of removed items
RESTORE_ROOT = HOME / 'Pictures' / 'iPhone Restored'
TRASH_TTL_DAYS = 30

IMAGE_EXTS = {'.heic', '.heif', '.jpg', '.jpeg', '.png', '.gif', '.tiff', '.webp', '.dng'}
VIDEO_EXTS = {'.mov', '.mp4', '.m4v', '.avi', '.3gp'}
LARGE_VIDEO_BYTES = 100 * 1024 * 1024
DARK_LUMA = 16          # mean 0-255 below this = black/dark shot
BLUR_DEFAULT = 25       # variance-of-Laplacian below this = blurry (UI slider re-flags)
NEAR_DUPE_DISTANCE = 4  # dHash hamming distance for near-dupes / "probably on Mac"
ANALYZE_EDGE = 256      # downscale long edge before blur/luma analysis
THUMB_EDGE = 256


# ── progress / state ──────────────────────────────────────────────────────

def write_json(path, obj):
    tmp = Path(str(path) + '.tmp')
    tmp.write_text(json.dumps(obj, indent=1) + '\n')
    os.replace(tmp, path)


def progress(op, phase, done=None, total=None, note='', status='running', error='', extra=None):
    obj = {'op': op, 'phase': phase, 'done': done, 'total': total, 'note': note,
           'status': status, 'error': error, 'ts': int(time.time())}
    if extra:
        obj.update(extra)
    write_json(PROGRESS, obj)


def update_state(**kv):
    state = {}
    if STATE.exists():
        try:
            state = json.loads(STATE.read_text())
        except Exception:
            state = {}
    state.update(kv)
    state['updated'] = datetime.now().isoformat(timespec='seconds')
    write_json(STATE, state)


def fail(op, phase, err):
    progress(op, phase, status='error', error=str(err))
    print(json.dumps({'error': str(err)}))
    sys.exit(1)


# ── hashing / imaging primitives ──────────────────────────────────────────

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def load_imaging():
    """Import Pillow/numpy lazily so `info` works before setup completes."""
    from PIL import Image
    import numpy as np
    try:
        from pillow_heif import register_heif_opener
        register_heif_opener()
    except ImportError:
        pass
    return Image, np


def analyze_image(path, Image, np):
    """Return (dhash_int, blur_score, luma, megapixels) or None if undecodable."""
    try:
        with Image.open(path) as im:
            mp = round(im.width * im.height / 1e6, 1)
            im = im.convert('L')
            im.thumbnail((ANALYZE_EDGE, ANALYZE_EDGE))
            a = np.asarray(im, dtype=np.float32)
            small = im.resize((9, 8), Image.LANCZOS)
    except Exception:
        return None
    # variance of Laplacian (4-neighbour kernel) = sharpness
    if a.shape[0] > 2 and a.shape[1] > 2:
        lap = (a[:-2, 1:-1] + a[2:, 1:-1] + a[1:-1, :-2] + a[1:-1, 2:]
               - 4 * a[1:-1, 1:-1])
        blur = float(lap.var())
    else:
        blur = 0.0
    luma = float(a.mean())
    s = np.asarray(small, dtype=np.int16)
    bits = (s[:, 1:] > s[:, :-1]).flatten()
    dhash = 0
    for b in bits:
        dhash = (dhash << 1) | int(b)
    return dhash, round(blur, 1), round(luma, 1), mp


def make_thumb(src, dest, Image):
    try:
        with Image.open(src) as im:
            im = im.convert('RGB')
            im.thumbnail((THUMB_EDGE, THUMB_EDGE))
            im.save(dest, 'JPEG', quality=70)
        return True
    except Exception:
        return False


def make_video_poster(src, dest):
    """Grab a representative frame (~1s in) as the video's thumbnail/preview.
    ~/Pictures isn't HTTP-served and clips are large with unknown codecs, so a
    poster still is the preview; playback stays 'Reveal in Finder' / 'Open'."""
    exe = shutil.which('ffmpeg')
    if not exe:
        return False
    try:
        subprocess.run(
            [exe, '-y', '-ss', '1', '-i', str(src), '-frames:v', '1',
             '-vf', f'scale={THUMB_EDGE}:{THUMB_EDGE}:force_original_aspect_ratio=decrease',
             str(dest)],
            capture_output=True, timeout=30)
        return dest.exists()
    except Exception:
        return False


def make_media_thumb(src, dest, Image):
    """Thumbnail for an image or a video (poster frame), by extension."""
    if src.suffix.lower() in VIDEO_EXTS:
        return make_video_poster(src, dest)
    return make_thumb(src, dest, Image)


def hamming(a, b):
    return bin(a ^ b).count('1')


def ffprobe(path):
    """Return (duration_sec, ok) using ffprobe if available."""
    exe = shutil.which('ffprobe')
    if not exe:
        return None, False
    try:
        out = subprocess.run(
            [exe, '-v', 'quiet', '-show_entries', 'format=duration',
             '-of', 'csv=p=0', str(path)],
            capture_output=True, text=True, timeout=20)
        return round(float(out.stdout.strip())), True
    except Exception:
        return None, True


def mac_free_gb():
    st = os.statvfs(HOME)
    return round(st.f_bavail * st.f_frsize / 1e9, 1)


# ── device access (pymobiledevice3 9.x — lockdown entry points are async) ─

async def connect_lockdown():
    from pymobiledevice3.lockdown import create_using_usbmux
    return await create_using_usbmux()


def afc_service(ld):
    from pymobiledevice3.services.afc import AfcService
    return AfcService(ld)


def stat_mtime_epoch(st):
    m = st.get('st_mtime')
    if isinstance(m, datetime):
        return int(m.replace(tzinfo=m.tzinfo or timezone.utc).timestamp())
    return int(m or 0)


async def afc_walk_files(afc, root='/DCIM'):
    """Return (path, size, mtime_epoch) for every regular file under root."""
    files = []
    stack = [root]
    while stack:
        d = stack.pop()
        try:
            names = await afc.listdir(d)
        except Exception:
            continue
        for name in names:
            p = f'{d}/{name}'
            try:
                st = await afc.stat(p)
            except Exception:
                continue
            if 'S_IFDIR' in str(st.get('st_ifmt')):
                stack.append(p)
            else:
                files.append((p, int(st.get('st_size') or 0), stat_mtime_epoch(st)))
    return files


# ── info ──────────────────────────────────────────────────────────────────

def cmd_info(_args):
    asyncio.run(_info_async())


async def _info_async():
    out = {'mac_free_gb': mac_free_gb(), 'connected': False}
    try:
        ld = await connect_lockdown()
    except Exception as e:
        out['reason'] = type(e).__name__
        print(json.dumps(out))
        return
    try:
        info = await ld.get_value() or {}
        disk = await ld.get_value(domain='com.apple.disk_usage') or {}
        gb = lambda v: round(v / 1e9, 1) if isinstance(v, (int, float)) else None
        # AmountDataAvailable = truly free (Finder's number); TotalDataAvailable
        # inflates it with purgeable space iOS could reclaim
        avail = disk.get('AmountDataAvailable')
        if avail is None:
            avail = disk.get('TotalDataAvailable')
        photos = gb(disk.get('PhotoUsage') or disk.get('CameraUsage'))
        if photos is None:  # iOS 26 dropped PhotoUsage — use the last DCIM walk instead
            try:
                photos = json.loads(STATE.read_text()).get('pull', {}).get('dcim_gb')
            except Exception:
                photos = None
        out.update({
            'connected': True,
            'name': info.get('DeviceName', 'iPhone'),
            'model': info.get('ProductType', ''),
            'ios': info.get('ProductVersion', ''),
            'total_gb': gb(disk.get('TotalDiskCapacity')),
            'free_gb': gb(avail),
            'photos_gb': photos,
        })
        update_state(device={'name': out['name'], 'ios': out['ios'],
                             'free_gb': out['free_gb'], 'total_gb': out['total_gb']})
    except Exception as e:
        out['reason'] = f'{type(e).__name__}: {e}'
    print(json.dumps(out))


# ── index (Mac photo index) ───────────────────────────────────────────────

def index_roots():
    roots = [HOME / 'Pictures']
    return [r for r in roots if r.exists()]


def load_jsonl(path):
    rows = []
    if path.exists():
        for line in path.read_text().splitlines():
            if line.strip():
                try:
                    rows.append(json.loads(line))
                except Exception:
                    pass
    return rows


def cmd_index(_args):
    op = 'index'
    Image, np = load_imaging()
    old = {r['path']: r for r in load_jsonl(MAC_INDEX)}
    files = []
    skip_parts = {'.photoslibrary'}  # Photos library needs Full Disk Access — v1 skips it
    for root in index_roots():
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames
                           if not any(d.endswith(s) for s in skip_parts)]
            for name in filenames:
                p = Path(dirpath) / name
                if p.suffix.lower() in IMAGE_EXTS | VIDEO_EXTS:
                    files.append(p)
    total = len(files)
    progress(op, 'hashing', 0, total)
    THUMBS_DIR.mkdir(parents=True, exist_ok=True)
    rows, reused = [], 0
    for i, p in enumerate(files):
        try:
            st = p.stat()
        except OSError:
            continue
        key = str(p)
        prev = old.get(key)
        if prev and prev.get('size') == st.st_size and prev.get('mtime') == int(st.st_mtime):
            row = prev
            reused += 1
        else:
            row = {'path': key, 'size': st.st_size, 'mtime': int(st.st_mtime),
                   'sha256': sha256_file(p)}
            if p.suffix.lower() in IMAGE_EXTS:
                res = analyze_image(p, Image, np)
                if res:
                    row['dhash'] = res[0]
        rows.append(row)
        if p.suffix.lower() in IMAGE_EXTS | VIDEO_EXTS:  # thumbs share the content-hash cache with phone items
            tp = THUMBS_DIR / f"{row['sha256'][:12]}.jpg"
            if not tp.exists():
                make_media_thumb(p, tp, Image)
        if i % 50 == 0:
            progress(op, 'hashing', i, total, note=f'{reused} unchanged reused')
    MAC_INDEX.write_text(''.join(json.dumps(r) + '\n' for r in rows))
    progress(op, 'done', total, total, status='done',
             extra={'indexed': len(rows), 'reused': reused})
    update_state(mac_index={'files': len(rows),
                            'gb': round(sum(r['size'] for r in rows) / 1e9, 1),
                            'at': datetime.now().isoformat(timespec='seconds')})


# ── pull (incremental camera roll) ────────────────────────────────────────

def cmd_pull(_args):
    asyncio.run(_pull_async())


async def _pull_async():
    op = 'pull'
    try:
        ld = await connect_lockdown()
        afc = afc_service(ld)
    except Exception as e:
        fail(op, 'connect', f'No device: {e}')
    manifest = {r['path']: r for r in load_jsonl(MANIFEST)}
    progress(op, 'listing')
    phone_files = await afc_walk_files(afc)
    new = [(p, size, mt) for p, size, mt in phone_files
           if p not in manifest or manifest[p].get('size') != size]
    total_bytes = sum(size for _, size, _ in new)
    if total_bytes / 1e9 > mac_free_gb() - 5:
        fail(op, 'preflight',
             f'Need {total_bytes / 1e9:.1f} GB staged but only {mac_free_gb()} GB free on Mac')
    STAGING_DIR.mkdir(parents=True, exist_ok=True)
    progress(op, 'pulling', 0, len(new),
             extra={'unchanged': len(phone_files) - len(new), 'bytes': total_bytes})
    pulled = 0
    with open(MANIFEST, 'a') as mf:
        for i, (p, size, mt) in enumerate(new):
            rel = p.lstrip('/')
            dest = STAGING_DIR / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            try:
                await afc.pull(p, str(dest), progress_bar=False)
                os.utime(dest, (mt, mt))
            except Exception as e:
                progress(op, 'pulling', i, len(new), note=f'skip {p}: {e}')
                continue
            row = {'path': p, 'size': size, 'mtime': mt,
                   'sha256': sha256_file(dest), 'staged': rel}
            manifest[p] = row
            mf.write(json.dumps(row) + '\n')
            pulled += 1
            if i % 10 == 0:
                progress(op, 'pulling', i, len(new))
    # compact the manifest (drop superseded lines from re-pulls)
    MANIFEST.write_text(''.join(json.dumps(r) + '\n' for r in manifest.values()))
    progress(op, 'done', len(new), len(new), status='done',
             extra={'pulled': pulled, 'unchanged': len(phone_files) - len(new)})
    update_state(pull={'pulled': pulled, 'phone_files': len(phone_files),
                       'dcim_gb': round(sum(s for _, s, _ in phone_files) / 1e9, 1),
                       'at': datetime.now().isoformat(timespec='seconds')})


# ── scan (analyze staged files) ───────────────────────────────────────────

def is_screenshot(path, has_dhash):
    return path.suffix.lower() == '.png' and has_dhash


def live_photo_pairs(rows):
    """Map MOV path -> HEIC/JPG row when both share a stem (Live Photos = one item)."""
    stems = {}
    for r in rows:
        p = Path(r['staged'])
        stems.setdefault((str(p.parent), p.stem.lower()), []).append(r)
    mov_to_still = {}
    for group in stems.values():
        stills = [r for r in group if Path(r['staged']).suffix.lower() in IMAGE_EXTS]
        movs = [r for r in group if Path(r['staged']).suffix.lower() == '.mov']
        if stills and movs:
            for m in movs:
                mov_to_still[m['staged']] = stills[0]['staged']
    return mov_to_still


def cmd_scan(_args):
    op = 'scan'
    Image, np = load_imaging()
    rows = [r for r in load_jsonl(MANIFEST) if (STAGING_DIR / r.get('staged', '')).exists()]
    if not rows:
        fail(op, 'load', 'Nothing staged — run pull first')
    mac_by_sha = {}
    mac_dhashes = []
    for r in load_jsonl(MAC_INDEX):
        mac_by_sha[r['sha256']] = r['path']
        if 'dhash' in r:
            mac_dhashes.append((r['dhash'], r['path']))
    THUMBS_DIR.mkdir(parents=True, exist_ok=True)
    mov_pairs = live_photo_pairs(rows)

    items, by_sha, dhash_list, deferred_movs = {}, {}, [], []
    total = len(rows)
    progress(op, 'analyzing', 0, total)
    for i, r in enumerate(rows):
        staged = STAGING_DIR / r['staged']
        ext = staged.suffix.lower()
        if r['staged'] in mov_pairs:  # MOV half of a Live Photo — folded below
            deferred_movs.append(r)
            continue
        # id is per-FILE (path-derived): byte-identical copies must stay
        # distinct so dupe groups can keep one and remove the others
        iid = hashlib.sha256(r['path'].encode()).hexdigest()[:12]
        thumb_key = r['sha256'][:12]  # thumbs dedupe by content
        item = {'id': iid, 'phone_path': r['path'], 'staged': r['staged'],
                'size': r['size'], 'mtime': r['mtime'], 'sha256': r['sha256'],
                'kind': 'video' if ext in VIDEO_EXTS else 'image', 'flags': []}
        if ext in IMAGE_EXTS:
            res = analyze_image(staged, Image, np)
            if res:
                item['dhash'], item['blur'], item['luma'], item['mp'] = res
                dhash_list.append((res[0], iid))
                if item['luma'] < DARK_LUMA:
                    item['flags'].append('dark')
                if is_screenshot(staged, True):
                    item['flags'].append('screenshot')
            thumb_path = THUMBS_DIR / f'{thumb_key}.jpg'
            if thumb_path.exists() or make_thumb(staged, thumb_path, Image):
                item['thumb'] = f'{thumb_key}.jpg'
        elif ext in VIDEO_EXTS:
            dur, _ = ffprobe(staged)
            if dur is not None:
                item['duration'] = dur
            if r['size'] >= LARGE_VIDEO_BYTES:
                item['flags'].append('large_video')
            thumb_path = THUMBS_DIR / f'{thumb_key}.jpg'
            if thumb_path.exists() or make_video_poster(staged, thumb_path):
                item['thumb'] = f'{thumb_key}.jpg'
        by_sha.setdefault(r['sha256'], []).append(iid)
        if r['sha256'] in mac_by_sha:
            item['flags'].append('on_mac')
            item['mac_path'] = mac_by_sha[r['sha256']]
        items[item['staged']] = item
        if i % 25 == 0:
            progress(op, 'analyzing', i, total)

    # fold Live-Photo MOVs into their stills (second pass — manifest order can
    # put the MOV before its still, so this can't happen inline above)
    for r in deferred_movs:
        still = items[mov_pairs[r['staged']]]
        still['live_mov'] = r['path']
        still['size'] += r['size']

    progress(op, 'grouping', total, total)
    id_map = {it['id']: it for it in items.values()}
    # exact-dupe groups
    groups = []
    for sha, ids in by_sha.items():
        if len(ids) > 1:
            groups.append({'kind': 'exact', 'ids': ids})
    # near-dupe groups (dHash union-find), skipping exact-dupe members
    exact_members = {i for g in groups for i in g['ids']}
    parent = {}

    def find(x):
        while parent.get(x, x) != x:
            parent[x] = parent.get(parent[x], parent[x])
            x = parent[x]
        return x

    def union(a, b):
        parent[find(a)] = find(b)

    candidates = [(h, i) for h, i in dhash_list if i not in exact_members]
    for a in range(len(candidates)):
        for b in range(a + 1, len(candidates)):
            if hamming(candidates[a][0], candidates[b][0]) <= NEAR_DUPE_DISTANCE:
                union(candidates[a][1], candidates[b][1])
    near = {}
    for _, iid in candidates:
        near.setdefault(find(iid), []).append(iid)
    groups += [{'kind': 'near', 'ids': ids} for ids in near.values() if len(ids) > 1]
    # pick keep-best per group: resolution, then sharpness
    for g in groups:
        best = max(g['ids'], key=lambda i: (id_map[i].get('mp', 0), id_map[i].get('blur', 0)))
        g['keep'] = best
        for iid in g['ids']:
            if iid != best and 'dupe' not in id_map[iid]['flags']:
                id_map[iid]['flags'].append('dupe')
    # "probably on Mac" — visual match only, never pre-checked
    for h, iid in dhash_list:
        it = id_map[iid]
        if 'on_mac' in it['flags']:
            continue
        for mh, mpath in mac_dhashes:
            if hamming(h, mh) <= NEAR_DUPE_DISTANCE:
                it['flags'].append('probably_on_mac')
                it['mac_path'] = mpath
                break
    # blur flag last; dark shots are excluded (zero-variance black frames are
    # "dark", not "blurry") and screenshots are judged by their own category
    for it in id_map.values():
        if (it.get('blur') is not None and it['blur'] < BLUR_DEFAULT
                and 'screenshot' not in it['flags'] and 'dark' not in it['flags']):
            it['flags'].append('blurry')

    # group keepers are usually unflagged but the review UI must render them
    group_members = {i for g in groups for i in g['ids']}
    flagged = [it for it in id_map.values() if it['flags'] or it['id'] in group_members]
    out = {'generated': datetime.now().isoformat(timespec='seconds'),
           'scanned': len(rows), 'flagged': len(flagged),
           'blur_default': BLUR_DEFAULT, 'items': flagged, 'groups': groups}
    write_json(FLAGS, out)
    progress(op, 'done', total, total, status='done',
             extra={'flagged': len(flagged), 'groups': len(groups)})
    update_state(scan={'scanned': len(rows), 'flagged': len(flagged),
                       'at': datetime.now().isoformat(timespec='seconds')})


# ── backup (copy + verify) ────────────────────────────────────────────────

def load_selection(path):
    sel = json.loads(Path(path).read_text())
    ids = set(sel['ids'])
    flags = json.loads(FLAGS.read_text())
    id_map = {it['id']: it for it in flags['items']}
    missing = ids - set(id_map)
    if missing:
        raise ValueError(f'{len(missing)} selected ids not in flags.json')
    return [id_map[i] for i in ids]


def cmd_backup(args):
    """Offload leg: copy every selected item to the chosen archive root
    (Mac folder or external volume) and hash-verify each copy. With --all,
    archives the whole camera roll from the manifest (copy-only, never deletes)."""
    op = 'backup'
    if getattr(args, 'all', False):
        items = load_jsonl(MANIFEST)  # whole camera roll — every pulled file
        if not items:
            fail(op, 'load', 'nothing staged — pull the camera roll first')
    elif args.selection:
        try:
            items = load_selection(args.selection)
        except Exception as e:
            fail(op, 'load', e)
    else:
        fail(op, 'args', 'backup needs --selection or --all')
    root = Path(args.dest) if getattr(args, 'dest', None) else BACKUP_ROOT
    need_gb = sum(it['size'] for it in items) / 1e9
    try:
        free_gb = shutil.disk_usage(root.parent if not root.exists() else root).free / 1e9
    except Exception as e:
        fail(op, 'preflight', f'Cannot reach {root}: {e}')
    if need_gb > free_gb - 5:
        fail(op, 'preflight', f'Backup needs {need_gb:.1f} GB but only {free_gb:.1f} GB free at {root}')
    dest_root = root / datetime.now().strftime('%Y-%m-%d')
    progress(op, 'copying', 0, len(items))
    verified, failed = [], []
    for i, it in enumerate(items):
        src = STAGING_DIR / it['staged']
        d = datetime.fromtimestamp(it['mtime'] or 0)
        dest = dest_root / f'{d.year:04d}' / f'{d.month:02d}' / Path(it['staged']).name
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.copy2(src, dest)
            ok = sha256_file(dest) == it['sha256']
        except Exception:
            ok = False
        (verified if ok else failed).append(it.get('id', it['sha256']))  # manifest rows have no id
        if 'live_mov' in it and ok:  # copy the MOV half of a Live Photo alongside
            mov_rel = it['live_mov'].lstrip('/')
            mov_src = STAGING_DIR / mov_rel
            if mov_src.exists():
                shutil.copy2(mov_src, dest.parent / mov_src.name)
        if i % 10 == 0:
            progress(op, 'copying', i, len(items))
    write_json(DATA_DIR / 'verified.json',
               {'ids': verified, 'failed': failed, 'dest': str(dest_root),
                'at': datetime.now().isoformat(timespec='seconds')})
    progress(op, 'done', len(items), len(items), status='done',
             extra={'verified': len(verified), 'failed': len(failed), 'dest': str(dest_root)})
    update_state(backup={'verified': len(verified), 'failed': len(failed),
                         'dest': str(dest_root), 'at': datetime.now().isoformat(timespec='seconds')})


# ── remove (verified set only) ────────────────────────────────────────────

def cmd_remove(args):
    asyncio.run(_remove_async(args))


async def _remove_async(args):
    op = 'remove'
    if not args.confirm:
        fail(op, 'confirm', 'remove requires --confirm')
    trash_mode = getattr(args, 'trash', False)
    if trash_mode:
        # cleanup mode: ids come straight from the selection; the staged copy
        # moves into the restore area (recoverable for TRASH_TTL_DAYS)
        ids = json.loads((DATA_DIR / 'selection.json').read_text())['ids']
    else:
        # offload mode: only backup-verified ids; the archive copy is the record
        ids = json.loads((DATA_DIR / 'verified.json').read_text())['ids']
    flags = json.loads(FLAGS.read_text())
    id_map = {it['id']: it for it in flags['items']}
    items = [id_map[i] for i in ids if i in id_map]
    try:
        ld = await connect_lockdown()
        afc = afc_service(ld)
    except Exception as e:
        fail(op, 'connect', f'No device: {e}')
    progress(op, 'removing', 0, len(items))
    removed, errors = [], []
    for i, it in enumerate(items):
        paths = [it['phone_path']] + ([it['live_mov']] if 'live_mov' in it else [])
        try:
            for p in paths:
                await afc.rm(p)
            removed.append(it['id'])
        except Exception as e:
            errors.append({'id': it['id'], 'error': str(e)})
        if i % 10 == 0:
            progress(op, 'removing', i, len(items))
    # permanent removal history — powers the "Removed" tab. Recovery target:
    # trash rows expire after TRASH_TTL_DAYS; archive (backup) rows never do.
    try:
        dest_root = Path(json.loads((DATA_DIR / 'verified.json').read_text()).get('dest', ''))
    except Exception:
        dest_root = Path('')
    with open(DATA_DIR / 'removals.jsonl', 'a') as rf:
        now = datetime.now()
        expires = (now + timedelta(days=TRASH_TTL_DAYS)).isoformat(timespec='seconds')
        for iid in removed:
            it = id_map[iid]
            row = {'at': now.isoformat(timespec='seconds'), 'name': Path(it['staged']).name,
                   'phone_path': it['phone_path'], 'size': it['size'],
                   'sha256': it['sha256'], 'thumb': it.get('thumb', '')}
            if trash_mode:
                row['trash'] = str(_move_to_trash(it))
                row['expires'] = expires
            else:
                d = datetime.fromtimestamp(it['mtime'] or 0)
                row['backup'] = str(dest_root / f'{d.year:04d}' / f'{d.month:02d}'
                                    / Path(it['staged']).name)
            rf.write(json.dumps(row) + '\n')
    freed_gb = round(sum(id_map[i]['size'] for i in removed) / 1e9, 1)
    icloud_suspected = len(errors) > 0 and len(removed) == 0
    result = {'removed': len(removed), 'errors': len(errors), 'freed_gb': freed_gb,
              'icloud_suspected': icloud_suspected,
              'error_samples': [e['error'] for e in errors[:3]]}
    # drop removed files from staging + manifest so re-runs stay truthful
    manifest = {r['path']: r for r in load_jsonl(MANIFEST)}
    for iid in removed:
        it = id_map[iid]
        manifest.pop(it['phone_path'], None)
        (STAGING_DIR / it['staged']).unlink(missing_ok=True)
        if 'live_mov' in it:  # the MOV half was rm'd from the phone too
            manifest.pop(it['live_mov'], None)
            (STAGING_DIR / it['live_mov'].lstrip('/')).unlink(missing_ok=True)
    MANIFEST.write_text(''.join(json.dumps(r) + '\n' for r in manifest.values()))
    _prune_flags(set(removed))
    write_json(DATA_DIR / 'remove-result.json', result)
    progress(op, 'done', len(items), len(items), status='done', extra=result)
    update_state(remove={**result, 'at': datetime.now().isoformat(timespec='seconds')})


def _prune_flags(removed_ids):
    """Drop removed ids from flags.json so the review grid stays truthful even
    before the next rescan. Mirrors the scan's inclusion rule: an item stays
    only if it still has flags OR belongs to a surviving group (>=2 members);
    groups that fall below 2 members dissolve and their keeps drop out."""
    if not removed_ids or not FLAGS.exists():
        return
    flags = json.loads(FLAGS.read_text())
    groups = []
    for g in flags.get('groups', []):
        g['ids'] = [i for i in g['ids'] if i not in removed_ids]
        if len(g['ids']) > 1:
            if g.get('keep') in removed_ids:
                g['keep'] = g['ids'][0]
            groups.append(g)
    group_members = {i for g in groups for i in g['ids']}
    items = [it for it in flags['items']
             if it['id'] not in removed_ids and (it['flags'] or it['id'] in group_members)]
    flags['items'] = items
    flags['groups'] = groups
    flags['flagged'] = len(items)
    write_json(FLAGS, flags)


def _move_to_trash(it):
    """Move an item's staged copy (and Live-Photo MOV half) into the restore
    area, mirroring the staging layout. Returns the main file's trash path."""
    dest = TRASH_DIR / it['staged']
    dest.parent.mkdir(parents=True, exist_ok=True)
    src = STAGING_DIR / it['staged']
    if src.exists():
        shutil.move(str(src), str(dest))
    if 'live_mov' in it:
        mov_rel = it['live_mov'].lstrip('/')
        mov_src = STAGING_DIR / mov_rel
        if mov_src.exists():
            mov_dest = TRASH_DIR / mov_rel
            mov_dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(mov_src), str(mov_dest))
    return dest


# ── purge / restore (the restore-area lifecycle) ──────────────────────────

def _rewrite_removals(rows):
    tmp = DATA_DIR / 'removals.jsonl.tmp'
    tmp.write_text(''.join(json.dumps(r) + '\n' for r in rows))
    os.replace(tmp, DATA_DIR / 'removals.jsonl')


def cmd_purge(args):
    """Delete restore-area files past their expiry (or all with --all).
    Rows stay in removals.jsonl as history with trash cleared."""
    rows = load_jsonl(DATA_DIR / 'removals.jsonl')
    now = datetime.now().isoformat(timespec='seconds')
    purged, freed = 0, 0
    for r in rows:
        if not r.get('trash'):
            continue
        if not args.all and r.get('expires', '') > now:
            continue
        p = Path(r['trash'])
        mov = p.with_suffix('.MOV')
        for f in (p, mov if mov != p else None):
            if f and f.exists():
                freed += f.stat().st_size
                f.unlink()
        r['trash'] = ''
        purged += 1
    _rewrite_removals(rows)
    print(json.dumps({'purged': purged, 'freed_gb': round(freed / 1e9, 2)}))


def cmd_restore(args):
    """Move one file out of the restore area to ~/Pictures/iPhone Restored."""
    rows = load_jsonl(DATA_DIR / 'removals.jsonl')
    row = next((r for r in rows if r.get('sha256') == args.sha and r.get('trash')), None)
    if not row:
        print(json.dumps({'error': 'not in the restore area (expired or already restored)'}))
        return
    src = Path(row['trash'])
    if not src.exists():
        row['trash'] = ''
        _rewrite_removals(rows)
        print(json.dumps({'error': 'restore copy is missing — it may have been purged'}))
        return
    RESTORE_ROOT.mkdir(parents=True, exist_ok=True)
    dest = RESTORE_ROOT / src.name
    n = 1
    while dest.exists():
        dest = RESTORE_ROOT / f'{src.stem} {n}{src.suffix}'
        n += 1
    shutil.move(str(src), str(dest))
    mov = src.with_suffix('.MOV')
    if mov != src and mov.exists():  # Live-Photo half travels along
        shutil.move(str(mov), str(dest.parent / f'{dest.stem}{mov.suffix}'))
    row['trash'] = ''
    row['restored'] = str(dest)
    _rewrite_removals(rows)
    print(json.dumps({'restored': str(dest)}))


# ── trash (Mac-side cleanup — recoverable, files go to the macOS Trash) ───

def cmd_trash(args):
    op = 'trash'
    sel = json.loads(Path(args.selection).read_text())
    paths = [p for p in sel.get('paths', []) if Path(p).exists()]
    trashed, errors = [], []
    for chunk_start in range(0, len(paths), 50):
        chunk = paths[chunk_start:chunk_start + 50]
        listing = ', '.join('POSIX file ' + json.dumps(p) for p in chunk)
        try:
            subprocess.run(['osascript', '-e', f'tell application "Finder" to delete {{{listing}}}'],
                           check=True, capture_output=True, timeout=120)
            trashed += chunk
        except Exception:
            for p in chunk:  # per-file fallback: move into ~/.Trash, uniquified
                try:
                    dest = HOME / '.Trash' / Path(p).name
                    n = 1
                    while dest.exists():
                        dest = HOME / '.Trash' / f'{Path(p).stem} {n}{Path(p).suffix}'
                        n += 1
                    shutil.move(p, dest)
                    trashed.append(p)
                except Exception as e:
                    errors.append({'path': p, 'error': str(e)})
    gone = set(trashed)
    rows = [r for r in load_jsonl(MAC_INDEX) if r['path'] not in gone]
    MAC_INDEX.write_text(''.join(json.dumps(r) + '\n' for r in rows))
    update_state(mac_index={'files': len(rows),
                            'gb': round(sum(r['size'] for r in rows) / 1e9, 1),
                            'at': datetime.now().isoformat(timespec='seconds')})
    print(json.dumps({'trashed': len(trashed), 'errors': errors[:5],
                      'freed_gb': round(sum(sel.get('sizes', {}).get(p, 0) for p in trashed) / 1e9, 2)}))


# ── main ──────────────────────────────────────────────────────────────────

def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('info')
    sub.add_parser('index')
    sub.add_parser('pull')
    sub.add_parser('scan')
    b = sub.add_parser('backup')
    b.add_argument('--selection')
    b.add_argument('--all', action='store_true')
    b.add_argument('--dest')
    r = sub.add_parser('remove')
    r.add_argument('--confirm', action='store_true')
    r.add_argument('--trash', action='store_true')
    p = sub.add_parser('purge')
    p.add_argument('--all', action='store_true')
    s = sub.add_parser('restore')
    s.add_argument('--sha', required=True)
    t = sub.add_parser('trash')
    t.add_argument('--selection', required=True)
    args = ap.parse_args()
    try:
        {'info': cmd_info, 'index': cmd_index, 'pull': cmd_pull,
         'scan': cmd_scan, 'backup': cmd_backup, 'remove': cmd_remove,
         'purge': cmd_purge, 'restore': cmd_restore,
         'trash': cmd_trash}[args.cmd](args)
    except SystemExit:
        raise
    except Exception as e:  # crash must land in progress.json or the UI spins forever
        progress(args.cmd, 'crashed', status='error', error=f'{type(e).__name__}: {e}')
        raise


if __name__ == '__main__':
    main()
