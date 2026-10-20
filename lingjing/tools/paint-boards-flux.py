#!/usr/bin/env python3
"""paint-boards-flux.py — the small boards' faces on the local FLUX (Hanli 10-20: 「代码画的都查一下, 用flux画吧」;
doc/art-audit-2026-10-20.md items 8–9): the rope boards' cave, 禹步's bluestone on the clifftop, 象棋's board and
blank pieces, 押宝's four doors, 七巧板's lacquer.

    PY=~/.linggen/runtime/envs/pictures/bin/python
    FLUX_REVIEW=<scratch> $PY tools/paint-boards-flux.py paint [--only id,…] [--seeds 1,2]
    FLUX_REVIEW=<scratch> $PY tools/paint-boards-flux.py cut          # the KEPT seeds → scripts/games/boards/

What is the puzzle stays code or text over the paint: the rope game's vines and items, 禹步's grid lines and dots,
象棋's grid and piece glyphs, 押宝's door names, 七巧板's shapes (filled with the painted lacquer).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flux_comic as fc  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / 'scripts' / 'games' / 'boards'
STYLE = fc.STYLE
TEX = ('A seamless flat game texture seen straight on, filling the WHOLE picture edge to edge, evenly lit, no '
       'objects: ')
DOOR = ('ONE old Chinese gambling-house DOOR seen straight from the front: a tall wooden door in a thick carved frame '
        'with a small curved tiled roof on top, and on its panel a big carved painted relief of ')
DOORS = {
  'long': 'a coiling BLUE-GREEN DRAGON (青龙) with a curly mane, the door lacquered deep teal',
  'hu': 'a fierce WHITE TIGER (白虎) with grey stripes, the door lacquered pale silver-grey',
  'que': 'a flaming RED PHOENIX bird (朱雀) with spread wings, the door lacquered bright vermilion',
  'wu': 'a BLACK TORTOISE with a snake coiled round its shell (玄武), the door lacquered dark navy-black',
}

JOBS = {
  'cave': dict(w=768, h=944, prompt=(
    'The inside of a cosy dim mountain CAVE for a cartoon physics puzzle game, seen straight on from the front: a '
    'thin band of rough brown rock roof with a few short stalactites along the very top edge, a flat sandy-brown '
    'earth floor along the very bottom edge, and between them a calm soft dark back wall of brown-grey rock in gentle '
    'shadow, plain and uncluttered so things in front of it read clearly, a soft warm light from above. '
    + STYLE + ' ' + fc.SCENE)),
  'yubu-ground': dict(w=1024, h=384, prompt=(
    'A wide view of a flat bluestone clifftop terrace high in the mountains for a cartoon game, seen from the front '
    'and a little above: smooth grey-blue stone paving across the bottom two thirds, a few tufts of grass and a small '
    'twisted pine at the far left and far right edges, a pale sky with soft clouds and distant blue peaks along the '
    'top. The middle of the paving is plain and empty. ' + STYLE + ' ' + fc.SCENE)),
  'yubu-slab': dict(key='magenta', w=512, h=512, prompt=(
    'ONE big perfectly SQUARE flat slab of smooth grey-blue BLUESTONE seen straight down from directly above, its '
    'face plain, flat and empty with a bevelled rim and a little moss at one corner, no lines, no marks, no writing. '
    + STYLE + ' ' + fc.ON_MAGENTA)),
  'xq-board': dict(w=768, h=768, prompt=TEX + (
    'warm honey-coloured polished WOOD of an old game board, fine straight grain running across, a soft varnish '
    'shine. ' + STYLE + ' No text, no lines, no grid, no marks.')),
  'xq-red': dict(key='magenta', w=512, h=512, prompt=(
    'ONE round flat wooden CHESS PIECE disc seen straight down from above: pale cream wood face, a thick bright RED '
    'lacquered rim ring round its edge, the face in the middle completely plain and empty, no character, no writing. '
    + STYLE + ' ' + fc.ON_MAGENTA)),
  'xq-black': dict(key='magenta', w=512, h=512, prompt=(
    'ONE round flat wooden CHESS PIECE disc seen straight down from above: pale cream wood face, a thick glossy '
    'BLACK lacquered rim ring round its edge, the face in the middle completely plain and empty, no character, no '
    'writing. ' + STYLE + ' ' + fc.ON_MAGENTA)),
  'qq-lacquer': dict(w=512, h=512, prompt=TEX + (
    'glossy cream-white lacquered WOOD, very fine soft grain, a gentle sheen and a few tiny gold flecks. ' + STYLE
    + ' No text, no lines, no marks.')),
}
for k, what in DOORS.items():
  JOBS[f'door-{k}'] = dict(key='magenta', w=512, h=768, prompt=DOOR + what + '. No writing, no plaque. ' + STYLE + ' '
                           + fc.ON_MAGENTA)

KEPT = {'cave': 1, 'yubu-ground': 1, 'yubu-slab': 2, 'xq-board': 2, 'xq-red': 1, 'xq-black': 1, 'qq-lacquer': 1,
        'door-long': 1, 'door-hu': 2, 'door-que': 1, 'door-wu': 1}
SIZE = {'cave': 720, 'yubu-ground': 1024, 'yubu-slab': 256, 'xq-board': 512, 'xq-red': 96, 'xq-black': 96,
        'qq-lacquer': 256}


def cut():
  from PIL import Image
  OUT.mkdir(parents=True, exist_ok=True)
  for jid, seed in KEPT.items():
    j, src = JOBS[jid], fc.REVIEW / 'boards' / f'{jid}-{seed}.png'
    im = fc.key_green(src, key=j['key']) if 'key' in j else Image.open(src).convert('RGB')
    fc.save_webp(im, OUT / f'{jid}.webp', max_side=SIZE.get(jid, 256), quality=84)
    print(jid, '→', OUT / f'{jid}.webp')


if __name__ == '__main__':
  a = fc.run(JOBS)
  if a.cmd == 'paint':
    fc.paint_all('boards', JOBS, a)
  else:
    cut()
