#!/usr/bin/env python3
"""atlas.py — 砸寨's skin: repaints Angry Aliens' atlases in place, frame for frame, so no game code changes.

    python3 tools/zhazhai/atlas.py      # then: cd tools/zhazhai && npm run build

level atlas (game-assets/atlases/level.png, its .json kept as upstream's):
  * every block frame `<material>_<shape>_<condition>_<W>x<H>` is redrawn as a comic block — upstream's own alpha is
    the shape (so circles, triangles and the chipped edges of a cracked block match the physics), filled with our
    material, a bold outline, a top light, and cracks for `dented` / `cracked`. Upstream's materials become:
    glass → 瓦 (celadon roof tile: brittle), wood → 木, stone → 石, metal → 铁, explosive → 火药桶 (powder keg).
    The Voronoi fracture cuts its shards from these textures at run time, so the debris is ours too.
  * the aliens become the painted pieces (art/games/zhazhai/*.png, tools/paint-zhazhai.py): the three greenelings
    the weasels (small · bandana · the chief), the four birds the four things 小满 flings (red 石子, yellow 短飞剑,
    blue 陶罐, black 五雷符), and the slingshot the painted fork.
background atlas: the forest theme's layers (the only theme 砸寨 uses) redrawn as silhouettes the game tints —
  karst peaks with a pagoda, rolling hills with pines — in upstream's own pale colour, so its tints still work.
Reads upstream's pictures from upstream-atlases/ (kept for exactly this), writes game-assets/atlases/.
"""
import json, math, random
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ART = HERE.parent.parent / 'worlds' / 'jiuding' / 'art' / 'games' / 'zhazhai'
UP = HERE / 'upstream-atlases'
OUT = HERE / 'game-assets' / 'atlases'
FONT = '/System/Library/Fonts/STHeiti Medium.ttc'

# material: (base, light, dark, outline)
PAL = {
  'wood': ((205, 130, 60), (240, 175, 100), (150, 88, 36), (78, 42, 16)),
  'glass': ((140, 205, 192), (214, 244, 234), (84, 150, 142), (34, 82, 84)),
  'stone': ((158, 160, 168), (204, 206, 212), (104, 106, 116), (52, 54, 64)),
  'metal': ((92, 104, 122), (156, 168, 186), (56, 64, 78), (24, 28, 36)),
  'explosive': ((214, 58, 42), (250, 120, 90), (150, 32, 24), (72, 14, 10)),
}


def frames(name):
  d = json.loads((OUT / f'{name}.json').read_text())
  return [(f['filename'], f['frame']) for f in d['textures'][0]['frames']]


def lerp(a, b, t):
  return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


# ── blocks ────────────────────────────────────────────────────────────────────────────────────
def pattern(material, shape, w, h, rnd):
  """The material's fill (RGB) over the whole frame rect; the mask cuts it to shape later."""
  base, light, dark, line = PAL[material]
  im = Image.new('RGB', (w, h), base)
  d = ImageDraw.Draw(im)
  for y in range(h):  # a soft top light, a darker foot
    t = y / max(1, h - 1)
    c = lerp(light, base, min(1, t * 2.2)) if t < 0.45 else lerp(base, dark, (t - 0.45) / 0.55 * 0.8)
    d.line([(0, y), (w, y)], fill=c)
  u = 70
  if material == 'wood':
    if shape == 'circle':  # a log's end: rings
      cx, cy = w / 2, h / 2
      for r in range(6, int(min(w, h) / 2), 7):
        d.ellipse([cx - r, cy - r * 0.95, cx + r, cy + r * 0.95], outline=dark, width=2)
    else:
      for y0 in range(9, h, 13):  # grain, wavy along the plank
        pts = [(x, y0 + 2.2 * math.sin(x / 23 + y0 + rnd.random() * 0.3)) for x in range(0, w + 8, 8)]
        d.line(pts, fill=dark, width=2)
      for x in range(u, w - 10, u):  # plank seams
        d.line([(x, 0), (x, h)], fill=line, width=3)
      for x in (12, w - 13):  # nails
        for y in (14, h - 15) if h >= 50 else (h // 2,):
          d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(60, 52, 48))
          d.ellipse([x - 2, y - 2, x, y], fill=(170, 160, 150))
  elif material == 'glass':  # 瓦: rows of scalloped roof tiles, glazed
    row = 26
    for i, y0 in enumerate(range(0, h + row, row)):
      off = (i % 2) * 18
      for x0 in range(-36 + off, w + 36, 36):
        d.arc([x0, y0 - row, x0 + 36, y0 + row * 0.7], 20, 160, fill=dark, width=3)
    for k in range(-h, w, 90):  # glaze streaks
      d.line([(k, h), (k + h, 0)], fill=light, width=9)
      d.line([(k + 16, h), (k + 16 + h, 0)], fill=light, width=3)
  elif material == 'stone':  # dressed blocks with mortar
    row = 35 if h >= 70 else h
    for i, y0 in enumerate(range(0, h, row)):
      d.line([(0, y0), (w, y0)], fill=dark, width=3)
      off = (i % 2) * 35
      for x in range(off, w, 70):
        d.line([(x, y0), (x, y0 + row)], fill=dark, width=3)
    for _ in range(int(w * h / 260)):  # grit
      x, y = rnd.uniform(0, w), rnd.uniform(0, h)
      d.ellipse([x, y, x + 3, y + 3], fill=dark if rnd.random() < 0.6 else light)
    if rnd.random() < 0.5:  # a fleck of moss
      x, y = rnd.uniform(8, w - 20), rnd.uniform(4, h * 0.4)
      d.ellipse([x, y, x + 14, y + 7], fill=(110, 160, 70))
  elif material == 'metal':  # 铁: brushed plate, bands and rivets at each unit
    for y in range(4, h, 6):
      d.line([(0, y), (w, y)], fill=lerp(base, dark, 0.35), width=1)
    for x in range(0, w + 1, u):
      for bx in (x + 6, x + u - 6):
        if 0 < bx < w:
          for y in range(10, h - 4, 22):
            d.ellipse([bx - 4, y - 4, bx + 4, y + 4], fill=dark)
            d.ellipse([bx - 3, y - 3, bx + 1, y + 1], fill=light)
  elif material == 'explosive':  # 火药桶: staves, black hoops, a yellow 火 label
    for x in range(0, w, 14):
      d.line([(x, 0), (x, h)], fill=dark, width=2)
    for fx in (0.16, 0.84) if w >= h else ():
      d.rectangle([w * fx - 5, 0, w * fx + 5, h], fill=(40, 30, 28))
    for fy in (0.16, 0.84) if h > w else ((0.2, 0.8) if w == h else ()):
      d.rectangle([0, h * fy - 5, w, h * fy + 5], fill=(40, 30, 28))
    s = min(w, h) * 0.62
    cx, cy = w / 2, h / 2
    d.polygon([(cx, cy - s / 2), (cx + s / 2, cy), (cx, cy + s / 2), (cx - s / 2, cy)], fill=(255, 214, 60), outline=(70, 30, 10), width=3)
    f = ImageFont.truetype(FONT, int(s * 0.5))
    d.text((cx, cy + 1), '火', font=f, fill=(150, 20, 10), anchor='mm')
  return im


def cracks(d, w, h, n, rnd, color, width):
  for _ in range(n):
    x, y = rnd.uniform(w * 0.15, w * 0.85), rnd.choice([rnd.uniform(0, h * 0.3), rnd.uniform(h * 0.7, h)])
    ang = rnd.uniform(0, math.tau)
    pts = [(x, y)]
    for _ in range(rnd.randint(3, 5)):
      ang += rnd.uniform(-0.9, 0.9)
      step = rnd.uniform(8, 18)
      x, y = x + math.cos(ang) * step, y + math.sin(ang) * step
      pts.append((x, y))
    d.line(pts, fill=color, width=width, joint='curve')
    if len(pts) > 2 and rnd.random() < 0.6:  # a branch
      bx, by = pts[len(pts) // 2]
      a2 = ang + rnd.choice([-1.2, 1.2])
      d.line([(bx, by), (bx + math.cos(a2) * 12, by + math.sin(a2) * 12)], fill=color, width=max(1, width - 1))


def block(name, crop):
  material, shape, cond, size = name.split('_')
  w, h = crop.size
  rnd = random.Random(name)
  alpha = np.asarray(crop.split()[-1])
  mask = (alpha > 110).astype(np.uint8)
  # upstream's glass is a hollow frame: fill every enclosed hole, so each block is solid (edge chips stay open)
  ff = mask.copy() * 255
  cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 128) if ff[0, 0] == 0 else None
  if ff[0, 0] == 128:
    mask = (ff != 128).astype(np.uint8)
  if shape == 'circle':  # upstream's circles are soft; a clean disc reads better
    mask = np.zeros_like(mask)
    cv2.circle(mask, (w // 2, h // 2), min(w, h) // 2 - 1, 1, -1)
    if cond != 'pristine':  # keep a chip or two
      for _ in range(1 if cond == 'dented' else 3):
        a = rnd.uniform(0, math.tau); r = min(w, h) / 2
        cv2.circle(mask, (int(w / 2 + math.cos(a) * r), int(h / 2 + math.sin(a) * r)), int(r * 0.22), 0, -1)
  if h > w:  # an upright frame: the grain, the bricks, the hoops run along its length
    fill = pattern(material, shape, h, w, rnd).transpose(Image.Transpose.ROTATE_90)
  else:
    fill = pattern(material, shape, w, h, rnd)
  d = ImageDraw.Draw(fill)
  dark, line = PAL[material][2], PAL[material][3]
  if cond == 'dented':
    cracks(d, w, h, 2 + (w * h) // 30000, rnd, line, 2)
  elif cond == 'cracked':
    cracks(d, w, h, 4 + (w * h) // 14000, rnd, line, 3)
  rgb = np.asarray(fill).copy()
  # the bold outline: the mask's edge band; an inner light just inside the top edge
  k = max(3, int(round(min(w, h) / 16)))
  inner = cv2.erode(mask, np.ones((2 * k + 1, 2 * k + 1), np.uint8))
  edge = (mask > 0) & (inner == 0)
  rgb[edge] = line
  shifted = np.zeros_like(inner); shifted[k:, :] = inner[:-k, :]
  rim = (inner > 0) & (shifted == 0)
  rgb[rim] = (rgb[rim] * 0.45 + np.array(PAL[material][1]) * 0.55).astype(np.uint8)
  a = cv2.GaussianBlur(mask.astype(np.float32) * 255, (3, 3), 0)
  if material == 'glass':
    a = a * 0.94
  return Image.fromarray(np.dstack([rgb, a.clip(0, 255).astype(np.uint8)]), 'RGBA')


# ── pieces ────────────────────────────────────────────────────────────────────────────────────
def fit(path, w, h, pad=0.04):
  im = Image.open(path).convert('RGBA')
  bb = im.getbbox()
  im = im.crop(bb)
  s = min(w * (1 - pad) / im.width, h * (1 - pad) / im.height)
  im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
  out = Image.new('RGBA', (w, h))
  out.alpha_composite(im, ((w - im.width) // 2, (h - im.height) // 2))
  return out


def slingshot(w, h):
  """The painted fork, kept upright and narrow: its prongs scaled to the frame's width, its trunk stretched below."""
  im = Image.open(ART / 'slingshot.png').convert('RGBA')
  im = im.crop(im.getbbox())
  s = w / im.width
  top = im.resize((w, int(im.height * s)), Image.LANCZOS)
  cut = int(top.height * 0.62)  # where the two prongs have joined the trunk
  out = Image.new('RGBA', (w, h))
  out.alpha_composite(top.crop((0, 0, w, cut)), (0, 0))
  trunk = top.crop((0, cut, w, top.height)).resize((w, h - cut), Image.LANCZOS)
  out.alpha_composite(trunk, (0, cut))
  return out


def pedestal(w, h):
  """The slingshot's foot: a squat mossy boulder, drawn as the stone blocks are."""
  base, light, dark, line = PAL['stone']
  im = Image.new('RGBA', (w, h))
  d = ImageDraw.Draw(im)
  d.rounded_rectangle([3, 10, w - 4, h - 3], radius=22, fill=(*line, 255))
  d.rounded_rectangle([8, 14, w - 9, h - 8], radius=18, fill=(*base, 255))
  d.rounded_rectangle([14, 17, w - 16, 30], radius=7, fill=(*light, 255))
  for x0, y0 in ((30, 44), (80, 52), (112, 38)):
    d.ellipse([x0, y0, x0 + 9, y0 + 6], fill=(*dark, 255))
  d.ellipse([18, 8, 64, 22], fill=(110, 165, 70, 255))
  d.ellipse([90, 9, 126, 20], fill=(110, 165, 70, 255))
  return im


PIECES = {
  'alienGreen_round': 'weasel-s.png', 'alienGreen_square': 'weasel-m.png', 'alienGreen_suit': 'weasel-l.png',
  'alienPink_round': 'proj-stone.png', 'alienYellow_round': 'proj-sword.png', 'alienBlue_round': 'proj-pot.png',
  'alienBeige_round': 'proj-talisman.png', 'alienPink_square': 'proj-pot.png',
}


def level_atlas():
  src = Image.open(UP / 'level.png').convert('RGBA')
  out = src.copy()
  for name, f in frames('level'):
    box = (f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])
    crop = src.crop(box)
    parts = name.split('_')
    if len(parts) == 4 and parts[0] in PAL:
      tile = block(name, crop)
    elif name in PIECES:
      tile = fit(ART / PIECES[name], f['w'], f['h'], pad=0.0)
    elif name == 'slingshot':
      tile = slingshot(f['w'], f['h'])
    elif name == 'slingshot_base':
      tile = pedestal(f['w'], f['h'])
    else:
      continue
    out.paste(Image.new('RGBA', (f['w'], f['h'])), box[:2])
    out.paste(tile, box[:2])
  out.save(OUT / 'level.png', optimize=True)


# ── backgrounds: silhouettes the game tints ───────────────────────────────────────────────────
def silhouette(w, h, top_y, fill, light, extra=None):
  """top_y(x) → the ridge's height at x (periodic in w, so the layer tiles); filled below, a lighter rim on top."""
  ys = np.array([top_y(x) for x in range(w)])
  yy = np.arange(h)[:, None]
  body = yy >= ys[None, :]
  rim = body & (yy < ys[None, :] + 7)
  rgba = np.zeros((h, w, 4), np.uint8)
  rgba[body] = (*fill, 255)
  rgba[rim] = (*light, 255)
  im = Image.fromarray(rgba, 'RGBA')
  if extra:
    extra(ImageDraw.Draw(im), ys)
  return im


def karst(w, h, fill, light, rnd, n=7, pagoda=True):
  peaks = [(rnd.uniform(0, w), rnd.uniform(0.15, 0.6) * h, rnd.uniform(55, 120)) for _ in range(n)]

  def top(x):
    y = h * 0.8
    for px, py, r in peaks:
      for k in (-w, 0, w):  # wrap: the layer tiles
        dx = (x - px - k) / r
        if abs(dx) < 1.6:  # a rounded sugar-loaf: steep sides, a dome
          y = min(y, py + (h * 0.8 - py) * (abs(dx) / 1.6) ** 2.6)
    return y

  def deco(d, ys):
    if not pagoda:
      return
    px, py, _ = min(peaks, key=lambda p: p[1])
    x = int(px) % w
    base = ys[x] + 4
    for i, (bw, bh) in enumerate([(34, 14), (28, 12), (22, 11), (16, 10)]):
      yb = base - sum(t[1] for t in [(34, 14), (28, 12), (22, 11), (16, 10)][:i])
      d.rectangle([x - bw / 2 + 4, yb - bh, x + bw / 2 - 4, yb], fill=fill)
      d.polygon([(x - bw / 2 - 5, yb - bh + 3), (x + bw / 2 + 5, yb - bh + 3), (x + bw / 2 - 3, yb - bh - 4), (x - bw / 2 + 3, yb - bh - 4)], fill=light)
    d.line([(x, base - 47), (x, base - 62)], fill=fill, width=3)
  return silhouette(w, h, top, fill, light, deco)


def hills_pines(w, h, fill, light, rnd):
  waves = [(rnd.uniform(0, math.tau), a, f) for a, f in ((26, 1), (14, 2), (8, 3))]

  def top(x):
    return h * 0.5 + sum(a * math.sin(f * math.tau * x / w + p) for p, a, f in waves)

  def deco(d, ys):
    for _ in range(14):  # pines: stacked comic tiers
      x = rnd.uniform(0, w)
      s = rnd.uniform(0.7, 1.3)
      yb = ys[int(x) % w] + 6
      d.rectangle([x - 3 * s, yb - 14 * s, x + 3 * s, yb], fill=fill)
      for i in range(3):
        tw, ty = (30 - i * 8) * s, yb - (12 + i * 16) * s
        d.polygon([(x - tw, ty), (x + tw, ty), (x, ty - 22 * s)], fill=fill)
        d.line([(x - tw, ty), (x, ty - 22 * s)], fill=light, width=3)
  return silhouette(w, h, top, fill, light, deco)


def background_atlas():
  src = Image.open(UP / 'background.png').convert('RGBA')
  out = src.copy()
  fr = dict(frames('background'))
  rnd = random.Random('zhazhai')

  def tone(name):
    f = fr[name]
    a = np.asarray(src.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])))
    px = a[a[..., 3] > 200][:, :3]
    fill = tuple(int(v) for v in np.median(px, axis=0))
    return fill, tuple(min(255, int(v * 1.12) + 12) for v in fill)

  def put(name, im):
    f = fr[name]
    out.paste(Image.new('RGBA', (f['w'], f['h'])), (f['x'], f['y']))
    out.paste(im, (f['x'], f['y']))

  f = fr['hillsLarge']; put('hillsLarge', karst(f['w'], f['h'], *tone('hillsLarge'), rnd))
  f = fr['hills']; put('hills', hills_pines(f['w'], f['h'], *tone('hills'), rnd))
  f = fr['mountains']; put('mountains', karst(f['w'], f['h'], *tone('mountains'), rnd, n=9, pagoda=False))
  # the level select's backdrop: a sky, far karst, a near ridge of pines
  f = fr['backgroundForest']
  sky0, sky1 = (214, 238, 250), (184, 230, 248)
  bg = Image.new('RGBA', (f['w'], f['h']))
  dd = ImageDraw.Draw(bg)
  for y in range(f['h']):
    dd.line([(0, y), (f['w'], y)], fill=(*lerp(sky0, sky1, y / f['h']), 255))
  far = karst(f['w'], 420, (196, 232, 248), (226, 244, 252), rnd, n=8)
  bg.alpha_composite(far, (0, 430))
  near = hills_pines(f['w'], 360, (176, 226, 246), (204, 238, 250), rnd)
  bg.alpha_composite(near, (0, 700))
  put('backgroundForest', bg)
  out.save(OUT / 'background.png', optimize=True)


def hero_art():
  """The title screen's big pieces (src/zhazhai/decor.ts), from the paintings, at a size the card needs."""
  d = HERE / 'game-assets' / 'art'
  d.mkdir(exist_ok=True)
  for k in ('weasel-s', 'weasel-m', 'weasel-l', 'proj-stone', 'slingshot'):
    im = Image.open(ART / f'{k}.png').convert('RGBA')
    im = im.crop(im.getbbox())
    s = 420 / max(im.size)
    im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS).save(d / f'{k}.webp', quality=86, method=6)


if __name__ == '__main__':
  hero_art()
  level_atlas()
  background_atlas()
  print('atlases →', OUT)
