#!/usr/bin/env python3
"""paint-zhazhai-throws.py — 砸寨's story throws: the targets, the props and the places (Hanli 10-20: 「射鹿可以用砸寨代替.
其他投掷类都用砸寨的不同关卡代替」), painted by the local FLUX (FLUX.2 klein 4B through mflux; Codex is out of credits).

    python3 tools/paint-zhazhai-throws.py paint [--only id,id] [--seeds 1,2] [--force]   # every seed → review/
    python3 tools/paint-zhazhai-throws.py cut [--only id,id]                               # the KEPT seed → game art

An EDIT pass from the house's own painting of the same thing (the retired 射鹿 board's ink stag, 鯥, pine, log…,
art/games/deer/ and art/games/lu/ — deleted with the board, in git before 2026-10-20's throw port), so the pose and the
shape stay the book's and only the look turns comic — the 砸寨 look (paint-zhazhai.py: Angry-Birds cartoon, a bold
dark outline, flat saturated colour). A repaint now carries the kept comic painting itself when the old one is gone.
FLUX's misses, for the record: the 鯥's pink wing root reads as pink wing membrane, not bare flesh at the root; the
pine came out a trunk with knots like eyes (seed 1), so the crown is a separate bough painting. A character or prop is painted on a flat key colour that
`cut` keys out (green, or magenta for the green things: pine, brush, reeds); a place is painted whole.
`cut` writes tools/zhazhai/game-assets/art/<id>.webp, which the game loads by name (src/zhazhai/decor.ts THROW_ART).
One FLUX job at a time on the GPU: this waits while another mflux process runs. English prompts only; HF offline.
"""
import argparse, json, os, subprocess, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORLD = HERE.parent / 'worlds' / 'jiuding'
OLD = WORLD / 'art' / 'games'
REVIEW = Path(os.environ.get('ZZ_REVIEW', '/tmp/zhazhai-throws-review'))  # every seed, to be looked at; never committed
OUT = HERE / 'zhazhai' / 'game-assets' / 'art'
PY = Path.home() / '.linggen/runtime/envs/pictures/bin/python'
SCRIPT = Path.home() / '.linggen/runtime/mlx_picture.py'
MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'

COMIC = ('Redraw it as bright cheerful cartoon mobile-game art in the manner of Angry Birds: a bold clean dark outline '
         'round every shape, flat saturated colours with simple cel shading and one soft highlight, chunky simplified '
         'forms. Keep the same pose, the same shape and the same proportions as the reference.')
KEYS = {'green': 'pure GREEN (#00FF00)', 'magenta': 'pure MAGENTA (#FF00FF)'}


def alone(key):
  return (f' The subject ALONE, centred, filling most of the picture, on a plain flat solid {KEYS[key]} background: '
          'no ground, no cast shadow, no scenery, no text, no letters, no border, no frame.')


PLACE = (' A wide landscape seen from the side like the background of a cartoon physics game: simple bold shapes, '
         'flat colours, soft depth, the lower fifth an even strip of ground. No people, no animals, no text, no border.')

# id: (reference under art/games, size, key or None for a place, subject)
PICTURES = {
  'deer-graze': ('deer/stag-drink.webp', (768, 576), 'green',
                 'A stag with big branching antlers, head lowered to drink, side view facing RIGHT, a warm tan-brown coat '
                 'with a cream belly and a short white tail.'),
  'deer-look': ('deer/stag-look.webp', (768, 576), 'green',
                'A stag with big branching antlers standing tall and alert, head up, ears pricked, side view facing RIGHT, '
                'a warm tan-brown coat with a cream belly and a short white tail.'),
  'deer-bolt': ('deer/stag-bolt.webp', (768, 576), 'green',
                'A stag with big branching antlers bolting away in a long leap, side view facing RIGHT, legs stretched out, '
                'a warm tan-brown coat with a cream belly, a short white tail flicked up.'),
  'lu-shut': ('lu/lu-folded.webp', (768, 576), 'green',
              'The lu, a monster of the old classic: a bull-headed beast with two short horns and glowing green eyes, a '
              'thick slick blue-black hide shining like a fish, bat-like wings folded tight against its ribs, a long '
              'scaly snake tail; head low, charging to the LEFT.'),
  'lu-open': ('lu/lu.webp', (768, 576), 'green',
              'The lu, a bull-headed beast with two short horns and glowing green eyes, a thick slick blue-black hide '
              'shining like a fish, a long scaly snake tail, head low facing LEFT; drawing a deep breath: its bat-like '
              'wings lifted half open, and at the root of the wing, under its ribs, a bright PINK patch of soft bare flesh '
              'shows.'),
  'prop-pine': ('deer/trunk.webp', (512, 768), 'magenta',
                'One tall straight pine trunk with rough red-brown bark and a few stubby broken branch knots.'),
  'prop-deadtree': ('deer/deadtree.webp', (512, 768), 'magenta',
                    'A tall dead tree, bare grey wood, no leaves, a few bare crooked branches, the bark peeling, its foot '
                    'splayed into roots.'),
  'prop-log': ('deer/log.webp', (768, 384), 'green',
               'A fallen log lying on its side, rough brown bark, the cut end showing pale rings.'),
  'prop-rock': ('deer/rock.webp', (768, 512), 'green',
                'A big rounded grey boulder with a crack across it and a little moss at its foot.'),
  'prop-bush': ('deer/bush.webp', (768, 512), 'magenta',
                'A thick round clump of brush: tangled twigs and small dark green leaves.'),
  'prop-reeds': ('deer/reed.webp', (512, 768), 'magenta',
                 'A clump of tall river reeds with feathery buff seed heads and long blades.'),
  'prop-bramble': ('thorns.webp', (768, 512), 'magenta',
                   'A low tangle of thorny bramble canes, dark red-brown with sharp thorns.'),
  'prop-crown': ('deer/bough.webp', (768, 512), 'magenta',
                 'The crown of a big old pine tree seen from the side: broad flat tiers of dark green needles on crooked '
                 'branches, wider than tall, no trunk below it.'),
  'prop-torch': (None, (512, 768), 'green',
                 'One burning torch made of a bundle of pine sticks bound with cord, standing upright, a bright orange and '
                 'yellow flame on top.'),
  'proj-arrow': ('deer/arrow.webp', (768, 256), 'magenta',
                 'One hunting arrow lying flat, pointing RIGHT: a straight wooden shaft, an iron head, grey-white goose '
                 'feather fletching.'),
  'place-creek': ('lu/shoal.webp', (1024, 576), None,
                  'Daytime at the mouth of a mountain valley: a clear stream running across the middle distance, pine-clad '
                  'ridges behind, a pale blue autumn sky with a few soft clouds, grass on the near bank.'),
  'place-shoal': ('lu/shoal.webp', (1024, 576), None,
                  'Night on a wide river shoal under a full moon: dark blue water across the middle, a far low bank, '
                  'a deep blue night sky with stars, mud and pale sand on the near shore.'),
}

# id: kept seed (after a look at review/).
KEPT = {'deer-graze': 2, 'deer-look': 1, 'deer-bolt': 1, 'lu-shut': 1, 'lu-open': 1, 'prop-deadtree': 1, 'prop-log': 2,
        'prop-pine': 2, 'prop-rock': 1, 'place-creek': 2, 'place-shoal': 1, 'proj-arrow': 2, 'prop-bramble': 1, 'prop-bush': 1,
        'prop-reeds': 1, 'prop-crown': 2, 'prop-torch': 2}


def gpu_free():
  r = subprocess.run(['pgrep', '-f', 'mlx_picture.py'], capture_output=True, text=True)
  return not r.stdout.strip()


def paint(key, seed, force):
  ref, size, keycol, subject = PICTURES[key]
  out = REVIEW / f'{key}.s{seed}.png'
  if out.exists() and not force:
    return f'{key} s{seed}: kept'
  while not gpu_free():
    time.sleep(5)
  comic = COMIC if ref else COMIC.split(' Keep the same pose')[0] + '.'  # no reference: nothing to keep
  prompt = f'{subject} {comic}' + (alone(keycol) if keycol else PLACE)
  src = (OLD / ref) if ref and (OLD / ref).exists() else (OUT / f'{key}.webp' if ref and (OUT / f'{key}.webp').exists() else None)
  if src and src.suffix == '.webp':  # FLUX reads PNG/JPEG
    from PIL import Image
    png = REVIEW / f'{key}.ref.png'
    Image.open(src).convert('RGBA').save(png)
    src = png
  req = {'model': MODEL, 'prompt': prompt, 'out': str(out), 'width': size[0], 'height': size[1], 'seed': seed,
         **({'reference': str(src)} if src else {})}
  env = dict(os.environ, HF_HOME=str(Path.home() / '.linggen/models/hf-hub'), HF_HUB_OFFLINE='1')
  r = subprocess.run([str(PY), str(SCRIPT)], input=json.dumps(req), text=True, capture_output=True, env=env)
  ok = r.returncode == 0 and out.exists()
  return f'{key} s{seed}: ' + ('painted' if ok else (r.stdout.strip()[-200:] or r.stderr.strip()[-200:]))


def keyed(src, keycol):
  """The key colour → alpha (its distance from the key), the spill pulled off the edges, trimmed."""
  import numpy as np, cv2
  from PIL import Image
  im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
  r, g, b = im[..., 0], im[..., 1], im[..., 2]
  if keycol == 'green':
    spill = g - np.maximum(r, b)
    fix = (1, np.maximum(r, b))
  else:
    spill = np.minimum(r, b) - g
    fix = None
  alpha = np.clip(1 - (spill - 40) / 80, 0, 1)
  alpha = cv2.GaussianBlur(alpha, (3, 3), 0)
  if fix:
    im[..., 1] = np.where(spill > 0, fix[1], g)
  else:  # magenta spill: pull red and blue down to the green
    m = spill > 0
    im[..., 0] = np.where(m, np.minimum(r, g + 20), r)
    im[..., 2] = np.where(m, np.minimum(b, g + 20), b)
  a8 = (alpha * 255).astype(np.uint8)
  ys, xs = np.where(a8 > 40)
  y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
  rgba = np.dstack([np.clip(im, 0, 255).astype(np.uint8), a8])[y0:y1, x0:x1]
  return Image.fromarray(rgba, 'RGBA')


def cut(key):
  from PIL import Image
  _, size, keycol, _ = PICTURES[key]
  seed = KEPT.get(key)
  if seed is None:
    return f'{key}: no kept seed'
  src = REVIEW / f'{key}.s{seed}.png'
  im = keyed(src, keycol) if keycol else Image.open(src).convert('RGB')
  im.thumbnail((1024, 1024) if not keycol else (640, 640), Image.LANCZOS)
  OUT.mkdir(parents=True, exist_ok=True)
  im.save(OUT / f'{key}.webp', quality=88, **({'exact': True} if keycol else {}))
  return f'{key}: cut from s{seed} → {im.size}'


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('cmd', choices=['paint', 'cut'])
  ap.add_argument('--only')
  ap.add_argument('--seeds', default='1,2')
  ap.add_argument('--force', action='store_true')
  a = ap.parse_args()
  keys = a.only.split(',') if a.only else list(PICTURES)
  REVIEW.mkdir(parents=True, exist_ok=True)
  for k in keys:
    if a.cmd == 'cut':
      print(cut(k), flush=True)
      continue
    for s in [int(x) for x in a.seeds.split(',')]:
      print(paint(k, s, a.force), flush=True)


if __name__ == '__main__':
  main()
