#!/usr/bin/env python3
"""pingshu.py — turn a 回 of 《九鼎录》 into a 评书 episode for TTS.

    python3 tools/pingshu.py segments story/jiuding-lu/01-第一回.md [--recap 上回…] [--max-chars 1300] > ep.jsonl
    <tts venv>/bin/python3 tools/pingshu.py render ep.jsonl out.wav --engine qwen [--voice uncle_fu] [--instruct …]
    GEMINI_API_KEY=… python3 tools/pingshu.py render ep.jsonl out.wav --engine gemini [--voice Algenib]
    … render … --check          # ASR each take (Qwen3-ASR), re-roll any the ear can't follow

`segments` is plain stdlib: it strips the reader's markup ({典=…}, [x]{注=…},
**bold**, ---), frames the 回 the way a 说书人 would (回目 up front,
「上回书说到」 when a recap is given, 「且听下回分解」 at the end) and emits one
JSON line per TTS-sized piece: {kind, text, pause_ms, dialogue}. A scene
break becomes a long pause and a 醒木 knock, a paragraph a short one.

`render` speaks those lines and joins them into one WAV. `qwen` runs
Qwen3-TTS through mlx_audio and must run in the engine's `tts` venv
(~/.linggen/runtime/envs/tts); `gemini` calls Gemini TTS with a style prompt.
"""
import argparse, base64, json, os, re, sys, urllib.request, wave

SR = 24000
PAUSE = {'sentence': 180, 'para': 550, 'scene': 1400, 'frame': 900}
NUM = '零一二三四五六七八九十'

# ---- segments -------------------------------------------------------------

def spoken(line):
    """The words a listener hears: markup gone, dashes and quotes speakable."""
    line = re.sub(r'\[([^\]]*)\]\{[^}]*\}', r'\1', line)   # [娘]{注=mama} → 娘
    line = re.sub(r'\{[^}=]*=[^}]*\}', '', line)            # 《史记》{典=…} → 《史记》
    line = re.sub(r'\*\*([^*]*)\*\*', r'\1', line)          # **天人合一**
    line = re.sub(r'[—─]{1,2}', '，', line)                 # —— reads as a breath
    return line.replace('「', '“').replace('」', '”').replace('『', '‘').replace('』', '’').strip()

def blocks(md):
    """(kind, text) per paragraph; kind is title | para | scene."""
    for raw in md.split('\n'):
        line = raw.strip()
        if not line:
            continue
        if line.startswith('#'):
            yield 'title', line.lstrip('#').strip()
        elif re.fullmatch(r'-{3,}|\*{3,}', line):
            yield 'scene', ''
        else:
            yield 'para', spoken(line)

def sentences(text):
    """Split at a sentence end outside quotes, so no quote spans two pieces."""
    out, cur, depth = [], '', 0
    for i, c in enumerate(text):
        cur += c
        depth += (c in '“‘') - (c in '”’')
        nxt = text[i + 1] if i + 1 < len(text) else ''
        ends = c in '。！？…' or (c in '”’' and cur[-2:-1] in ('。', '！', '？', '…'))
        if depth <= 0 and ends and nxt not in '。！？…”’':
            out.append(cur)
            cur = ''
    return [s for s in out + [cur] if s.strip()]

def pieces(text, limit):
    """Group sentences into TTS-sized pieces of at most ~limit characters."""
    out, cur = [], ''
    for s in sentences(text):
        if cur and len(cur) + len(s) > limit:
            out.append(cur)
            cur = ''
        cur += s
    return out + [cur] if cur else out

def huimu(title):
    """'第一回　一只破碗辞残照　半张烙饼换妖王' → ('第一回', ['一只…', '半张…'])."""
    parts = re.split(r'[\s　]+', title)
    return parts[0], parts[1:]

def opening(title, recap):
    n, lines = huimu(title)
    head = f'{n}，{"，".join(lines)}。'
    if recap:
        return [f'上回书说到，{recap.rstrip("。")}。书接上回。', head]
    if n == '第一回':
        return ['列位，今天咱们开一部新书，书名叫《九鼎录》。', head]
    return ['书接上回。', head]

def closing(title):
    _, lines = huimu(title)
    return [f'正是：{"，".join(lines)}。', '要知后事如何，且听下回分解。']

def line(kind, text, pause):
    return {'kind': kind, 'text': text, 'pause_ms': pause, 'dialogue': '“' in text}

def episode(md, recap='', limit=110, max_chars=0, frame=True):
    """The whole 回 as spoken lines, optionally cut after max_chars of story."""
    items, title, told = [], '', 0
    for kind, text in blocks(md):
        if kind == 'title':
            title = text
            if frame:
                items += [line('frame', t, PAUSE['frame']) for t in opening(text, recap)]
        elif kind == 'scene':
            if items:
                items[-1]['pause_ms'] = PAUSE['scene']
                items[-1]['knock'] = True
        else:
            if max_chars and told >= max_chars:
                break
            parts = pieces(text, limit)
            items += [line('story', p, PAUSE['sentence']) for p in parts]
            items[-1]['pause_ms'] = PAUSE['para']
            told += len(text)
    if frame and title:
        items[-1]['pause_ms'] = PAUSE['scene']
        items[-1]['knock'] = True
        items += [line('frame', t, PAUSE['frame']) for t in closing(title)]
    return items

def cmd_segments(a):
    md = open(a.file, encoding='utf-8').read()
    for it in episode(md, a.recap, a.limit, a.max_chars, not a.no_frame):
        print(json.dumps(it, ensure_ascii=False))

# ---- render ---------------------------------------------------------------

STYLE_EN = ('Read the transcript aloud in Mandarin as a veteran Chinese pingshu storyteller in the '
            'style of Shan Tianfang: a gravelly, resonant old man\'s voice, brisk and rhythmic, slowing '
            'down and punching the punchlines, voicing each character. Speak only the transcript.')
# Qwen takes the style as an instruct; Gemini reads a Chinese style note ALOUD, so it gets English.
STYLE_ZH = ('用传统评书说书人的腔调讲：嗓音浑厚略带沙哑，吐字干脆，语速偏快，'
            '抑扬顿挫，讲到包袱处放慢、加重，人物对话要学出人物的口气。')

def knock():
    """A 醒木 on the table: a short, bright, fast-decaying noise burst."""
    import numpy as np
    t = np.arange(int(SR * 0.12)) / SR
    rng = np.random.default_rng(3)
    body = np.sin(2 * np.pi * 1850 * t) * 0.6 + rng.standard_normal(t.size) * 0.4
    return (body * np.exp(-t * 55) * 0.55).astype('float32')

def silence(ms):
    import numpy as np
    return np.zeros(int(SR * ms / 1000), dtype='float32')

def qwen_speaker(a):
    from mlx_audio.tts.utils import load_model
    import numpy as np
    model = load_model(a.model)

    def say(text):
        chunks = [np.array(r.audio) for r in model.generate(
            text=text, voice=a.voice, instruct=a.instruct, lang_code='chinese',
            temperature=0.8, max_tokens=min(max(int(len(text) * 0.5 * 12), 120), 2400))]
        return np.concatenate(chunks).astype('float32')
    return say

def gemini_speaker(a):
    import numpy as np
    key = os.environ['GEMINI_API_KEY']
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{a.model}:generateContent?key={key}'

    def say(text):
        body = {'contents': [{'parts': [{'text': (f'### DIRECTOR\'S NOTES\n{a.instruct}\n\n#### TRANSCRIPT\n' if a.instruct else '') + text}]}],
                'generationConfig': {'responseModalities': ['AUDIO'], 'speechConfig': {
                    'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': a.voice}}}}}
        req = urllib.request.Request(url, json.dumps(body).encode(), {'Content-Type': 'application/json'})
        reply = patient(lambda: json.load(urllib.request.urlopen(req, timeout=300)))
        pcm = base64.b64decode(reply['candidates'][0]['content']['parts'][0]['inlineData']['data'])
        return np.frombuffer(pcm, '<i2').astype('float32') / 32768
    return say

def tighten(audio, floor=0.012, keep=0.32, win=0.02):
    """Shorten the model's own long hesitations; a 说书人 doesn't dead-air."""
    import numpy as np
    n = int(SR * win)
    frames = audio[:len(audio) // n * n].reshape(-1, n)
    quiet = np.sqrt((frames ** 2).mean(axis=1)) < floor
    out, run = [], 0
    for f, q in zip(frames, quiet):
        run = run + 1 if q else 0
        if run * win <= keep:
            out.append(f)
    return np.concatenate(out) if out else audio

def similarity(a, b):
    """How much of the script the listener heard, Han characters only."""
    import difflib
    han = lambda s: re.sub(r'[^\u4e00-\u9fff]', '', s)
    return difflib.SequenceMatcher(None, han(a), han(b), autojunk=False).ratio()

def checked(say, asr_model, tries=3, good=0.9):
    """Wrap say(): transcribe each take and re-roll a garbled one, keep the best."""
    import tempfile
    from mlx_audio.stt.utils import load_model
    asr = load_model(asr_model)
    tmp = tempfile.NamedTemporaryFile(suffix='.wav', delete=False).name

    def heard(audio):
        write_wav(tmp, audio)
        return asr.generate(tmp).text

    def say_checked(text):
        best, best_score = None, -1
        for n in range(tries):
            audio = say(text)
            score = similarity(text, heard(audio))
            if score > best_score:
                best, best_score = audio, score
            if score >= good:
                break
            print(f'    take {n + 1} heard {score:.2f}, again', file=sys.stderr)
        print(f'    heard {best_score:.2f}', file=sys.stderr)
        return best
    return say_checked

def patient(call, tries=6):
    """Retry a rate-limited (429) or flaky cloud call with a growing wait."""
    import time, urllib.error
    for n in range(tries):
        try:
            return call()
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 503) or n == tries - 1:
                raise
            print(f'    {e.code}, waiting {20 * (n + 1)}s', file=sys.stderr)
            time.sleep(20 * (n + 1))

def batches(items, limit):
    """Gemini reads better in long runs: merge story lines up to limit chars."""
    out = []
    for it in items:
        prev = out[-1] if out else None
        if prev and prev['kind'] == it['kind'] == 'story' and not prev.get('knock') \
                and len(prev['text']) + len(it['text']) <= limit:
            sep = '\n\n' if prev['pause_ms'] >= PAUSE['para'] else ''
            out[-1] = {**it, 'text': prev['text'] + sep + it['text']}
        else:
            out.append(dict(it))
    return out

def write_wav(path, audio):
    import numpy as np
    pcm = (np.clip(audio, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())

def cmd_render(a):
    import numpy as np
    items = [json.loads(l) for l in open(a.segments, encoding='utf-8') if l.strip()]
    if a.engine == 'gemini':
        items = batches(items, a.batch)
    say = (qwen_speaker if a.engine == 'qwen' else gemini_speaker)(a)
    if a.check:
        say = checked(say, a.check)
    audio = [silence(400)]
    for i, it in enumerate(items):
        print(f'[{i + 1}/{len(items)}] {it["text"][:30]}', file=sys.stderr)
        audio += [tighten(say(it['text'])), silence(it['pause_ms'])]
        if it.get('knock'):
            audio += [knock(), silence(500)]
    write_wav(a.out, np.concatenate(audio))

DEFAULT_MODEL = {'qwen': 'mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit',
                 'gemini': 'gemini-3.8-flash-tts'}
DEFAULT_STYLE = {'qwen': STYLE_ZH, 'gemini': STYLE_EN}
DEFAULT_VOICE = {'qwen': 'uncle_fu', 'gemini': 'Algenib'}

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('segments')
    s.add_argument('file')
    s.add_argument('--recap', default='', help='one line for 「上回书说到」')
    s.add_argument('--limit', type=int, default=110, help='max chars per TTS piece')
    s.add_argument('--max-chars', type=int, default=0, help='stop after this much story (a sample)')
    s.add_argument('--no-frame', action='store_true', help='no 说书人 opening/closing')
    r = sub.add_parser('render')
    r.add_argument('segments')
    r.add_argument('out')
    r.add_argument('--engine', choices=['qwen', 'gemini'], default='qwen')
    r.add_argument('--model')
    r.add_argument('--voice')
    r.add_argument('--instruct', default='', help="style prompt (default per engine); '-' for none")
    r.add_argument('--check', nargs='?', const='mlx-community/Qwen3-ASR-1.7B-8bit', default='',
                   help='transcribe each take with this ASR model and re-roll a garbled one')
    r.add_argument('--batch', type=int, default=600, help='gemini: chars per request')
    a = p.parse_args()
    if a.cmd == 'render':
        a.model = a.model or DEFAULT_MODEL[a.engine]
        a.voice = a.voice or DEFAULT_VOICE[a.engine]
        a.instruct = None if a.instruct == '-' else a.instruct or DEFAULT_STYLE[a.engine]
    (cmd_segments if a.cmd == 'segments' else cmd_render)(a)

if __name__ == '__main__':
    main()
