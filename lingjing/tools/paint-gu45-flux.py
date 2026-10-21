#!/usr/bin/env python3
"""paint-gu45-flux.py — 古四 · 古五's new boards painted by the local FLUX (2026-10-21, the 卷一 small-game plan).

    PY=~/.linggen/runtime/envs/pictures/bin/python
    $PY tools/paint-gu45-flux.py paint [--only id,…] [--seeds 1,2]   # every seed → $FLUX_REVIEW/gu45/, looked at
    $PY tools/paint-gu45-flux.py cut                                  # the KEPT seeds → the kits' art folders

凶崖 (守墙关, levels/shouqiang.json `xiongya`): the 秘境 ledge halfway down the cliff — an edit pass from the 药园's lane
field (so the five lanes stay where the engine has them), now cracked stone over the dark; its rim the wall.
坑底 (守炉, games.json `shoulu` · `kengdi`): the pit floor under the 第三石板 (the board's ground), and 孙二狗 huddled in
its corner where the furnace stands — the one kept.
下坠子 (割绳子 `guirope`): the 蛫 in its hollow (the target, from the 古本 plate's shape) and the 竹筒 the rope runs to.
Every sprite is an edit pass from the kits' own art, so the set keeps the comic style. Every seed is looked at for
fake writing before it is kept.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flux_comic as fc

HERE = Path(__file__).resolve().parent
ART = HERE.parent / 'worlds' / 'jiuding' / 'art'
QSRC = ART / 'games' / 'shouqiang'
QOUT = HERE.parent / 'scripts' / 'games' / 'shouqiang' / 'art'
LOUT = HERE.parent / 'scripts' / 'games' / 'shoulu' / 'art'
ROPE = ART / 'games' / 'rope'
REV = fc.REVIEW / 'gu45'

STYLE_OF = ('The attached picture shows this game\'s art style: draw a NEW subject in exactly that style (the same bold '
            'dark-brown outline, flat cel shading, saturated colours and glossy highlight), not the attached subject. ')
NO_WRITING = 'No writing, no letters, no glyphs anywhere. '

JOBS = {
  # ── 凶崖 (守墙关) ──
  'xiongya-bg': dict(kit='q', scene=True, w=768, h=1152, refs=[QOUT / 'yaoyuan-bg.webp'], prompt=(
    'The attached picture is this game\'s lane field: paint the SAME composition, the five long straight strips running '
    'from the top edge to the bottom edge in exactly the same places and widths, the same flat view from above, but it is '
    'no garden now: it is a narrow STONE LEDGE inside a dark cavern cliff in a hidden realm. Each strip is a long run of '
    'cracked grey-blue stone slabs; between the strips, dark deep crevices; across the very top, the ledge breaks off into '
    'a black abyss with cold mist rising and a few faint glowing motes. Wet rock, a little moss, a few pale glowing fungi. '
    'Cool blue-grey light, deep shadows. NO people, NO creatures, NO buildings, NO wall. ' + fc.STYLE + ' ' + fc.SCENE)),
  'xiongya-wall': dict(kit='q', w=1024, h=512, refs=[QSRC / 'wall.green.webp'], key='magenta', size=900, prompt=(
    'The attached picture is a long wall prop in this game. Draw the SAME kind of long straight prop running across the '
    'whole width, the same view from behind and above, but now it is the rough rock LIP of a cliff ledge: a long low '
    'ridge of dark grey stone with cracks and a little moss, at its left end an old RUSTED iron stake driven into the rock '
    'with a short frayed hemp rope tied on it. No towers, no roofs, no lanterns, no fence. ' + NO_WRITING + fc.ON_MAGENTA)),
  # ── 坑底 (守炉) ──
  'ground-kengdi': dict(kit='l', scene=True, w=768, h=976, refs=[LOUT / 'ground-heisong.webp'], prompt=(
    'The attached picture is this game\'s map ground: paint the SAME kind of flat ground texture seen from straight above, '
    'filling the WHOLE picture edge to edge, nothing standing up, no path, no road — but now it is the floor of a deep '
    'dark STONE PIT in a cavern: damp grey flagstones, broken rock and grit, small puddles, a few scattered old bones and a '
    'rusted broken blade, dark moss in the cracks; dim cold light from above, deep blue-grey shadows at the edges. '
    + fc.STYLE + ' ' + fc.SCENE)),
  'sunergou': dict(kit='l', w=512, h=512, refs=[QSRC / 'xiaoman-idle.green.webp'], key='magenta', size=192, prompt=(
    STYLE_OF + 'ONE thin frightened teenage peasant boy SITTING huddled on the ground hugging his knees, a torn grey robe '
    'ripped open from the collar to the waist, scraped hands, a little blue cloth bundle with a red string charm at his '
    'side, a big scared face looking up. Seen from the front and a little from above, the whole body in view. '
    + NO_WRITING + fc.STYLE + ' ' + fc.ON_MAGENTA)),
  # ── 下坠子 (割绳子) ──
  'gui': dict(kit='r', w=768, h=512, refs=[ART / 'creatures' / 'gui.webp'], key='magenta', size=360, prompt=(
    'The attached picture is the MASTER drawing of this beast. Draw the SAME beast as a bright cartoon mobile-game sprite: '
    'a huge old turtle-like beast with a pale WHITE body and a RED head on a long neck, its great domed shell dark and '
    'heavy like an upturned black IRON WOK with old notches and scratches round its rim and one fresh crack near the neck, '
    'crouched low, seen from the side and a little from above, head stretched out to the left. ' + NO_WRITING
    + fc.STYLE + ' ' + fc.ON_MAGENTA)),
  'zhutong': dict(kit='r', w=512, h=512, key='magenta', size=160, prompt=(
    'A single game inventory item icon: ONE bamboo WATER FLASK — one thick section of green bamboo with its two knots, a '
    'wooden stopper in the top, a hemp cord tied round its middle, standing upright, seen from a slightly raised '
    'three-quarter view. ' + fc.STYLE + ' ' + fc.ON_MAGENTA)),
}

# Looked at 2026-10-21 (no fake writing kept).
KEPT = {}


def cut():
  from PIL import Image
  for jid, seed in KEPT.items():
    j = JOBS[jid]
    src = REV / f'{jid}-{seed}.png'
    out = {'q': QOUT, 'l': LOUT, 'r': ROPE}[j['kit']] / f'{jid}.webp'
    out.parent.mkdir(parents=True, exist_ok=True)
    if j.get('scene'):
      im = Image.open(src).convert('RGB')
      im = im.resize((720, 1080) if j['kit'] == 'q' else (600, 760), Image.LANCZOS)
      im.save(out, 'WEBP', quality=84, method=6)
      if j['kit'] == 'q':
        Image.open(src).convert('RGB').save(QSRC / f'{jid}.webp', 'WEBP', quality=90)
    else:
      if j['kit'] == 'q':
        Image.open(src).convert('RGB').save(QSRC / f'{jid}.green.webp', 'WEBP', quality=90)
      fc.save_webp(fc.key_green(src, key=j.get('key', 'magenta')), out, max_side=j.get('size') or 256)
    print(jid, '→', out)


if __name__ == '__main__':
  a = fc.run(JOBS)
  if a.cmd == 'paint':
    fc.paint_all('gu45', JOBS, a)
  else:
    cut()
