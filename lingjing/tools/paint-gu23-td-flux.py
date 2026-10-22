#!/usr/bin/env python3
"""paint-gu23-td-flux.py — 古二 and 古三's three 塔防 boards painted by the local FLUX (2026-10-21, the 卷一 small-game plan,
doc/games-plan-juan1.md; Hanli: 「start building」). Never Codex.

    PY=~/.linggen/runtime/envs/pictures/bin/python
    $PY tools/paint-gu23-td-flux.py paint [--only id,…] [--seeds 1,2]   # every seed → $FLUX_REVIEW/gu23td/, looked at
    $PY tools/paint-gu23-td-flux.py cut                                  # the KEPT seeds → the two kits' art folders

抬鹿下山 (守墙关, levels/shouqiang.json `tailu`, 00-tailu): the 溪边 path at dusk, two tracks down to the line; the 门板 with
the stag on it for the wall; 小满 from behind with 爷爷's bow (standing, drawing); 老周 beside him, barefoot (he took his shoes
off on the stalk), throwing stones; the bow's three card icons. The arrow and the stone are 砸寨's (proj-arrow, proj-stone),
turned to the kit's shot by `cut`, not painted.

雪夜柴垛 (守炉, games.json `shoulu` · `chaiduo`, 00-halfyear): the yard behind the house on a snowy night, the 柴垛 with the
鸡窝 at its foot (「落进了柴垛底下的鸡窝」) for the 炉. The ground was first an edit pass from the 石坳 ground and came out
saturated blue with its flowers kept (the build's own note, 10-22); repainted the same day from words alone, `SNOW_YARD`, in
the kit's style: white snow, grey-blue moon shadow, nothing green.

泗水路 (守炉, `sishui`, 00-gate): the road at night (an edit pass from the 山路 ground), 舅舅 asleep by the fire. The fire, the
枯枝 and 小满 are 守火's (tools/paint-gu1-td-flux.py).
Every sprite is an edit pass from a kit's own art, so the set keeps its comic style; every seed is looked at for fake writing.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flux_comic as fc

HERE = Path(__file__).resolve().parent
QSRC = HERE.parent / 'worlds' / 'jiuding' / 'art' / 'games' / 'shouqiang'
LSRC = HERE.parent / 'worlds' / 'jiuding' / 'art' / 'games' / 'shoulu'
ZART = HERE.parent / 'scripts' / 'games' / 'zhazhai' / 'art'
QOUT = HERE.parent / 'scripts' / 'games' / 'shouqiang' / 'art'
LOUT = HERE.parent / 'scripts' / 'games' / 'shoulu' / 'art'
REV = fc.REVIEW / 'gu23td'

STYLE_OF = ('The attached picture shows this game\'s art style: draw a NEW subject in exactly that style (the same bold '
            'dark-brown outline, flat cel shading, saturated colours and glossy highlight), not the attached subject. ')
NO_WRITING = 'No writing, no letters, no glyphs anywhere. '
BACK = 'Seen from BEHIND and a little from above, the back of the figure towards us, the whole body in view. '
LAOZHOU = ('a stocky weathered middle-aged peasant hunter with a short black beard and a grey cloth headband, a shaggy straw '
           'rain cape over a patched grey-brown cotton jacket with a rope sash, baggy patched trousers, BAREFOOT')
JIUJIU = ('a thin middle-aged village bookkeeper with a small black moustache and a soft dark cloth cap, a long plain grey '
          'cotton robe')
NIGHT = ('The attached image is this map\'s ground by DAY: paint the SAME picture, the same composition, every tuft, '
         'flower, leaf and pebble in exactly the same place and size, seen from straight above, but at NIGHT: cool '
         'moonlight from the upper left, deep ink-blue and dark green shadows, the colours dim and cold, a few pale '
         'silver highlights, still clearly readable. Nothing added, nothing standing up. ' + fc.SCENE)

SNOW_YARD = ('A flat game-map GROUND seen from straight above, filling the whole picture: the snowy back yard of a farmhouse '
             'in old rural China on a WINTER NIGHT, in the style of a bold-outlined flat cel-shaded cartoon mobile game. '
             'It is DARK, late at night: an even blanket of snow over everything, lit only by a dim moon, so the snow '
             'reads a soft dusky slate grey-blue, a little lighter in the middle and deep shadowy grey-blue at the '
             'edges like a vignette, a few faint silver highlights on the drifts; the middle of the picture wide, open '
             'and plain. Only along the edges: a few dark pebbles and dry brown grass stalks poking through the snow, a '
             'few scattered twigs and split firewood chips, a small trail of bird footprints. Muted, calm and cold, NOT '
             'bright white, NOT saturated blue. No flowers, no green plants, no leaves, nothing standing up, no icons, '
             'no buttons. ' + fc.SCENE)

JOBS = {
  # ── 抬鹿下山 (守墙关) ──
  'tailu-bg': dict(kit='q', scene=True, w=768, h=1152, prompt=(
    'A TALL PORTRAIT game background, a 3/4 view from high above: a wooded mountain valley in old rural China at '
    'DUSK. A shallow rocky STREAM winds down the middle from the top edge to the bottom; TWO narrow trodden dirt TRAILS run '
    'from the top of the picture straight down to the bottom, one on each side of the stream, bare earth with no paving stones; dark pines, reeds and '
    'boulders along the banks, a few fallen autumn leaves. Warm orange and violet dusk light from low on the right, long '
    'blue shadows. NO people, NO animals, NO buildings. ' + fc.STYLE + ' ' + fc.SCENE)),
  'tailu-wall': dict(kit='q', w=1024, h=512, refs=[QSRC / 'wall.green.webp'], key='magenta', size=900, prompt=(
    'The attached picture is a long wall prop in this game. Draw the SAME kind of long straight prop running across the '
    'whole width, the same view from behind and above, but now it is a low line of stream-bank boulders and a fallen log '
    'with, in the very CENTRE, an old plain wooden house DOOR laid flat across two long carrying poles, and a big brown '
    'STAG with branching antlers lying on the door, an arrow in its neck. No towers, no roofs, no wall, no people. '
    + NO_WRITING + fc.ON_MAGENTA)),
  'xiaoman-bow': dict(kit='q', w=512, h=640, refs=[QSRC / 'xiaoman-idle.green.webp'], key='magenta', prompt=(
    'The attached picture is the MASTER drawing of this boy. Draw the SAME boy, the same clothes and the same view from '
    'behind and above, but with NO sword, NO talisman and no pouch: he holds a long old wooden hunting BOW wrapped with '
    'pale sinew upright in his left hand, a few arrows in a cloth quiver on his back, standing watchful. '
    + NO_WRITING + fc.ON_MAGENTA)),
  'laozhou-side': dict(kit='q', w=512, h=640, refs=[QSRC / 'xiaoman-idle.green.webp'], key='magenta', prompt=(
    STYLE_OF + 'ONE ' + LAOZHOU + ', a stone in his raised right hand, about to throw it. ' + BACK + NO_WRITING + fc.STYLE
    + ' ' + fc.ON_MAGENTA)),
  # ── 雪夜柴垛 · 泗水路 (守炉) ──
  'ground-shiao-snow': dict(kit='l', scene=True, ground=True, w=768, h=976, prompt=SNOW_YARD),
  'ground-shanlu-night': dict(kit='l', scene=True, ground=True, w=768, h=976, refs=[LOUT / 'ground-shanlu.webp'], prompt=NIGHT),
  'chaiduo': dict(kit='l', w=640, h=640, refs=[QSRC / 'xiaoman-idle.green.webp'], key='magenta', size=200, prompt=(
    STYLE_OF + 'ONE tall rounded WOODPILE of stacked split firewood logs behind a farmhouse, a thick cap of white snow on '
    'its top, and at its foot a small round CHICKEN COOP of woven twigs with a little dark doorway. Seen from the front '
    'and a little from above. ' + NO_WRITING + fc.STYLE + ' ' + fc.ON_MAGENTA)),
  'jiujiu-sleep': dict(kit='l', w=512, h=384, refs=[QSRC / 'xiaoman-idle.green.webp'], key='magenta', size=192, prompt=(
    STYLE_OF + 'ONE ' + JIUJIU + ', lying on his side asleep on the ground, curled up under a patched quilt, his head on a '
    'small cloth bundle, eyes shut, mouth open snoring. Seen from the front and a little from above. ' + NO_WRITING
    + fc.STYLE + ' ' + fc.ON_MAGENTA)),
}
# The second frames: edit passes from a kept first, so they are the same figure.
SECOND = {
  'xiaoman-bow-cast': ('xiaoman-bow', 'q', 'the same boy, the same view from behind, now drawing the bow: the bow held out '
                       'level in his left hand, the string pulled back to his cheek with an arrow on it, aiming up and '
                       'away from us'),
}
ICONS = {
  'icon-gong-more': 'a wooden hunting bow loosing two arrows at once, two white motion lines',
  'icon-gong-pierce': 'one arrow flying straight through two small brown leaves in a row, a white streak behind it',
  'icon-gong-arc': 'an arrow flying in a high curved arc, a dotted white curve behind it',
}
for k, what in ICONS.items():
  JOBS[k] = dict(kit='q', w=512, h=512, refs=[QSRC / 'icon-jian-more.green.webp'], key='magenta', size=160, prompt=(
    'The attached picture is the MASTER skill icon: draw the SAME round medallion, the same thick shiny gold rim, the same '
    f'rendering and size; only change the background gradient to warm dusk orange to deep violet and the emblem inside '
    f'to: {what}. No text, no numbers. ' + fc.ON_MAGENTA))

# Looked at 2026-10-21 (no fake writing kept): job → seed. ground-shiao-snow repainted 10-22 (SNOW_YARD; seeds 2 and 6 drew
# button-like icons in a corner, 1 kept).
KEPT = {'tailu-bg': 3, 'xiaoman-bow-cast': 3, 'tailu-wall': 1, 'xiaoman-bow': 2, 'laozhou-side': 1, 'ground-shiao-snow': 1, 'ground-shanlu-night': 2, 'chaiduo': 1,
        'jiujiu-sleep': 1, 'icon-gong-more': 1, 'icon-gong-pierce': 2, 'icon-gong-arc': 1}


def second_jobs():
  out = {}
  for jid, (src, kit, what) in SECOND.items():
    seed = KEPT.get(src)
    if not seed:
      continue
    j = JOBS[src]
    out[jid] = dict(kit=kit, w=j['w'], h=j['h'], refs=[REV / f'{src}-{seed}.png'], key='magenta', size=j.get('size'), prompt=(
      'The attached picture is the MASTER drawing of this figure: draw ' + what + '. The same figure, the same colours, '
      'outline, size and view. ' + NO_WRITING + fc.ON_MAGENTA))
  return out


def shots():
  """The arrow and the stone: 砸寨's own (proj-arrow, proj-stone), squared for the kit's shot (it draws a shot square, its
  tip to the upper right like the 剑阵's sword)."""
  from PIL import Image
  arrow = Image.open(ZART / 'proj-arrow.webp').convert('RGBA')
  arrow = arrow.rotate(45, expand=True, resample=Image.BICUBIC)
  arrow = arrow.crop(arrow.getbbox())
  side = max(arrow.size)
  sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
  sq.paste(arrow, ((side - arrow.width) // 2, (side - arrow.height) // 2), arrow)
  fc.save_webp(sq, QOUT / 'arrow.webp', max_side=128)
  stone = Image.open(ZART / 'proj-stone.webp').convert('RGBA')
  fc.save_webp(stone.crop(stone.getbbox()), QOUT / 'stone.webp', max_side=96)
  print('arrow, stone → done')


def cut(only=()):
  from PIL import Image
  jobs = {**JOBS, **second_jobs()}
  for jid, seed in KEPT.items():
    if only and jid not in only:
      continue
    j = jobs[jid]
    src = REV / f'{jid}-{seed}.png'
    out = (QOUT if j['kit'] == 'q' else LOUT) / f'{jid}.webp'
    keep = (QSRC if j['kit'] == 'q' else LSRC)
    if j.get('ground'):
      Image.open(src).convert('RGB').resize((600, 760), Image.LANCZOS).save(out, 'WEBP', quality=82, method=6)
    elif j.get('scene'):
      Image.open(src).convert('RGB').resize((720, 1080), Image.LANCZOS).save(out, 'WEBP', quality=84, method=6)
      Image.open(src).convert('RGB').save(keep / f'{jid}.webp', 'WEBP', quality=90)
    else:
      Image.open(src).convert('RGB').save(keep / f'{jid}.green.webp', 'WEBP', quality=90)
      fc.save_webp(fc.key_green(src, key=j.get('key', 'magenta')), out, max_side=j.get('size') or 256)
    print(jid, '→', out)
  if not only:
    shots()


if __name__ == '__main__':
  a = fc.run(JOBS)
  if a.cmd == 'paint':
    fc.paint_all('gu23td', {**JOBS, **second_jobs()}, a)
  else:
    cut([k for k in a.only.split(',') if k])
