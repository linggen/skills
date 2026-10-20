#!/usr/bin/env python3
"""paint-mishi-flux.py — 密室's room, dial and bronze hand on the local FLUX (Hanli 10-20: 「代码画的都查一下, 用flux画吧」).

    PY=~/.linggen/runtime/envs/pictures/bin/python
    FLUX_REVIEW=<scratch> $PY tools/paint-mishi-flux.py paint [--only id,…] [--seeds 1,2]
    FLUX_REVIEW=<scratch> $PY tools/paint-mishi-flux.py cut          # the KEPT seeds → scripts/games/mishi/

The puzzle stays text over paint: the 天干/地支 rings are the dial's puzzle, the hand's thirteen studs are buttons
at fixed places, so the painting only gives them a body. The hand is an EDIT pass from the old code drawing
(tools/mishi-hand-ref.png: its four fingers and thumb where the studs sit), so the fingers land under the studs.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flux_comic as fc  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'scripts' / 'games' / 'mishi'
STYLE = fc.STYLE + ' Mysterious, candle-lit, old bronze and stone.'

JOBS = {
  'room': dict(w=1024, h=384, prompt=(
    'A wide side-view of a small hidden stone CHAMBER inside an old Daoist mountain, for a cartoon puzzle game: a back '
    'wall of big rounded grey-brown stone blocks, a dark narrow wooden doorway at the far LEFT, a smooth stone floor '
    'across the bottom, two small oil lamps on the wall glowing warm orange, cobwebs in the top corners, dusty and '
    'quiet. The middle of the wall is plain and empty. ' + STYLE + ' ' + fc.SCENE)),
  'niche': dict(key='magenta', w=384, h=512, prompt=(
    'ONE empty arched stone wall NICHE (a small alcove with a round top) of carved grey stone with a thick stone rim, '
    'its inside dark and empty, seen straight from the front. ' + STYLE + ' ' + fc.ON_MAGENTA)),
  'dial': dict(key='magenta', w=768, h=768, prompt=(
    'ONE big round ancient BRONZE DIAL seen straight on from the front, a perfect circle: a heavy disc of warm '
    'greenish-gold bronze with three raised concentric RINGS (an outer band, a middle band and a small round boss in '
    'the centre), plain and smooth with NO marks, no symbols, no writing, a little verdigris in the grooves. '
    + STYLE + ' ' + fc.ON_MAGENTA)),
  'hand': dict(key='green', w=960, h=480, refs=[HERE / 'mishi-hand-ref.png'], prompt=(
    'Turn this flat drawing into an ancient Chinese BRONZE HAND sculpture, keeping exactly the same shape, size and '
    'position: the four straight fingers side by side with rounded tips, smooth and plain (no carvings, no eyes, no '
    'creases, no marks), the thumb at the right, cast in warm greenish-gold bronze with a little verdigris patina and a '
    'soft shine, a bold dark outline. '
    'Plain flat solid pure GREEN background (#00FF00) everywhere else. No text, no marks.')),
}

KEPT = {'room': 1, 'niche': 1, 'dial': 1, 'hand': 1}


def cut():
  from PIL import Image
  OUT.mkdir(parents=True, exist_ok=True)
  for jid, seed in KEPT.items():
    j, src = JOBS[jid], fc.REVIEW / 'mishi' / f'{jid}-{seed}.png'
    if jid == 'hand':  # untrimmed: the studs are placed as shares of the whole picture
      im = fc.key_green(src, trim=False, key='green')
    elif 'key' in j:
      im = fc.key_green(src, key=j['key'])
    else:
      im = Image.open(src).convert('RGB')
    side = {'room': 1024, 'niche': 160, 'dial': 512, 'hand': 960}[jid]
    fc.save_webp(im, OUT / f'{jid}.webp', max_side=side, quality=84)
    print(jid, '→', OUT / f'{jid}.webp')


if __name__ == '__main__':
  a = fc.run(JOBS)
  if a.cmd == 'paint':
    fc.paint_all('mishi', JOBS, a)
  else:
    cut()
