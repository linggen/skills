#!/usr/bin/env python3
"""pingshu-publish.py — the rendered 评书 made ready for the CDN, and the manifest the game reads.

    ~/.linggen/runtime/envs/tts/bin/python3 tools/pingshu-publish.py --check
        [--work ~/Downloads/评书样音/卷一/.work] [--full ~/Downloads/评书样音/卷一]
        [--out ~/Downloads/评书样音/r2] [--book story/jiuding-lu]
    bash tools/pingshu-r2.sh            # then: upload what is new to R2 (one command)

Reads only. From `pingshu.py render --keep` (the per-piece WAVs, .work/NN/
{i:04d}-{sha1(text)[:10]}.wav, and the report .work/NN.json that marks a piece
finished), the book and the scenes, it builds one clip per beat the dialogue
box plays: a scene's paragraph (rules/tell.mjs beatsOf), found in its 回 as a
run of whole sentences. The scenes often cut a long book paragraph into
several beats, and a beat may start or end inside one of render's pieces
(pingshu.py `pieces`: sentences grouped up to 110 characters); such a piece
is cut at the sentence boundary — estimated by the characters before it and
snapped to the nearest pause in the audio. No clean pause there: that beat
gets no clip and stays silent (better silence than a word cut in half); with
--check each cut clip is also heard back (Qwen3-ASR) and dropped if misheard.
Plain python3 works too (numpy, macOS afconvert), without --check.
Pieces join with render's own sentence gap; AAC mono ~48 kbps. Frame lines and
醒木 knocks belong to no beat. A finished 回 (卷一/第N回.m4a) is copied as is.

Every file is named by its content hash — immutable, cached for good, uploaded
once: <out>/jiuding-lu/p/<hash>.m4a (a beat), <out>/jiuding-lu/h/<hui>-<hash>.m4a
(a whole 回). The manifest, story/jiuding-lu/audio.json, is the one thing
committed: {base, hui: {h01: {full: {file, bytes, secs}, paras: {<key>: {file, secs}}}}}.
A key is para_key() of the beat's text — the same normalisation and hash as
scripts/pingshu.js paraKey, so the page finds a beat's clip from the beat itself.

Rerunnable as more of the render finishes: what was built is reused, and what
can't be built now keeps its earlier entry while a scene still plays that beat.
"""
import argparse, glob, hashlib, json, os, re, shutil, subprocess, sys, tempfile, wave

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pingshu  # noqa: E402  (segments' own split: spoken, sentences, pieces, PAUSE)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://media.linggen.dev/jiuding-lu/'
PREFIX = 'jiuding-lu'
BITRATE = 48000
LIMIT = 110  # pingshu.py segments --limit (the render used the default)

# ---- the key (mirror of scripts/pingshu.js normPara / fnv64) --------------

KEEP = re.compile(r'[㐀-䶿一-鿿豈-﫿0-9A-Za-z]')

def norm_para(text):
    text = re.sub(r'\[([^\]]*)\]\{[^}]*\}', r'\1', text)
    text = re.sub(r'\{[^}\n]*\}', '', text)
    return ''.join(KEEP.findall(text))

def fnv64(s):
    h = 0xcbf29ce484222325
    for b in s.encode('utf-8'):
        h = ((h ^ b) * 0x100000001b3) & 0xffffffffffffffff
    return f'{h:016x}'

def para_key(text):
    n = norm_para(text)
    return fnv64(n) if n else ''

# ---- the book and the beats ---------------------------------------------------

def paragraphs(md):
    """Each book paragraph as render spoke it: its pieces, each {text, sents}
    (the piece's spoken text; its sentences normalised) — pingshu.pieces' grouping."""
    out = []
    for raw in md.split('\n'):
        line = raw.strip()
        if not line or line.startswith('#') or re.fullmatch(r'-{3,}|\*{3,}', line):
            continue
        said = pingshu.spoken(line)
        pieces, cur = [], []
        for sent in pingshu.sentences(said):
            if cur and len(''.join(cur)) + len(sent) > LIMIT:
                pieces.append(cur)
                cur = []
            cur.append(sent)
        pieces += [cur] if cur else []
        assert [''.join(p) for p in pieces] == pingshu.pieces(said, LIMIT), line[:30]
        out.append([{'text': ''.join(p), 'sents': [norm_para(x) for x in p], 'said': p} for p in pieces])
    return out

def huis(book_dir):
    """[(hui id, NN, md path, 回 name)] in book.json's order, and the book's world."""
    book = json.load(open(os.path.join(book_dir, 'book.json'), encoding='utf-8'))
    out = []
    for vol in book.get('volumes', []):
        for h in vol.get('hui', []):
            if h.get('draft'):  # a 回 Hanli has not approved yet (book.json `draft`) is not told
                continue
            name = os.path.splitext(h['file'])[0].split('-', 1)[1]
            out.append((h['id'], h['file'][:2], os.path.join(book_dir, h['file']), name))
    return out, book.get('world', 'jiuding')

SKIP_BEAT = re.compile(r'^(〔(银月|Yinyue)〕|([-*_])\3{2,})$')

def beats(world_dir):
    """{hui: [beat text, …]} — every zh paragraph a scene or an exit plays in the
    box, split as rules/tell.mjs beatsOf splits a passage."""
    out = {}
    for f in sorted(glob.glob(os.path.join(world_dir, 'chapters', '*', 'scenes', '*.json'))):
        sc = json.load(open(f, encoding='utf-8'))
        if not sc.get('hui'):
            continue
        for story in [sc.get('story')] + [x.get('story') for x in sc.get('exits', [])]:
            zh = story.get('zh') if isinstance(story, dict) else None
            for para in re.split(r'\n+', zh or ''):
                para = para.replace('⟪', '').replace('⟫', '').strip()
                if para and not SKIP_BEAT.match(para):
                    out.setdefault(sc['hui'], []).append(para)
    return out

def locate(paras, n):
    """Where a beat's text stands in the book: [(piece, first sentence, last
    sentence)] within one paragraph, sentences counted inside each piece — or None."""
    for pieces in paras:
        flat = [(pi, si, s) for pi, p in enumerate(pieces) for si, s in enumerate(p['sents'])]
        for a in range(len(flat)):
            got = ''
            for b in range(a, len(flat)):
                got += flat[b][2]
                if got == n:
                    return [(pi, min(si for q, si, _ in flat[a:b + 1] if q == pi), max(si for q, si, _ in flat[a:b + 1] if q == pi))
                            for pi in sorted({q for q, _, _ in flat[a:b + 1]})], pieces
                if len(got) >= len(n):
                    break
    return None

# ---- the render's output -----------------------------------------------------

def sha10(text):
    return hashlib.sha1(text.encode()).hexdigest()[:10]

def finished(work, nn):
    """Piece WAVs whose take is done: {sha10: path}. A piece counts once the
    report names it (render writes the report after the WAV)."""
    try:
        done = set(json.load(open(os.path.join(work, f'{nn}.json'), encoding='utf-8')).get('pieces', {}))
    except (OSError, ValueError):
        return {}
    d = os.path.join(work, nn)
    out = {}
    for f in (os.listdir(d) if os.path.isdir(d) else []):
        m = re.fullmatch(r'\d{4}-([0-9a-f]{10})\.wav', f)
        if m and m.group(1) in done:
            out[m.group(1)] = os.path.join(d, f)
    return out

def read_wav(path):
    import numpy as np
    with wave.open(path, 'rb') as w:
        return np.frombuffer(w.readframes(w.getnframes()), '<i2'), w.getframerate()

FRAME, QUIET, MIN_GAP = 0.01, 0.012 * 32768, 0.06

def gaps(pcm, rate):
    """The pauses in a take: [(start s, end s)] of quiet runs at least MIN_GAP long."""
    import numpy as np
    n = int(rate * FRAME)
    frames = pcm[:len(pcm) // n * n].astype('float32').reshape(-1, n)
    quiet = np.sqrt((frames ** 2).mean(axis=1)) < QUIET
    out, start = [], None
    for i, q in enumerate(list(quiet) + [False]):
        if q and start is None:
            start = i
        elif not q and start is not None:
            if (i - start) * FRAME >= MIN_GAP:
                out.append((start * FRAME, i * FRAME))
            start = None
    return out

BREATH = re.compile(r'[，、；：。！？…,;:!?]')

def weight(said):
    """How long a sentence takes, in characters: its words, and a breath at each mark."""
    return len(norm_para(said)) + 1.5 * len(BREATH.findall(said))

def cut_at(pcm, rate, said, k):
    """The sample where sentence k begins in a piece (0 < k < len): its share
    of the spoken span (weight), snapped to the best nearby pause — the
    longest, the closest. None when no pause is near."""
    pauses = gaps(pcm, rate)
    dur = len(pcm) / rate
    lead = pauses[0][1] if pauses and pauses[0][0] == 0 else 0
    tail = pauses[-1][0] if pauses and pauses[-1][1] >= dur - FRAME else dur
    est = lead + (tail - lead) * sum(map(weight, said[:k])) / max(1, sum(map(weight, said)))
    reach = max(1.2, 0.2 * (tail - lead))
    near = [(b - a) * 3 - abs((a + b) / 2 - est) for a, b in pauses if lead < a and b < tail and abs((a + b) / 2 - est) <= reach]
    if not near:
        return None
    a, b = [g for g in pauses if lead < g[0] and g[1] < tail and abs((g[0] + g[1]) / 2 - est) <= reach][near.index(max(near))]
    return int((a + b) / 2 * rate)

def span(path, said, first, last):
    """A piece's audio from sentence `first` through `last`; None if a cut can't be placed."""
    pcm, rate = read_wav(path)
    lo = cut_at(pcm, rate, said, first) if first > 0 else 0
    hi = cut_at(pcm, rate, said, last + 1) if last < len(said) - 1 else len(pcm)
    if lo is None or hi is None or hi <= lo:
        return None
    return pcm[lo:hi].tobytes(), rate

def joined(parts):
    """The beat's spans with render's sentence gap between pieces: (pcm bytes, rate)."""
    rate = parts[0][1]
    gap = b'\0\0' * int(rate * pingshu.PAUSE['sentence'] / 1000)
    return gap.join(p for p, _ in parts), rate

def encode(pcm, rate, dest):
    """AAC mono at BITRATE in an .m4a, written to dest."""
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'in.wav')
        with wave.open(src, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
            w.writeframes(pcm)
        part = dest + '.part'
        subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', str(BITRATE), '-c', '1', src, part],
                       check=True, capture_output=True)
        os.replace(part, dest)

def seconds(path):
    out = subprocess.run(['afinfo', path], capture_output=True, text=True).stdout
    m = re.search(r'estimated duration:\s*([\d.]+)', out)
    return round(float(m.group(1)), 1) if m else None

def clip_hash(pcm, rate):
    return hashlib.sha256(pcm + f'|{rate}|aac{BITRATE}'.encode()).hexdigest()[:16]

def clip(pcm, rate, out):
    """One beat's clip, encoded once: its file (relative to base) and secs."""
    h = clip_hash(pcm, rate)
    rel = f'p/{h}.m4a'
    dest = os.path.join(out, PREFIX, rel)
    if not os.path.exists(dest):
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        encode(pcm, rate, dest)
    return {'file': rel, 'secs': round(len(pcm) / 2 / rate, 1)}

def whole(src, hui, out):
    """A finished 回's file, copied under its hash."""
    h = hashlib.sha256(open(src, 'rb').read()).hexdigest()[:16]
    rel = f'h/{hui}-{h}.m4a'
    dest = os.path.join(out, PREFIX, rel)
    if not os.path.exists(dest):
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copyfile(src, dest + '.part')
        os.replace(dest + '.part', dest)
    return {'file': rel, 'bytes': os.path.getsize(dest), 'secs': seconds(dest)}

# ---- the ear (--check) ----------------------------------------------------------

def ear(model, cache_path):
    """heard_ok(pcm, rate, text): a cut clip transcribed (Qwen3-ASR, the render's
    own --check model; needs the tts venv) and kept only if what is heard is
    the beat (same_beat). What was heard is cached by clip hash in cache_path,
    so a rerun asks again only of new cuts."""
    cache = json.load(open(cache_path, encoding='utf-8')) if os.path.exists(cache_path) else {}
    asr = []

    def heard_ok(pcm, rate, text):
        h = clip_hash(pcm, rate)
        if h not in cache:
            if not asr:
                from mlx_audio.stt.utils import load_model
                asr.append(load_model(model))
            with tempfile.TemporaryDirectory() as tmp:
                wav = os.path.join(tmp, 'cut.wav')
                with wave.open(wav, 'wb') as w:
                    w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
                    w.writeframes(pcm)
                cache[h] = {'heard': asr[0].generate(wav).text}
            json.dump(cache, open(cache_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        return same_beat(text, cache[h]['heard'])
    return heard_ok

def same_beat(text, heard):
    """Is what was heard this beat? The same length within a character or so (a
    cut that took a word off, or let the next one in, fails; a homophone — 禾
    heard as 和 — does not), and mostly the same words."""
    said, got = norm_para(pingshu.spoken(text)), norm_para(heard)
    return abs(len(said) - len(got)) <= max(1, len(said) // 40) and pingshu.similarity(said, got) >= 0.6

# ---- the manifest -------------------------------------------------------------

def beat_clip(text, paras, have, out, heard_ok=None):
    """(status, clip): 'built' with its clip, or why not — 'unplaced' (not a run of
    the book's sentences), 'waiting' (a piece not rendered yet), 'uncut' (no
    pause), 'misheard' (a cut the ear says is wrong, with --check)."""
    found = locate(paras, norm_para(text))
    if not found:
        return 'unplaced', None
    runs, pieces = found
    paths = [have.get(sha10(pieces[pi]['text'])) for pi, _, _ in runs]
    if not all(paths):
        return 'waiting', None
    parts = [span(p, pieces[pi]['said'], a, b) for p, (pi, a, b) in zip(paths, runs)]
    if not all(parts):
        return 'uncut', None
    pcm, rate = joined(parts)
    cut = any(a > 0 or b < len(pieces[pi]['said']) - 1 for pi, a, b in runs)
    if cut and heard_ok and not heard_ok(pcm, rate, text):
        return 'misheard', None
    return 'built', clip(pcm, rate, out)

def publish_hui(hid, nn, md_path, name, texts, a, old):
    paras, have = paragraphs(open(md_path, encoding='utf-8').read()), finished(a.work, nn)
    clips, tally = {}, {}
    for text in texts:
        key = para_key(text)
        if not key or key in clips:
            continue
        status, c = beat_clip(text, paras, have, a.out, a.heard_ok)
        tally[status] = tally.get(status, 0) + 1
        # What can't be built now (its pieces gone or re-rendering) keeps its
        # earlier clip while a scene still plays the beat.
        if status == 'waiting':
            c = old.get('paras', {}).get(key)
        if c:
            clips[key] = c
    src = os.path.join(a.full, f'{name}.m4a')
    full = whole(src, hid, a.out) if os.path.exists(src) else old.get('full')
    print(f'{hid} {name}: {len(clips)} beats voiced {tally}, whole {"yes" if full else "no"}', file=sys.stderr)
    entry = {**({'full': full} if full else {}), 'paras': dict(sorted(clips.items()))}
    return entry if clips or full else None

def prune(out, manifest):
    """Files of this out dir no manifest entry names any more (a beat re-cut, a
    clip the ear refused) are removed here; what is already on R2 stays there."""
    named = {c['file'] for h in manifest['hui'].values() for c in [*h['paras'].values(), *([h['full']] if 'full' in h else [])]}
    gone = [f for f in glob.glob(os.path.join(out, PREFIX, '*', '*.m4a')) if os.path.relpath(f, os.path.join(out, PREFIX)) not in named]
    for f in gone:
        os.remove(f)
    return len(gone)

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    home = os.path.expanduser('~/Downloads/评书样音')
    p.add_argument('--work', default=os.path.join(home, '卷一', '.work'))
    p.add_argument('--full', default=os.path.join(home, '卷一'))
    p.add_argument('--out', default=os.path.join(home, 'r2'))
    p.add_argument('--book', default=os.path.join(ROOT, 'story', 'jiuding-lu'))
    p.add_argument('--base', default=BASE)
    p.add_argument('--check', nargs='?', const='mlx-community/Qwen3-ASR-1.7B-8bit', default='',
                   help='ASR every cut clip and drop a misheard one (run in the tts venv)')
    a = p.parse_args()
    a.heard_ok = ear(a.check, os.path.join(a.out, '.checked.json')) if a.check else None
    path = os.path.join(a.book, 'audio.json')
    old = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}
    book, world = huis(a.book)
    texts = beats(os.path.join(ROOT, 'worlds', world))
    out = {}
    for hid, nn, md, name in book:
        entry = publish_hui(hid, nn, md, name, texts.get(hid, []), a, old.get('hui', {}).get(hid, {}))
        if entry:
            out[hid] = entry
    manifest = {'_': 'Written by tools/pingshu-publish.py; the files live at base (R2, uploaded by tools/pingshu-r2.sh). Keys: scripts/pingshu.js paraKey of a beat.',
                'base': a.base, 'hui': out}
    with open(path + '.part', 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
        f.write('\n')
    os.replace(path + '.part', path)
    pruned = prune(a.out, manifest)
    n = sum(len(h['paras']) for h in out.values())
    print(f'{path}: {len(out)} 回, {n} clips, {sum(1 for h in out.values() if "full" in h)} whole; files in {os.path.join(a.out, PREFIX)} ({pruned} unused removed)', file=sys.stderr)

if __name__ == '__main__':
    main()
