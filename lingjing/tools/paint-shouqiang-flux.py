#!/usr/bin/env python3
"""paint-shouqiang-flux.py — 守墙关's 药园 levels (2–5, the talisman lanes) painted by the local FLUX
(Hanli 10-20: 「植物大战僵尸方向好」「药园正好符合」; Codex is out of credits).

    PY=~/.linggen/runtime/envs/pictures/bin/python
    $PY tools/paint-shouqiang-flux.py paint [--only id,…] [--seeds 1,2]   # every seed → $FLUX_REVIEW/shouqiang/, looked at
    $PY tools/paint-shouqiang-flux.py cut                                  # the KEPT seeds → scripts/games/shouqiang/art/

Every piece is an EDIT pass from 守墙关's own art, so the set stays one style: the 药园 at night from the 山道
background, the 药园's low stone wall from the 山门 wall, the five talisman units from the fire talisman, the seed
icons from the 剑阵 medallion, the 灵气 orb from 银月's fox-fire. A unit's second frame (attack / active) is an
edit pass from its first, so it is the same object. The camera is 守墙关's: high behind the wall, looking up the
field; beasts come down toward us. Every seed is looked at for fake writing before it is kept.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flux_comic as fc

HERE = Path(__file__).resolve().parent
SRC = HERE.parent / 'worlds' / 'jiuding' / 'art' / 'games' / 'shouqiang'
OUT = HERE.parent / 'scripts' / 'games' / 'shouqiang' / 'art'
REV = fc.REVIEW / 'shouqiang'

STYLE_OF = ('The attached picture shows this game\'s art style: draw a NEW subject in exactly that style (the same bold '
            'dark-brown outline, flat cel shading, saturated colours and glossy highlight), not the attached subject. ')
VIEW = 'Seen from the front and a little from above, standing upright on the ground, the whole thing in view. '
NO_WRITING = 'No writing, no letters, no glyphs anywhere: only swirls and shapes. '

UNITS = {
  'jian': ('A Taoist SWORD TALISMAN post: a short wooden stake driven into the soil, a long yellow paper talisman '
           'pasted down its front with red brush swirls, a glowing silver-blue flying sword hovering point-up above it, '
           'a soft blue glow.'),
  'juling': ('A small SPIRIT-GATHERING ARRAY on the ground: a ring of seven little round white stones set in a circle on '
             'a patch of soil, faint glowing cyan lines joining them, a small glowing pale-blue spirit orb hovering in '
             'the middle, a few sparkles.'),
  'tu': ('An EARTH-WALL TALISMAN: a squat thick block of rammed yellow-brown earth, as wide as it is tall, chunky and '
         'solid, with one yellow paper talisman pasted on its front, a little grass on top.'),
  'han': ('A FROST TALISMAN post: a short wooden stake in the soil, a pale blue paper talisman down its front with white '
          'swirls, ice crystals growing over the stake, a hovering icy blue crystal shard point-up above it, cold mist.'),
  'lei': ('A THUNDER TALISMAN: a purple-and-yellow paper talisman standing upright on a small stone, crackling with '
          'bright purple-white lightning sparks, a tiny dark storm cloud above it.'),
}
ACTIVE = {
  'jian': 'the same post FIRING: the flying sword shooting straight UP off the top of the picture with a bright blue streak, the talisman flaring with light',
  'juling': 'the same array ACTIVE: the stones glowing bright, the spirit orb swollen big and bright, rising up in a burst of light',
  'tu': 'the same earth block BATTERED: deep cracks across it, chunks bitten out of its top corners, the talisman torn and half peeling',
  'han': 'the same post FIRING: the icy shard shooting straight UP with a frosty white-blue streak, frost flaring round it',
  'lei': 'the same talisman EXPLODING: a big round burst of purple-white lightning and light blasting outward from it',
}
ICONS = {
  'seed-jian': ('deep blue to bright cyan', 'ONE glowing silver flying sword point-up over a yellow paper talisman'),
  'seed-juling': ('teal to pale green', 'a ring of small white stones round a glowing pale-blue spirit orb'),
  'seed-tu': ('brown to golden ochre', 'a chunky block of rammed earth with a yellow talisman on it'),
  'seed-han': ('navy to icy cyan', 'an icy blue crystal shard over a pale blue talisman, frost round it'),
  'seed-lei': ('dark purple to violet', 'a talisman crackling with a bright purple-white lightning burst'),
}

JOBS = {
  'yaoyuan-bg': dict(w=768, h=1152, refs=[SRC / 'bg.webp'], scene=True, prompt=(
    STYLE_OF + 'A TALL PORTRAIT game background, TOP-DOWN 3/4 VIEW from above: a Taoist temple HERB GARDEN on a mountain '
    'slope AT NIGHT under a full moon. FIVE long straight raised herb BEDS run from the top edge of the picture straight '
    'down to the bottom edge, side by side, evenly spaced, each bed dark tilled soil planted with rows of small leafy '
    'spirit herbs whose leaves glow faintly pale green-blue, with narrow trodden earth paths between the beds. At the very '
    'top, dark pine woods and rocks fade into night mist. Moonlight cool blue, deep navy shadows, a few fireflies. '
    'NO characters, NO creatures, NO buildings, NO wall. ' + fc.SCENE)),
  # The edit pass kept the 山道's vanishing point (two beds converging): the field must be flat, five beds parallel.
  'yaoyuan-flat': dict(w=768, h=1152, scene=True, prompt=(
    'A TALL PORTRAIT top-down game map seen from STRAIGHT ABOVE, flat, orthographic, no perspective, no vanishing point: '
    'a Taoist herb garden AT NIGHT. FIVE identical straight vertical raised HERB BEDS, perfectly parallel, side by side, '
    'each the same width, running from the top edge to the bottom edge of the picture like five long stripes; each bed '
    'dark tilled soil with neat rows of small leafy spirit herbs whose leaves glow faintly pale cyan; narrow dark earth '
    'paths between the beds. Cool blue moonlight, navy shadows, a few fireflies. ' + fc.STYLE + ' ' + fc.SCENE)),
  'bed': dict(w=384, h=1152, scene=True, prompt=(
    'Seen from STRAIGHT ABOVE, flat, no perspective: ONE long straight vertical raised herb BED filling the whole picture '
    'edge to edge, dark tilled soil with neat rows of small leafy spirit herbs whose leaves glow faintly pale cyan, a '
    'low rim of packed earth along its left and right sides, at NIGHT under cool blue moonlight. ' + fc.STYLE + ' '
    + fc.SCENE)),
  'yaoyuan-wall': dict(w=1024, h=512, refs=[SRC / 'wall.green.webp'], key='green', prompt=(
    'The attached picture is a long wall prop in this game. Draw the SAME kind of long straight prop running across the '
    'whole width, the same top-down 3/4 view from behind and above, but now it is a LOW rough FIELDSTONE GARDEN WALL of '
    'grey and brown stones, knee-high, moss and little ferns on it, a short bamboo fence along its top, two small paper '
    'lanterns on bamboo poles glowing warm orange at the left and right ends, no towers, no roofs, no banners. '
    + NO_WRITING + fc.ON_GREEN)),
  'orb': dict(w=512, h=512, refs=[SRC / 'fu-han.green.webp'], key='magenta', prompt=(
    STYLE_OF + 'ONE round glowing SPIRIT ORB: a soft bright pale-cyan and white ball of light with a little swirl of '
    'mist inside it, a ring of sparkles round it, glossy. ' + fc.ON_MAGENTA)),
}
for k, what in UNITS.items():
  JOBS[f'unit-{k}'] = dict(w=512, h=640, refs=[SRC / 'fu-huo.green.webp'], key='magenta',
                           prompt=STYLE_OF + 'ONE ' + what + ' ' + VIEW + NO_WRITING + fc.STYLE + ' ' + fc.ON_MAGENTA)
for k, (bg, what) in ICONS.items():
  JOBS[k] = dict(w=512, h=512, refs=[SRC / 'icon-jian-more.green.webp'], key='green', prompt=(
    'The attached picture is the MASTER skill icon: draw the SAME round medallion, the same thick shiny gold rim, the '
    f'same rendering and size; only change the background gradient to {bg} and the emblem inside to: {what}. '
    'No text, no numbers. ' + fc.ON_GREEN))

# Looked at 2026-10-20: see KEPT below.
KEPT = {}


def active_jobs():
  """A unit's second frame: an edit pass from its kept first frame (so the same object)."""
  out = {}
  for k, what in ACTIVE.items():
    seed = KEPT.get(f'unit-{k}')
    if not seed:
      continue
    out[f'unit-{k}-2'] = dict(w=512, h=640, refs=[REV / f'unit-{k}-{seed}.png'], key='magenta', prompt=(
      'The attached picture is the MASTER drawing of this object: draw ' + what + '. The same object, the same colours, '
      'outline, size and view. ' + NO_WRITING + fc.ON_MAGENTA))
  return out


SIZES = {'yaoyuan-wall': 900, 'orb': 128}


def cut():
  from PIL import Image
  jobs = {**JOBS, **active_jobs()}
  for jid, seed in KEPT.items():
    j = jobs[jid]
    src = REV / f'{jid}-{seed}.png'
    name = jid.replace('unit-', 'unit-')
    if j.get('scene'):
      im = Image.open(src).convert('RGB').resize((720, 1080), Image.LANCZOS)
      im.save(OUT / f'{name}.webp', 'WEBP', quality=84, method=6)
      Image.open(src).convert('RGB').save(SRC / f'{name}.webp', 'WEBP', quality=90)
    else:
      Image.open(src).convert('RGB').save(SRC / f'{name}.green.webp', 'WEBP', quality=90)
      im = fc.key_green(src, key=j.get('key', 'magenta'))
      fc.save_webp(im, OUT / f'{name}.webp', max_side=SIZES.get(jid, 256))
    print(jid, '→', OUT / f'{name}.webp')


if __name__ == '__main__':
  a = fc.run(JOBS)
  if a.cmd == 'paint':
    fc.paint_all('shouqiang', {**JOBS, **active_jobs()}, a)
  else:
    cut()
