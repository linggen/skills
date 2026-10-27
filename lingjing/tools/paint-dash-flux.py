#!/usr/bin/env python3
"""paint-dash-flux.py — 几何冲刺's things on the local FLUX (Hanli 10-27: 「调息的不太好玩, 能换成geometry dash那种蹦着躲避障碍的吗」 ·
「画面不精致…」: painted, never bare shapes).

    PY=~/.linggen/runtime/envs/pictures/bin/python
    FLUX_REVIEW=<scratch> $PY tools/paint-dash-flux.py paint [--only id,…] [--seeds 1,2,3]   # every seed, to be looked at
    FLUX_REVIEW=<scratch> $PY tools/paint-dash-flux.py cut                                   # the KEPT seeds → scripts/games/dash/art/

The runner is 气走经脉's own 灵珠 (scripts/games/qimai/art/pearl.webp) rolling along the 经脉; the lands behind it are
气走经脉's painted skies and ridges (qimai/art), the ground its cliff rock. Painted here, in the same comic style, on
green: the SPIKE (a knot of thorny black stone), the BLOCK (a carved stone block), the PAD (a talisman disc) and the
ORB (a ring of golden qi). Every seed is looked at for fake writing before it is kept.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flux_comic as fc  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'scripts' / 'games' / 'dash' / 'art'
REV = fc.REVIEW / 'dash'
NO_WRITING = 'No writing, no letters, no glyphs anywhere. '
SIDE = 'Seen straight from the SIDE, like a side-scrolling platform game, the whole thing in view. '

JOBS = {
  'spike': dict(w=512, h=512, prompt=(fc.STYLE + ' ' + SIDE + NO_WRITING +
    'ONE single tall sharp SPIKE standing upright on a flat base: a jagged knot of black-violet crystal stone with thorny '
    'barbs, a clean TRIANGLE silhouette pointing straight up, as wide at the base as it is tall, a cold purple glint on '
    'its edges. ' + fc.ON_GREEN)),
  'block': dict(w=512, h=512, prompt=(fc.STYLE + ' ' + SIDE + NO_WRITING +
    'ONE perfectly SQUARE chunky carved stone BLOCK, a cube seen flat from the front, grey-blue weathered stone with '
    'bevelled edges, a few cracks, a little green moss on its top edge, a faint carved cloud swirl on its face. '
    + fc.ON_GREEN)),
  'pad': dict(w=768, h=384, prompt=(fc.STYLE + ' ' + SIDE + NO_WRITING +
    'ONE low flat JUMP PAD lying on the ground seen from the side: a thin round golden bronze disc like a coin lying '
    'flat, glowing bright yellow light rising from its top in short upward rays, very wide and very low. '
    + fc.ON_GREEN)),
  'orb': dict(w=512, h=512, prompt=(fc.STYLE + ' ' + NO_WRITING +
    'ONE floating glowing RING of golden qi light seen face on: a perfect round hollow ring, bright yellow-gold with a '
    'white-hot inner edge, a few small sparkles round it, the middle of the ring empty. ' + fc.ON_GREEN)),
}
KEPT = {'spike': 3, 'block': 1, 'pad': 1, 'orb': 3}
SIZES = {'spike': 160, 'block': 160, 'pad': 200, 'orb': 128}


def cut():
  OUT.mkdir(parents=True, exist_ok=True)
  for jid, seed in KEPT.items():
    im = fc.key_green(REV / f'{jid}-{seed}.png', key=JOBS[jid].get('key', 'green'))
    fc.save_webp(im, OUT / f'{jid}.webp', max_side=SIZES[jid])
    print(jid, '→', OUT / f'{jid}.webp', im.size)


if __name__ == '__main__':
  a = fc.run(JOBS)
  if a.cmd == 'paint':
    fc.paint_all('dash', JOBS, a)
  else:
    cut()
