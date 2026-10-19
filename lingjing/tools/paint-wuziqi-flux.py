#!/usr/bin/env python3
"""paint-wuziqi-flux.py — the 五子棋 board and stones (games/wuziqi.css), painted by the local FLUX.

    python3 tools/paint-wuziqi-flux.py [--only id,id] [--seeds 1,2,3,4] [--review DIR] [--keep id,…] [--cut id,…]

2026-10-19 (五子棋 in the 九宫格's place — the 困阵, 周衡's table, the 秘境's 奇遇): the board and its stones
were CSS gradients. FLUX.2 klein 4B through mflux, tools/paint-rope-flux.py's recipe (an EDIT pass from a
house 水墨淡彩 painting, art/items/chonglou.webp, so the paper and wash match; English prompts only; HF
offline, nothing downloaded). The board is a texture only — the fifteen lines stay drawn in ink by the CSS,
so they sit exactly on the points; the stones are sprites with the paper taken out as alpha.
Without --keep every seed goes to the review folder to be looked at; --cut takes the KEPT seed from it.
One FLUX job at a time on the GPU: this waits while another mflux process runs.
"""
import argparse, json, os, subprocess, tempfile, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORLD = HERE.parent / 'worlds' / 'jiuding'
OUT = WORLD / 'art' / 'games' / 'wuziqi'
REFERENCE = WORLD / 'art' / 'items' / 'chonglou.webp'
PY = Path.home() / '.linggen/runtime/envs/pictures/bin/python'
SCRIPT = Path.home() / '.linggen/runtime/mlx_picture.py'
MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'

STYLE = ('Match the attached reference picture EXACTLY in style: Chinese ink wash on pale aged rice paper, xieyi brush '
         'strokes, soft ink gradations, muted mineral colours. Replace its subject entirely: do not draw the plant. '
         'No text, no characters, no seal, no signature, no grid, no lines, no border, no frame, no vignette.')

SUBJECTS = {
  'board': 'Seen from directly above, filling the whole picture edge to edge: the flat top of an old square slab of pale '
           'weathered stone, a very light warm grey with a faint wash of celadon green, soft mottled ink texture, a few '
           'faint mineral speckles, quiet and even, nothing on it. Only the stone surface, no edges visible.',
  'black': 'A single round black go stone seen from slightly above, polished dark ink black with a soft grey sheen on its '
           'upper left, a slightly convex lens shape, a faint soft shadow under it. Just the one stone in the middle on '
           'plain empty paper.',
  'white': 'A single round white go stone seen from slightly above, made of pale shell or white jade, warm ivory white '
           'with a faint grey ink outline and a soft grey shade on its lower right, a slightly convex lens shape. Just '
           'the one stone in the middle on plain empty paper.',
}

# id: (kept seed, crop box in the 512 picture or None (to the subject), output size, paper threshold or None (opaque))
KEPT = {'board': (1, (16, 16, 496, 496), (480, 480), None), 'black': (1, None, 96, 30), 'white': (1, None, 96, 18)}


def gpu_free():
  r = subprocess.run(['pgrep', '-f', 'mlx_picture.py'], capture_output=True, text=True)
  return not r.stdout.strip()


def paint(out, subject, seed):
  while not gpu_free():
    time.sleep(5)
  req = {'model': MODEL, 'prompt': f'{subject} Style: {STYLE}', 'out': str(out), 'width': 512, 'height': 512, 'seed': seed,
         'reference': str(REFERENCE)}
  env = dict(os.environ, HF_HOME=str(Path.home() / '.linggen/models/hf-hub'), HF_HUB_OFFLINE='1')
  r = subprocess.run([str(PY), str(SCRIPT)], input=json.dumps(req), text=True, capture_output=True, env=env)
  return None if r.returncode == 0 and Path(out).exists() else (r.stdout.strip()[-200:] or r.stderr.strip()[-200:])


def to_webp(png, webp, box, size, threshold):
  crop = f".crop({tuple(box)!r})" if box else ''
  if threshold is None:  # an opaque texture
    code = (f"from PIL import Image; im = Image.open({str(png)!r}).convert('RGB'){crop}; "
            f"im = im.resize({tuple(size)!r}, Image.LANCZOS); im.save({str(webp)!r}, 'WEBP', quality=84)")
  else:
    code = (f"from PIL import Image; import numpy as np; im = Image.open({str(png)!r}).convert('RGB'){crop}; "
            "a = np.asarray(im).astype(float); "
            "c = np.concatenate([a[:8, :8].reshape(-1, 3), a[:8, -8:].reshape(-1, 3), a[-8:, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)]); "
            "d = np.sqrt(((a - np.median(c, axis=0)) ** 2).sum(axis=2)); "
            f"al = np.clip((d - {threshold}) * 6, 0, 255); "
            "img = Image.fromarray(np.dstack([a, al]).astype('uint8'), 'RGBA'); "
            + ("" if box else "ys, xs = np.where(al > 220); m = 4; img = img.crop((max(0, xs.min() - m), max(0, ys.min() - m), min(img.width, xs.max() + m), min(img.height, ys.max() + m))); ")
            + f"k = {size} / max(img.size); img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS); "
            + f"img.save({str(webp)!r}, 'WEBP', quality=88)")
  subprocess.run([str(PY), '-c', code], check=True)


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--only', default='')
  ap.add_argument('--seeds', default='1,2,3,4')
  ap.add_argument('--review', default=str(Path(tempfile.gettempdir()) / 'wuziqi-flux-review'))
  ap.add_argument('--keep', default='', help='id,… — paint its KEPT seed into art/games/wuziqi/<id>.webp')
  ap.add_argument('--cut', default='', help='id,… — cut its KEPT seed from the review folder into art/games/wuziqi/<id>.webp')
  a = ap.parse_args()
  ids = [i for i in a.only.split(',') if i] or list(SUBJECTS)
  if a.cut or a.keep:
    OUT.mkdir(parents=True, exist_ok=True)
    for sid in [k for k in (a.cut or a.keep).split(',') if k]:
      seed, box, size, threshold = KEPT[sid]
      png = Path(a.review) / f'{sid}-{seed}.png'
      if a.keep:
        png = Path(tempfile.gettempdir()) / f'wuziqi-flux-{sid}.png'
        err = paint(png, SUBJECTS[sid], seed)
        if err: print(sid, 'failed', err); continue
      to_webp(png, OUT / f'{sid}.webp', box, size, threshold); print(sid, '→', OUT / f'{sid}.webp')
    return
  review = Path(a.review); review.mkdir(parents=True, exist_ok=True)
  for sid in ids:
    for seed in [int(s) for s in a.seeds.split(',')]:
      out = review / f'{sid}-{seed}.png'
      err = paint(out, SUBJECTS[sid], seed)
      print(sid, seed, err or out, flush=True)


if __name__ == '__main__':
  main()
