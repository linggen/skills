"""flux_comic.py — the small games' comic painter on the local FLUX (Hanli 10-20: 「代码画的都查一下, 用flux画吧」).

A library the per-game paint scripts import (tools/paint-zhazhai-flux.py, …). Run them with the engine's
`pictures` venv, where mflux lives:

    ~/.linggen/runtime/envs/pictures/bin/python tools/paint-<game>-flux.py paint [--only id,…] [--seeds 1,2,3]
    ~/.linggen/runtime/envs/pictures/bin/python tools/paint-<game>-flux.py cut

FLUX.2 klein 4B (mflux 4-bit, HF_HOME ~/.linggen/models/hf-hub, offline), loaded ONCE per run (a picture is
~15–25 s; the one-shot engine runner reloads per picture). Text-to-image, or an edit pass from a reference
picture (the style match: 砸寨's weasels, 银月's frames). `paint` writes every seed into a review folder to be
looked at; the script's KEPT table names the seed taken; `cut` keys it (a flat green ground, chroma key with
the spill pulled off — a white coat survives) and writes the game's webp.

Style (10-19 comic ruling, 10-20 benchmark 《向僵尸开炮》): chunky, bold-outlined, flat cel-shaded cartoon,
big readable silhouettes. "no text" is unreliable: every seed is looked at for fake glyphs.
"""
import os, sys, time
from pathlib import Path

os.environ.setdefault('HF_HOME', str(Path.home() / '.linggen/models/hf-hub'))
os.environ.setdefault('HF_HUB_OFFLINE', '1')

MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'
REVIEW = Path(os.environ.get('FLUX_REVIEW', '/tmp/flux-comic-review'))

STYLE = ('Bright cheerful cartoon mobile-game art in the manner of Angry Birds and polished casual mobile games: '
         'a bold clean dark-brown outline round every shape, flat saturated colours with simple cel shading and one '
         'soft glossy highlight, chunky rounded forms, a big readable silhouette. Old rural China flavour.')
ON_GREEN = ('The subject ALONE, centred, filling most of the picture, on a plain flat solid pure bright GREEN '
            'background (#00FF00) that runs to every edge: no ground, no cast shadow, no scenery, no text, no '
            'letters, no writing, no border, no frame.')
SCENE = 'No text, no letters, no writing, no signature, no border, no frame, no people.'

_models = {}


def _model(edit):
  if edit in _models:
    return _models[edit]
  from huggingface_hub import snapshot_download
  from mflux.models.common.config.model_config import ModelConfig
  path = snapshot_download(MODEL)
  cfg = ModelConfig.flux2_klein_4b()
  if edit:
    from mflux.models.flux2.variants.edit.flux2_klein_edit import Flux2KleinEdit
    m = Flux2KleinEdit(model_config=cfg, model_path=path)
  else:
    from mflux.models.flux2.variants.txt2img.flux2_klein import Flux2Klein
    m = Flux2Klein(model_config=cfg, model_path=path)
  _models.clear()  # one at a time: a model holds GBs of unified memory
  _models[edit] = m
  return m


def busy():
  """Another FLUX job (the engine's mlx_picture.py, a bare mflux) holds the GPU: wait for it."""
  import subprocess
  r = subprocess.run(['pgrep', '-lf', 'mlx_picture|mflux-generate'], capture_output=True, text=True)
  return bool(r.stdout.strip())


def render(prompt, out, w=768, h=512, seed=1, refs=None, steps=4):
  while busy():
    time.sleep(1)
  t0 = time.time()
  m = _model(bool(refs))
  kw = dict(seed=seed, prompt=prompt, num_inference_steps=steps, height=h, width=w, guidance=1.0)
  if refs:
    kw['image_paths'] = [str(r) for r in refs]
  img = m.generate_image(**kw)
  Path(out).parent.mkdir(parents=True, exist_ok=True)
  img.save(path=str(out))
  return time.time() - t0


ON_MAGENTA = ON_GREEN.replace('GREEN', 'MAGENTA').replace('#00FF00', '#FF00FF')


def key_green(src, trim=True, spill_lo=40, spill_hi=80, key='green'):
  """Green (or magenta) → alpha by chroma distance, the spill pulled off the edges; trimmed to the subject."""
  import numpy as np, cv2
  from PIL import Image
  im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
  r, g, b = im[..., 0], im[..., 1], im[..., 2]
  if key == 'magenta':
    spill = np.minimum(r, b) - g
    alpha = np.clip(1 - (spill - spill_lo) / spill_hi, 0, 1)
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0)
    im[..., 0] = np.where(spill > 0, np.maximum(g, r - spill), r)
    im[..., 2] = np.where(spill > 0, np.maximum(g, b - spill), b)
    return _finish(im, alpha, trim)
  spill = g - np.maximum(r, b)
  alpha = np.clip(1 - (spill - spill_lo) / spill_hi, 0, 1)
  alpha = cv2.GaussianBlur(alpha, (3, 3), 0)
  im[..., 1] = np.where(spill > 0, np.maximum(r, b), g)
  return _finish(im, alpha, trim)


def _finish(im, alpha, trim):
  import numpy as np, cv2
  from PIL import Image
  # drop specks: keep only components of real size
  a8 = (alpha * 255).astype(np.uint8)
  n, lab, stats, _ = cv2.connectedComponentsWithStats((a8 > 100).astype(np.uint8), 8)
  big = max(stats[1:, cv2.CC_STAT_AREA]) if n > 1 else 0
  for i in range(1, n):
    if stats[i, cv2.CC_STAT_AREA] < max(60, big * 0.01):
      a8[lab == i] = 0
  rgba = np.dstack([np.clip(im, 0, 255).astype(np.uint8), a8])
  out = Image.fromarray(rgba, 'RGBA')
  if trim:
    out = out.crop(out.getbbox())
  return out


def save_webp(im, dst, max_side=None, quality=86):
  from PIL import Image
  if max_side and max(im.size) > max_side:
    k = max_side / max(im.size)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
  Path(dst).parent.mkdir(parents=True, exist_ok=True)
  im.save(dst, 'WEBP', quality=quality, method=6, exact=True)
  return im


def run(jobs, argv=None):
  """`paint` every job × seed into REVIEW/<game>/ (skips seeds already there; --force repaints)."""
  import argparse
  ap = argparse.ArgumentParser()
  ap.add_argument('cmd', choices=['paint', 'cut'])
  ap.add_argument('--only', default='')
  ap.add_argument('--seeds', default='1,2,3')
  ap.add_argument('--force', action='store_true')
  a = ap.parse_args(argv)
  return a


def paint_all(game, jobs, a):
  only = [k for k in a.only.split(',') if k] or list(jobs)
  for jid in only:
    j = jobs[jid]
    for seed in [int(s) for s in a.seeds.split(',')]:
      out = REVIEW / game / f'{jid}-{seed}.png'
      if out.exists() and not a.force:
        continue
      s = render(j['prompt'], out, j.get('w', 768), j.get('h', 512), seed, j.get('refs'))
      print(f'{jid} {seed} → {out} ({s:.0f} s)', flush=True)
