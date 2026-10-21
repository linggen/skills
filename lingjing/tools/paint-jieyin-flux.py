#!/usr/bin/env python3
"""paint-jieyin-flux.py — 结印's 火蛋 painted by the local FLUX (never Codex; the house's comic style, flux_comic.STYLE).

    PY=~/.linggen/runtime/envs/pictures/bin/python
    $PY tools/paint-jieyin-flux.py paint [--only id,…] [--seeds 1,2,3]   # every seed → $FLUX_REVIEW/jieyin/, to be looked at
    $PY tools/paint-jieyin-flux.py cut                                    # the KEPT seeds → scripts/games/jieyin/art/

The rest of the scene is 守墙关's (the 山道, 小满 casting, the beasts: game-kit.md § Shared assets); only the 火蛋 is new.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flux_comic as fc

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'scripts' / 'games' / 'jieyin' / 'art'

JOBS = {
  'huodan': dict(w=640, h=640, prompt=(
    'ONE round plump egg made of fire for a cartoon spell, an egg shape of glowing orange-yellow flame with a hot white '
    'core, a little crack of light across its shell, three cheeky curling flame tufts on its top like a hair curl, '
    'a short tail of sparks behind it, seen from the side. No face. ' + fc.STYLE + ' ' + fc.ON_MAGENTA)),
  'fizzle': dict(w=640, h=640, prompt=(
    'ONE small comic puff of grey-black smoke with a few tiny dying orange sparks and one sad little curl of smoke on '
    'top, a fizzled spell, seen from the front. No face. ' + fc.STYLE + ' ' + fc.ON_GREEN), key='green'),
}

# 法术试炼 (games/doufa.js, 手势斗法): each move's sprite, in the same comic house style (Hanli 10-21: 「OK … 可以开始做了」).
FX = {
  'bingzhui': 'ONE sharp icicle spike of pale blue ice flying point-first to the right, frosty white edges, a few ice sparkles behind it',
  'jinren': 'ONE curved crescent blade of shining golden-white metal energy flying to the right, like a thin glowing sickle moon, a bright edge',
  'muteng': 'ONE thick coil of green magic vine with small leaves, curled in a loose ring like a lasso, glowing faintly green',
  'tuqiang': 'ONE short thick wall of packed brown earth and stones rising from the ground, wider than tall, chunks of soil on top',
  'feijian': 'ONE small slim flying sword pointing to the right, polished steel blade with a blue glow and a short red tassel on the hilt',
  'zhangfeng': 'ONE swirling gust of wind shaped like a big curling wave, pale blue-white swooshes and motion lines, moving to the right',
  'quanjin': 'ONE round shockwave ring bursting on the ground, a cracked dusty ring with flying pebbles and yellow dust, seen from the front and a little above',
  'dianxue': 'ONE small glowing golden star-shaped seal spark, like a tiny eight-pointed light burst with a ring around it',
  'steam': 'ONE big puffy cloud of white steam bursting outward, round billows with soft grey shading, a few water droplets',
}
for k, what in FX.items():
  JOBS[k] = dict(w=640, h=640, prompt=what + ', for a cartoon spell effect in a game. No face, no hands, no people. ' + fc.STYLE + ' ' + fc.ON_MAGENTA)

# Looked at 2026-10-21 (3 seeds each): huodan 1 the plumpest flame egg with the crack and curl; the fizzle prompt
# came out as a charred egg with a wisp of smoke (seed 3) — kept, it reads as 走火 better than a puff.
KEPT = {'huodan': 1, 'fizzle': 3,
        # 法术试炼, looked at 2026-10-21 (2 seeds each): every one reads its move by shape — spike, crescent, vine ring, earth
        # wall, sword, wind curl, cracked shock ring, golden star, steam cloud.
        'bingzhui': 2, 'jinren': 1, 'muteng': 1, 'tuqiang': 1, 'feijian': 1, 'zhangfeng': 1, 'quanjin': 2, 'dianxue': 1, 'steam': 1}


def cut():
  OUT.mkdir(parents=True, exist_ok=True)
  for jid, seed in KEPT.items():
    src = fc.REVIEW / 'jieyin' / f'{jid}-{seed}.png'
    im = fc.key_green(src, key=JOBS[jid].get('key', 'magenta'))
    fc.save_webp(im, OUT / f'{jid}.webp', max_side=256)
    print(jid, '→ done')


if __name__ == '__main__':
  a = fc.run(JOBS)
  if a.cmd == 'paint':
    fc.paint_all('jieyin', JOBS, a)
  else:
    cut()
