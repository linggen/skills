#!/usr/bin/env python3
"""paint-gu1-td-flux.py — 第一回's two 塔防 boards painted by the local FLUX (2026-10-21, Hanli: 第一回 adds two 塔防 boards).

    PY=~/.linggen/runtime/envs/pictures/bin/python
    $PY tools/paint-gu1-td-flux.py paint [--only id,…] [--seeds 1,2]   # every seed → $FLUX_REVIEW/gu1td/, looked at
    $PY tools/paint-gu1-td-flux.py cut [--only id,…]                    # the KEPT seeds → the two kits' art folders

守白菜 (守墙关, levels/shouqiang.json `baicai`): 阿禾's vegetable plot by day — the 篱笆 with its gaps at the top, the cabbage
bed for the wall, 阿禾 from behind with her 竹竿 (idle, poking), 小满 beside her shooing, the 芦花鸡 (two steps and a
startled frame), the 竹竿 shot, a 土坷垃, the three card icons. Every sprite is an edit pass from 守墙关's own art (小满,
野猪, the 剑阵 medallion, the 山门 wall), so the set keeps the kit's comic style and its camera: high behind the wall.

守火 (守炉, games.json `shoulu` · `shouhuo`): the valley floor by night at the cliff's foot, the campfire, the 枯枝, the hurt
fox asleep in his old jacket (from 银月's own frame), the eyes in the dark, and 小满 three ways (standing, throwing, carrying).
Every seed is looked at for fake writing before it is kept.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flux_comic as fc

HERE = Path(__file__).resolve().parent
QSRC = HERE.parent / 'worlds' / 'jiuding' / 'art' / 'games' / 'shouqiang'
LSRC = HERE.parent / 'worlds' / 'jiuding' / 'art' / 'games' / 'shoulu'
QOUT = HERE.parent / 'scripts' / 'games' / 'shouqiang' / 'art'
LOUT = HERE.parent / 'scripts' / 'games' / 'shoulu' / 'art'
REV = fc.REVIEW / 'gu1td'

STYLE_OF = ('The attached picture shows this game\'s art style: draw a NEW subject in exactly that style (the same bold '
            'dark-brown outline, flat cel shading, saturated colours and glossy highlight), not the attached subject. ')
NO_WRITING = 'No writing, no letters, no glyphs anywhere. '
BACK = 'Seen from BEHIND and a little from above, the back of the figure towards us, the whole body in view. '
FRONT = 'Seen from the front and a little from above, standing on the ground, the whole body in view. '
# Her hair is BLACK: the book's 「两根黄毛小辫」 is 黄毛丫头 — a poor kid's thin dry dull hair, never blonde (Hanli 10-22:
# 「收白菜里阿禾是黄毛吗?」 — the first paint said straw-yellow and came out golden). The canon portrait people/ahe-girl.
# No hair-colour word but black/dark reaches the model.
AHE = ('a skinny little peasant girl of about eleven with dull BLACK hair, thin and a little messy, in two thin small '
       'BLACK braided pigtails, a patched grey-brown cotton jacket and baggy patched trousers, black cloth shoes')
XM = ('a skinny twelve-year-old peasant boy, black hair in a small topknot tied with a red band, a patched off-white '
      'cotton jacket with a dark sash, grey trousers, straw sandals')
HEN = ('a plump speckled barred black-and-white farm hen (a cuckoo-patterned hen), a bright red comb and wattles, yellow '
       'legs, a cheeky determined comic face')
SEL = 'q'  # which kit a job cuts into: q 守墙关 · l 守炉

JOBS = {
  # ── 守白菜 (守墙关) ──
  'baicai-bg': dict(kit='q', scene=True, w=768, h=1152, refs=[QSRC / 'bg.webp'], prompt=(
    STYLE_OF + 'A TALL PORTRAIT game background, a 3/4 view from high above: a village VEGETABLE PLOT in old rural China on an '
    'overcast autumn day. Across the very TOP runs a low woven bamboo-and-twig FENCE from edge to edge with three or four '
    'GAPS in it; below it, long rows of dark tilled soil with small leafy greens and radish tops, narrow trodden dirt paths '
    'running from the fence straight down towards the bottom of the picture, a few stones, a little straw. The lower part '
    'is open bare soil. Soft grey daylight. NO people, NO animals, NO buildings. ' + fc.STYLE + ' ' + fc.SCENE)),
  'baicai-wall': dict(kit='q', w=1024, h=512, refs=[QSRC / 'wall.green.webp'], key='magenta', size=900, prompt=(
    'The attached picture is a long wall prop in this game. Draw the SAME kind of long straight prop running across the '
    'whole width, the same view from behind and above, but now it is a long LOW raised garden BED of heaped dark earth with '
    'a rim of small stones, a row of small cabbages and green onions along it, and in the very CENTRE one HUGE round '
    'pale-green Chinese cabbage, tightly wrapped, much bigger than the others, glossy. No towers, no roofs, no wall. '
    + NO_WRITING + fc.ON_MAGENTA)),
  'ahe-idle': dict(kit='q', w=512, h=640, refs=[QSRC / 'xiaoman-idle.green.webp'], key='magenta', prompt=(
    STYLE_OF + 'ONE ' + AHE + ', holding a long thin green BAMBOO POLE upright in her right hand, its tip high above her '
    'head, standing guard. ' + BACK + NO_WRITING + fc.STYLE + ' ' + fc.ON_MAGENTA)),
  'xiaoman-side': dict(kit='q', w=512, h=640, refs=[QSRC / 'xiaoman-idle.green.webp'], key='magenta', prompt=(
    'The attached picture is the MASTER drawing of this boy. Draw the SAME boy, the same clothes, the same view from behind '
    'and above, but now he has NO sword and no talisman: both arms flung up and out, waving and flapping his hands to shoo '
    'chickens away, a small clod of earth in one hand. ' + NO_WRITING + fc.ON_MAGENTA)),
  'luhuaji-walk-1': dict(kit='q', w=512, h=512, refs=[QSRC / 'yezhu-walk-1.green.webp'], key='magenta', prompt=(
    STYLE_OF + 'ONE ' + HEN + ', running towards the viewer and down, seen from the front and a little from above, one foot '
    'lifted, wings tucked. ' + NO_WRITING + fc.STYLE + ' ' + fc.ON_MAGENTA)),
  'zhugan': dict(kit='q', w=512, h=512, key='magenta', size=128, prompt=(
    'ONE short length of green bamboo pole with two knots, lying diagonally from the lower-left corner to the upper-right '
    'corner, a few white speed lines behind it. ' + fc.STYLE + ' ' + fc.ON_MAGENTA)),
  'kela': dict(kit='q', w=384, h=384, key='magenta', size=96, prompt=(
    'ONE small round clod of dry brown earth with a few crumbs and a blade of grass sticking out. ' + fc.STYLE + ' '
    + fc.ON_MAGENTA)),
  # ── 守火 (守炉) ──
  'ground-yingu-night': dict(kit='l', scene=True, w=768, h=976, prompt=(
    'Seen from straight above, a flat ground texture filling the WHOLE picture edge to edge for a cartoon tower-defense map, '
    'nothing standing up, no path, no road: the floor of a narrow mountain valley AT NIGHT after rain — dark wet grass, '
    'mossy stones, puddles catching a little light, low bushes with small SILVER leaves, fallen silver leaves; along the '
    'bottom edge dark grey cliff rock. Deep blue-grey night, no moon visible. ' + fc.STYLE + ' ' + fc.SCENE)),
  'campfire': dict(kit='l', w=512, h=512, key='magenta', size=192, prompt=(
    'ONE small campfire: a few crossed dry sticks on a ring of grey stones, bright orange and yellow flames, a few sparks. '
    'Seen from the front and a little from above. ' + fc.STYLE + ' ' + fc.ON_MAGENTA)),
  'kuzhi': dict(kit='l', w=512, h=384, key='magenta', size=160, prompt=(
    'ONE small bundle of three dry dead branches lying on the ground, grey-brown bark, a few small SILVER leaves still on '
    'them. ' + fc.STYLE + ' ' + fc.ON_MAGENTA)),
  'fox-sleep': dict(kit='l', w=512, h=384, refs=[LSRC / 'idle-1.green.webp'], key='magenta', size=192, prompt=(
    'The attached picture is the MASTER drawing of this little silver fox. Draw the SAME little silver-white fox, but lying '
    'curled up asleep on the ground, eyes shut, tired and hurt, half wrapped in a patched old brown cotton jacket. '
    + NO_WRITING + fc.ON_MAGENTA)),
  'yanjing': dict(kit='l', w=512, h=512, refs=[QSRC / 'zheng-walk-1.green.webp'], key='magenta', size=160, prompt=(
    STYLE_OF + 'ONE shadowy night beast you can barely see: a shaggy almost-black furry silhouette, crouching low and '
    'creeping forward, pointed ears, NO clear features except two big round glowing YELLOW eyes. Seen from the side. '
    + NO_WRITING + fc.STYLE + ' ' + fc.ON_MAGENTA)),
  'xiaoman-idle': dict(kit='l', w=512, h=640, refs=[QSRC / 'xiaoman-idle.green.webp'], key='magenta', size=192, prompt=(
    STYLE_OF + 'ONE ' + XM + ', a woodcutter\'s chopper tucked in his sash, standing alert, a stone in one hand. ' + FRONT
    + NO_WRITING + fc.STYLE + ' ' + fc.ON_MAGENTA)),
}
# The second frames: edit passes from a kept first, so they are the same figure.
SECOND = {
  'ahe-cast': ('ahe-idle', 'q', 'the same girl, the same view from behind, now thrusting the bamboo pole forward and down '
               'hard in both hands to poke, leaning into it, a little whoosh line at its tip'),
  'luhuaji-walk-2': ('luhuaji-walk-1', 'q', 'the same hen, the other foot lifted, wings half open, mid-stride'),
  'luhuaji-hit': ('luhuaji-walk-1', 'q', 'the same hen startled and squawking, feathers flying off, wings flapping wildly, eyes '
                  'wide'),
  'xiaoman-throw': ('xiaoman-idle', 'l', 'the same boy, the same front view, throwing a stone overhand, his arm swung up '
                    'and forward'),
  'xiaoman-carry': ('xiaoman-idle', 'l', 'the same boy, the same front view, his arms full of a bundle of dry branches with '
                    'small silver leaves, hugging them to his chest'),
}
ICONS = {
  'icon-gan-more': 'a green bamboo pole poking forward twice, two quick white motion lines',
  'icon-gan-sweep': 'a green bamboo pole sweeping sideways in a wide white arc through three small feathers',
  'icon-gan-back': 'a green bamboo pole swinging back the other way, a curved white arrow round it',
}
for k, what in ICONS.items():
  JOBS[k] = dict(kit='q', w=512, h=512, refs=[QSRC / 'icon-jian-more.green.webp'], key='magenta', size=160, prompt=(
    'The attached picture is the MASTER skill icon: draw the SAME round medallion, the same thick shiny gold rim, the same '
    f'rendering and size; only change the background gradient to fresh spring green to pale straw yellow and the emblem '
    f'inside to: {what}. No text, no numbers. ' + fc.ON_MAGENTA))

# Looked at 2026-10-21 (no fake writing kept). ahe-idle · ahe-cast repainted 2026-10-22 with her hair black (seeds 1–4
# each): idle 2 (pole on the left like the first, thin braids; 1 pole on the right, 3 a cut white pole tip, 4 a cast
# shadow), cast 1 (the diagonal poke; 2 grew a second pole, 3 a bent pole, 4 a stiff stride).
KEPT = {'baicai-bg': 1, 'baicai-wall': 2, 'ahe-idle': 2, 'xiaoman-side': 2, 'luhuaji-walk-1': 1, 'zhugan': 1, 'kela': 2,
        'ground-yingu-night': 1, 'campfire': 1, 'xiaoman-idle': 1, 'kuzhi': 1, 'fox-sleep': 2, 'yanjing': 1,
        'icon-gan-more': 2, 'icon-gan-sweep': 1, 'icon-gan-back': 2,
        'ahe-cast': 1, 'luhuaji-walk-2': 1, 'luhuaji-hit': 2, 'xiaoman-throw': 2, 'xiaoman-carry': 1}


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
    if j.get('scene'):
      im = Image.open(src).convert('RGB')
      im = im.resize((720, 1080) if j['kit'] == 'q' else (600 * 4 // 3, 760 * 4 // 3), Image.LANCZOS)
      im.save(out, 'WEBP', quality=84, method=6)
      Image.open(src).convert('RGB').save(keep / f'{jid}.webp', 'WEBP', quality=90)
    else:
      Image.open(src).convert('RGB').save(keep / f'{jid}.green.webp', 'WEBP', quality=90)
      fc.save_webp(fc.key_green(src, key=j.get('key', 'magenta')), out, max_side=j.get('size') or 256)
    print(jid, '→', out)


if __name__ == '__main__':
  a = fc.run(JOBS)
  if a.cmd == 'paint':
    fc.paint_all('gu1td', {**JOBS, **second_jobs()}, a)
  else:
    cut([k for k in a.only.split(',') if k])
