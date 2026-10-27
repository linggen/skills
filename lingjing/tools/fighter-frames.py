#!/usr/bin/env python3
"""fighter-frames.py — 格斗's painted frames (Hanli 10-27: the rig 「像纸片人」 → frame by frame, as KOF '97 is made).

    python3 tools/fighter-frames.py <who> <raw dir> [--pick name=seed,…]

A fighter is painted once as a MASTER (txt2img, the kept seed), then every frame is painted by the FLUX.2 klein edit
with TWO references: the master (who she is: face, costume, sword) and a plain mannequin sketch of the frame's pose
(tools/fighter-poses.json → the sketch), so the person stays the same and the pose is the one asked for. This script
takes the painted frames (`<raw dir>/<who>-<frame>-s<seed>.png`), keys each off its paper (paint-fighter.py's key),
crops them all to ONE shared box (so the feet stand on one line and the scale never jumps between frames), scales them
down and writes art/games/fighter/<who>/<frame>.webp and art/games/fighter/<who>/frames.json: the box, the anchor
(the feet's middle, in frame pixels) and each frame's file. fighter/draw.js plays them with hold times.
"""
import argparse, importlib.util, json
from pathlib import Path
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'worlds' / 'jiuding' / 'art' / 'games' / 'fighter'
SCALE = 0.5
ANCHOR = (768 * 0.42, 1060)  # the sketches' hip line and ground (tools/fighter-poses.json)


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('who')
  ap.add_argument('raw')
  ap.add_argument('--pick', default='', help='frame=seed,… (else seed 1)')
  ap.add_argument('--poses', default=str(HERE / 'fighter-poses.json'), help='the pose sketches\' numbers: each frame\'s hip line (`dx`)')
  a = ap.parse_args()
  spec = importlib.util.spec_from_file_location('pf', HERE / 'paint-fighter.py')
  pf = importlib.util.module_from_spec(spec); spec.loader.exec_module(pf)
  pick = dict(p.split('=') for p in a.pick.split(',') if p)
  raw = Path(a.raw)
  names = sorted({p.name.split('-')[1] for p in raw.glob(f'{a.who}-*-s*.png') if p.name.split('-')[1] != 'master'})
  keyed = {}
  for n in names:
    png = raw / f"{a.who}-{n}-s{pick.get(n, 1)}.png"
    if not png.exists():
      continue
    keyed[n] = pf.key(png)
  # one box for all: the union of every frame's ink
  boxes = [im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox() for im in keyed.values()]
  x0 = min(b[0] for b in boxes) - 8; y0 = min(b[1] for b in boxes) - 8
  x1 = max(b[2] for b in boxes) + 8; y1 = max(b[3] for b in boxes) + 4
  dest = OUT / a.who
  dest.mkdir(parents=True, exist_ok=True)
  size = (round((x1 - x0) * SCALE), round((y1 - y0) * SCALE))
  for n, im in keyed.items():
    im.crop((x0, y0, x1, y1)).resize(size, Image.LANCZOS).save(dest / f'{n}.webp', quality=80, alpha_quality=80, method=6)
  poses = json.loads(Path(a.poses).read_text()).get(a.who, {}) if Path(a.poses).exists() else {}
  # each frame's anchor: where its sketch put the hips over the ground (a lunge's sketch stands further back, for the blade)
  anchor = lambda n: [round((ANCHOR[0] + poses.get(n, {}).get('dx', 0) - x0) * SCALE, 1), round((ANCHOR[1] - y0) * SCALE, 1)]
  meta = {'size': list(size), 'scale': SCALE, 'frames': {n: {'file': f'{n}.webp', 'anchor': anchor(n)} for n in keyed}}
  (dest / 'frames.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1) + '\n')
  total = sum((dest / f'{n}.webp').stat().st_size for n in keyed)
  print(a.who, len(keyed), 'frames', size, total, 'bytes')


if __name__ == '__main__':
  main()
