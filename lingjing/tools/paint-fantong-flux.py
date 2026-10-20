#!/usr/bin/env python3
"""paint-fantong-flux.py — 喂饭桶's picture painted by the local FLUX (Hanli 10-20: 「代码画的都查一下, 用flux画吧」).

    PY=~/.linggen/runtime/envs/pictures/bin/python
    $PY tools/paint-fantong-flux.py paint [--only id,…] [--seeds 1,2,3]   # every seed → $FLUX_REVIEW/fantong/
    $PY tools/paint-fantong-flux.py cut                                    # the KEPT seeds → scripts/games/fantong/

fantong.js drawBucket drew the woodshed in ink lines: the woodpile, the 饭桶 (the book's copper furnace that opens
when it feels like it), the 丹田 bowl. Now they are comic pictures; the code keeps only what moves or counts — the
bowl's water line (qi left), the row of seals (things fed), the splash when it spits. pot-open is an edit pass
from pot-shut, so it is the same pot with its lid up.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flux_comic as fc

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'scripts' / 'games' / 'fantong'
REVIEW = fc.REVIEW / 'fantong'

JOBS = {
  'pot-shut': dict(w=640, h=576, key='magenta', prompt=(
    'ONE squat round old copper furnace pot with a big round shiny copper belly, three short stubby legs, two small '
    'ring handles, a domed copper lid shut tight, dents and green patina spots, a stubborn sleepy look about it, '
    'seen from the front. No writing anywhere. ' + fc.STYLE + ' ' + fc.ON_MAGENTA)),
  'woodpile': dict(w=768, h=448, key='magenta', prompt=(
    'ONE low stack of split firewood logs piled crosswise, pale split ends and brown bark, seen from the front. '
    + fc.STYLE + ' ' + fc.ON_MAGENTA)),
  'bowl': dict(w=640, h=448, key='magenta', prompt=(
    'ONE wide shallow empty blue-and-white porcelain bowl seen from the front and a little above, a soft pale-blue '
    'spirit glow inside it. No writing. ' + fc.STYLE + ' ' + fc.ON_MAGENTA)),
}
OPEN = dict(w=640, h=576, key='magenta', prompt=(
  'The attached image is the MASTER drawing of this copper furnace pot: draw the SAME pot, same colours, same outline, '
  'same size and place, only its domed lid is popped up and tilted open, a warm golden glow and a puff of steam '
  'coming out of the gap. ' + fc.ON_MAGENTA))

# Looked at 2026-10-20 (3 seeds each): pot-shut 3 (half-lidded, unimpressed: the pot that opens when it feels like
# it), woodpile 2, bowl 1; pot-open 2 (the lid flipped up, steam).
KEPT = {'pot-shut': 3, 'woodpile': 2, 'bowl': 1, 'pot-open': 2}


def jobs():
  j = dict(JOBS)
  shut = KEPT.get('pot-shut')
  if shut:
    j['pot-open'] = dict(OPEN, refs=[REVIEW / f'pot-shut-{shut}.png'])
  return j


def cut():
  OUT.mkdir(parents=True, exist_ok=True)
  from PIL import Image
  J = jobs()
  ims = {jid: fc.key_green(REVIEW / f'{jid}-{seed}.png', key=J[jid]['key']) for jid, seed in KEPT.items()}
  pots = [k for k in ims if k.startswith('pot-')]  # one canvas, feet on its floor: the pot keeps its size as the lid lifts
  W, H = max(ims[k].width for k in pots), max(ims[k].height for k in pots)
  for k in pots:
    c = Image.new('RGBA', (W, H)); c.alpha_composite(ims[k], ((W - ims[k].width) // 2, H - ims[k].height)); ims[k] = c
  for jid, im in ims.items():
    fc.save_webp(im, OUT / f'{jid}.webp', max_side=320)
    print(jid, '→', OUT / f'{jid}.webp', im.size)


if __name__ == '__main__':
  a = fc.run(JOBS)
  if a.cmd == 'paint':
    fc.paint_all('fantong', jobs(), a)
  else:
    cut()
