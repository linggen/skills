#!/usr/bin/env python3
"""paint-xiaoman-flux.py — 小满's two 守墙关 frames without the blade (Hanli 10-20: 「小满手上的剑, 不要剑锋对着自己,
有点奇怪. 几个游戏里都是这样」). The Codex frames had a flying sword baked in beside his raised hand, its tip DOWN at
him (idle), and a blade under the talisman he flings (cast). An edit pass from each frame keeps the same boy, pose,
outline and size and leaves the hand empty; the games draw the hovering sword as its own sprite, tip up-field.
小满's frames are shared: 守墙关 (idle + cast), 撒豆成兵 (cast). 华容道's pushing 小满 and 喷嚏's never had a blade.

    PY=~/.linggen/runtime/envs/pictures/bin/python
    $PY tools/paint-xiaoman-flux.py paint [--seeds 1,2,3]   # → $FLUX_REVIEW/xiaoman/, looked at
    $PY tools/paint-xiaoman-flux.py cut                      # KEPT → art/games/shouqiang/ + scripts/games/shouqiang/art/
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flux_comic as fc
from PIL import Image

HERE = Path(__file__).resolve().parent
SRC = HERE.parent / 'worlds' / 'jiuding' / 'art' / 'games' / 'shouqiang'
OUT = HERE.parent / 'scripts' / 'games' / 'shouqiang' / 'art'
REV = fc.REVIEW / 'xiaoman'
MASTER = ('The attached picture is the MASTER drawing of this boy: draw the SAME boy, the same pose, the same view from '
          'behind and above, the same clothes, hair, colours, outline and size. ')
JOBS = {
  'xiaoman-idle': dict(w=640, h=576, refs=[SRC / 'xiaoman-idle.green.webp'], key='green', prompt=(
    MASTER + 'His raised right hand makes the two-finger sword sign and is EMPTY: there is NO sword, no blade, no weapon '
    'and no glow anywhere in the picture. ' + fc.ON_GREEN)),
  'xiaoman-cast': dict(w=640, h=576, refs=[SRC / 'xiaoman-cast.green.webp'], key='green', prompt=(
    MASTER + 'His raised hand flings ONE glowing yellow paper talisman bursting into light; there is NO sword, no blade, '
    'no weapon anywhere in the picture. ' + fc.ON_GREEN)),
}
# Looked at 2026-10-20 (3 seeds each): every seed lost the blade and kept the boy; seed 1 of each is the closest to
# its master's pose and line.
KEPT = {'xiaoman-idle': 1, 'xiaoman-cast': 1}


def cut():
  for jid, seed in KEPT.items():
    src = REV / f'{jid}-{seed}.png'
    Image.open(src).convert('RGB').save(SRC / f'{jid}.green.webp', 'WEBP', quality=90)
    im = fc.key_green(src)
    fc.save_webp(im, SRC / f'{jid}.webp')
    old = Image.open(OUT / f'{jid}.webp')
    fc.save_webp(im, OUT / f'{jid}.webp', max_side=max(old.size))
    print(jid, '→', OUT / f'{jid}.webp')


if __name__ == '__main__':
  a = fc.run(JOBS)
  fc.paint_all('xiaoman', JOBS, a) if a.cmd == 'paint' else cut()
