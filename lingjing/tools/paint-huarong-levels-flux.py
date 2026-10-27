#!/usr/bin/env python3
"""paint-huarong-levels-flux.py — 华容道's story levels of the second batch (全文后的小游戏 古五 → 古九, 2026-10-26),
painted by the local FLUX in the kit's own cartoon style, as tools/paint-huarong-crowd-flux.py painted 人堆.

    PY=~/.linggen/runtime/envs/pictures/bin/python
    $PY tools/paint-huarong-levels-flux.py paint <level> [--only id,…] [--seeds 1,2]   # → $FLUX_REVIEW/huarong-<level>/
    $PY tools/paint-huarong-levels-flux.py cut <level>                                 # the KEPT seeds → art/games/huarong-<level>/

小满 (the 2×2) is the kit's own k.webp. Each level's small blocks: v (1×2), h (2×1), s (1×1), and its floor.
  kouzi (第五回, wm-kouzi): 阿禾's reckoning at the wall — four hundred grey robes fill the mouths; the one nobody wants.
  wali  (第九回, 01-tower): the fallen corner of the water-gate tower — beams, bricks and tiles off 老胡.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flux_comic as fc

HERE = Path(__file__).resolve().parent
ART = HERE.parent / 'worlds' / 'jiuding' / 'art' / 'games'
PEOPLE = 'Ancient Chinese people in plain cotton robes, no modern clothes.'
TALL, WIDE, SQUARE = 'twice as tall as it is wide, filling the tall picture.', 'twice as wide as it is tall, filling the wide picture.', 'roughly as wide as it is tall, filling the picture.'

LEVELS = {
  'kouzi': {
    'v': ('ONE ancient Chinese young sect disciple in a plain grey robe standing upright, seen whole from head to cloth shoes, '
          'a folded yellowed paper map in his hand, ' + TALL + ' ' + PEOPLE),
    'h': ('ONE big fallen grey rock block lying flat, rough and cracked, ' + WIDE),
    's': ('ONE small ancient Chinese boy disciple in a grey robe squatting and hugging his knees, round and chunky, ' + SQUARE + ' ' + PEOPLE),
    'floor': ('Seen from straight above: the plain old grey stone floor of a cave hall, big worn flagstones, a few cracks and '
              'patches of moss; NO people, nothing standing up; evenly lit, a flat texture filling the WHOLE picture edge to edge.'),
  },
  'wali': {
    'v': ('ONE heavy broken wooden roof beam standing upright, splintered at one end, dark old wood, ' + TALL),
    'h': ('ONE stack of grey city-wall bricks lying flat, a few broken, ' + WIDE),
    's': ('ONE small heap of broken dark grey roof tiles, ' + SQUARE),
    'floor': ('Seen from straight above: flat packed earth with a light scatter of dust, grit and tiny tile chips, an even '
              'pattern; NO building, NO tower, NO wall, NO people, nothing standing up, no object in the middle; evenly lit, a flat '
              'texture filling the WHOLE picture edge to edge.'),
  },
}
# Looked at (2 seeds each); the seed kept per piece.
KEPT = {
  'kouzi': {'v': 2, 'h': 1, 's': 1, 'floor': 2},
  'wali': {'v': 1, 'h': 1, 's': 1, 'floor': 2},
}
SIZE = {'v': (160, 320), 'h': (320, 160), 's': (160, 160), 'floor': (480, 600)}
PAINT = {'v': (384, 768), 'h': (768, 384), 's': (512, 512), 'floor': (768, 960)}


def jobs(level):
  out = {}
  for jid, prompt in LEVELS[level].items():
    w, h = PAINT[jid]
    if jid == 'floor':
      out[jid] = dict(w=w, h=h, prompt=prompt + ' ' + fc.STYLE + ' ' + fc.SCENE)
    else:
      out[jid] = dict(w=w, h=h, key='magenta', prompt=prompt + ' ' + fc.STYLE + ' ' + fc.ON_MAGENTA)
  return out


def cut(level):
  from PIL import Image
  dst = ART / f'huarong-{level}'
  dst.mkdir(parents=True, exist_ok=True)
  for jid, seed in KEPT[level].items():
    src = fc.REVIEW / f'huarong-{level}' / f'{jid}-{seed}.png'
    w, h = SIZE[jid]
    if jid == 'floor':
      Image.open(src).convert('RGB').resize((w, h), Image.LANCZOS).save(dst / 'floor.webp', 'WEBP', quality=80, method=6)
      continue
    im = fc.key_green(src, key='magenta')
    k = min(w * 0.94 / im.width, h * 0.94 / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    tile = Image.new('RGBA', (w, h))
    tile.alpha_composite(im, ((w - im.width) // 2, (h - im.height) // 2))
    fc.save_webp(tile, dst / f'{jid}.webp', quality=86)
    print(level, jid, '→', dst / f'{jid}.webp')


if __name__ == '__main__':
  level = next((x for x in sys.argv[2:] if not x.startswith('-')), None)
  if level not in LEVELS:
    sys.exit(f'level: one of {", ".join(LEVELS)}')
  argv = [x for x in sys.argv[1:] if x != level]
  a = fc.run(jobs(level), argv)
  if a.cmd == 'paint':
    fc.paint_all(f'huarong-{level}', jobs(level), a)
  else:
    cut(level)
