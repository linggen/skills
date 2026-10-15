#!/usr/bin/env python3
"""paint-guan.py — the base painting under 沉鼎观's map (the 外门 roam, 2026-10-15), by the LOCAL FLUX.

    python3 tools/paint-guan.py --seeds 11,23,47,59 --out DIR

Hanli (2026-10-15, 「可以，按你的建议做」): while he is an 外门 disciple he roams INSIDE the 观 and
goes down the mountain only on a 执事堂 令. The places are places/xu.json's (place/road model);
this painting is only the plate a local map card would draw them on. Where each sits, as
fractions of the width and height, matching the book (04-第四回 … 07-第七回):
山门 at the head of the long stone stair, bottom centre (.50,.88) — 瞿老 sweeps those steps;
演武场 above it, a paved ground with four old cypresses at its corners (.50,.64);
正殿 the main hall, centre, higher up (.50,.40); 执事堂 a plain hall west of it (.30,.44);
藏经阁 a two-storey pavilion upper left (.25,.22); 讲堂 right of 正殿 (.68,.38);
外门 — 几十间灰瓦房顺着东坡一层一层叠上去 — rows of grey-tiled houses stepping up the east
slope (.78,.56); 饭堂 a long hall below them (.64,.68); 柴房 a shed at the far right (.90,.70);
药园 terraced herb beds upper right (.78,.22); 后山崖顶 the bare cliff top, top right (.92,.08).
Same hand as paint-village.py. No text, no labels, no people. Output 1536×1024, webp q84.
"""
# The kept pick (2026-10-15): seed 47 → worlds/jiuding/art/map/guan.webp — stair and gate bottom centre, the open
# ground between two trees, the main hall centre, a hall and the pavilion left, the dormitory rows, herb terraces
# and the cliff right, the dining hall lower right. Spots: places/xu.json `plate.at`.
KEPT = {'guan': {'seed': 47}}

import argparse, json, os, subprocess
from pathlib import Path

PY = Path.home() / '.linggen/runtime/envs/pictures/bin/python'
SCRIPT = Path.home() / '.linggen/runtime/mlx_picture.py'
MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'
W, H = 1536, 1024

STYLE = ('A Chinese ink-and-light-watercolour painting on warm aged rice paper, like an old Chinese painted temple map (yu tu): '
         'fine ink linework, soft grey washes, muted pale blue-green and earth tones, visible paper grain, calm and sparse, plenty of '
         'quiet open ground between the buildings. Set in old China, Ming dynasty, a Taoist mountain temple, not Japanese, not Western, '
         'no pagoda. No people, no figures. No text, no letters, no labels, no calligraphy, no seal, no signature, no border, no frame.')
GUAN = ('A very high bird\'s-eye view from far above, like a map, looking down on a modest Taoist temple compound on a steep mountainside, '
        'all buildings small in the picture. At the bottom centre, a long straight stone stair climbs up out of pine woods and mist to a '
        'simple stone gate. Above the gate, in the lower middle: a wide open paved square ground with one old cypress tree at each of its '
        'four corners. In the centre, higher up: the main hall, the largest building, grey tiled roof. To its left, a little lower: a plain '
        'small hall with a walled yard. At the upper left: a small two-storey pavilion among pines. To the right of the main hall: a long '
        'low lecture hall. On the right side, the east slope: several rows of small grey-tiled dormitory houses stepping up the slope in '
        'terraces; below them a long low dining hall with a courtyard; at the far right a small wooden woodshed with stacked firewood. '
        'At the upper right: terraced herb garden beds with a low wall. In the top right corner: a bare rocky cliff top with one twisted pine. '
        'Stone paths join every building. Mist and mountain ridges across the top.')
PROMPT = f'{GUAN} Style: {STYLE}'


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
  (base / 'prompt-guan.txt').write_text(PROMPT + '\n')
  for seed in [int(s) for s in a.seeds.split(',')]:
    png = base / f'guan-s{seed}.png'
    if png.exists():
      continue
    ok, said = render(seed, png)
    ok = ok and subprocess.run(['/opt/homebrew/bin/cwebp', '-q', '84', str(png), '-o', str(png.with_suffix('.webp'))], capture_output=True).returncode == 0
    print(f'guan seed {seed}: {"ok" if ok else "failed " + said}', flush=True)


if __name__ == '__main__':
  main()
