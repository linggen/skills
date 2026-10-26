#!/usr/bin/env python3
"""paint-huarong-crowd-flux.py — 华容道's crowd level (人堆, 第三回's 码头: 小满 slips behind the porters out of the white
robe's sight; doc/games.md § 全文后的小游戏), painted by the local FLUX in the kit's own cartoon style.

    PY=~/.linggen/runtime/envs/pictures/bin/python
    $PY tools/paint-huarong-crowd-flux.py paint [--only id,…] [--seeds 1,2,3]   # every seed → $FLUX_REVIEW/huarong-crowd/
    $PY tools/paint-huarong-crowd-flux.py cut                                    # the KEPT seeds → worlds/jiuding/art/games/huarong-crowd/

小满 (the 2×2) is the kit's own k.webp — the same boy in every game. The other blocks are the 码头's people and
their loads, seen from above at an angle as the cave's rocks are: a porter standing (1×2), a shoulder pole of
baskets (2×1), a squatting child (1×1); the floor is the wet earth of the landing.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flux_comic as fc

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'worlds' / 'jiuding' / 'art' / 'games' / 'huarong-crowd'
PEOPLE = 'Ancient Chinese villagers in plain patched cotton, no modern clothes.'

JOBS = {
  'v': dict(w=384, h=768, key='magenta', prompt=(
    'ONE tall broad-shouldered ancient Chinese porter standing upright, seen whole from head to straw sandals, his back half '
    'turned, a rolled cloth on his shoulder, twice as tall as he is wide, filling the tall picture. ' + PEOPLE + ' ' + fc.STYLE
    + ' ' + fc.ON_MAGENTA)),
  'h': dict(w=768, h=384, key='magenta', prompt=(
    'ONE bamboo shoulder pole lying flat across the picture with a heavy woven basket of grain hanging at each end, '
    'twice as wide as it is tall, filling the wide picture. ' + fc.STYLE + ' ' + fc.ON_MAGENTA)),
  's': dict(w=512, h=512, key='magenta', prompt=(
    'ONE small ancient Chinese village child squatting and hugging his knees, round and chunky, roughly as wide as he is '
    'tall, filling the picture. ' + PEOPLE + ' ' + fc.STYLE + ' ' + fc.ON_MAGENTA)),
  'floor': dict(w=768, h=960, prompt=(
    'Seen from straight above: plain wet brown earth of a river landing, smooth, a few faint footprints and puddle '
    'gleams, a little grey mist at the very edges; NO people, NO boats, nothing standing up; evenly lit, a flat texture '
    'filling the WHOLE picture edge to edge. ' + fc.STYLE + ' ' + fc.SCENE)),
}

# Looked at 2026-10-26 (2 seeds each): v 2 (the porter, a rolled cloth on his shoulder), h 1 (grain baskets), s 1, floor 1.
KEPT = {'v': 2, 'h': 1, 's': 1, 'floor': 1}
SIZE = {'v': (160, 320), 'h': (320, 160), 's': (160, 160), 'floor': (480, 600)}


def cut():
  from PIL import Image
  for jid, seed in KEPT.items():
    src = fc.REVIEW / 'huarong-crowd' / f'{jid}-{seed}.png'
    w, h = SIZE[jid]
    if jid == 'floor':
      im = Image.open(src).convert('RGB').resize((w, h), Image.LANCZOS)
      im.save(OUT / 'floor.webp', 'WEBP', quality=80, method=6)
      continue
    im = fc.key_green(src, key='magenta')
    k = min(w * 0.94 / im.width, h * 0.94 / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    tile = Image.new('RGBA', (w, h))
    tile.alpha_composite(im, ((w - im.width) // 2, (h - im.height) // 2))
    fc.save_webp(tile, OUT / f'{jid}.webp', quality=86)
    print(jid, '→', OUT / f'{jid}.webp')


if __name__ == '__main__':
  a = fc.run(JOBS)
  if a.cmd == 'paint':
    fc.paint_all('huarong-crowd', JOBS, a)
  else:
    OUT.mkdir(parents=True, exist_ok=True)
    cut()
