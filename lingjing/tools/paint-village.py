#!/usr/bin/env python3
"""paint-village.py — the base painting under 石坳村's village map (scripts/games/village.js), by the LOCAL FLUX.

    python3 tools/paint-village.py --seeds 11,23,47 --out DIR

Today the map is code-drawn ink lines in a 320×132 drawing; the numbered markers sit at
village.js AT (x, y): 货郎担 under the 槐树 [42,104] · 爹 at the well [92,96] · 阿禾's cabbage
[118,70] · 东坡 (the herb slope) [262,46] · 吴婆婆's doorstep [298,92]. As fractions of the width
and height: 槐树 lower far left (.13,.79), well lower left (.29,.75), cabbage left of centre
(.37,.53), 东坡 upper right (.82,.35), 吴婆婆 lower far right (.93,.70). The painting puts each
place there by position words. The book (01-第一回): 蒙山脚下, seventeen households, the old
槐树 is the village mouth, the well platform, 东坡 where the firewood is, 马家's three-court
house of white walls and black tiles across a valley on the far hillside.

Round one (seeds 11/23/5/8) came out close, a few big cottages; round two asks for the view from far above
with tiny cottages and empty ground between. Same hand as paint-backdrop.py (chendingshan.webp's look). Calm, so the markers and white
text read on top. No text, no labels, no people. Output 1536×1024, webp q84.
"""
# The kept pick (2026-10-14): seed 31 of round two (village2) → worlds/jiuding/art/backdrop/village.webp —
# calmest: far view, wide empty ground; 槐树 and well lower left, east slope upper right, 马家 far upper left; only ~7 cottages, 吴婆婆's house sits mid-right, not far right
KEPT = {'village': {'seed': 31, 'round': 'village2'}}

import argparse, json, os, subprocess
from pathlib import Path

PY = Path.home() / '.linggen/runtime/envs/pictures/bin/python'
SCRIPT = Path.home() / '.linggen/runtime/mlx_picture.py'
MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'
W, H = 1536, 1024

STYLE = ('A Chinese ink-and-light-watercolour painting on warm aged rice paper, like an old Chinese painted village map (yu tu): '
         'fine ink linework, soft grey washes, muted pale blue-green and earth tones, visible paper grain, calm and sparse, plenty of '
         'quiet open ground. Set in old China, Ming dynasty, not Japanese, not Western. No people, no figures. No text, no letters, no '
         'labels, no calligraphy, no seal, no signature, no border, no frame, no compass, no legend.')
VILLAGE = ('A very high bird\'s-eye view from far above and far away, like a map, looking down at a small poor mountain village: about seventeen tiny thatched-roof cottages, each small in the picture, with '
           'mud walls and little fenced yards, scattered loosely across the middle of the picture. A narrow dirt path enters at the bottom '
           'left and winds through the village to the right side. Positions: at the far left, near the bottom, the village mouth: one '
           'huge old Chinese scholar tree (pagoda tree) with a wide spreading crown beside the path. Left of centre, low in the picture: '
           'a round stone well on a small square stone platform with a patch of muddy ground around it. A little left of the centre, in '
           'the middle: a small fenced vegetable garden with rows of big green cabbages beside a cottage. In the upper right: a bare grassy '
           'hillside, the east slope, rising up from the village with scattered shrubs and a few pines. At the far right, a little below '
           'the middle: the last small cottage at the east end of the village with a stone doorstep. Across the top of the picture: the '
           'misty green foothills of a mountain range, and at the upper left, far away across a valley on the hillside, one large walled '
           'courtyard house with white walls and black tiled roofs. Gentle terraced fields at the edges; wide empty ground between the places.')
PROMPT = f'{VILLAGE} Style: {STYLE}'


def render(seed, png):
  req = {'model': MODEL, 'prompt': PROMPT, 'out': str(png), 'width': W, 'height': H, 'seed': seed, 'reference': None}
  env = dict(os.environ, HF_HOME=str(Path.home() / '.linggen/models/hf-hub'), HF_HUB_OFFLINE='1')
  r = subprocess.run([str(PY), str(SCRIPT)], input=json.dumps(req), text=True, capture_output=True, env=env)
  return r.returncode == 0 and png.exists(), (r.stdout.strip() or r.stderr.strip())[-200:]


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--seeds', required=True)
  ap.add_argument('--out', required=True)
  a = ap.parse_args()
  base = Path(a.out)
  base.mkdir(parents=True, exist_ok=True)
  (base / 'prompt-village.txt').write_text(PROMPT + '\n')
  for seed in [int(s) for s in a.seeds.split(',')]:
    png = base / f'village-s{seed}.png'
    if png.exists():
      continue
    ok, said = render(seed, png)
    ok = ok and subprocess.run(['/opt/homebrew/bin/cwebp', '-q', '84', str(png), '-o', str(png.with_suffix('.webp'))], capture_output=True).returncode == 0
    print(f'village seed {seed}: {"ok" if ok else "failed " + said}', flush=True)


if __name__ == '__main__':
  main()
