#!/usr/bin/env python3
"""paint-zhazhai-flux.py — 砸寨's code-drawn parts repainted by the local FLUX (Hanli 10-20: 「代码画的都查一下, 用flux画吧」).

    PY=~/.linggen/runtime/envs/pictures/bin/python
    $PY tools/paint-zhazhai-flux.py paint [--only id,…] [--seeds 1,2,3]   # every seed → $FLUX_REVIEW/zhazhai/, to be looked at
    $PY tools/paint-zhazhai-flux.py cut                                    # the KEPT seeds → art/games/zhazhai/flux/

Then `python3 tools/zhazhai/atlas.py && (cd tools/zhazhai && npm run build)`: atlas.py reads art/games/zhazhai/flux/
for the block materials, the basket, the slingshot's boulder and the parallax layers (frame names and sizes kept).
Codex painted the weasels, the throws and the fork (tools/paint-zhazhai.py); FLUX paints what atlas.py used to draw.
Style: flux_comic.STYLE (the comic ruling); the green/magenta ground is keyed out (flux_comic.key_green).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flux_comic as fc

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'worlds' / 'jiuding' / 'art' / 'games' / 'zhazhai' / 'flux'
WEASEL = HERE.parent / 'scripts' / 'games' / 'zhazhai' / 'art' / 'weasel-m.webp'

TEX = ('A seamless flat texture filling the WHOLE picture edge to edge, seen straight on, no object outline, no '
       'perspective, evenly lit, in the cartoon game style: ')
JOBS = {
  'basket': dict(key='magenta', w=768, h=512, prompt=(
    'ONE big empty round woven bamboo basket (a wide low Chinese farm basket), seen from the front and a little from '
    'above so its round open mouth shows as a wide oval with the dark inside visible, golden straw-yellow bamboo '
    'strips in a criss-cross weave, a thick bound rim of bamboo with dark lashings, slightly wider at the top than '
    'the foot. Empty. ' + fc.STYLE + ' ' + fc.ON_MAGENTA)),
  'boulder': dict(key='magenta', w=768, h=512, prompt=(
    'ONE squat wide grey boulder, a low flat-topped rock twice as wide as it is tall, a few tufts of bright green '
    'moss and grass on top, chipped facets. ' + fc.STYLE + ' ' + fc.ON_MAGENTA)),
  'tex-wood': dict(w=768, h=512, prompt=TEX + 'warm orange-brown wooden planks laid horizontally, chunky wood grain '
    'lines and knots, dark plank seams, a few iron nail heads. ' + fc.STYLE + ' ' + fc.SCENE),
  'tex-tile': dict(w=768, h=512, prompt=TEX + 'rows of overlapping celadon-green glazed Chinese roof tiles (scalloped '
    'pantiles), shiny glaze highlights, dark grooves between rows. ' + fc.STYLE + ' ' + fc.SCENE),
  'tex-stone': dict(w=768, h=512, prompt=TEX + 'a dressed grey stone block wall, chunky rectangular stones in '
    'staggered courses with dark mortar lines, a few chips and flecks of green moss. ' + fc.STYLE + ' ' + fc.SCENE),
  'tex-iron': dict(w=768, h=512, prompt=TEX + 'dark blue-grey riveted iron plate, rows of round rivets, brushed metal '
    'with a soft sheen, a bolted iron band. ' + fc.STYLE + ' ' + fc.SCENE),
  'tex-keg': dict(w=768, h=512, prompt=('A close-up of the curved side of a big wooden gunpowder barrel filling the '
    'WHOLE picture edge to edge: wide vertical wooden staves painted glossy red side by side with dark seams between '
    'them, two thick black iron hoops with rivets running straight across the picture at one quarter and three '
    'quarters of its height. Only the barrel surface, no background. ' + fc.STYLE + ' ' + fc.SCENE)),
  'far': dict(key='magenta', w=1024, h=448, prompt=(
    'A wide panorama of distant soft blue-green karst mountains (tall rounded Guilin sugar-loaf peaks) with a tiny '
    'pagoda on one peak, wisps of mist at their feet, pale and hazy far away, spread across the whole width. The '
    'mountains rise from the bottom edge; above them the background is flat solid MAGENTA (#FF00FF). '
    + fc.STYLE + ' ' + fc.SCENE)),
  'mid': dict(key='magenta', w=1024, h=448, prompt=(
    'A wide panorama of blue-green karst hills, rounded sugar-loaf peaks of different heights with a few pine trees '
    'and a little red-roofed pavilion on one ridge, rising from the bottom edge across the whole width and running '
    'off both sides. Above the peaks the background is flat solid MAGENTA (#FF00FF). ' + fc.STYLE + ' ' + fc.SCENE)),
  'log': dict(key='magenta', w=512, h=512, prompt=(
    'ONE round sawn log end seen straight on, a perfect circle: pale wood with brown growth rings, bark round the '
    'edge, a crack or two. ' + fc.STYLE + ' ' + fc.ON_MAGENTA)),
  'near': dict(key='magenta', w=1024, h=448, prompt=(
    'A wide panorama of rolling bright green grassy hills with clumps of round cartoon pine trees and a few rice '
    'terraces, spread across the whole width, the hills filling the lower half and running off both sides. Above '
    'the hills the background is flat solid MAGENTA (#FF00FF). ' + fc.STYLE + ' ' + fc.SCENE)),
  'select': dict(w=1024, h=1024, prompt=(
    'A bright cheerful landscape backdrop for a cartoon game menu: a pale blue sky with a few puffy white clouds in '
    'the upper half, far blue karst peaks with a little pagoda, then rolling green hills with round pine trees and '
    'a thatched village roof or two in the lower third, soft and light so menu buttons read over it. '
    + fc.STYLE + ' ' + fc.SCENE)),
}

# id: seed — each seed looked at 2026-10-20 (one subject, no fake glyphs, on-model): basket 2 (deep, the mouth
# open), boulder 2 (the widest, flat-topped), wood 2, tile 2 (pantiles read as 瓦; 1 was fish-scale), stone 2
# (staggered courses), iron 2, far 3 (the pagoda peak), near 1 (pines and terraces).
KEPT = {'basket': 2, 'boulder': 2, 'tex-wood': 2, 'tex-tile': 2, 'tex-stone': 2, 'tex-iron': 2, 'far': 3, 'near': 1, 'select': 1, 'tex-keg': 1, 'mid': 1, 'log': 1}
# The basket's open mouth (the inner edge of its rim), measured on the kept seed in its 768×512 picture: centre,
# radii. atlas.py cuts it out of basket-front so the throws sit inside.
MOUTH = {'cx': 383, 'cy': 208, 'rx': 228, 'ry': 110}


def cut():
  OUT.mkdir(parents=True, exist_ok=True)
  for jid, seed in KEPT.items():
    j = JOBS[jid]
    src = fc.REVIEW / 'zhazhai' / f'{jid}-{seed}.png'
    if 'key' in j:
      im = fc.key_green(src, trim=jid not in ('far', 'mid', 'near'), key=j['key'])
    else:
      from PIL import Image
      im = Image.open(src).convert('RGBA')
    if jid == 'basket':  # the mouth as fractions of the trimmed picture (key_green trims to the alpha's bbox)
      import json
      from PIL import Image
      full = fc.key_green(src, trim=False, key=j['key'])
      x0, y0, x1, y1 = full.getbbox()
      W, H = x1 - x0, y1 - y0
      m = {'cx': (MOUTH['cx'] - x0) / W, 'cy': (MOUTH['cy'] - y0) / H, 'rx': MOUTH['rx'] / W, 'ry': MOUTH['ry'] / H}
      (OUT / 'basket.json').write_text(json.dumps({k: round(v, 4) for k, v in m.items()}) + '\n')
    fc.save_webp(im, OUT / f'{jid}.webp', quality=90)
    print(jid, '→', OUT / f'{jid}.webp')


if __name__ == '__main__':
  a = fc.run(JOBS)
  if a.cmd == 'paint':
    fc.paint_all('zhazhai', JOBS, a)
  else:
    cut()
