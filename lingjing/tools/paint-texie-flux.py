#!/usr/bin/env python3
"""paint-texie-flux.py — 施法特写's 小满 in side profile, painted by the local FLUX (never Codex; the house's comic style,
flux_comic.STYLE), an edit pass from 守墙关's comic 小满 (art/games/shouqiang/xiaoman-idle.webp) so he is the same boy.

    PY=~/.linggen/runtime/envs/pictures/bin/python
    $PY tools/paint-texie-flux.py paint [--only id,…] [--seeds 1,2,3]   # every seed → $FLUX_REVIEW/texie/, to be looked at
    $PY tools/paint-texie-flux.py cut                                    # the KEPT seed → scripts/games/texie/art/

The close-up (games/texie.js, the ink version) lays his hands over this picture as live ink strokes, so the painting
keeps his arms down and out of the way: only the head, shoulders and chest, facing right.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flux_comic as fc

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'scripts' / 'games' / 'texie' / 'art'
XIAOMAN = HERE.parent / 'worlds' / 'jiuding' / 'art' / 'games' / 'shouqiang' / 'xiaoman-idle.webp'

JOBS = {
  'xiaoman-side': dict(w=768, h=768, refs=[XIAOMAN], key='magenta', prompt=(
    'The attached image is the MASTER drawing of this boy: draw the SAME boy, same face, black hair in a small topknot '
    'tied with a red cord, the same off-white hemp tunic with a dark sash, in the same cartoon style. A close-up BUST '
    'PORTRAIT in strict SIDE PROFILE facing RIGHT: only his head, neck, shoulders and upper chest, cut off at the '
    'chest. His eyes narrowed in fierce concentration, mouth set, a determined frown, looking straight ahead to the '
    'right. His arms hang down out of the picture: NO hands, NO fingers, NO arms raised. ' + fc.STYLE + ' '
    + fc.ON_MAGENTA)),
}

# Looked at 2026-10-21 (4 seeds): 1 the truest profile facing right, no hands, no glyphs (2–4 turn toward us).
KEPT = {'xiaoman-side': 1}


def cut():
  OUT.mkdir(parents=True, exist_ok=True)
  for jid, seed in KEPT.items():
    src = fc.REVIEW / 'texie' / f'{jid}-{seed}.png'
    im = fc.key_green(src, key=JOBS[jid].get('key', 'green'))
    fc.save_webp(im, OUT / f'{jid}.webp', max_side=512)
    print(jid, '→ done')


if __name__ == '__main__':
  a = fc.run(JOBS)
  if a.cmd == 'paint':
    fc.paint_all('texie', JOBS, a)
  else:
    cut()
