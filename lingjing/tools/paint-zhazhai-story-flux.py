#!/usr/bin/env python3
"""paint-zhazhai-story-flux.py — the two 砸寨 throws the 调息 cut brought in (Hanli 10-20: 「调息感觉太多了」 → 「可以」),
painted by the local FLUX through flux_comic (the comic ruling, loaded once a run):

    PY=~/.linggen/runtime/envs/pictures/bin/python
    $PY tools/paint-zhazhai-story-flux.py paint [--only id,…] [--seeds 1,2]   # every seed → $FLUX_REVIEW/zhazhai-story/
    $PY tools/paint-zhazhai-story-flux.py cut                                 # the KEPT seeds → tools/zhazhai/game-assets/art/

- 讲堂试法 (第六回 wm-qianye, `jiangtang`): the back of 沉鼎观's lecture hall, the straw dummies, a bench, and the three
  spells 小满 throws there — 火弹, 冰锥, 金刃 (褚先生's 「火是矛，冰是针，金是镰」).
- 投一个给我看看 (今一 j01-track, `toulan`): the club fair on the central square, the portable hoop, the folding table,
  马小宝's 摇杯 and the ball.
Then `cd tools/zhazhai && npm run build` (src/zhazhai/decor.ts THROW_ART loads them by name). A thing is painted on a
flat key colour that `cut` keys out (green, or magenta for the green-ish: the ice); a place is painted whole.
English prompts only; every seed is looked at for fake glyphs before it is KEPT.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flux_comic as fc

HERE = Path(__file__).resolve().parent
OUT = HERE / 'zhazhai' / 'game-assets' / 'art'
GAME = 'zhazhai-story'
MODERN = fc.STYLE.replace(' Old rural China flavour.', ' A modern Chinese university today.')
PLACE = (' A wide landscape seen from the side like the background of a cartoon physics game: simple bold shapes, flat '
         'colours, soft depth, the lower fifth an even strip of floor or ground. ')


def thing(subject, key='green', style=fc.STYLE):
  on = fc.ON_GREEN if key == 'green' else fc.ON_MAGENTA
  return f'{subject} {style} {on}'


JOBS = {
  # 讲堂试法
  'place-jiangtang': dict(w=1024, h=576, prompt=(
    'Inside an old Chinese Taoist temple lecture hall, the empty back of the hall: dark red wooden pillars, a polished '
    'plank floor, plain whitewashed walls with tall paper lattice windows letting in warm afternoon light, low wooden '
    'desks pushed against the far wall, a hanging paper lantern.' + PLACE + fc.STYLE + ' ' + fc.SCENE)),
  'dummy': dict(key='green', w=576, h=768, prompt=thing(
    'ONE straw practice dummy for martial arts training: a bundle of golden straw tied with rope into a head, a body and '
    'two stubby arms on a crossbar, standing on a single wooden post, a round red cloth target patch on its chest, seen '
    'from the front.')),
  'prop-bench': dict(key='green', w=768, h=384, prompt=thing(
    'ONE long low plain wooden bench seen exactly from the side, four square legs, a thick plank seat, warm brown wood.')),
  'proj-fire': dict(key='green', w=512, h=512, prompt=thing(
    'ONE round FIREBALL flying to the RIGHT: a glowing ball of red and orange flame with a bright yellow-white core and '
    'a short flickering tail of flame trailing to the LEFT, a few sparks.')),
  'proj-ice': dict(key='magenta', w=768, h=256, prompt=thing(
    'ONE sharp ICE SPIKE lying flat and pointing RIGHT: a long slender icicle of clear pale blue ice with white frosty '
    'facets, a needle-sharp point at the right end, a few frost crystals.', key='magenta')),
  'proj-metal': dict(key='green', w=768, h=384, prompt=thing(
    'ONE flying golden crescent BLADE of light, curved like a sickle, its sharp curved edge facing RIGHT: shining '
    'bright metallic gold with a white-hot edge and a thin motion streak behind it on the LEFT.')),
  # 投一个给我看看
  'place-campus': dict(w=1024, h=576, prompt=(
    'A sunny modern Chinese university campus square in September during the student club fair: rows of small white '
    'canopy tents with folding tables far away across the square, leafy plane trees, a big modern library building with '
    'glass windows behind, a clear blue sky with a few soft clouds, pale paving stones on the near ground. No banners, '
    'no signs.' + PLACE + MODERN + ' ' + fc.SCENE)),
  'prop-hoop': dict(key='magenta', w=576, h=768, prompt=thing(
    'ONE portable basketball hoop seen exactly from the SIDE: a heavy black wheeled base on the ground at the RIGHT, a '
    'tall dark grey steel pole rising from it and curving forward to the LEFT at the top, holding a white rectangular '
    'backboard seen edge-on as a thick vertical plank, and an orange rim with a white net sticking out to the LEFT of '
    'the backboard.', key='magenta', style=MODERN)),
  'prop-table': dict(key='green', w=768, h=384, prompt=thing(
    'ONE plain folding table seen exactly from the side: a light grey plastic table top, thin silver metal folding legs, '
    'a plain blue tablecloth hanging a little over the front edge. Nothing on it.', style=MODERN)),
  'shaker': dict(key='green', w=384, h=576, prompt=thing(
    'ONE big sports protein shaker bottle standing upright: a tall translucent white plastic cup half full of milky '
    'white protein shake, a black screw lid with a flip spout and a carrying loop, a few measuring lines on its side.',
    style=MODERN)),
  'proj-ball': dict(key='green', w=512, h=512, prompt=thing(
    'ONE orange BASKETBALL, a perfect sphere with black seam lines and a pebbled leather texture, one soft highlight.',
    style=MODERN)),
}

# id: seed — chosen after looking at every seed (one subject, the view asked for, no fake glyphs).
KEPT = {'place-jiangtang': 2, 'dummy': 1, 'prop-bench': 1, 'proj-fire': 1, 'proj-ice': 2, 'proj-metal': 2,
        'place-campus': 2, 'prop-hoop': 1, 'prop-table': 1, 'shaker': 2, 'proj-ball': 2}
# 2026-10-20, looked at: the hall's seed 2 has the most floor; metal 1 was an arrow, 2 the sickle; shaker 1 cast a
# shadow; ball 1's seams read as a cross; the hoop's 1 and 2 alike (1: the base squarer).


def cut():
  from PIL import Image
  for jid, seed in KEPT.items():
    j = JOBS[jid]
    src = fc.REVIEW / GAME / f'{jid}-{seed}.png'
    if 'key' in j:
      im = fc.key_green(src, key=j['key'])
      im.thumbnail((640, 640), Image.LANCZOS)
    else:
      im = Image.open(src).convert('RGB')
      im.thumbnail((1024, 1024), Image.LANCZOS)
    fc.save_webp(im, OUT / f'{jid}.webp', quality=88)
    print(jid, f's{seed} →', OUT / f'{jid}.webp', im.size)


if __name__ == '__main__':
  a = fc.run(JOBS)
  if a.cmd == 'paint':
    fc.paint_all(GAME, JOBS, a)
  else:
    cut()
