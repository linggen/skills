#!/usr/bin/env python3
"""paint-rope-flux.py — the 割绳子 games' sprites (灵气泡, 荆棘), painted by the local FLUX.

    python3 tools/paint-rope-flux.py [--only id,id] [--seeds 1,2,3,4] [--review DIR] [--keep id:seed,…]

2026-10-16 (the 饭桶's daily cut-the-rope puzzle; Codex quota low): FLUX.2 klein 4B through mflux
(tools/paint-cards.py's recipe, HF_HOME at the cached model, nothing downloaded), as an EDIT pass
from a house 水墨淡彩 painting (`reference`, art/items/chonglou.webp) so the sprite sits in the same
paper and wash. Prompts are English only (Chinese words in a FLUX prompt invite fake characters).
Without --keep, every seed goes to the review folder to be looked at; --keep paints the chosen seed
again and writes art/games/<id>.webp: cropped to the subject, the paper taken out as alpha (how far
each pixel is from the paper's colour), so the sprite lays clean on the light page and the dark one.
One FLUX job at a time on the GPU: wait while another mflux process runs.

Kept (2026-10-16, four seeds each looked at — one subject, no text, no seal): 灵气泡 seed 1 (a clean
ink ring, jade-and-gold wash, a wisp of mist), 荆棘 seed 1 (a dense crossed bramble, rust leaves).
"""
import argparse, json, os, subprocess, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORLD = HERE.parent / 'worlds' / 'jiuding'
OUT = WORLD / 'art' / 'games'
REFERENCE = WORLD / 'art' / 'items' / 'chonglou.webp'
PY = Path.home() / '.linggen/runtime/envs/pictures/bin/python'
SCRIPT = Path.home() / '.linggen/runtime/mlx_picture.py'
MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'

STYLE = ('Match the attached reference picture EXACTLY in style: Chinese ink wash on pale aged rice paper, xieyi brush '
         'strokes, soft ink gradations, muted mineral colours, generous empty paper. Replace its subject entirely: do not '
         'draw the plant, do not draw the grey cloud of wash. The one subject alone in the middle on plain empty paper that '
         'runs to every edge. No text, no characters, no seal, no signature, no border, no frame, no vignette.')

SUBJECTS = {
  'bubble': 'A single round floating bubble of pale spirit mist, a perfect circle drawn with one light ink ring, the inside '
            'a very soft luminous wash of faint jade green and pale gold, a small white highlight near the top left, a few '
            'wisps of mist curling around its rim. Just the one bubble.',
  'thorns': 'A short horizontal tangle of thorny bramble branches, dark ink stems crossing each other, many sharp pointed '
            'thorns along them, a few small dry leaves in muted rust brown, wider than it is tall, lying across the middle '
            'of the paper. Just the bramble, nothing else.',
}

# id: (kept seed, crop box in the 512 picture, output size, paper threshold)
KEPT = {'bubble': (1, (120, 120, 392, 392), (256, 256), 10), 'thorns': (1, (10, 170, 502, 350), (492, 180), 26)}


def paint(out, subject, seed):
  req = {'model': MODEL, 'prompt': f'{subject} Style: {STYLE}', 'out': str(out), 'width': 512, 'height': 512, 'seed': seed,
         'reference': str(REFERENCE)}
  env = dict(os.environ, HF_HOME=str(Path.home() / '.linggen/models/hf-hub'), HF_HUB_OFFLINE='1')
  r = subprocess.run([str(PY), str(SCRIPT)], input=json.dumps(req), text=True, capture_output=True, env=env)
  return None if r.returncode == 0 and Path(out).exists() else (r.stdout.strip()[-200:] or r.stderr.strip()[-200:])


def to_webp(png, webp, box, size, threshold):
  code = (f"from PIL import Image; import numpy as np; im = Image.open({str(png)!r}).convert('RGB').crop({tuple(box)!r}); "
          "a = np.asarray(im).astype(float); "
          "c = np.concatenate([a[:8, :8].reshape(-1, 3), a[:8, -8:].reshape(-1, 3), a[-8:, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)]); "
          "d = np.sqrt(((a - np.median(c, axis=0)) ** 2).sum(axis=2)); "
          f"al = np.clip((d - {threshold}) * 6, 0, 255); "
          f"Image.fromarray(np.dstack([a, al]).astype('uint8'), 'RGBA').resize({tuple(size)!r}, Image.LANCZOS).save({str(webp)!r}, 'WEBP', quality=88)")
  subprocess.run([str(PY), '-c', code], check=True)


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--only', default='')
  ap.add_argument('--seeds', default='1,2,3,4')
  ap.add_argument('--review', default=str(Path(tempfile.gettempdir()) / 'rope-flux-review'))
  ap.add_argument('--keep', default='', help='id,… — paint its KEPT seed into art/games/<id>.webp')
  a = ap.parse_args()
  ids = [i for i in a.only.split(',') if i] or list(SUBJECTS)
  if a.keep:
    OUT.mkdir(parents=True, exist_ok=True)
    for sid in [k for k in a.keep.split(',') if k]:
      seed, box, size, threshold = KEPT[sid]
      png = Path(tempfile.gettempdir()) / f'rope-flux-{sid}.png'
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
