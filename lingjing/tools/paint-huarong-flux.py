#!/usr/bin/env python3
"""paint-huarong-flux.py — 华容道's pieces painted by the local FLUX (Hanli 10-20: 「代码画的都查一下, 用flux画吧」).

    PY=~/.linggen/runtime/envs/pictures/bin/python
    $PY tools/paint-huarong-flux.py paint [--only id,…] [--seeds 1,2,3]   # every seed → $FLUX_REVIEW/huarong/
    $PY tools/paint-huarong-flux.py cut                                    # the KEPT seeds → scripts/games/huarong/

The blocks were flat CSS tiles with a glyph (你 / 岩 / 藤 / 石); now each kind is a painted tile, shown as the
block's background (huarong.css), the glyph kept only as the button's aria-label. 小满 (the 2×2 你) is an edit
pass from 守墙's comic 小满 (art/games/shouqiang/xiaoman-idle.webp) so he is the same boy in every game.
Tiles are painted to their block's shape (2×2 square, 1×2 tall, 2×1 wide, 1×1) on a flat colour that is keyed
out, then cropped to the shape and laid on a rounded tile of the cave floor.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flux_comic as fc

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'scripts' / 'games' / 'huarong'
XIAOMAN = HERE.parent / 'worlds' / 'jiuding' / 'art' / 'games' / 'shouqiang' / 'xiaoman-idle.webp'

JOBS = {
  'k': dict(w=512, h=512, refs=[XIAOMAN], key='magenta', prompt=(
    'The attached image is the MASTER drawing of this boy: draw the SAME boy, same face, hair, clothes and colours, '
    'in the same cartoon style. He is squeezed in a tight spot, crouching with both hands pushing against the sides, '
    'looking up with a determined grin, his whole body filling a SQUARE. ' + fc.STYLE + ' ' + fc.ON_MAGENTA)),
  'v': dict(w=384, h=768, key='magenta', prompt=(
    'ONE tall upright grey cave boulder, a standing slab of rock twice as tall as it is wide, chunky facets, a crack '
    'and a little moss, filling the tall picture. ' + fc.STYLE + ' ' + fc.ON_MAGENTA)),
  'h': dict(w=768, h=384, key='magenta', prompt=(
    'ONE thick fallen log lying flat across the picture, wrapped in a tangle of green jungle vines with a few leaves, '
    'twice as wide as it is tall, filling the wide picture. ' + fc.STYLE + ' ' + fc.ON_MAGENTA)),
  's': dict(w=512, h=512, key='magenta', prompt=(
    'ONE round chunky grey cave rock, a lumpy stone roughly as wide as it is tall with a couple of chips and a fleck '
    'of moss, filling the picture. ' + fc.STYLE + ' ' + fc.ON_MAGENTA)),
  'floor': dict(w=768, h=960, prompt=(
    'Seen from straight above: plain warm brown packed earth of a cave floor, smooth, with only faint cracks, tiny '
    'specks of grit and a little dark moss at the very edges; NO rocks, NO stones, NO boulders, nothing standing up; '
    'evenly lit, a flat texture filling the WHOLE picture edge to edge. ' + fc.STYLE + ' '
    + fc.SCENE)),
}

# Looked at 2026-10-20 (3 seeds each): k 1 (小满 on-model, arms out pushing), v 1 (a standing slab), h 3 (the vines
# read best), s 2 (round, mossy), floor 5 (plain earth, muted: seeds 1–3 painted rocks that read as pieces).
KEPT = {'k': 1, 'v': 1, 'h': 3, 's': 2, 'floor': 5}
SIZE = {'k': (320, 320), 'v': (160, 320), 'h': (320, 160), 's': (160, 160), 'floor': (480, 600)}


def cut():
  from PIL import Image
  for jid, seed in KEPT.items():
    src = fc.REVIEW / 'huarong' / f'{jid}-{seed}.png'
    w, h = SIZE[jid]
    if jid == 'floor':
      im = Image.open(src).convert('RGB').resize((w, h), Image.LANCZOS)
      im.save(OUT / 'floor.webp', 'WEBP', quality=80, method=6)
      print('floor →', OUT / 'floor.webp')
      continue
    im = fc.key_green(src, key='magenta')
    k = min(w * 0.94 / im.width, h * 0.94 / im.height)
    sy = min(1.5, h * 0.8 / (im.height * k)) if jid == 'h' else 1  # a log is slim: let it fill the tile a little
    im = im.resize((round(im.width * k), round(im.height * k * max(1, sy))), Image.LANCZOS)
    tile = Image.new('RGBA', (w, h))
    tile.alpha_composite(im, ((w - im.width) // 2, (h - im.height) // 2))
    fc.save_webp(tile, OUT / f'{jid}.webp', quality=86)
    print(jid, '→', OUT / f'{jid}.webp')


if __name__ == '__main__':
  a = fc.run(JOBS)
  if a.cmd == 'paint':
    fc.paint_all('huarong', JOBS, a)
  else:
    OUT.mkdir(parents=True, exist_ok=True)
    cut()
