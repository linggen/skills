#!/usr/bin/env python3
"""paint-items-comic-flux.py — the small games' comic item set, painted by the local FLUX (Hanli 10-20: 「A, 画一套漫画风的道具」).

    PY=~/.linggen/runtime/envs/pictures/bin/python
    FLUX_REVIEW=<scratch> $PY tools/paint-items-comic-flux.py paint [--only id,…] [--seeds 1,2,3]   # → $FLUX_REVIEW/items-comic/
    FLUX_REVIEW=<scratch> $PY tools/paint-items-comic-flux.py sheet [--only id,…]                    # contact sheets to look at
    FLUX_REVIEW=<scratch> $PY tools/paint-items-comic-flux.py cut                                     # the KEPT seeds → art/items-comic/

Every item 喂饭桶 · 割藤 (games/fantongcut.js, deleted 2026-10-20; the set is kept for the games to come) could hang: what the 饭桶 eats (items.json less fantong.json `never`), the
秘境's finds (鼎苔 · 灵芝 · 人参 · 铜矿石) and the 奇遇's 药篓. art/items/ is 水墨 and stays the story's and the bag's; this
set is for the small games only (Hanli 10-19: small games are comic, story pages keep ink). Where an item has an ink
picture of its OWN (art/items/<id>.webp) the comic one is an edit pass from it, so it keeps its shape and colours;
an item that borrows another's ink (柴火棍 used 雷击木's) or has none is painted from its words.

`cut` keys the ground (magenta, or green for a pink / purple item), trims, and lays every icon on one square canvas
(SIZE, a little air round it; `scale` shrinks one that should read small) → art/items-comic/<id>.webp; the keyed
full-size cut goes to art/items-comic/src/. It writes scripts/games/items-comic.js, the ids the games look up.
"""
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flux_comic as fc

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
INK = ROOT / 'worlds' / 'jiuding' / 'art' / 'items'
OUT = ROOT / 'worlds' / 'jiuding' / 'art' / 'items-comic'
INDEX = ROOT / 'scripts' / 'games' / 'items-comic.js'
REVIEW = fc.REVIEW / 'items-comic'
SIZE, PAD = 192, 10

ICON = ('A single game inventory item icon: ONE object, big and simple, its silhouette readable when tiny, seen from a '
        'slightly raised three-quarter view.')

# id → what it is (English, the object only). `key`: 'green' for a pink / purple / magenta thing. `scale`: < 1 to
# read small on the canvas. `txt`: paint from the words even when an own ink picture exists (the ink is off).
ITEMS = {
  # the 秘境's finds and deals
  'dingtai': dict(txt=True, d='a lump of bright jade-green velvety moss with a soft green glow, scraped off with a thin flake of old bronze under it'),
  'lingzhi': dict(d='a glossy reddish-brown lingzhi mushroom: a big kidney-shaped lacquered cap with growth rings on a short twisted stalk'),
  'ginseng': dict(d='a pale cream ginseng root with forked legs and whiskery hair-roots, a sprig of green leaves and red berries on top'),
  'tongkuang': dict(d='a chunky lump of copper ore, rusty brown-orange rock with turquoise-green malachite patches'),
  'yaolou': dict(d='an old woven bamboo herb basket with a rope strap, a few green herbs and a root poking out of the top'),
  # 凡物 by the woodpile, and what the 饭桶 spits back
  'chaihuo': dict(d='one short split firewood stick, pale split wood on one side and brown bark on the other, laid diagonally'),
  'shizi': dict(d='one flat oval grey river pebble lying on its side, a little speckled, clearly a stone and not a ball', scale=0.7),
  'xiao-shizi': dict(d='one flat oval grey river pebble lying on its side, a little speckled, clearly a stone and not a ball', scale=0.42),
  'kuye': dict(d='one dry curled brown autumn leaf with a short stem'),
  'huangjing-gen': dict(d='a knobbly yellow Solomon\'s seal root, half rotten, with dark brown rot spots and a few limp rootlets'),
  'huangqi-canzhu': dict(d='a broken milkvetch plant: a pale yellow root with a snapped stem and a few worm-bitten green leaves with holes'),
  'yaqian': dict(d='one thin wooden toothpick laid diagonally, its tip chewed', scale=0.85),
  'guoba': dict(d='a crispy golden-brown slab of scorched rice crust, bumpy rice grains on its surface'),
  'yicuo-hui': dict(d='a small heap of soft grey ash with a few black charcoal flecks', scale=0.8),
  'hanxiao-bandian': dict(key='green', d='one round bright pink pill with tiny white flower petals floating round it'),
  'zhixiao-wan': dict(d='one round dark olive-green bitter pill, a little steam of bitterness over it'),
  'tama-defu': dict(d='a crumpled yellow paper talisman strip with a clumsy red drawing of a stick-legged horse on it, no writing'),
  'ganliang': dict(d='travel rations: a little stack of three round flat baked flatbreads tied with a string'),
  'talisman': dict(d='a yellow paper talisman strip with red cinnabar swirls and a red seal blob, no readable writing'),
  'qi-pill': dict(d='one round shining golden pill'),
  'mend-pill': dict(d='one round glossy red pill'),
  'qi-pill-3': dict(txt=True, d='one round shining golden pill with three raised golden bands round its middle like a stacked bead, three small sparkles beside it'),
  'mend-pill-3': dict(txt=True, d='one round glossy red pill with three raised golden bands round its middle like a stacked bead, three small sparkles beside it'),
  'baina-dai': dict(d='a plump drawstring pouch sewn from many patches of differently coloured cloth'),
  # pills
  'huiqi-pill': dict(d='one round glossy sky-blue pill with a soft blue glow'),
  'mend-pill-9': dict(d='one round glossy red pill inside a big radiant burst of golden light rays, a halo of many golden sparkles round it'),
  'qi-pill-9': dict(d='one round golden pill inside a big radiant burst of golden light rays, a halo of many golden sparkles round it'),
  # gear
  'bamboo-sword': dict(d='a practice sword made of pale green bamboo, a bound grip'),
  'iron-sword': dict(d='a plain straight double-edged iron Chinese jian sword with a simple guard, laid diagonally'),
  'duan-dao': dict(d='a short single-edged knife with a wooden handle bound in cord, laid diagonally'),
  'qiuyu-ci': dict(d='a long curved ivory-coloured beak spike with a leather-wrapped grip, laid diagonally'),
  'heyu-dao': dict(d='a dagger made from one big curved ivory-white beast tusk, thick and ridged at the base and tapering to a sharp point, its base wrapped in brown hide as a grip, laid diagonally'),
  'qingtong-jian': dict(d='an old Chinese bronze jian sword, the blade dull gold-brown bronze with a few blotches of green verdigris, a ring pommel, laid diagonally'),
  'huochai-jian': dict(d='a giant wooden matchstick like a sword, its round red head burning with a lively orange flame, laid diagonally'),
  'feijian-duan': dict(d='a short silver flying sword glowing with a pale blue light, laid diagonally'),
  'chitong-hulu': dict(d='a hulu bottle gourd made of shiny red copper metal, two round bulbs, a small one on top of a big one, a cork stopper and a red cord tied at its narrow waist'),
  'straw-cloak': dict(d='a traditional Chinese straw rain cape made of layered brown palm fibre, spread out'),
  'grey-robe': dict(d='a neatly folded plain grey cotton robe'),
  'pi-kanjian': dict(d='an old worn brown leather sleeveless vest'),
  'heyu-ao': dict(d='a thick short coat of reddish-brown bristly beast hide'),
  'lipi-kanjian': dict(d='a sleeveless vest of spotted leopard-cat fur'),
  'shunfeng-liu': dict(d='a pair of low ankle shoes of grey scaly beast skin with stitched soles, a few wind swirls behind them'),
  'pouch-low': dict(d='a small plain brown hemp drawstring pouch'),
  'pouch-mid': dict(d='a blue silk drawstring storage pouch with a gold cord'),
  'pouch-high': dict(d='a rich red-and-gold embroidered silk drawstring storage pouch'),
  'zou-purse': dict(key='green', d='a small red cloth coin purse tied with a red cord'),
  # charms and odd treasures
  'tama-fu': dict(d='a yellow paper talisman strip with a little red galloping horse painted on it and red speed lines, no writing'),
  'penti-fu': dict(d='a yellow paper talisman strip with a pale-blue puff of air curling off it, no writing'),
  'lianxi-fu': dict(d='a grey paper talisman strip with dark smoky swirls, no writing'),
  'wulei-fu': dict(d='a yellow paper talisman strip crackling with blue lightning, red zigzag marks on it, no writing'),
  'yangyang-zhen': dict(d='a little bundle of silver needles tied with a fluffy pink feather tuft'),
  'zipai-jing': dict(d='a round polished bronze hand mirror with a short handle'),
  'niuzhi-ganlu': dict(d='a small clay jar of red chili beef-tallow, red peppers and Sichuan peppercorns on top'),
  'neimen-map': dict(d='an old parchment map scroll half unrolled, mountains and a winding path drawn on it, no writing'),
  'jade-fish': dict(d='a small carved pale green jade fish pendant on a red cord'),
  'jade-ring': dict(d='a round flat pale green jade ring disc with a small gap in it, on a red cord'),
  'shi-zhui': dict(d='a smooth flat oval grey-brown river-stone pendant, a short cord loop tied on top, the whole cord inside the picture'),
  'shisui-zhui': dict(d='a milky white glowing teardrop stone-marrow pendant, a short cord loop tied on top, the whole cord inside the picture'),
  'anhe-yu': dict(d='a dark blue-green jade pebble pendant, oval and polished, a short cord loop tied on top, the whole cord inside the picture'),
  'chaiya-zhui': dict(d='a sharp white dhole fang pendant hanging on a leather cord'),
  'xizhu': dict(d='one luminous pale pearl with a soft swirl of breath in it'),
  # materials
  'sang-paper': dict(d='a small stack of off-white mulberry paper sheets, the top sheet curling'),
  'qi-salt': dict(d='a little heap of coarse white sea-salt crystals in a small dish'),
  'yaodan-1': dict(d='a demon core: one round glowing beast pearl'),
  'yaodan-2': dict(d='a demon core: one round glowing beast pearl, larger and brighter'),
  'yaodan-3': dict(d='a demon core: one round blazing beast pearl, the brightest'),
  'juyou': dict(d='two oranges and a big yellow-green pomelo with leaves'),
  'dansha': dict(key='green', d='a heap of bright red cinnabar crystals'),
  'shujin': dict(d='a folded bolt of rich patterned Sichuan brocade silk'),
  'langgan': dict(d='three round glossy blue-green jade beads side by side, one small and two larger, each with a white highlight'),
  'zixu-zhi': dict(key='green', d='a purple lingzhi mushroom: a flat glossy kidney-shaped purple cap with growth rings on a short twisted stalk, long thin purple whisker filaments trailing from the rim of its cap'),
  'deer-hide': dict(d='a folded tan deer hide with white spots'),
  'longxu-cao': dict(d='a bundle of long thin wiry green dragon-whisker grass tied in the middle'),
  'luobo': dict(d='one white radish with green leaves'),
  'hu-pi': dict(d='a rolled red fox pelt with a bushy white-tipped tail'),
  'li-pi': dict(d='a folded leopard-cat pelt with coin-shaped spots'),
  'houer-jiu': dict(d='a small clay wine jar with a leaf stopper and a little monkey paw print on it'),
  'she-tui': dict(d='a coiled pale papery shed snake skin'),
  'she-dan': dict(d='a small dark green snake gall bladder, glossy'),
  'ying-yu': dict(d='a few long brown-and-white barred hawk feathers'),
  'chai-ya': dict(d='one sharp curved white dhole fang'),
  'zhu-ya': dict(d='a pair of curling ivory boar tusks'),
  'lang-pi': dict(d='a folded thick grey wolf pelt'),
  'xiong-dan': dict(d='a dark black-gold bear gall, glossy'),
  'congcong-zhua': dict(d='a big beast claw with six sharp black talons'),
  'xiegou-yu': dict(d='a long grey-green feather from a strange bird'),
  'lingling-pi': dict(d='a folded ox hide with orange-and-black tiger stripes'),
  'yumu': dict(d='a few round pearly white fish eyes like pearls'),
  'jingjing-wei': dict(d='a long tuft of fine white tail hair bound at the top like a whisk'),
  'bibi-ling': dict(d='one long warm golden-brown wing feather'),
  'dangkang-ya': dict(d='one big curved ivory tusk'),
  'geju-zong': dict(d='a long tuft of bright red mane hair bound at the top'),
  'qique-zhua': dict(d='a chicken-like scaly bird foot ending in big hooked tiger claws'),
  'huangjing': dict(d='a plump knobbly golden-yellow Solomon\'s seal root'),
  'heshouwu': dict(d='a dark reddish-brown knobbly fleeceflower root'),
  'fuling': dict(d='a lumpy round brown poria fungus ball, white inside where a piece is cut'),
  'cangzhu': dict(d='a gnarled brown atractylodes root with a few green leaves'),
  'chaihu': dict(d='a bupleurum plant with thin green leaves, small yellow flowers and a brown root'),
  'yuanzhi': dict(d='a polygala plant with thin green leaves, small purple flowers and a long root'),
  'chonglou': dict(d='a paris herb: one stem with a whorl of seven green leaves and one spidery yellow-green flower on top'),
  'shihu': dict(d='a dendrobium orchid: jointed golden-green stems with a few pale flowers'),
  'banxia': dict(d='a pinellia plant: a small round white tuber with a few green leaves'),
  'songmo': dict(d='a little cluster of brown-capped pine mushrooms'),
  'tie-sha': dict(d='a small heap of dark grey iron sand'),
  'yunmu': dict(d='a stack of thin shiny translucent mica sheets'),
  'cishi': dict(d='a dark grey lodestone lump with a few iron filings stuck to it'),
  'xionghuang': dict(key='green', d='a lump of bright orange-red realgar crystal'),
  'chishizhi': dict(key='green', d='a lump of smooth red-pink clay rock'),
  # 喂饭桶 · 开炉's new prizes (Hanli 10-20 table) and what it gives that the old set lacked
  'banjie-fanshao': dict(d='the handle half of a wooden rice paddle, snapped off with a ragged bitten edge where the scoop should be'),
  'yike-daya': dict(d='one huge yellowish-white molar tooth with two roots, a red thread tied round its roots', scale=0.85),
  'yige-ge': dict(d='one round see-through bubble the size of a fist with a little swirl of grey fog inside it', scale=0.85),
  'lingshi': dict(d='spirit stones: three glowing pale-blue faceted crystals in a little cluster'),
  'fangzi-canye': dict(d='a torn half-burned yellowed paper page with scorched brown edges and faint red brush strokes, no readable writing'),
  'baoge-ling': dict(d='a small greasy brown wooden token with a fat round belly carved on its face and a red cord through a hole at the top, no writing'),
  'yinyue-lingdang': dict(d='one tiny round silver bell on a short red cord tied in a bow', scale=0.7),
  'foundation-pill': dict(txt=True, d='one round pale jade-white pill with one thin gold ring round its middle and a few dark specks on it'),
  'foundation-pill-9': dict(txt=True, d='one round crystal-clear pill like a frozen dewdrop, nine thin gold rings round it, a radiant halo of golden light'),
}

# Looked at 2026-10-20: the seed taken for each (a contact sheet per batch; fake text and off items re-rolled).
KEPT = {
  'dingtai': 2,
  'lingzhi': 1,
  'ginseng': 2,
  'tongkuang': 2,
  'yaolou': 2,
  'chaihuo': 2,
  'shizi': 1,
  'xiao-shizi': 1,
  'kuye': 1,
  'huangjing-gen': 2,
  'huangqi-canzhu': 2,
  'yaqian': 1,
  'guoba': 2,
  'yicuo-hui': 2,
  'hanxiao-bandian': 2,
  'zhixiao-wan': 2,
  'tama-defu': 2,
  'ganliang': 2,
  'talisman': 2,
  'qi-pill': 2,
  'mend-pill': 1,
  'qi-pill-3': 1,
  'mend-pill-3': 1,
  'baina-dai': 2,
  'huiqi-pill': 1,
  'mend-pill-9': 1,
  'qi-pill-9': 1,
  'bamboo-sword': 1,
  'iron-sword': 2,
  'duan-dao': 1,
  'qiuyu-ci': 1,
  'heyu-dao': 2,
  'qingtong-jian': 1,
  'huochai-jian': 1,
  'feijian-duan': 2,
  'chitong-hulu': 1,
  'straw-cloak': 1,
  'grey-robe': 1,
  'pi-kanjian': 1,
  'heyu-ao': 2,
  'lipi-kanjian': 2,
  'shunfeng-liu': 2,
  'pouch-low': 1,
  'pouch-mid': 2,
  'pouch-high': 1,
  'zou-purse': 2,
  'tama-fu': 1,
  'penti-fu': 2,
  'lianxi-fu': 1,
  'wulei-fu': 1,
  'yangyang-zhen': 2,
  'zipai-jing': 1,
  'niuzhi-ganlu': 2,
  'neimen-map': 2,
  'jade-fish': 2,
  'jade-ring': 1,
  'shi-zhui': 1,
  'shisui-zhui': 1,
  'anhe-yu': 1,
  'chaiya-zhui': 2,
  'xizhu': 1,
  'sang-paper': 1,
  'qi-salt': 2,
  'yaodan-1': 1,
  'yaodan-2': 2,
  'yaodan-3': 1,
  'juyou': 1,
  'dansha': 2,
  'shujin': 2,
  'langgan': 2,
  'zixu-zhi': 2,
  'deer-hide': 2,
  'longxu-cao': 1,
  'luobo': 2,
  'hu-pi': 2,
  'li-pi': 2,
  'houer-jiu': 2,
  'she-tui': 2,
  'she-dan': 1,
  'ying-yu': 2,
  'chai-ya': 1,
  'zhu-ya': 2,
  'lang-pi': 1,
  'xiong-dan': 1,
  'congcong-zhua': 1,
  'xiegou-yu': 1,
  'lingling-pi': 2,
  'yumu': 1,
  'jingjing-wei': 2,
  'bibi-ling': 2,
  'dangkang-ya': 1,
  'geju-zong': 2,
  'qique-zhua': 2,
  'huangjing': 2,
  'heshouwu': 1,
  'fuling': 2,
  'cangzhu': 1,
  'chaihu': 2,
  'yuanzhi': 1,
  'chonglou': 2,
  'shihu': 1,
  'banxia': 2,
  'songmo': 1,
  'tie-sha': 1,
  'yunmu': 2,
  'cishi': 1,
  'xionghuang': 1,
  'chishizhi': 2,
  'banjie-fanshao': 2,
  'yike-daya': 1,
  'yige-ge': 2,
  'lingshi': 3,
  'fangzi-canye': 3,
  'baoge-ling': 2,
  'yinyue-lingdang': 2,
  'foundation-pill': 2,
  'foundation-pill-9': 2,
}


def own_ink(jid):
  p = INK / f'{jid}.webp'
  return p if p.exists() and not ITEMS[jid].get('txt') else None


def png_ref(src):
  """mflux reads PNG/JPEG paths: the webp ink as a PNG beside the review files."""
  from PIL import Image
  dst = REVIEW / 'ref' / f'{src.stem}.png'
  if not dst.exists():
    dst.parent.mkdir(parents=True, exist_ok=True)
    Image.open(src).convert('RGB').save(dst)
  return dst


def ground(jid):
  return fc.ON_GREEN if ITEMS[jid].get('key') == 'green' else fc.ON_MAGENTA


def jobs():
  out = {}
  for jid, it in ITEMS.items():
    ink = own_ink(jid)
    if ink:
      prompt = (f'The attached picture is an ink-wash painting of {it["d"]}. Redraw ONLY that object, the same object '
                'with the same shape, colours and details, as a comic game icon. Leave out the paper, the ink wash, the '
                f'ground, rocks, table and all scenery. {ICON} {fc.STYLE} {ground(jid)}')
      out[jid] = dict(w=512, h=512, prompt=prompt, refs=[png_ref(ink)])
    else:
      out[jid] = dict(w=512, h=512, prompt=f'{ICON} The object: {it["d"]}. {fc.STYLE} {ground(jid)}')
  return out


def sheet(ids, seeds, name):
  """A contact sheet: one row per item, its seeds side by side, labelled by id (the label is the sheet's, not the art's)."""
  from PIL import Image, ImageDraw
  T = 200
  rows = [i for i in ids if any((REVIEW / f'{i}-{s}.png').exists() for s in seeds)]
  c = Image.new('RGB', (110 + T * len(seeds), T * len(rows)), 'white')
  d = ImageDraw.Draw(c)
  for r, jid in enumerate(rows):
    d.text((4, r * T + T // 2), jid, fill='black')
    for k, s in enumerate(seeds):
      p = REVIEW / f'{jid}-{s}.png'
      if p.exists():
        c.paste(Image.open(p).convert('RGB').resize((T - 4, T - 4)), (110 + k * T, r * T))
        d.text((112 + k * T, r * T + 2), str(s), fill='white')
  out = REVIEW / 'sheets' / f'{name}.png'
  out.parent.mkdir(parents=True, exist_ok=True)
  c.save(out)
  print(out)


def cut():
  from PIL import Image
  ids = []
  for jid, seed in KEPT.items():
    im = fc.key_green(REVIEW / f'{jid}-{seed}.png', key=ITEMS[jid].get('key', 'magenta'))
    fc.save_webp(im, OUT / 'src' / f'{jid}.webp', max_side=512, quality=90)
    box = round((SIZE - 2 * PAD) * ITEMS[jid].get('scale', 1))
    k = box / max(im.size)
    sm = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    c = Image.new('RGBA', (SIZE, SIZE))
    c.alpha_composite(sm, ((SIZE - sm.width) // 2, (SIZE - sm.height) // 2))
    fc.save_webp(c, OUT / f'{jid}.webp', quality=88)
    ids.append(jid)
  ids.sort()
  INDEX.write_text(
    '// items-comic.js — written by tools/paint-items-comic-flux.py `cut`; do not edit by hand.\n'
    '// The small games\' comic item icons (Hanli 10-20: 「A, 画一套漫画风的道具」): art/items-comic/<id>.webp, one\n'
    f'// {SIZE} px square each, transparent. art/items/ stays the story\'s and the bag\'s ink.\n'
    f'const IDS = new Set({json.dumps(ids)});\n'
    'const BASE = new URL(\'../../worlds/jiuding/art/items-comic/\', import.meta.url).href;\n'
    '/** The comic icon for an item id, or null when the set has none (the caller draws its glyph). */\n'
    'export const comicArt = (id) => (id && IDS.has(id) ? `${BASE}${id}.webp` : null);\n')
  print(len(ids), 'icons →', OUT, ';', INDEX)


if __name__ == '__main__':
  import argparse
  ap = argparse.ArgumentParser()
  ap.add_argument('cmd', choices=['paint', 'cut', 'sheet'])
  ap.add_argument('--only', default='')
  ap.add_argument('--seeds', default='1,2,3')
  ap.add_argument('--force', action='store_true')
  ap.add_argument('--name', default='sheet')
  a = ap.parse_args()
  if a.cmd == 'paint':
    fc.paint_all('items-comic', jobs(), a)
  elif a.cmd == 'sheet':
    sheet([k for k in a.only.split(',') if k] or list(ITEMS), [int(s) for s in a.seeds.split(',')], a.name)
  else:
    cut()
