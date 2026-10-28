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
# 泗水路's skin (2026-10-28, games.json `sishui` `skin`): before 入门 there are no talismans — the 剑阵 is a camp's boy
# with a 弹弓 and the 火符 a 汉子 with a 火把, woken along the road; three steps each, the same figure growing.
PEOPLE = 'ONE {who} for a cartoon tower-defense game, seen from the front and a little from above, the whole figure in view: {what}. No writing anywhere. '
SKIN = {
  'tangong': ('small ancient Chinese village boy of about ten in a short cross-collar wrapped hemp tunic of faded blue tied with a cloth sash, grey trousers and straw sandals, his hair in a little topknot (old China, nothing modern: no buttons, no pockets)', {
    1: 'he sits on a tied cloth travelling bundle, holding up a forked-branch Y-shaped slingshot with its band pulled back, a pebble in the pouch',
    2: 'he stands on a wooden wheelbarrow loaded with cloth bundles, aiming a forked-branch Y-shaped slingshot, its band pulled back with a pebble',
    3: 'he stands on top of a loaded wooden handcart with a red paper lantern hanging from a bamboo pole stuck in it, aiming a big forked-branch Y-shaped slingshot, its band pulled back with a pebble'}),
  'huoba': ('sturdy ancient Chinese village man in a short cross-collar wrapped brown hemp tunic tied with a cloth sash, trousers tied at the shin, straw sandals and a cloth headband (old China, nothing modern: no buttons, no pockets)', {
    1: 'he holds up one burning wooden torch beside a small pile of dry branches',
    2: 'he holds a burning torch high beside a small crackling campfire ringed with stones',
    3: 'he swings two burning torches beside a big roaring bonfire ringed with stones'}),
}
# 守火 · 雪夜柴垛 rebuilt as build boards (2026-10-28, Hanli: 「守火和雪夜守柴, 可否用主力的塔防取代?」 · 「守炉比较好玩」):
# the cave's two (he is alone: what he lit himself) and the yard's two (老周 next door, the snow itself), one pair each.
SKIN['laozhou'] = ('stocky ancient Chinese old village man of about sixty with a short grey stubble beard, a padded winter cross-collar wrapped brown cotton coat tied with a cloth sash, trousers tied at the shin and straw sandals, a cloth headband (old China, nothing modern: no buttons, no pockets)', {
    1: 'he stands holding a fist-sized stone ready to throw, beside a small pile of stones on the snow',
    2: 'he throws a stone overarm, beside a bamboo basket full of stones on the snow',
    3: 'he stands on a low snowy stone wall throwing a stone hard, a big bamboo basket of stones beside him'})
THING = 'ONE {what} for a cartoon tower-defense game, seen from the front and a little from above, the whole thing in view. No writing anywhere, no people. '
THINGS = {
  'huodui': {
    1: 'small campfire of dry moss and pine twigs burning on a flat grey rock',
    2: 'campfire of pine branches ringed with grey stones, bright orange flames',
    3: 'big roaring bonfire of pine logs ringed with large grey stones, tall flames and flying sparks'},
  'songyan': {
    1: 'lump of golden pine resin smouldering on a flat grey stone, a thin curl of grey smoke rising',
    2: 'small heap of golden pine resin and green pine needles smouldering on stones, a thick cloud of grey smoke',
    3: 'round clay pot full of burning golden pine resin on three stones, billowing thick white-grey smoke'},
  'bingshui': {
    1: 'wooden bucket of water with a thin skin of ice, a small glassy icy puddle beside it on white snow',
    2: 'wooden bucket tipped over beside a wide glassy frozen ice slick on white snow',
    3: 'long wooden water trough frozen solid with hanging icicles, a big glassy ice slick before it on white snow'},
}
for art, (who, steps) in SKIN.items():
  for lv, what in steps.items():
    JOBS[f'tower-{art}-{lv}'] = dict(w=512, h=640, prompt=PEOPLE.format(who=who, what=what) + fc.STYLE + ' ' + fc.ON_MAGENTA)
for art, steps in THINGS.items():
  for lv, what in steps.items():
    JOBS[f'tower-{art}-{lv}'] = dict(w=512, h=640, prompt=THING.format(what=what) + fc.STYLE + ' ' + fc.ON_MAGENTA)
JOBS['furnace'] = dict(w=640, h=640, prompt=(
  'ONE big round bronze alchemy cauldron, a three-legged Chinese ding furnace with two upright square handles and '
  'a lid, a glowing orange fire showing through a round opening in its belly, a wisp of smoke, seen from the front '
  'and a little from above. No writing anywhere. ' + fc.STYLE + ' ' + fc.ON_MAGENTA))
for m, what in MAPS.items():
  JOBS[f'ground-{m}'] = dict(w=768, h=976, prompt=GROUND.format(what=what) + fc.STYLE + ' ' + fc.SCENE)
# Night grounds (2026-10-21, the review: 药园巡夜 at 丑时 and 丹房看炉 played on bright day grass): edit passes from the
# day ground, so every tuft, flower and leaf keeps its place and the road (drawn from the level's data) lies as it did.
NIGHT = ('The attached image is this map\'s ground by DAY: paint the SAME picture, the same composition, every tuft, '
         'flower, leaf and pebble in exactly the same place and size, seen from straight above, but at NIGHT: cool '
         'moonlight from the upper left, deep ink-blue and dark green shadows, the colours dim and cold, a few pale '
         'silver highlights on the leaves, still clearly readable. Nothing added, nothing standing up. ' + fc.SCENE)
NIGHTS = {'yaoyuan': None, 'houshan': 'danfang-kanlu'}  # map → the level whose 丹炉 a lantern lights (cut: `glow`)
for m, lit in NIGHTS.items():
  JOBS[f'ground-{m}-night'] = dict(w=768, h=976, refs=[OUT / f'ground-{m}.webp'], prompt=NIGHT, glow=lit)
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
        'pine': 1, 'rock': 2, 'bush': 2, 'yezhu-walk-2': 1,
        # 2026-10-21 (3 seeds each): seed 1 keeps every leaf and flower of the day's and stays readable; 2 and 3 go near black.
        'ground-yaoyuan-night': 1, 'ground-houshan-night': 1,
        # 2026-10-28 (泗水路's skin, seeds 1–5): 1–2 dressed him in a buttoned modern jacket — the prompt asks for a crossed
        # hemp tunic and a sash now; seed 3 keeps one boy and a readable forked slingshot on all three, seed 4 one man.
        'tower-tangong-1': 3, 'tower-tangong-2': 3, 'tower-tangong-3': 3, 'tower-huoba-1': 4, 'tower-huoba-2': 4, 'tower-huoba-3': 4,
        # 2026-10-28 (守火 · 雪夜柴垛 rebuilt, seeds 1–3 each, every one looked at): one man and one fire, smoke, ice across the steps.
        'tower-laozhou-1': 2, 'tower-laozhou-2': 2, 'tower-laozhou-3': 2, 'tower-huodui-1': 1, 'tower-huodui-2': 1, 'tower-huodui-3': 1,
        'tower-songyan-1': 1, 'tower-songyan-2': 1, 'tower-songyan-3': 1, 'tower-bingshui-1': 1, 'tower-bingshui-2': 1, 'tower-bingshui-3': 1}


def glow(im, level):
  """A lantern's warm light round the level's 丹炉 (games.json `furnace`, on the 600×760 board), screened on."""
  from PIL import Image, ImageChops, ImageDraw, ImageFilter
  games = json.loads((HERE.parent / 'worlds' / 'jiuding' / 'games.json').read_text())
  L = next(l for g in games['games'] if isinstance(g, dict) for l in g.get('levels', []) if isinstance(l, dict) and l.get('id') == level)
  x, y = L['furnace']
  light = Image.new('RGB', im.size, (0, 0, 0))
  d = ImageDraw.Draw(light)
  for r, c in ((150, (70, 38, 8)), (95, (120, 70, 18)), (50, (170, 110, 40))):
    d.ellipse((x - r, y - r * 0.8, x + r, y + r * 0.8), fill=c)
  return ImageChops.screen(im, light.filter(ImageFilter.GaussianBlur(40)))


def cut(only=()):
  OUT.mkdir(parents=True, exist_ok=True)
  from PIL import Image
  for jid, seed in KEPT.items():
    if only and jid not in only:
      continue
    j = JOBS[jid]
    src = fc.REVIEW / 'shoulu' / f'{jid}-{seed}.png'
    if jid.startswith('ground-'):
      im = Image.open(src).convert('RGB').resize((600, 760), Image.LANCZOS)
      if j.get('glow'):
        im = glow(im, j['glow'])
      im.save(OUT / f'{jid}.webp', 'WEBP', quality=82, method=6)
    else:
      im = fc.key_green(src, key=j.get('key', 'magenta'))
      dst = (ART / 'shoulu' / f'{jid}.webp') if jid.endswith('walk-2') else OUT / f'{jid}.webp'
      fc.save_webp(im, dst, max_side=256 if jid.startswith(('tower', 'pine', 'rock', 'bush')) else 320)
    print(jid, '→ done')
  if not only:
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
    cut([k for k in a.only.split(',') if k])
