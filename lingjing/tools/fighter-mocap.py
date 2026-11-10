#!/usr/bin/env python3
"""fighter-mocap.py — 格斗's key poses from motion capture, as a side view (2026-11-10, Hanli: 「现在画出来的拳脚长短感觉不太合理」).

The source: the CMU Graphics Lab Motion Capture Database (http://mocap.cs.cmu.edu/), whose terms read: 「This data is free
for use in research projects. You may include this data in commercially-sold products, but you may not resell this data
directly, even in converted form.」 — so the takes are read from a local download (never committed, never shipped); only
a handful of side-view angles per key pose land in tools/fighter-poses-v2.json. Acknowledgment the database asks for:
「The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF
EIA-0196217.」 The takes are generic martial-arts drills (subject 135 Oiduki = a stepping straight punch, Yokogeri = a
side kick; subject 144 punch sequences) — no game's animation is a source.

    python3 tools/fighter-mocap.py sheet  <asf> <amc> <out.jpg> [--every 10] [--limb rwrist]   every Nth frame, side view
    python3 tools/fighter-mocap.py angles <asf> <amc> <frame> [--face rwrist|rfoot|…] [--near r|l] the frame as pose angles

`angles` prints a pose in fighter-poses' terms (lean, legF/legB/armF/armB as [upper, lower] degrees from straight down,
positive toward the facing side): the joints are projected on the vertical plane through the strike's line (the
horizontal direction from the hips to `--face` at that frame), so a punch or kick thrown along that line keeps its full
length; F is the near side (`--near`, the side toward the viewer: her right when she faces right).
"""
import argparse, json, math, sys
from pathlib import Path
import numpy as np


def rot(axis, deg):
  r = math.radians(deg); c, s = math.cos(r), math.sin(r)
  return {'x': np.array([[1, 0, 0], [0, c, -s], [0, s, c]]),
          'y': np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]),
          'z': np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])}[axis]


def euler(order, vals):
  """ASF's angles applied in `order` (XYZ: x first) → one matrix."""
  m = np.eye(3)
  for a, v in zip(order.lower(), vals):
    m = rot(a, v) @ m
  return m


def read_asf(path):
  bones, hier, root_order = {}, {}, ['tx', 'ty', 'tz', 'rx', 'ry', 'rz']
  lines = Path(path).read_text().splitlines()
  sec, cur = None, None
  for ln in lines:
    t = ln.strip()
    if not t or t.startswith('#'):
      continue
    if t.startswith(':'):
      sec = t.split()[0]
      continue
    w = t.split()
    if sec == ':root' and w[0] == 'order':
      root_order = [x.lower() for x in w[1:]]
    elif sec == ':bonedata':
      if w[0] == 'begin':
        cur = {'dof': []}
      elif w[0] == 'end':
        bones[cur['name']] = cur
      elif w[0] == 'name':
        cur['name'] = w[1]
      elif w[0] == 'direction':
        cur['dir'] = np.array([float(x) for x in w[1:4]])
      elif w[0] == 'length':
        cur['len'] = float(w[1])
      elif w[0] == 'axis':
        cur['axis'] = euler(w[4], [float(x) for x in w[1:4]])
      elif w[0] == 'dof':
        cur['dof'] = [x.lower() for x in w[1:]]
    elif sec == ':hierarchy':
      if w[0] in ('begin', 'end'):
        continue
      hier[w[0]] = w[1:]
  return bones, hier, root_order


def read_amc(path):
  frames, cur = [], None
  for ln in Path(path).read_text().splitlines():
    t = ln.strip()
    if not t or t[0] in '#:':
      continue
    if t.isdigit():
      cur = {}; frames.append(cur); continue
    w = t.split()
    cur[w[0]] = [float(x) for x in w[1:]]
  return frames


def fk(asf, frame):
  """Every bone's end in the take's own space (Y up), in metres."""
  bones, hier, ro = asf
  scale = (1.0 / 0.45) * 2.54 / 100.0
  rv = dict(zip(ro, frame['root']))
  pos = {'root': np.array([rv['tx'], rv['ty'], rv['tz']]) * scale}
  R = {'root': euler('xyz', [rv['rx'], rv['ry'], rv['rz']])}
  def walk(parent):
    for b in hier.get(parent, []):
      bn = bones[b]
      vals = dict(zip(bn['dof'], frame.get(b, [])))
      M = euler('xyz', [vals.get('rx', 0), vals.get('ry', 0), vals.get('rz', 0)])
      C = bn['axis']
      R[b] = R[parent] @ C @ M @ C.T
      pos[b] = pos[parent] + R[b] @ bn['dir'] * bn['len'] * scale
      walk(b)
  walk('root')
  return pos


# the joints a side view needs: name → bone whose END is that joint
J = {'hip': 'root', 'lhip': 'lhipjoint', 'rhip': 'rhipjoint', 'lknee': 'lfemur', 'lankle': 'ltibia', 'ltoe': 'lfoot',
     'rknee': 'rfemur', 'rankle': 'rtibia', 'rtoe': 'rfoot', 'neck': 'lowerneck', 'head': 'head', 'sh0': 'thorax',
     'lsh': 'lclavicle', 'lelb': 'lhumerus', 'lwri': 'lradius', 'lfist': 'lhand', 'rsh': 'rclavicle', 'relb': 'rhumerus',
     'rwri': 'rradius', 'rfist': 'rhand'}
END = {'rwrist': 'rfist', 'lwrist': 'lfist', 'rfoot': 'rankle', 'lfoot': 'lankle'}


def joints(asf, frame):
  p = fk(asf, frame)
  return {k: p[b] for k, b in J.items()}


def plane(j, face):
  """The side view's axes: forward (horizontal, from the hips toward `face`'s joint) and up (Y)."""
  v = j[END.get(face, face)] - j['hip']; v[1] = 0
  n = np.linalg.norm(v)
  return v / n if n > 1e-6 else np.array([0, 0, 1.0])


def project(j, fwd):
  """Each joint as (x forward, y up) in metres, the feet's middle at x 0, the ground at y 0."""
  out = {k: np.array([float(v @ fwd), float(v[1])]) for k, v in j.items()}
  g = min(out['lankle'][1], out['rankle'][1], out['ltoe'][1], out['rtoe'][1])
  mid = (out['lankle'][0] + out['rankle'][0]) / 2
  return {k: np.array([v[0] - mid, v[1] - g]) for k, v in out.items()}


def ang(a, b):
  """The angle of a→b from straight down, positive toward the facing side (+x), in degrees."""
  d = b - a
  return math.degrees(math.atan2(d[0], -d[1]))


def angles(asf, frame, face, near='r'):
  j = joints(asf, frame)
  q = project(j, plane(j, face))
  f, b = near, 'l' if near == 'r' else 'r'
  hipc = (q['lhip'] + q['rhip']) / 2
  shc = (q['lsh'] + q['rsh']) / 2
  lean = (math.degrees(math.atan2((shc - hipc)[0], (shc - hipc)[1])))
  def two(a, m, e):
    return [round(ang(q[a], q[m])), round(ang(q[m], q[e]))]
  pose = {'lean': round(lean), 'legF': two(f + 'hip', f + 'knee', f + 'ankle'), 'legB': two(b + 'hip', b + 'knee', b + 'ankle'),
          'armF': two(f + 'sh', f + 'elb', f + 'fist'), 'armB': two(b + 'sh', b + 'elb', b + 'fist'),
          'head': round(math.degrees(math.atan2((q['head'] - q['neck'])[0], (q['head'] - q['neck'])[1])))}
  return pose, q


def axis(asf, fr, face, step=4):
  """The take's strike line: the horizontal direction from the hips to `face`'s joint at its furthest reach."""
  best, fwd = -1, None
  for i in range(0, len(fr), step):
    j = joints(asf, fr[i]); v = j[END.get(face, face)] - j['hip']; v[1] = 0
    if np.linalg.norm(v) > best:
      best, fwd = np.linalg.norm(v), v / np.linalg.norm(v)
  return fwd


def sheet(asf, amc, out, every, face):
  from PIL import Image, ImageDraw
  fr = read_amc(amc)
  idx = list(range(0, len(fr), every))
  cols = 12
  cw, ch = 160, 220
  im = Image.new('RGB', (cw * cols, ch * math.ceil(len(idx) / cols)), (240, 235, 225))
  d = ImageDraw.Draw(im)
  fwd = axis(asf, fr, face)
  for n, i in enumerate(idx):
    j = joints(asf, fr[i])
    q = project(j, fwd)
    ox, oy = (n % cols) * cw + cw * 0.4, (n // cols) * ch + ch - 14
    P = lambda k: (ox + q[k][0] * 90, oy - q[k][1] * 90)
    for a, b, c in (('lhip', 'lknee', 'lankle'), ('lsh', 'lelb', 'lfist')):
      d.line([P(a), P(b), P(c)], fill=(150, 150, 150), width=3)
    for a, b, c in (('rhip', 'rknee', 'rankle'), ('rsh', 'relb', 'rfist')):
      d.line([P(a), P(b), P(c)], fill=(200, 40, 40), width=3)
    d.line([P('hip'), P('sh0'), P('head')], fill=(0, 0, 0), width=3)
    d.text((ox - cw * 0.4 + 4, oy - ch + 18), str(i), fill=(0, 0, 0))
  im.save(out, quality=80)
  print(out, len(fr), 'frames')


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('cmd', choices=['sheet', 'angles'])
  ap.add_argument('asf'); ap.add_argument('amc'); ap.add_argument('arg')
  ap.add_argument('--every', type=int, default=10)
  ap.add_argument('--face', default='rwrist')
  ap.add_argument('--near', default='r')
  a = ap.parse_args()
  asf = read_asf(a.asf)
  if a.cmd == 'sheet':
    sheet(asf, a.amc, a.arg, a.every, a.face)
  else:
    pose, _ = angles(asf, read_amc(a.amc)[int(a.arg)], a.face, a.near)
    print(json.dumps(pose))


if __name__ == '__main__':
  main()
