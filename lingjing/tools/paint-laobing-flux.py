#!/usr/bin/env python3
"""paint-laobing-flux.py — 烙饼's pictures (games/laobing.js), painted by the local FLUX.

    python3 tools/paint-laobing-flux.py [--only id,id] [--seeds 1,2,3,4] [--review DIR] [--keep id,…] [--cut id,…]

2026-10-16 (the 饭桶's daily cooking game): FLUX.2 klein 4B through mflux, an EDIT pass from a house
水墨淡彩 painting (art/items/chonglou.webp), the same recipe as tools/paint-rope-flux.py. English
prompts only. Without --keep/--cut every seed goes to the review folder to be looked at; --cut takes
the KEPT seed from the review folder, --keep paints it again; either writes art/games/laobing/<id>.webp,
the paper taken out as alpha. One FLUX job at a time: each job waits while another mflux runs.

Kept: see KEPT (each seed looked at — one subject, no text, no seal).
"""
import argparse, json, os, subprocess, tempfile, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORLD = HERE.parent / 'worlds' / 'jiuding'
OUT = WORLD / 'art' / 'games' / 'laobing'
REFERENCE = WORLD / 'art' / 'items' / 'chonglou.webp'
PY = Path.home() / '.linggen/runtime/envs/pictures/bin/python'
SCRIPT = Path.home() / '.linggen/runtime/mlx_picture.py'
MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'

STYLE = ('Match the attached reference picture EXACTLY in style: Chinese ink wash on pale aged rice paper, xieyi brush '
         'strokes, soft ink gradations, muted mineral colours, generous empty paper. Replace its subject entirely: do not '
         'draw the plant, do not draw the grey cloud of wash. The one subject alone in the middle on plain empty paper that '
         'runs to every edge. No text, no characters, no seal, no signature, no border, no frame, no vignette.')

SUBJECTS = {
  'griddle': 'A large round flat cast-iron griddle pan for flatbread, seen from straight above, a wide dark grey iron disc '
             'with a slightly lighter worn centre and a thin rim, empty, filling most of the paper. Just the one round iron disc.',
  'stove': 'The front of an old village mud-brick cooking stove, low and wide, with one arched fire opening in the middle '
           'of its face, the opening dark and empty with soot around it, no fire. Seen straight from the front. Just the stove front.',
  'fire': 'A small cluster of flickering orange and red flames rising from a few glowing embers and charred sticks, '
          'warm light, drawn in loose wash. Just the small fire, nothing around it.',
  'blaze': 'A tall roaring fire, big bright orange and yellow flames leaping high from a heap of burning split logs, '
           'sparks flying upward. Just the fire, nothing around it.',
  'raw': 'A single round flat piece of raw bread dough, pale creamy white, smooth, slightly floury, seen from straight '
         'above, a perfect round disc. Just the one round dough.',
  'gold': 'A single round flatbread seen from straight above, cooked golden brown, with toasted darker brown spots and '
          'blisters spread over its surface, a perfect round disc. Just the one flatbread.',
  'burnt': 'A single round flatbread seen from straight above, badly burnt, charred black patches and dark scorched '
           'brown all over, a few cracks, a perfect round disc. Just the one burnt flatbread.',
  'plate': 'A single empty round shallow plate of coarse blue and white village porcelain, seen from straight above, '
           'a simple blue ring painted near its rim. Just the one empty plate.',
  'wood': 'A small bundle of three short split firewood sticks lying crossed, pale bark and split wood ends, tied with '
          'nothing. Just the firewood.',
}

# id: (kept seed, crop box in the 512 picture or None (to the subject), output size, paper threshold)
KEPT = {}


def busy():
  # A FLUX job itself (a python running mlx_picture.py or mflux), not a shell that waits naming them.
  r = subprocess.run(['pgrep', '-lf', 'mflux|mlx_picture'], capture_output=True, text=True)
  return any('python' in line.split(' ', 2)[1] for line in r.stdout.splitlines() if ' ' in line)


def paint(out, subject, seed):
  while busy(): time.sleep(0.4)
  req = {'model': MODEL, 'prompt': f'{subject} Style: {STYLE}', 'out': str(out), 'width': 512, 'height': 512, 'seed': seed,
         'reference': str(REFERENCE)}
  env = dict(os.environ, HF_HOME=str(Path.home() / '.linggen/models/hf-hub'), HF_HUB_OFFLINE='1')
  r = subprocess.run([str(PY), str(SCRIPT)], input=json.dumps(req), text=True, capture_output=True, env=env)
  return None if r.returncode == 0 and Path(out).exists() else (r.stdout.strip()[-200:] or r.stderr.strip()[-200:])


def to_webp(png, webp, box, size, threshold):
  crop = f".crop({tuple(box)!r})" if box else ''
  code = (f"from PIL import Image; import numpy as np; im = Image.open({str(png)!r}).convert('RGB'){crop}; "
          "a = np.asarray(im).astype(float); "
          "c = np.concatenate([a[:8, :8].reshape(-1, 3), a[:8, -8:].reshape(-1, 3), a[-8:, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)]); "
          "d = np.sqrt(((a - np.median(c, axis=0)) ** 2).sum(axis=2)); "
          f"al = np.clip((d - {threshold}) * 6, 0, 255); "
          "img = Image.fromarray(np.dstack([a, al]).astype('uint8'), 'RGBA'); "
          + ("" if box else "ys, xs = np.where(al > 220); m = 6; img = img.crop((max(0, xs.min() - m), max(0, ys.min() - m), min(img.width, xs.max() + m), min(img.height, ys.max() + m))); ")
          + (f"img = img.resize({tuple(size)!r}, Image.LANCZOS); " if isinstance(size, tuple) else
             f"k = {size} / max(img.size); img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS); ")
          + f"img.save({str(webp)!r}, 'WEBP', quality=88)")
  subprocess.run([str(PY), '-c', code], check=True)


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--only', default='')
  ap.add_argument('--seeds', default='1,2,3,4')
  ap.add_argument('--review', default=str(Path(tempfile.gettempdir()) / 'laobing-flux-review'))
  ap.add_argument('--keep', default='')
  ap.add_argument('--cut', default='')
  a = ap.parse_args()
  ids = [i for i in a.only.split(',') if i] or list(SUBJECTS)
  OUT.mkdir(parents=True, exist_ok=True)
  if a.cut:
    for sid in [k for k in a.cut.split(',') if k]:
      seed, box, size, threshold = KEPT[sid]
      to_webp(Path(a.review) / f'{sid}-{seed}.png', OUT / f'{sid}.webp', box, size, threshold); print(sid, '→', OUT / f'{sid}.webp')
    return
  if a.keep:
    for sid in [k for k in a.keep.split(',') if k]:
      seed, box, size, threshold = KEPT[sid]
      png = Path(tempfile.gettempdir()) / f'laobing-flux-{sid}.png'
      err = paint(png, SUBJECTS[sid], seed)
      if err: print(sid, 'failed', err); continue
      to_webp(png, OUT / f'{sid}.webp', box, size, threshold); print(sid, '→', OUT / f'{sid}.webp')
    return
  review = Path(a.review); review.mkdir(parents=True, exist_ok=True)
  for sid in ids:
    for seed in [int(s) for s in a.seeds.split(',')]:
      out = review / f'{sid}-{seed}.png'
      if out.exists(): continue
      t0 = time.time(); err = paint(out, SUBJECTS[sid], seed)
      print(sid, seed, 'failed ' + err if err else f'→ {out} ({time.time() - t0:.0f} s)', flush=True)


if __name__ == '__main__':
  main()
