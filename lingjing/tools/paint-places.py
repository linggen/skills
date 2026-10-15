#!/usr/bin/env python3
"""paint-places.py — one backdrop painting per PLACE of 卷一, by the LOCAL FLUX.

    python3 tools/paint-places.py --seeds 11,23,47 --out DIR                 # a review round, every place, by day
    python3 tools/paint-places.py --only shiao-home,chaifang --night --seeds 23 --out DIR

The stage paints a picture under the story (paint-backdrop.py): by default the weather's.
Hanli approved 2026-10-15 (「go indoors images, as your recommendation」) a painting per place,
so the background moves when the scene does — 讲经堂 looks like 讲经堂. A set piece or a beast's
出场 still wins over it; a place without one falls back to the weather's painting. Each place
says whether it is a room (`indoor`): outdoors the weather, season and wind layers draw on top,
indoors only a faint seasonal tint. Night variants only where the story spends nights; the
others are darkened by code.

One hand with the weather set (chendingshan.webp's look: ink and light watercolour on warm aged
rice paper), but richer and livelier — Hanli's taste lesson of 2026-10-15: he preferred the
fuller paintings, a small seal or signature welcome, over sparse rule-correct redos. Wide 3:2
stage, the lower third quiet (the story lines sit there). 今线 (沂州中医药大学) is modern
buildings in the same ink style. No people; no text beyond a seal.

FLUX.2 klein 4B through mflux (paint-backdrop.py's recipe; HF_HOME ~/.linggen/models/hf-hub,
offline, nothing downloaded), English prompt only. Each render waits until no other
mlx_picture.py is running (another painter may share the machine). Output 1536×1024, webp q84.
"""
# The kept picks (2026-10-15, round r1 of seeds 11 and 23; picked by the builder's coordinator for Hanli, who
# delegated it): '<place>': seed → worlds/jiuding/art/places/<place>.webp; `night` → <place>-night.webp, the same seed
# with the NIGHT line (--night), which keeps the day picture's composition.
KEPT = {
    'shiao': {'seed': 11, 'round': 'r1'},
    'shiao-home': {'seed': 11, 'round': 'r1', 'night': True},
    'shiao-zaojian': {'seed': 11, 'round': 'r1'},
    'shiao-chaiduo': {'seed': 11, 'round': 'r1', 'night': True},
    'mengshan': {'seed': 11, 'round': 'r1'},
    'heisong': {'seed': 11, 'round': 'r1'},
    'duanbei': {'seed': 23, 'round': 'r1'},
    'heisong-creek': {'seed': 11, 'round': 'r1'},
    'heisong-cliff': {'seed': 23, 'round': 'r1'},
    'yingu': {'seed': 23, 'round': 'r1'},
    'yingu-cave': {'seed': 23, 'round': 'r1', 'night': True},
    'shanmen': {'seed': 11, 'round': 'r1'},
    'songlin': {'seed': 11, 'round': 'r1'},
    'houshan': {'seed': 11, 'round': 'r1'},
    'sishui-shimen': {'seed': 11, 'round': 'r1'},
    'yanwu': {'seed': 11, 'round': 'r1'},
    'yaoyuan': {'seed': 11, 'round': 'r1', 'night': True},
    'zhengdian': {'seed': 11, 'round': 'r1'},
    'jiangtang': {'seed': 11, 'round': 'r1'},
    'chaifang': {'seed': 11, 'round': 'r1', 'night': True},
    'chaifang-back': {'seed': 11, 'round': 'r1'},
    'waimen': {'seed': 11, 'round': 'r1'},
    'waimen-dorm': {'seed': 23, 'round': 'r1', 'night': True},
    'mijing-shishi': {'seed': 11, 'round': 'r1'},
    'mijing-cliff': {'seed': 11, 'round': 'r1'},
    'jin-track': {'seed': 23, 'round': 'r1'},
    'jin-court': {'seed': 11, 'round': 'r1'},
    'jin-gym': {'seed': 11, 'round': 'r1'},
    'jin-stacks': {'seed': 11, 'round': 'r1', 'night': True},
    'jin-ward': {'seed': 11, 'round': 'r1'},
    'jin-night': {'seed': 11, 'round': 'r1', 'night': True},
}

import argparse, json, os, subprocess, time
from pathlib import Path

PY = Path.home() / '.linggen/runtime/envs/pictures/bin/python'
SCRIPT = Path.home() / '.linggen/runtime/mlx_picture.py'
MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'
W, H = 1536, 1024

STYLE = ('A Chinese ink-and-light-watercolour painting on warm aged rice paper: loose wet ink washes and lively xieyi brushwork '
         'with some fine ink linework, not a tight line drawing; expressive strokes, soft grey washes, muted mineral colours (pale blue-green, ochre, rust, indigo), visible paper grain, '
         'rich atmosphere and depth, generous empty space, like a plate from a finely illustrated old Chinese novel; a small red '
         'artist\'s seal in a corner is fine. No people, no figures, no animals. No text, no letters, no calligraphy except the small seal; '
         'no border, no frame.')
OLD = 'Set in old China, Ming dynasty, not Japanese, not Western.'
NEW = 'Set in a present-day northern Chinese city, drawn in the old ink style; modern buildings, no cars in focus, no signs with readable text.'
STAGE = ('Wide 3:2 composition like a stage set: the interest sits in the upper two thirds; the bottom third of the picture is quiet '
         'and plain — empty ground, floor or water, nothing in it.')
NIGHT = ('It is night over the WHOLE picture: everything washed in deep dark blue-black ink, lit only by faint cold moonlight or a '
         'small warm lamp glow where said; no bright paper anywhere.')

# id → (area, zh label, indoor, night?, prompt). Areas make the contact sheets. `night` = the story spends nights here.
PLACES = {
  # 石坳村
  'shiao':         ('shiao', '石坳村', False, False, 'A poor mountain village at the foot of Mount Meng: a few thatched mud-walled cottages with little fenced yards, an old pagoda tree with a spreading crown at the village mouth, a stone well, a dirt lane, a vegetable patch, smoke from one chimney, green hills and a steep mountain behind.'),
  'shiao-home':    ('shiao', '石坳村 · 家中', True, True, 'Inside a very poor hunter\'s thatched cottage: a mud-brick kang bed with a worn quilt, a wooden chest, a crooked door, a small paper window, a hunting bow and a skinning knife hung on the mud wall, a row of basins on the floor catching drips from the leaking roof, an oil lamp on a low table, rafters and straw above.'),
  'shiao-zaojian': ('shiao', '石坳村 · 灶间', True, False, 'Inside a poor village kitchen: a big mud-brick stove with an iron wok and a wooden lid, a bellows, firewood stacked by the stove, a water vat, a few bowls on a shelf, a tiny oil lamp, a small paper window, soot on the walls, steam rising.'),
  'shiao-chaiduo': ('shiao', '石坳村 · 屋后柴垛', False, True, 'Behind a thatched cottage at the foot of the mountain: a big tall woodpile of stacked firewood against the back mud wall, a chopping block with an axe, a low fence, an old tree, dark pine hills and the mountain beyond, a wide open sky.'),
  # 蒙山 · 黑松岭 · 银叶谷
  'mengshan':      ('mengshan', '蒙山 · 前山', False, False, 'The front slopes of Mount Meng: grassy hillsides and scrub, a hunter\'s narrow path climbing among rocks and a few pines, layered green mountains rising behind into the sky.'),
  'heisong':       ('mengshan', '黑松岭', False, False, 'Black Pine Ridge: a dark, dense, ancient forest of black pines on a steep ridge, twisted trunks, deep shadow between them, a faint game trail, hanging mist, rugged crags above; wild and forbidding.'),
  'duanbei':       ('mengshan', '黑松岭 · 断碑', False, False, 'At the edge of a dark black-pine forest, a tall old stone stele broken in half stands by a faint path, moss and vines on it, its top half fallen in the grass; the dark ridge rises behind, forbidding.'),
  'heisong-creek': ('mengshan', '黑松岭 · 谷口溪边', False, False, 'A clear mountain creek at the mouth of a valley under black pines: water running over smooth stones, ferns and reeds on the banks, a small pool, the valley opening into misty ridges beyond.'),
  'heisong-cliff': ('mengshan', '黑松岭 · 崖下', False, False, 'At the foot of a sheer dark cliff on a pine ridge: a towering rock face with cracks and clinging pines, fallen boulders and scree at its base, roots and moss, the sky a narrow strip above.'),
  'yingu':         ('mengshan', '银叶谷', False, False, 'A hidden secluded valley of silver-leaved trees: pale shimmering silvery leaves, a shallow hollow in the ground among grass and ferns, soft mist, steep mountain walls around, an unearthly calm and quiet beauty.'),
  'yingu-cave':    ('mengshan', '银叶谷 · 石洞', True, True, 'Inside a shallow rock cave in a mountain valley, looking out through the cave mouth: rough stone walls and ceiling, a small campfire of twigs on the stone floor, a bundle and a folded coat by it, and through the arched mouth the misty valley and silver-leaved trees outside.'),
  # 沉鼎观 (outside)
  'shanmen':       ('chending-out', '沉鼎观 · 山门', False, False, 'The mountain gate of an old Taoist temple: a weathered stone paifang gate at the top of a long steep flight of stone steps, a cliff wall beside the steps carved with rows of old characters worn smooth, ancient pines, clouds below, temple roofs glimpsed above.'),
  'songlin':       ('chending-out', '沉鼎观 · 山门外的林子', False, False, 'A deep old forest outside a mountain temple gate: tall straight pines and old oaks, dappled light, ferns and mossy rocks, a winding footpath vanishing into the wood, mist between the trunks.'),
  'houshan':       ('chending-out', '沉鼎山 · 后山崖顶', False, False, 'A high cliff top behind the temple mountain: a flat bluestone slab swept clean, a small thatched hut with a half-open door, a gnarled pine leaning out over the drop, a sea of clouds and far peaks below, a great open sky.'),
  'sishui-shimen': ('chending-out', '泗水 · 秘境石门', False, False, 'A wide river shrunk to a thin line in its bed, vast glistening mud flats on both banks, and standing on the mud in a river bend a tall square ancient stone door, dark and mysterious, carved with worn patterns; the temple mountain on the far bank.'),
  'yanwu':         ('chending-out', '外门演武场 · 五行台', False, False, 'A temple training ground: a broad packed-earth courtyard, in its middle a low round platform of five bluestone slabs with grass in the seams, four ancient cypress trees at the corners, weapon racks, temple halls with grey-tiled upturned eaves around.'),
  'yaoyuan':       ('chending-out', '沉鼎观 · 药园', False, True, 'A temple herb garden on a mountain terrace: neat terraced beds of medicinal herbs and flowers, a bamboo fence and gate, a small tool shed, a stone path, a trellis, pines and mountain peaks behind.'),
  # 沉鼎观 (inside the walls)
  'zhengdian':     ('chending-in', '沉鼎观 · 正殿', True, False, 'Inside the great main hall of an old Taoist temple: massive red-lacquered columns, dim light from tall lattice doors, no statue, only an empty square stone pedestal in the middle with a darker patch on top, a few round straw cushions, a test stone, incense haze, high dark beams.'),
  'jiangtang':     ('chending-in', '沉鼎观 · 讲堂', True, False, 'Inside an old temple lecture hall: three bays under grey tile, rows of low wooden desks and straw cushions, a raised dais with a lectern at the front, tall lattice windows letting in slanting light, old elm beams, a small bronze tripod incense burner, scrolls on shelves.'),
  'chaifang':      ('chending-in', '沉鼎观 · 柴房', True, True, 'Inside a small temple woodshed turned into a room: firewood stacked to the rafters along one wall, a narrow plank bed, a small clay furnace with a faint glow, a rough wooden door, a little paper window, tools hung on pegs, straw on the floor.'),
  'chaifang-back': ('chending-in', '沉鼎观 · 柴房后面', False, False, 'The back yard behind a temple woodshed: muddy ground, a big woodpile and a chopping block, a stone wall, an old locust tree, the grey-tiled roofs of the temple and the mountain behind.'),
  'waimen':        ('chending-in', '沉鼎观 · 外门', False, False, 'The outer court of a mountain temple: a stone-paved courtyard, simple disciple dormitories and a refectory with grey-tiled roofs, an old locust tree, a wooden notice board on posts, a covered walkway, the mountain peaks behind.'),
  'waimen-dorm':   ('chending-in', '沉鼎观 · 外门 · 大通铺', True, True, 'Inside a long temple dormitory: a long communal sleeping platform with rolled quilts in a row, wooden pillars, a window at the far end, a door, a few bundles and sandals on the floor, plain whitewashed walls.'),
  # 沉鼎秘境 — underground, its own dim light
  'mijing-shishi': ('mijing', '沉鼎秘境 · 石室', True, False, 'Inside an ancient sealed stone chamber deep underground: walls of fitted stone carved with faded diagrams of the five elements, a low mound of earth in the middle, a faint glow from cracks, dust in the air; mysterious and silent.'),
  'mijing-cliff':  ('mijing', '沉鼎秘境 · 崖壁', True, False, 'Inside a vast dim underground secret realm: a sheer cliff wall rising into darkness, a deep black chasm below its edge, thin seeping water lines on the rock, strange faint lights in the dark; eerie and immense.'),
  # 今线 · 沂州中医药大学
  'jin-track':     ('jin', '沂中医 · 体育场 (scape track)', False, False, 'A university sports field: a red running track around a green football pitch, a low concrete grandstand, floodlight towers, teaching buildings and trees beyond.'),
  'jin-court':     ('jin', '沂中医 · 体育馆 (scape court)', True, False, 'Inside a university sports hall: a polished wooden basketball court, high steel roof trusses, big windows, folded bleachers along the wall, a hoop at the far end.'),
  'jin-gym':       ('jin', '沂中医 · 学生健身房 (scape gym)', True, False, 'Inside a small student gym: weight racks, a bench press, treadmills by big windows, rubber floor mats, a wall mirror.'),
  'jin-stacks':    ('jin', '图书馆 · 古籍部 (scape stacks/dark)', True, True, 'Inside the rare-books room of a university library: tall wooden shelves of old thread-bound Chinese books in cloth cases, a long reading table with a green-shaded lamp, a window, quiet and dusty.'),
  'jin-ward':      ('jin', '沂中医 · 城里的医院 (scape ward)', True, False, 'Inside a city hospital ward: a white hospital bed with a steel rail, a drip stand, a bedside cabinet with a thermos, a window with thin curtains, clean pale light.'),
  'jin-night':     ('jin', '沂中医 · 一食堂后门 (scape night)', False, True, 'The back door of a university canteen: a loading area with stacked crates and bins, a steel door under a small lamp, steam from a vent, a row of bicycles, plane trees.'),
}


def prompt(pid, night=False):
  _, _, indoor, _, scene = PLACES[pid]
  era = NEW if pid.startswith('jin-') else OLD
  dark = f' {NIGHT}' if night else ''
  return f'{scene}{dark} {STAGE} {era} Style: {STYLE}'


def wait_turn():
  while subprocess.run(['pgrep', '-f', 'envs/pictures/bin/python .*mlx_picture'], capture_output=True).stdout.strip():
    time.sleep(0.5)


def render(p, seed, png):
  wait_turn()
  req = {'model': MODEL, 'prompt': p, 'out': str(png), 'width': W, 'height': H, 'seed': seed, 'reference': None}
  env = dict(os.environ, HF_HOME=str(Path.home() / '.linggen/models/hf-hub'), HF_HUB_OFFLINE='1')
  r = subprocess.run([str(PY), str(SCRIPT)], input=json.dumps(req), text=True, capture_output=True, env=env)
  return r.returncode == 0 and png.exists(), (r.stdout.strip() or r.stderr.strip())[-200:]


def webp(png, out):
  return subprocess.run(['/opt/homebrew/bin/cwebp', '-q', '84', str(png), '-o', str(out)], capture_output=True).returncode == 0


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--seeds', required=True, help='seeds to roll, e.g. 11,23,47')
  ap.add_argument('--only', default='', help='place ids, comma-separated (default all)')
  ap.add_argument('--night', action='store_true', help='the night variants (only places with night needs, unless --only)')
  ap.add_argument('--out', required=True, help='review folder (PNGs, webps and prompts.json land here)')
  a = ap.parse_args()
  base = Path(a.out)
  base.mkdir(parents=True, exist_ok=True)
  ids = a.only.split(',') if a.only else [k for k, v in PLACES.items() if v[3] or not a.night]
  part = 'night' if a.night else 'day'
  prompts = {f'{i}-{part}': prompt(i, a.night) for i in ids}
  (base / f'prompts-{part}.json').write_text(json.dumps(prompts, ensure_ascii=False, indent=1) + '\n')
  for seed in [int(s) for s in a.seeds.split(',')]:
    for i in ids:
      png = base / f'{i}-{part}-s{seed}.png'
      if png.exists():
        continue
      t = time.time()
      ok, said = render(prompts[f'{i}-{part}'], seed, png)
      print(f'{i}-{part} seed {seed}: {"ok" if ok and webp(png, png.with_suffix(".webp")) else "failed " + said} ({time.time() - t:.0f}s)', flush=True)


if __name__ == '__main__':
  main()
