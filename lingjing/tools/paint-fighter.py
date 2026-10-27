#!/usr/bin/env python3
"""paint-fighter.py — 格斗's fighters as painted cut-out rigs (Hanli 10-27: 「人物正式画一下吧」).

    python3 tools/paint-fighter.py [--only xiaoman,qinyan] [--raw DIR] [--keep DIR]

Each fighter is painted ONCE by the local FLUX (tools/paint-games.py's recipe and call), in a shadow-puppet layout —
side view, facing right, legs apart, both arms held out from the body — so its parts come apart cleanly. The painting
is keyed off its paper (the paper is flooded in from the border, the painting's own colours kept), cut along the
polygons in tools/fighter-rig.json into parts (head, torso, the arms in two, the legs in two or the robe's skirt and
shoes), and the parts packed into one atlas: art/games/fighter/<who>.webp, with art/games/fighter/<who>.json saying
where each part sits, its pivot (the joint it turns about), the joint its bone runs to, and every joint of the rest
pose. fighter/draw.js lays the parts on its skeleton: every frame the same painted parts, so every frame matches.

The kept seed and the words are in fighter-rig.json; `--raw DIR` cuts paintings already made (DIR/<who>-s<seed>.png),
`--keep DIR` keeps the raw paintings there. Nothing here runs at play time.
"""
import argparse, importlib.util, json, math, tempfile
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'worlds' / 'jiuding' / 'art' / 'games' / 'fighter'
RIG = json.loads((HERE / 'fighter-rig.json').read_text())
SCALE = RIG['_scale']  # the atlas against the painting


def paint(who, spec, raw_dir):
  png = Path(raw_dir) / f"{who}-s{spec['seed']}.png" if raw_dir else None
  if png and png.exists():
    return png
  spec_ = importlib.util.spec_from_file_location('pg', HERE / 'paint-games.py')
  pg = importlib.util.module_from_spec(spec_); spec_.loader.exec_module(pg)
  png = Path(raw_dir or tempfile.gettempdir()) / f"{who}-s{spec['seed']}.png"
  words = spec['who'] + RIG['_pose'] + RIG['_style']
  err = pg.paint_flux(png, words, 'pose', tuple(spec['paint']), spec['seed'])
  if err:
    raise SystemExit(f'{who}: {err}')
  return png


def key(png):
  """The painting off its paper: the paper flooded in from the border (what the painting encloses stays), its
  colours kept as painted; a soft edge."""
  import cv2
  a = np.asarray(Image.open(png).convert('RGB')).astype(np.float32) / 255.0
  h, w, _ = a.shape
  b = max(4, int(min(h, w) * 0.03))
  band = np.concatenate([a[:b].reshape(-1, 3), a[-b:].reshape(-1, 3), a[:, :b].reshape(-1, 3), a[:, -b:].reshape(-1, 3)])
  paper = np.median(band, axis=0)
  # the paper's own unevenness: compare to a heavily blurred picture where it is near paper
  d = np.abs(a - paper).max(axis=2)
  # near the paper: its own colour, or a stain lighter than it and as warm (the robe's pale blue is not)
  lum0 = a @ np.array([0.299, 0.587, 0.114], np.float32)
  plum0 = float(paper @ np.array([0.299, 0.587, 0.114], np.float32))
  hue = np.abs((a - a.mean(axis=2, keepdims=True)) - (paper - paper.mean())).max(axis=2)
  near = ((d < 0.10) | ((lum0 > plum0 - 0.01) & (hue < 0.035))).astype(np.uint8)
  # flood the paper from every border pixel through what is near paper
  m = np.zeros((h + 2, w + 2), np.uint8)
  bg = near.copy() * 255
  for x in range(0, w, 8):
    for y in (0, h - 1):
      if bg[y, x] == 255:
        cv2.floodFill(bg, m, (x, y), 128)
  for y in range(0, h, 8):
    for x in (0, w - 1):
      if bg[y, x] == 255:
        cv2.floodFill(bg, m, (x, y), 128)
  body = (bg != 128).astype(np.uint8)
  body = cv2.morphologyEx(body, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
  # drop specks: keep the big pieces only
  n, lab, stats, _ = cv2.connectedComponentsWithStats(body, connectivity=8)
  keep = np.zeros_like(body)
  lum = a @ np.array([0.299, 0.587, 0.114], np.float32)
  plum = float(paper @ np.array([0.299, 0.587, 0.114], np.float32))
  big = max(range(1, n), key=lambda i: stats[i, cv2.CC_STAT_AREA]) if n > 1 else 0
  for i in range(1, n):
    if stats[i, cv2.CC_STAT_AREA] <= h * w * 0.002:
      continue
    # the figure, and any other piece with ink in it (a blade apart from the hand); never a stain lighter than the paper
    if i == big or float(lum[lab == i].mean()) < plum - 0.12:
      keep[lab == i] = 1
  alpha = cv2.GaussianBlur((keep * 255).astype(np.uint8), (3, 3), 0)
  # the edge pixels carry paper: pull their colour toward the body's
  rgb = (a * 255).astype(np.uint8)
  return Image.fromarray(np.dstack([rgb, alpha]), 'RGBA')


def cut(img, poly, feather=1.5):
  """One part: the polygon's pixels (softly edged), cropped to its ink."""
  mask = Image.new('L', img.size, 0)
  ImageDraw.Draw(mask).polygon([tuple(p) for p in poly], fill=255)
  mask = mask.filter(ImageFilter.GaussianBlur(feather))
  part = img.copy()
  part.putalpha(Image.fromarray(np.minimum(np.asarray(img.getchannel('A')), np.asarray(mask))))
  box = part.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
  return part.crop(box), box


def pack(parts, pad=3):
  """Shelf-pack the parts into one sheet: answers the sheet and each part's rect."""
  order = sorted(parts, key=lambda k: -parts[k][0].size[1])
  width = 1024
  x = y = row = 0
  rects = {}
  for k in order:
    im = parts[k][0]
    w, h = im.size
    if x + w + pad > width:
      x, y, row = 0, y + row + pad, 0
    rects[k] = (x, y, w, h)
    x += w + pad
    row = max(row, h)
  sheet = Image.new('RGBA', (width, y + row), (0, 0, 0, 0))
  for k, (x, y, w, h) in rects.items():
    sheet.alpha_composite(parts[k][0], (x, y))
  return sheet, rects


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--only', default='')
  ap.add_argument('--raw', default=None, help='cut the paintings in this folder (DIR/<who>-s<seed>.png) instead of painting')
  ap.add_argument('--keep', default=None, help='keep the raw paintings here')
  a = ap.parse_args()
  only = set(filter(None, a.only.split(',')))
  OUT.mkdir(parents=True, exist_ok=True)
  for who, spec in RIG['fighters'].items():
    if only and who not in only:
      continue
    png = paint(who, spec, a.raw or a.keep)
    img = key(png)
    k = SCALE
    img = img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)
    sc = lambda p: [p[0] * k, p[1] * k]
    joints = {n: sc(p) for n, p in spec['joints'].items()}
    parts = {}
    for name, p in spec['parts'].items():
      part, box = cut(img, [sc(q) for q in p['poly']], 1.2)
      parts[name] = (part, box, p)
    sheet, rects = pack(parts)
    sheet.save(OUT / f'{who}.webp', quality=82, alpha_quality=80, method=6)
    meta = {'scale': k, 'sole': spec['sole'] * k, 'parts': {}, 'joints': joints}
    for name, (part, box, p) in parts.items():
      x, y, w, h = rects[name]
      piv = joints[p['pivot']]
      meta['parts'][name] = {'rect': [x, y, w, h], 'origin': [round(box[0], 2), round(box[1], 2)], 'pivot': p['pivot'], 'to': p['to']}
    (OUT / f'{who}.json').write_text(json.dumps(meta, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(who, 'parts', len(parts), 'sheet', sheet.size, (OUT / f'{who}.webp').stat().st_size, 'bytes')


if __name__ == '__main__':
  main()
