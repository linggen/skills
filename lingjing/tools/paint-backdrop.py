#!/usr/bin/env python3
"""paint-backdrop.py — the weather backgrounds the story plays over, by the LOCAL FLUX.

    python3 tools/paint-backdrop.py --seeds 1,2,3 --out DIR            # a review round, every slot
    python3 tools/paint-backdrop.py --only rain-day,fog-night --seeds 7 --out DIR

The story plays full-stage over a picture, the way a creature's 出场 does (00-longzhi):
the picture fills the stage, the lower part fades to dark, white lines fade in over it.
By default the picture follows the weather — the scene's own tag first, the real local
weather where the scene names none — so there is one background per weather kind
(linggen/shared/sky.js KINDS: clear, cloudy, fog, rain, snow, storm), day and night: 12.
Hanli approved the set 2026-10-14 (「可以，开工」). Creatures and set pieces keep their own.

One set, one hand: a single base prompt (卷一's country — the hills of 徐州/蒙山, pines, a
river, a far path and village — no people, no near buildings, no creatures), and only the
weather line and the time of day change. The house look is chendingshan.webp's (ink and
light watercolour on warm aged rice paper). The bottom ~35% sits under dark-faded text, so
the interest is in the upper two thirds and the foreground is quiet water and bank. The
rain and snow particles are drawn live on top, so the painting carries the mood.

FLUX.2 klein 4B through mflux (paint-chending.py's recipe, nothing downloaded), English
prompt only; "no text" is unreliable, so every picture is looked at. Output 1536×1024, webp q84.
"""
# The kept picks (2026-10-14, picked from two seeds a slot; Hanli: 「看起来都不错, 你pick吧」), each
# worlds/jiuding/art/backdrop/<slot>.webp. `round`: raw = the first prompts, raw2 = the second (night darkened
# over the whole land, storm-day reworked).
KEPT = {
    'clear-day': {'seed': 23, 'round': 'raw'},  # open pale sky, valley village far off
    'clear-night': {'seed': 23, 'round': 'raw2'},  # full moon, stars, moon path on the river
    'cloudy-day': {'seed': 23, 'round': 'raw'},  # heavy grey cloud bank over the ridges
    'cloudy-night': {'seed': 11, 'round': 'raw2'},  # moon smothered in black cloud
    'fog-day': {'seed': 11, 'round': 'raw'},  # mist bands fill the valley
    'fog-night': {'seed': 11, 'round': 'raw2'},  # dim moon, mist bands between dark ridges
    'rain-day': {'seed': 11, 'round': 'raw'},  # slanting rain, wet grey ink
    'rain-night': {'seed': 11, 'round': 'raw2'},  # black wet sky, rain streaks
    'snow-day': {'seed': 11, 'round': 'raw'},  # white slopes and near bank
    'snow-night': {'seed': 23, 'round': 'raw2'},  # moon over white slopes, black river
    'storm-day': {'seed': 11, 'round': 'raw2'},  # black cloud, a big pine bent by the wind
    'storm-night': {'seed': 23, 'round': 'raw2'},  # churning black sky, rain, rough river
}

import argparse, json, os, subprocess
from pathlib import Path

PY = Path.home() / '.linggen/runtime/envs/pictures/bin/python'
SCRIPT = Path.home() / '.linggen/runtime/mlx_picture.py'
MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'
W, H = 1536, 1024

STYLE = ('A Chinese ink-and-light-watercolour landscape painting (shan shui) on warm aged rice paper: fine ink linework, soft grey '
         'washes, muted pale blue-green on the pines, visible paper grain, like a plate from a finely illustrated old Chinese novel. '
         'Set in old China, Ming dynasty, not Japanese, not Western. No people, no figures, no animals, no boats. No text, no letters, '
         'no calligraphy, no seal, no signature, no border, no frame, no vignette.')
LAND = ('A wide, empty landscape of the low rounded hills and steep green mountains of northern Jiangsu and Shandong. Upper part of the '
        'picture: the sky, and layered mountain ridges receding into the distance, the far ones pale. Middle: pine-covered slopes, a few '
        'gnarled pines on rocky outcrops to the left and right, a narrow dirt path winding up the hill, and very far away in the middle '
        'distance a tiny, barely visible cluster of thatched village roofs among trees. Bottom third: a broad calm river running across the whole width, '
        'with a low empty grassy bank in the very front; the bottom of the picture is quiet and plain, nothing in it.')

WEATHER = {
  'clear':  {'day': 'Clear weather: a wide open pale sky, bright, crisp and calm, soft warm sunlight on the ridges, clean distant mountains, the river still and shining.',
             'night': 'A clear night: a deep dark indigo-ink sky full of small pale stars, a round bright full moon high in the upper sky, silver moonlight on the ridges and a long moon path on the dark river; dark ink, deep blue-black washes.'},
  'cloudy': {'day': 'Overcast weather: a heavy grey sky filled with thick, low, rolling ink clouds pressing on the mountain tops, flat dull light, no sun, muted grey colours.',
             'night': 'A cloudy night: a dark sky of heavy, thick ink clouds, no stars, only a faint dim glow where the moon is hidden behind the clouds; very dark ink, deep grey-black washes, the hills barely visible.'},
  'fog':    {'day': 'Thick fog: soft white bands of mist drifting across the whole landscape, the mountains half lost in the mist, only their tops and a few pines showing through, the far ridges vanishing into white, the river fading into fog.',
             'night': 'A foggy night: pale bands of mist lying across dark mountains under a dim moon blurred by fog, the ridges dissolving into grey haze, dark ink and soft silver-grey mist, cold and silent.'},
  'rain':   {'day': 'Steady rain: a dark wet grey sky, fine slanting streaks of rain across the whole picture, wet blurred ink, the mountains softened and dripping, the pines dark and wet, the river surface dimpled and grey.',
             'night': 'A rainy night: a black wet sky, fine slanting streaks of rain, wet blurred dark ink, the mountains dim dark shapes, the pines black and dripping, the river dark; no moon, no stars, very dark blue-black washes.'},
  'snow':   {'day': 'Snow: the ground, the hills and the mountain slopes covered in white snow, the pine branches heavy with snow, a pale grey-white winter sky, a few snowflakes falling, the river dark and cold between white banks, the near bank under snow.',
             'night': 'A snowy night: white snow on the hills, the mountains and the pine branches glowing softly under a dark grey-indigo sky, a pale hazy moon, a few snowflakes falling, the river black between white banks, the near bank under snow; dark ink, cold blue-grey washes.'},
  'storm':  {'day': 'A violent gale: every pine on the slopes is bent hard to the right by the wind, crowns and branches streaming sideways, under a very dark, black, churning sky of storm clouds, driving slanting rain, rough choppy waves on the river, dramatic dark ink.',
             'night': 'A gale at night: every pine on the slopes is bent hard to the right by the wind, crowns and branches streaming sideways, under a pitch-black sky of churning storm clouds, driving rain, rough dark waves on the river; almost black ink.'},
}


# Round one (seeds 11/23/47) darkened only the night SKY: the hills, pines and river stayed
# day-lit paper. So every night gets this line too, and the storm puts its wind first.
NIGHT = ('It is night over the WHOLE picture, not only the sky: the mountains, the slopes, the pines, the river and the near bank '
         'are all washed in deep dark blue-black ink, lit only by faint cold light on the edges; no bright paper anywhere.')


def prompt(kind, time):
  night = f' {NIGHT}' if time == 'night' else ''
  return f'{WEATHER[kind][time]}{night} {LAND} Style: {STYLE}'


def render(p, seed, png):
  req = {'model': MODEL, 'prompt': p, 'out': str(png), 'width': W, 'height': H, 'seed': seed, 'reference': None}
  env = dict(os.environ, HF_HOME=str(Path.home() / '.linggen/models/hf-hub'), HF_HUB_OFFLINE='1')
  r = subprocess.run([str(PY), str(SCRIPT)], input=json.dumps(req), text=True, capture_output=True, env=env)
  return r.returncode == 0 and png.exists(), (r.stdout.strip() or r.stderr.strip())[-200:]


def webp(png, out):
  return subprocess.run(['/opt/homebrew/bin/cwebp', '-q', '84', str(png), '-o', str(out)], capture_output=True).returncode == 0


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--seeds', required=True, help='seeds to roll, e.g. 1,2,3')
  ap.add_argument('--only', default='', help='slots, e.g. rain-day,fog-night (default all 12)')
  ap.add_argument('--out', required=True, help='review folder (PNGs, webps and prompts.json land here)')
  a = ap.parse_args()
  base = Path(a.out)
  base.mkdir(parents=True, exist_ok=True)
  slots = [s.split('-') for s in a.only.split(',')] if a.only else [(k, t) for k in WEATHER for t in ('day', 'night')]
  prompts = {f'{k}-{t}': prompt(k, t) for k, t in slots}
  (base / 'prompts.json').write_text(json.dumps(prompts, ensure_ascii=False, indent=1) + '\n')
  for seed in [int(s) for s in a.seeds.split(',')]:
    for k, t in slots:
      png = base / f'{k}-{t}-s{seed}.png'
      if png.exists():
        continue
      ok, said = render(prompts[f'{k}-{t}'], seed, png)
      print(f'{k}-{t} seed {seed}: {"ok" if ok and webp(png, png.with_suffix(".webp")) else "failed " + said}', flush=True)


if __name__ == '__main__':
  main()
