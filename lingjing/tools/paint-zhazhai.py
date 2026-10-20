#!/usr/bin/env python3
"""paint-zhazhai.py — 砸寨's painted pieces (the weasels, the four things 小满 flings, the slingshot), in comic style.

    python3 tools/paint-zhazhai.py [--only id,id] [--force] [--jobs 4]

STYLE RULING 2026-10-19 (Hanli): every small game is comic, Angry-Birds cartoon — not the house ink. So unlike
paint-games.py (ink on paper, keyed by the paper), each piece here is painted by Codex as a flat cartoon on plain
white and keyed by a flood fill from the border through the white (the bold outline stops it), then trimmed and
fitted into a square. The weasels carry art/games/zhazhai/weasel-idle.webp (the 10-19 Codex weasel) as their
character reference, so the three read as the same family.

Output: art/games/zhazhai/<piece>.png (RGBA). tools/zhazhai/atlas.py packs them into the game's atlases.
"""
import argparse, subprocess, tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
ART = HERE.parent / 'worlds' / 'jiuding' / 'art'
OUT = ART / 'games' / 'zhazhai'
MODEL = 'gpt-6.1-sol'

STYLE = ('Bright cheerful cartoon mobile-game art in the manner of Angry Birds: a bold clean dark-brown outline round '
         'every shape, flat saturated colours with simple cel shading and one soft glossy highlight, chunky rounded '
         'forms, big expressive eyes where there is a face. Old rural China flavour (no Japanese, no Western dress). '
         'The subject ALONE, centred, filling most of the picture, on a plain solid pure WHITE background: no ground, '
         'no cast shadow, no scenery, no text, no letters, no characters, no seal, no border, no frame.')
WEASEL_REF = 'The attached image shows the CHARACTER (a yellow weasel spirit with a red bandana): keep who it is, but redraw it fully in the cartoon style described, not in its watercolour.'

# id: (reference or None, subject)
PIECES = {
  'weasel-s': ('games/zhazhai/weasel-idle.webp',
    'A small round chubby yellow-ochre weasel spirit minion drawn as an almost perfectly ROUND ball of a body that is mostly '
    'its face, seen from the front turned slightly LEFT: tiny round ears, a white muzzle and cheeks, big shifty black eyes, '
    'a sly little grin with one buck tooth, three whiskers each side, tiny paws held up at its chin, a stubby bushy tail '
    'curling up behind. No bandana. Cute and mischievous.'),
  'weasel-m': ('games/zhazhai/weasel-idle.webp',
    'A round chubby yellow-ochre weasel spirit drawn as a ROUND ball of a body that is mostly its face, seen from the front '
    'turned slightly LEFT, wearing a faded red cloth bandana knotted on its head like a little bandit: a white muzzle, '
    'big smug half-lidded eyes, a cheeky grin showing one tooth, whiskers, a bushy tail curling up behind, a chicken '
    'feather stuck in the bandana. Cocky and cute.'),
  'weasel-l': ('games/zhazhai/weasel-idle.webp',
    'The weasel spirit CHIEF: a big round fat yellow-ochre weasel drawn as a ROUND ball of a body, seen from the front '
    'turned slightly LEFT, wearing a tiny black Ming official hat with two little side wings perched on top of its head, '
    'a red sash round its big belly, a white muzzle, thick bushy brows, a smug toothy grin, long curling whiskers like '
    'a moustache, a drumstick of roast chicken in one paw, a huge bushy tail behind. Pompous and funny.'),
  'proj-stone': (None,
    'ONE round grey river stone, a smooth chunky pebble almost a perfect ball, a couple of chips and a fleck of moss, '
    'a glossy highlight top-left.'),
  'proj-sword': (None,
    'ONE short Chinese flying sword (a small jian) lying diagonally from lower-left to upper-RIGHT with its point at the '
    'upper right: a bright steel blade with a ridge down the middle, a little bronze guard, a short wrapped hilt and a '
    'red tassel, a faint white-blue glow round the blade.'),
  'proj-pot': (None,
    'ONE round little clay pot, a squat ball-shaped earthenware jar with a short neck and a rope tied round it, '
    'reddish-brown terracotta with a darker glaze drip, a glossy highlight.'),
  'proj-talisman': (None,
    'ONE Taoist thunder talisman: a tall narrow strip of yellow paper standing upright with red brush-swirl marks on it '
    '(abstract swirls, no readable writing), crackling with small blue-white lightning sparks round its edges, '
    'its top edge slightly curled.'),
  'slingshot': (None,
    'ONE big wooden Y-shaped slingshot fork standing upright, cut from a gnarled forked tree branch, its two prongs '
    'wrapped near the top with red cloth bands, the bark warm brown, seen straight from the side. NO band and no '
    'pouch between the prongs: the fork alone.'),
}


def paint(key, ref, subject, force):
  dst = OUT / f'{key}.png'
  if dst.exists() and not force:
    return f'{key}: kept'
  with tempfile.TemporaryDirectory() as d:
    from PIL import Image
    args = []
    if ref:
      p = Path(d) / 'ref.png'
      Image.open(ART / ref).convert('RGBA').save(p)
      args = ['-i', str(p)]
    prompt = (f'Use your image generation tool to make ONE new square image, then save it in the current directory as '
              f'piece.png. {WEASEL_REF if ref else ""} Subject: {subject} Style: {STYLE} Reply with the saved file path only.')
    subprocess.run(['codex', 'exec', '-m', MODEL, '--skip-git-repo-check', '-s', 'workspace-write', *args, '--', prompt],
                   cwd=d, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=900)
    src = Path(d) / 'piece.png'
    if not src.exists():
      return f'{key}: codex made no picture'
    key_white(src, dst)
  return f'{key}: painted'


def key_white(src, dst):
  """White → alpha by a flood fill from the border through near-white (the outline stops it); trim; square."""
  import numpy as np, cv2
  from PIL import Image
  im = np.asarray(Image.open(src).convert('RGB')).astype(np.int16)
  h, w, _ = im.shape
  near = ((im.min(axis=2) > 232) & (im.max(axis=2) - im.min(axis=2) < 22)).astype(np.uint8)
  mask = np.zeros((h + 2, w + 2), np.uint8)
  bg = near.copy() * 255
  for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
    if bg[y, x] == 255:
      cv2.floodFill(bg, mask, (x, y), 128)
  alpha = np.where(bg == 128, 0, 255).astype(np.uint8)
  alpha = cv2.morphologyEx(alpha, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
  alpha = cv2.GaussianBlur(alpha, (3, 3), 0)
  ys, xs = np.where(alpha > 40)
  y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
  rgba = np.dstack([im.astype(np.uint8), alpha])[y0:y1, x0:x1]
  side = max(y1 - y0, x1 - x0) + 8
  sq = np.zeros((side, side, 4), np.uint8)
  oy, ox = (side - (y1 - y0)) // 2, (side - (x1 - x0)) // 2
  sq[oy:oy + y1 - y0, ox:ox + x1 - x0] = rgba
  Image.fromarray(sq, 'RGBA').resize((512, 512), Image.LANCZOS).save(dst)


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--only')
  ap.add_argument('--force', action='store_true')
  ap.add_argument('--jobs', type=int, default=4)
  a = ap.parse_args()
  OUT.mkdir(parents=True, exist_ok=True)
  keys = a.only.split(',') if a.only else list(PIECES)
  with ThreadPoolExecutor(a.jobs) as ex:
    for line in ex.map(lambda k: paint(k, *PIECES[k], a.force), keys):
      print(line, flush=True)


if __name__ == '__main__':
  main()
