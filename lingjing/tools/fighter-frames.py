#!/usr/bin/env python3
"""fighter-frames.py — 格斗's painted frames, KOF '97's way: every pose painted by hand (Hanli 10-27: the cut-out rig
「像纸片人」 → frame by frame; 「秦雁 · 画帧预览 我看过了, 很好」).

    python3 tools/fighter-frames.py sketch <who> <raw>                  the pose sketches (<raw>/pose-<frame>.png)
    python3 tools/fighter-frames.py paint  <who> <raw> [--only a,b] [--seeds 1,2] [--master]
    python3 tools/fighter-frames.py build  <who> <raw> [--pick frame=seed,…] [--sheet out.jpg]

Everything about a fighter is in tools/fighter-poses.json: its MASTER (txt2img, or an edit of a `ref` painting; the kept
seed and words), the words that say who it is in every frame, each frame's pose sketch (a plain mannequin, side view
facing right: lean, legF/legB/armF/armB as [upper, lower] angles from straight down, positive toward the facing side;
`up` a lift, `rot` the whole body turned about the feet (a fall), `width` a wider canvas for a blade) and words, and the
CLIPS the board plays (frames, fps, loop, the strike frame `hit`, the few frames `calm` keeps for reduced motion).

`paint` runs the local FLUX.2 klein (tools/fighter-flux.py in the pictures venv, one model load a batch): the master
first, then each frame as an EDIT with two references — the master (face, dress, sword) and the pose sketch — so the
person stays the same and the pose is the one asked. Paintings land in <raw> as <who>-<frame>-s<seed>.png (a seed
already painted is skipped: a stopped batch resumes).

`build` keys each kept painting off its paper, sets its soles on one ground line (a frame in the air or on the ground
keeps the place its sketch gives, through `fix`), scales it to the board (SCALE), trims it to its ink and packs all the
frames into ONE sheet: art/games/fighter/<who>.webp, with art/games/fighter/<who>.json — each frame's rect in the sheet
and its anchor (the standing feet's middle) inside that rect, the standing height in sheet pixels, where the sword's
tip and the hands are (for the board's trail, glow and fire), and the clips. `--sheet` writes a builder's check: every
clip's frames side by side on one ground line, and each pair of neighbours laid over each other (onion skin), the test
of 「两帧切换要顺」. Nothing here runs at play time.
"""
import argparse, json, math, os, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'worlds' / 'jiuding' / 'art' / 'games' / 'fighter'
POSES = json.loads((HERE / 'fighter-poses.json').read_text())
PY = Path.home() / '.linggen/runtime/envs/pictures/bin/python'
MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'
W, H = 768, 1152            # the painting
GROUND, HIPX = 1060, W * 0.42  # the sketch's ground and the hips' column
PGROUND = 1100              # where the master's soles stand in the painting
SCALE = 0.42                # the sheet against the painting (a standing figure ~430 px)
L = dict(thigh=190, shin=190, torso=250, neck=30, head=62, upper=130, fore=125, sword=330)
EDIT_STYLE = ('Drawn in the same soft graphite pencil and light watercolour wash on warm aged paper as the first image, the '
              'whole figure seen from the side facing right, alone on plain empty paper, no ground, no other objects, no text. '
              'The second image is only a pose guide: copy its body pose exactly, never its grey shapes.')


# ── The sketch: a plain mannequin from a pose's numbers ─────────────────────────────────────────────────────────────
def at(o, a, l):
  r = math.radians(a)
  return (o[0] + math.sin(r) * l, o[1] + math.cos(r) * l)


def skeleton(p):
  """The pose's joints in painting pixels (the sketch's own frame)."""
  legH = lambda a: L['thigh'] * math.cos(math.radians(a[0])) + L['shin'] * math.cos(math.radians(a[1]))
  hip = (HIPX + p.get('dx', 0), GROUND - max(legH(p['legF']), legH(p['legB']), 60) - 30 - p.get('up', 0))
  lean = math.radians(p['lean'])
  sh = (hip[0] + math.sin(lean) * L['torso'], hip[1] - math.cos(lean) * L['torso'])
  head = (sh[0] + math.sin(lean) * (L['neck'] + L['head']), sh[1] - math.cos(lean) * (L['neck'] + L['head']))
  j = {'hip': hip, 'sh': sh, 'head': head}
  for k, o, ln in (('legF', hip, 'thigh'), ('legB', hip, 'thigh'), ('armF', sh, 'upper'), ('armB', sh, 'upper')):
    a = p[k]
    m = at(o, a[0], L[ln]); e = at(m, a[1], L['shin' if ln == 'thigh' else 'fore'])
    j[k] = (o, m, e)
  if p.get('sword', True):
    a = p['armF'][1] + p.get('swordTurn', 0)
    j['tip'] = at(j['armF'][2], a, L['sword'])
  return j


def turn(pt, about, deg):
  r = math.radians(deg); x, y = pt[0] - about[0], pt[1] - about[1]
  return (about[0] + x * math.cos(r) - y * math.sin(r), about[1] + x * math.sin(r) + y * math.cos(r))


def sketch(p, out, armed=True, robe=True):
  w = p.get('width', W)
  im = Image.new('RGBA', (w, H), (0, 0, 0, 0))
  d = ImageDraw.Draw(im)
  p = {**p, 'sword': armed and p.get('sword', True)}
  j = skeleton(p)
  ink, far = (40, 40, 40, 255), (110, 110, 110, 255)
  def limb(seg, wd, col):
    d.line(list(seg), fill=col, width=wd, joint='curve')
  limb(j['legB'], 46, far); limb(j['legF'], 46, ink)
  for f in (j['legB'][2], j['legF'][2]):
    d.ellipse([f[0] - 10, f[1] - 14, f[0] + 46, f[1] + 12], fill=ink)
  if robe:
    fb, ff, hip = j['legB'][2], j['legF'][2], j['hip']
    lo = min(fb[0], ff[0]) - 40; hi = max(fb[0], ff[0]) + 40; hy = min(fb[1], ff[1]) - 40
    d.polygon([(hip[0] - 45, hip[1] - 10), (hip[0] + 45, hip[1] - 10), (hi, hy), (lo, hy)], fill=(150, 165, 180, 255))
  limb(j['armB'], 30, far)
  d.line([j['hip'], j['sh']], fill=ink, width=90)
  hx, hy = j['head']
  d.ellipse([hx - L['head'] + 8, hy - L['head'], hx + L['head'] - 8, hy + L['head']], fill=ink)
  limb(j['armF'], 30, ink)
  if not armed:  # fists
    for k in ('armB', 'armF'):
      e = j[k][2]; d.ellipse([e[0] - 22, e[1] - 22, e[0] + 22, e[1] + 22], fill=far if k == 'armB' else ink)
  if 'tip' in j:
    d.line([j['armF'][2], j['tip']], fill=(90, 90, 90, 255), width=10)
  if p.get('rot'):
    feet = (HIPX + p.get('dx', 0), GROUND)
    im = im.rotate(-p['rot'], center=feet, resample=Image.BICUBIC)
  bg = Image.new('RGBA', (w, H), (238, 230, 212, 255))
  bg.alpha_composite(im)
  bg.convert('RGB').save(out)


def points(p, armed):
  """Where the sword's tip and the hands are, in painting pixels: the sketch's joints, scaled about the feet to the
  painting's size (the edit keeps the master's place and size, not the sketch's)."""
  j = skeleton({**p, 'sword': armed and p.get('sword', True)})
  feet = (HIPX + p.get('dx', 0), GROUND)
  k = (PGROUND - 76) / (GROUND - (skeleton(STAND)['head'][1] - L['head']))
  def put(pt):
    if p.get('rot'):
      pt = turn(pt, feet, p['rot'])
    return (HIPX + (pt[0] - feet[0]) * k, PGROUND + (pt[1] - GROUND) * k)
  out = {'handF': put(j['armF'][2]), 'handB': put(j['armB'][2])}
  if 'tip' in j:
    out['tip'] = put(j['tip'])
  return out


STAND = {'lean': 0, 'legF': [8, 0], 'legB': [-8, 0], 'armF': [10, 10], 'armB': [-10, -10], 'sword': False}


# ── The paper off: paint-games' key, the paper flooded in from the border ──────────────────────────────────────────
def key(png, erase=()):
  """The painting off its paper: the paper flooded in from the border (what the painting encloses stays), its colours
  kept as painted; specks and stains lighter than the paper dropped; a soft edge."""
  import cv2
  a = np.asarray(Image.open(png).convert('RGB')).astype(np.float32) / 255.0
  h, w, _ = a.shape
  b = max(4, int(min(h, w) * 0.03))
  band = np.concatenate([a[:b].reshape(-1, 3), a[-b:].reshape(-1, 3), a[:, :b].reshape(-1, 3), a[:, -b:].reshape(-1, 3)])
  paper = np.median(band, axis=0)
  lumw = np.array([0.299, 0.587, 0.114], np.float32)
  d = np.abs(a - paper).max(axis=2)
  lum, plum = a @ lumw, float(paper @ lumw)
  hue = np.abs((a - a.mean(axis=2, keepdims=True)) - (paper - paper.mean())).max(axis=2)
  near = ((d < 0.10) | ((lum > plum - 0.01) & (hue < 0.035))).astype(np.uint8)
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
  # a stain the figure encloses (between a blade and the robe) is whiter than the paper: cleared inside the frame's
  # `fix.erase` boxes (painting pixels), only where lighter than the paper, so a blade crossing the box stays
  for x0, y0, x1, y1 in erase:
    sub = bg[y0:y1, x0:x1]
    sub[lum[y0:y1, x0:x1] > plum + 0.015] = 128
  body = (bg != 128).astype(np.uint8)
  body = cv2.morphologyEx(body, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
  n, lab, stats, _ = cv2.connectedComponentsWithStats(body, connectivity=8)
  keep = np.zeros_like(body)
  big = max(range(1, n), key=lambda i: stats[i, cv2.CC_STAT_AREA]) if n > 1 else 0
  for i in range(1, n):
    if stats[i, cv2.CC_STAT_AREA] <= h * w * 0.002:
      continue
    if i == big or float(lum[lab == i].mean()) < plum - 0.12:  # the figure, or a blade apart from the hand
      keep[lab == i] = 1
  alpha = cv2.GaussianBlur((keep * 255).astype(np.uint8), (3, 3), 0)
  return Image.fromarray(np.dstack([(a * 255).astype(np.uint8), alpha]), 'RGBA')


# ── paint ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def paint(who, raw, only, seeds, master):
  spec = POSES[who]
  raw.mkdir(parents=True, exist_ok=True)
  ms = spec['master']
  mpng = raw / f"{who}-master-s{ms['seed']}.png"
  jobs = []
  if master:
    base = ms.get('base')
    if base:  # the master is an edit of a base painting (txt2img) toward the guard
      bpng = raw / f"{who}-base-s{base['seed']}.png"
      jobs.append({'seed': base['seed'], 'prompt': base['words'], 'out': str(bpng)})
      sketch(spec['frames'][ms['pose']], raw / f"pose-{ms['pose']}.png", spec.get('armed', True), spec.get('robe', True))
    for sd in seeds:
      job = {'seed': sd, 'prompt': ms['words'], 'out': str(raw / f'{who}-master-s{sd}.png')}
      if base:
        job['refs'] = [str(bpng), str(raw / f"pose-{ms['pose']}.png")]
      jobs.append(job)
  else:
    if not mpng.exists():
      raise SystemExit(f'{who}: paint the master first (--master), kept seed {ms["seed"]}')
    for name, p in spec['frames'].items():
      if only and name not in only:
        continue
      sk = raw / f'pose-{name}.png'
      sketch(p, sk, spec.get('armed', True), spec.get('robe', True))
      for sd in seeds:
        jobs.append({'seed': sd, 'out': str(raw / f'{who}-{name}-s{sd}.png'), 'refs': [str(mpng), str(sk)], 'width': p.get('width', W),
                     'prompt': f"Repaint {spec['who']} in the pose of the second image: {p['words']} {EDIT_STYLE}"})
  env = dict(os.environ, HF_HOME=str(Path.home() / '.linggen/models/hf-hub'), HF_HUB_OFFLINE='1')
  print(who, len(jobs), 'paintings', flush=True)
  r = subprocess.run(['nice', '-n', '10', str(PY), str(HERE / 'fighter-flux.py')], input=json.dumps({'model': MODEL, 'jobs': jobs}),
                     text=True, env=env, stdout=subprocess.PIPE)
  print(r.stdout[-300:])
  if r.returncode:
    raise SystemExit(r.returncode)


# ── build ──
def head_size(im):
  """The scale a painting came out at: the larger side of its hair (the biggest dark, unsaturated piece in the upper
  part of the figure). The edit keeps who it is but not always how big; a frame is scaled to the idle's head."""
  import cv2
  a = np.asarray(im).astype(np.float32) / 255
  al = a[..., 3] > .5
  lum = a[..., :3] @ np.array([.299, .587, .114]); sat = a[..., :3].max(2) - a[..., :3].min(2)
  dark = (al & (lum < .25) & (sat < .12)).astype(np.uint8)
  n, lab, st, cen = cv2.connectedComponentsWithStats(dark, 8)
  ys = np.nonzero(al.any(1))[0]
  up = [i for i in range(1, n) if cen[i][1] < ys.min() + (ys.max() - ys.min()) * .55]
  if not up:
    return None
  i = max(up, key=lambda i: st[i, 4])
  return float(max(st[i, 2], st[i, 3]))



def placed(im, p, fix):
  """The keyed painting moved so its soles stand on PGROUND (unless `air`/`free`), and scaled by fix.s about the feet."""
  al = np.asarray(im.getchannel('A')) > 128
  ys = np.nonzero(al.any(axis=1))[0]
  dy = 0 if (p.get('air') or p.get('free')) else PGROUND - int(ys.max())
  dy += fix.get('dy', 0)
  dx = fix.get('dx', 0)
  s = fix.get('s', 1.0)
  # an affine about the feet (HIPX, PGROUND): scale s, then move (dx, dy)
  fx, fy = HIPX, PGROUND
  inv = (1 / s, 0, fx - (fx + dx) / s, 0, 1 / s, fy - (fy + dy) / s)
  w = im.width
  return im.transform((w, H), Image.AFFINE, inv, resample=Image.BICUBIC), (dx, dy, s, fx, fy)


def build(who, raw, pick, sheet_out):
  spec = POSES[who]
  armed = spec.get('armed', True)
  frames, keyed, heads = {}, {}, {}
  for name, p in spec['frames'].items():
    sd = pick.get(name, p.get('seed', 1))
    png = raw / f'{who}-{name}-s{sd}.png'
    if not png.exists():
      print('missing', png.name); continue
    keyed[name] = key(png, p.get('fix', {}).get('erase', ()))
    heads[name] = head_size(keyed[name])
  idle = [heads[n] for n in spec['clips']['idle']['frames'] if heads.get(n)]
  ref = float(np.median(idle))
  for name, im0 in keyed.items():
    p = spec['frames'][name]
    fix = dict(p.get('fix', {}))
    # the hair's measure is only a hint (an arm or a turned head hides some): the kept scale is `fix.s`, set by eye on a
    # strip of the heads side by side
    hint = round(ref / heads[name], 2) if heads.get(name) else None
    print(f"  {name:10} scale {fix.get('s', 1)}  (hair hint {hint})")
    im, (dx, dy, s, fx, fy) = placed(im0, p, fix)
    tr = lambda pt: (fx + (pt[0] - fx) * s + dx, fy + (pt[1] - fy) * s + dy)
    pts = {k: tr(v) for k, v in points(p, armed).items()}
    pts.update({k: tuple(v) for k, v in p.get('points', {}).items()})  # a hand placed by eye
    frames[name] = (im, pts, (HIPX + p.get('anchor', 0), PGROUND))
  # the standing height: the first idle frame's top of ink to the ground
  first = frames[next(iter(spec['clips']['idle']['frames']))][0]
  top = int(np.nonzero((np.asarray(first.getchannel('A')) > 128).any(axis=1))[0].min())
  parts = {}
  for name, (im, pts, anc) in frames.items():
    small = im.resize((round(im.width * SCALE), round(H * SCALE)), Image.LANCZOS)
    box = small.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox()
    parts[name] = (small.crop(box), box, pts, anc)
  sheet, rects = pack({k: v[0] for k, v in parts.items()})
  OUT.mkdir(parents=True, exist_ok=True)
  sheet.save(OUT / f'{who}.webp', quality=74, alpha_quality=70, method=6)
  r1 = lambda v: round(v, 1)
  meta = {'stand': r1((PGROUND - top) * SCALE), 'frames': {}, 'clips': spec['clips']}
  for name, (part, box, pts, anc) in parts.items():
    rel = lambda pt: [r1(pt[0] * SCALE - box[0]), r1(pt[1] * SCALE - box[1])]
    meta['frames'][name] = {'rect': list(rects[name]), 'anchor': rel(anc), **{k: rel(v) for k, v in pts.items()}}
  (OUT / f'{who}.json').write_text(json.dumps(meta, ensure_ascii=False, separators=(',', ':')) + '\n')
  print(who, len(parts), 'frames · sheet', sheet.size, (OUT / f'{who}.webp').stat().st_size, 'bytes')
  if sheet_out:
    check(meta, sheet, sheet_out)


def pack(parts, width=2048, pad=2):
  order = sorted(parts, key=lambda k: -parts[k].size[1])
  x = y = row = 0
  rects = {}
  for k in order:
    w, h = parts[k].size
    if x + w > width:
      x, y, row = 0, y + row + pad, 0
    rects[k] = (x, y, w, h)
    x += w + pad
    row = max(row, h)
  sheet = Image.new('RGBA', (width, y + row), (0, 0, 0, 0))
  for k, (x, y, w, h) in rects.items():
    sheet.alpha_composite(parts[k], (x, y))
  return sheet, rects


def check(meta, sheet, out):
  """Every clip on one ground line, its frames in order, then each neighbour pair overlaid (onion skin)."""
  F = meta['frames']
  cell, gh = 300, 460
  rows = []
  for cname, c in meta['clips'].items():
    names = [n for n in c['frames'] if n in F]
    pairs = list(zip(names, names[1:] + (names[:1] if c.get('loop') else [])))
    row = Image.new('RGB', (cell * (len(names) + len(pairs)) + 120, gh), (233, 222, 198))
    d = ImageDraw.Draw(row)
    d.text((6, 6), cname, fill=(0, 0, 0))
    def put(n, x, tint=None):
      fr = F[n]; x0, y0, w, h = fr['rect']; im = sheet.crop((x0, y0, x0 + w, y0 + h))
      if tint:
        a = im.getchannel('A').point(lambda v: v * 0.55)
        im = Image.new('RGBA', im.size, tint); im.putalpha(a)
      row.paste(im, (int(x - fr['anchor'][0]), int(gh - 20 - fr['anchor'][1])), im)
    for i, n in enumerate(names):
      put(n, 120 + i * cell + cell * 0.4); d.text((120 + i * cell + 6, gh - 16), n, fill=(0, 0, 0))
    for i, (a, b) in enumerate(pairs):
      x = 120 + (len(names) + i) * cell + cell * 0.4
      put(a, x, (200, 40, 30, 255)); put(b, x, (30, 60, 200, 255)); d.text((x - cell * 0.4 + 6, gh - 16), f'{a}>{b}', fill=(0, 0, 0))
    d.line([(0, gh - 20), (row.width, gh - 20)], fill=(160, 30, 30), width=1)
    rows.append(row)
  wmax = max(r.width for r in rows)
  big = Image.new('RGB', (wmax, gh * len(rows)), (233, 222, 198))
  for i, r in enumerate(rows):
    big.paste(r, (0, i * gh))
  big.thumbnail((4000, 8000))
  big.save(out, quality=80)
  print('check', out)


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('cmd', choices=['sketch', 'paint', 'build'])
  ap.add_argument('who')
  ap.add_argument('raw')
  ap.add_argument('--only', default='')
  ap.add_argument('--seeds', default='1')
  ap.add_argument('--master', action='store_true')
  ap.add_argument('--pick', default='', help='frame=seed,… (else the frame\'s kept `seed`, else 1)')
  ap.add_argument('--sheet', default='')
  a = ap.parse_args()
  raw = Path(a.raw)
  spec = POSES[a.who]
  if a.cmd == 'sketch':
    raw.mkdir(parents=True, exist_ok=True)
    for n, p in spec['frames'].items():
      sketch(p, raw / f'pose-{n}.png', spec.get('armed', True), spec.get('robe', True))
  elif a.cmd == 'paint':
    paint(a.who, raw, set(filter(None, a.only.split(','))), [int(x) for x in a.seeds.split(',')], a.master)
  else:
    build(a.who, raw, dict(p.split('=') for p in a.pick.split(',') if p), a.sheet)


if __name__ == '__main__':
  main()
