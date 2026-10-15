#!/usr/bin/env python3
"""paint-festivals.py — one picture per festival, by the LOCAL FLUX (paint-backdrop.py's recipe).

    python3 tools/paint-festivals.py --seeds 11,23 --out DIR            # a review round, every festival
    python3 tools/paint-festivals.py --only zhongqiu,wanshengjie --seeds 7 --out DIR

On a festival day the stage's backdrop is that festival's painting (festivals.json `backdrop`,
atmos.js stageArt), with the festival's dressing drawn live on top; a scene's own sky or set
piece still wins. The engine's app shows the same pictures, faint, behind its sky overlay
(it keeps its own copies in ui/public/festivals). Hanli approved the set 2026-10-15.

One set, one hand: the backdrops' house look (ink and light watercolour on warm aged rice paper,
xieyi strokes, muted mineral colours, generous empty space), and only the festival's subject
changes. The bottom ~35% sits under dark-faded text, so the subject lives in the upper two
thirds. The western feasts (情人节 元旦 圣诞 万圣节 感恩节) take clearly Western subjects — Hanli,
2026-10-15: recognised at a glance (a tree and stockings, roses and a letter, jack-o'-lanterns,
fireworks, a turkey) — still in the same ink (a 西域胡商's feast days, never 道统 lore);
清明 is quiet. FLUX.2 klein 4B through mflux, English prompt only; "no text" is unreliable, so
every picture is looked at and one with marks, letters or a seal is rolled again.
Output 1536×1024, webp q84.
"""
# The kept picks (2026-10-15), each worlds/jiuding/art/festival/<id>.webp.
# Round one (seeds 11, 23) for the lunar feasts and 清明; picked by the builder's coordinator for Hanli.
KEPT = {
    'chuxi': {'seed': 11},  # fireworks over the snowed village, warm lit windows
    'chunjie': {'seed': 23},  # the lane of lanterns framed by a plum branch, the gate down the lane
    'yuanxiao': {'seed': 11},  # lanterns over the river and bridge, full reflections
    'qingming': {'seed': 11},  # willows in misty rain, the quiet path
    'duanwu': {'seed': 11},  # the dragon boat far off on the river, mugwort and reeds
    'qixi': {'seed': 11},  # the Milky Way and the magpies' arc
    'zhongqiu': {'seed': 11},  # the full moon and osmanthus over the river
    'chongyang': {'seed': 11},  # chrysanthemums on the high terrace, geese in a line
    'laba': {'seed': 11},  # the snowed temple, smoke from its kitchen
    # Round two (seeds 11, 23, 47), the western five on Western subjects — provisional picks, Hanli to choose.
    'qingrenjie': {'seed': 23, 'round': 'west'},  # red roses and a letter sealed with a heart (s47's letter grew marks)
    'wanshengjie': {'seed': 47, 'round': 'west'},  # two glowing jack-o'-lanterns under a bare tree, bats, the crescent
    'ganenjie': {'seed': 11, 'round': 'west'},  # the turkey on the harvest table, maples at the window
    'yuandan': {'seed': 11, 'round': 'west'},  # fireworks over the town and its clock tower
    'shengdan': {'seed': 47, 'round': 'west'},  # the tree and the stockings at the hearth, snow at the window
}

import argparse, json, os, subprocess
from pathlib import Path

PY = Path.home() / '.linggen/runtime/envs/pictures/bin/python'
SCRIPT = Path.home() / '.linggen/runtime/mlx_picture.py'
MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'
W, H = 1536, 1024

STYLE = ('A Chinese ink-and-light-watercolour painting on warm aged rice paper, xieyi freehand brushwork: loose expressive ink strokes, '
         'soft grey washes, a few muted mineral colours (pale ochre, faded cinnabar, celadon), visible paper grain, generous empty '
         'space, calm and quiet, like a plate from a finely illustrated old Chinese book. The lower third of the picture is plain and '
         'quiet, almost empty paper or still water. No people, no faces, no figures. No text, no letters, no characters, no calligraphy, '
         'no writing on lanterns or banners, no seal, no red stamp, no signature, no border, no frame, no vignette.')

SUBJECT = {
  'chuxi': 'New Year\'s Eve night in an old Chinese mountain village: snow on thatched roofs, warm lamplight in every small window, '
           'smoke rising from chimneys into a dark ink sky, a few faint red sparks of firecrackers far off.',
  'chunjie': 'The Spring Festival: a narrow old village lane of grey tiled roofs, plain red paper lanterns hanging along the eaves, '
             'a light dusting of snow, a plum branch with pink blossoms in the foreground corner, a soft winter sky.',
  'yuanxiao': 'The Lantern Festival night: many small round glowing paper lanterns floating over a dark river and an arched stone '
              'bridge, their warm reflections trembling on the water, a round full moon above.',
  'qingrenjie': "Valentine's Day, painted in Chinese ink: a loose bouquet of red roses tied with a ribbon lying on a table beside a folded love letter with a small red heart drawn on its seal, a few rose petals scattered, a window with soft light. Tender and quiet.",
  'qingming': 'Qingming, the tomb-sweeping day: fine misty spring rain over green hills, weeping willows with long pale-green strands, '
              'a lonely stone path leading into mist, a few white pear blossoms. Quiet, respectful, gentle grey and green.',
  'duanwu': 'The Dragon Boat Festival: a long carved dragon boat on a wide river seen from afar, small and simple, river reeds and '
            'bundles of mugwort in the foreground, early summer haze over far hills.',
  'qixi': 'The Qixi night: a deep indigo sky with the Milky Way flowing across it like a river of pale ink and stars, a flock of '
          'magpies rising into it in a long arc, dark hills below.',
  'zhongqiu': 'The Mid-Autumn Festival: a huge round pale-gold full moon in a clear night sky, a branch of osmanthus with tiny '
              'golden flowers reaching in from the side, a calm river below reflecting the moon.',
  'chongyang': 'The Double Ninth Festival: a high mountain terrace among autumn peaks, clusters of yellow chrysanthemums by a rock, '
               'a sprig of red dogwood berries, far ridges and a few wild geese flying in a line across a pale autumn sky.',
  'wanshengjie': "Halloween, painted in Chinese ink: three carved jack-o'-lantern pumpkins with grinning faces glowing warm orange from inside, on the ground by a crooked bare tree, a few bats flying across a thin crescent moon, falling leaves. Playful and a little eerie, but calm.",
  'ganenjie': 'Thanksgiving, painted in Chinese ink: a harvest table seen close with a golden roast turkey on a platter, pumpkins, apples, corn and a pie, red and gold maple leaves scattered, a window onto autumn trees. Warm, thankful and calm.',
  'laba': 'Laba, deep winter: a quiet old mountain temple half buried in snow, a thin thread of smoke rising from its kitchen, a '
          'clay pot steaming on a small stove under the eaves, bare trees, a pale grey sky.',
  'yuandan': "New Year's Day at midnight, painted in Chinese ink: bursts of fireworks in soft ochre, cinnabar and pale gold blooming in a dark night sky over a small sleeping town of rooftops and a clock tower, their light reflected faintly. Festive but quiet.",
  'shengdan': 'Christmas, painted in Chinese ink: a decorated Christmas tree with small baubles, a star on top and a few warm candles, stockings hanging at a brick hearth with a low fire, a window showing snow falling outside. Warm and gentle.',
}


def prompt(fid):
  return f'{SUBJECT[fid]} Style: {STYLE}'


def render(p, seed, png):
  req = {'model': MODEL, 'prompt': p, 'out': str(png), 'width': W, 'height': H, 'seed': seed, 'reference': None}
  env = dict(os.environ, HF_HOME=str(Path.home() / '.linggen/models/hf-hub'), HF_HUB_OFFLINE='1')
  r = subprocess.run([str(PY), str(SCRIPT)], input=json.dumps(req), text=True, capture_output=True, env=env)
  return r.returncode == 0 and png.exists(), (r.stdout.strip() or r.stderr.strip())[-200:]


def webp(png, out):
  return subprocess.run(['/opt/homebrew/bin/cwebp', '-q', '84', str(png), '-o', str(out)], capture_output=True).returncode == 0


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--seeds', required=True, help='seeds to roll, e.g. 11,23')
  ap.add_argument('--only', default='', help='festival ids, e.g. zhongqiu,wanshengjie (default all)')
  ap.add_argument('--out', required=True, help='review folder (PNGs, webps and prompts.json land here)')
  a = ap.parse_args()
  base = Path(a.out)
  base.mkdir(parents=True, exist_ok=True)
  ids = a.only.split(',') if a.only else list(SUBJECT)
  prompts = {fid: prompt(fid) for fid in ids}
  (base / 'prompts.json').write_text(json.dumps(prompts, ensure_ascii=False, indent=1) + '\n')
  for seed in [int(s) for s in a.seeds.split(',')]:
    for fid in ids:
      png = base / f'{fid}-s{seed}.png'
      if png.exists():
        continue
      ok, said = render(prompts[fid], seed, png)
      print(f'{fid} seed {seed}: {"ok" if ok and webp(png, png.with_suffix(".webp")) else "failed " + said}', flush=True)


if __name__ == '__main__':
  main()
