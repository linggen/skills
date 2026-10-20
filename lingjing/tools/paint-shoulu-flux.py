#!/usr/bin/env python3
"""paint-shoulu-flux.py — 守炉's board painted by the local FLUX (Hanli 10-20: 「代码画的都查一下, 用flux画吧」).

    PY=~/.linggen/runtime/envs/pictures/bin/python
    $PY tools/paint-shoulu-flux.py paint [--only id,…] [--seeds 1,2,3]   # every seed → $FLUX_REVIEW/shoulu/, to be looked at
    $PY tools/paint-shoulu-flux.py cut                                    # the KEPT seeds → scripts/games/shoulu/art/

What draw.js drew in code: the talismans (four kinds × three levels), the 丹炉, the ground of each of the five
maps, and the pines and rocks round the road. The road itself stays drawn from the level's data, on the
painted ground. The beasts are 守墙's (Codex comic, art/games/shouqiang/<beast>-walk-*/hit: one 野猪 serves
every kit, game-kit.md § Shared assets); FLUX paints only 野猪's second step (合窳 stays exactly 守墙关's / 撒豆成兵's, Hanli 10-20),
as edit passes from their first step. `cut` packs the beasts too: scripts/games/shoulu/art/beasts.webp + .json.
"""
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flux_comic as fc

HERE = Path(__file__).resolve().parent
ART = HERE.parent / 'worlds' / 'jiuding' / 'art' / 'games'
QIANG = ART / 'shouqiang'
OUT = HERE.parent / 'scripts' / 'games' / 'shoulu' / 'art'

LEVEL = {
  1: 'a short plain wooden post standing on a small flat stone, one yellow paper talisman hanging from its top',
  2: 'a carved red-lacquered wooden pillar on a round grey stone base, red ribbons tied round it, a bigger glowing talisman hanging from its top',
  3: 'a small grey stone shrine pillar with a tiny curved red-tiled roof and gold trim on a round carved stone base, a large brightly glowing talisman hanging under the roof',
}
KIND = {
  'jian': 'a small shining silver flying sword hovering beside it, a blue glow, a blue sword shape painted on the talisman',
  'huo': 'the talisman wreathed in bright orange flames, a red flame shape painted on it',
  'han': 'the talisman frosted with pale blue ice crystals and a cold blue glow, a white snowflake shape painted on it',
  'lei': 'crackling with bright purple-white lightning, a yellow lightning-bolt shape painted on the talisman',
}
TOWER = ('ONE small Taoist talisman tower for a cartoon tower-defense game, seen from the front and a little from '
         'above, standing upright, the whole thing in view: {lvl}; {kind}. No writing anywhere on it, only the shape. ')
GROUND = ('Seen from straight above, a flat ground texture filling the WHOLE picture edge to edge for a cartoon '
          'tower-defense map, evenly lit, nothing standing up, no path, no road, no buildings: {what}. ')
MAPS = {
  'shiao': 'bright green village meadow grass with clover, little white and yellow flowers and a few pebbles',
  'shanlu': 'green mountain grass with patches of grey gravel and small rocks pressed flat',
  'yaoyuan': 'lush green grass with tiny herb plants, small red and purple flowers, neat tufts',
  'houshan': 'mossy green grass with scattered fallen orange and brown leaves and twigs',
  'heisong': 'dark green forest floor covered in brown pine needles, moss patches and small pine cones',
}

JOBS = {}
for k, kind in KIND.items():
  for lv, lvl in LEVEL.items():
    JOBS[f'tower-{k}-{lv}'] = dict(w=512, h=640, prompt=TOWER.format(lvl=lvl, kind=kind) + fc.STYLE + ' ' + fc.ON_MAGENTA)
JOBS['furnace'] = dict(w=640, h=640, prompt=(
  'ONE big round bronze alchemy cauldron, a three-legged Chinese ding furnace with two upright square handles and '
  'a lid, a glowing orange fire showing through a round opening in its belly, a wisp of smoke, seen from the front '
  'and a little from above. No writing anywhere. ' + fc.STYLE + ' ' + fc.ON_MAGENTA))
for m, what in MAPS.items():
  JOBS[f'ground-{m}'] = dict(w=768, h=976, prompt=GROUND.format(what=what) + fc.STYLE + ' ' + fc.SCENE)
JOBS['pine'] = dict(w=512, h=640, prompt=('ONE round cartoon pine tree seen from the front and a little from above, '
  'a short brown trunk, three stacked fluffy dark-green tiers. ' + fc.STYLE + ' ' + fc.ON_MAGENTA))
JOBS['rock'] = dict(w=512, h=384, prompt=('ONE low chunky grey boulder with a tuft of grass at its foot, seen from the '
  'front and a little from above. ' + fc.STYLE + ' ' + fc.ON_MAGENTA))
JOBS['bush'] = dict(w=512, h=384, prompt=('ONE round leafy green bush with a few tiny red berries, seen from the front '
  'and a little from above. ' + fc.STYLE + ' ' + fc.ON_MAGENTA))
STEP = ('The attached image is the MASTER drawing of this beast: draw the SAME beast, same colours, same outline, '
        'same size and the same three-quarter view, only the legs change: the other step of its walk, the legs '
        'that were forward now back and the others forward. ' + fc.ON_GREEN)
JOBS['yezhu-walk-2'] = dict(w=640, h=640, refs=[QIANG / 'yezhu-walk-1.green.webp'], key='green', prompt=STEP)

# Looked at 2026-10-20 (2 seeds each): every talisman reads its kind by shape (sword, flame, snowflake, bolt) with no
# writing; the three levels climb post → lacquered pillar → roofed stone shrine. Grounds: flowers, gravel, herbs,
# leaves, needles; the props plain. The second steps keep the master's three-quarter view.
KEPT = {'tower-jian-1': 2, 'tower-jian-2': 2, 'tower-jian-3': 1, 'tower-huo-1': 2, 'tower-huo-2': 2, 'tower-huo-3': 1,
        'tower-han-1': 1, 'tower-han-2': 2, 'tower-han-3': 1, 'tower-lei-1': 1, 'tower-lei-2': 2, 'tower-lei-3': 1,
        'furnace': 1, 'ground-shiao': 1, 'ground-shanlu': 2, 'ground-yaoyuan': 1, 'ground-houshan': 1, 'ground-heisong': 1,
        'pine': 1, 'rock': 2, 'bush': 2, 'yezhu-walk-2': 1}


def cut():
  OUT.mkdir(parents=True, exist_ok=True)
  from PIL import Image
  for jid, seed in KEPT.items():
    j = JOBS[jid]
    src = fc.REVIEW / 'shoulu' / f'{jid}-{seed}.png'
    if jid.startswith('ground-'):
      im = Image.open(src).convert('RGB').resize((600, 760), Image.LANCZOS)
      im.save(OUT / f'{jid}.webp', 'WEBP', quality=82, method=6)
    else:
      im = fc.key_green(src, key=j.get('key', 'magenta'))
      dst = (ART / 'shoulu' / f'{jid}.webp') if jid.endswith('walk-2') else OUT / f'{jid}.webp'
      fc.save_webp(im, dst, max_side=256 if jid.startswith(('tower', 'pine', 'rock', 'bush')) else 320)
    print(jid, '→ done')
  beasts()


BEASTS = {'yezhu': ['walk-1', 'walk-2', 'hit'], 'zheng': ['walk-1', 'walk-2', 'hit'], 'qiuyu': ['walk-1', 'walk-2', 'hit'],
          'qique': ['walk-1', 'walk-2', 'hit'], 'heyu': ['walk-1', 'hit']}  # 合窳 exactly as 撒豆成兵 shows it (Hanli 10-20)


def beasts():
  """The beasts' frames on one sheet: each scaled to the same height per beast (the boss twice), cells in a row."""
  from PIL import Image
  H = {'heyu': 200}
  cells, ims = {}, []
  for b, frames in BEASTS.items():
    for f in frames:
      p = QIANG / f'{b}-{f}.webp'
      if not p.exists():
        p = ART / 'shoulu' / f'{b}-{f}.webp'
      if not p.exists():
        continue
      im = Image.open(p).convert('RGBA'); im = im.crop(im.getbbox())
      h = H.get(b, 110); k = h / im.height
      ims.append((f'{b}-{f}', im.resize((round(im.width * k), h), Image.LANCZOS)))
  W = 1024; x = y = 0; rowh = 0; placed = []
  for name, im in ims:
    if x + im.width > W: x = 0; y += rowh + 2; rowh = 0
    placed.append((name, im, x, y)); cells[name] = [x, y, im.width, im.height]
    x += im.width + 2; rowh = max(rowh, im.height)
  sheet = Image.new('RGBA', (W, y + rowh))
  for name, im, x, y in placed:
    sheet.alpha_composite(im, (x, y))
  sheet.save(OUT / 'beasts.webp', 'WEBP', quality=86, method=6, exact=True)
  (OUT / 'beasts.json').write_text(json.dumps({'cells': cells}) + '\n')
  print('beasts →', OUT / 'beasts.webp', sheet.size)


if __name__ == '__main__':
  a = fc.run(JOBS)
  if a.cmd == 'paint':
    fc.paint_all('shoulu', JOBS, a)
  else:
    cut()
