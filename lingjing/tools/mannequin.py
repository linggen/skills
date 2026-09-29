#!/usr/bin/env python3
"""mannequin.py — the 图鉴's base figures for every 经脉 · 穴位 diagram.

    python3 tools/mannequin.py

Hanli, 2026-09-29: 「用一个假人标出经脉和穴位」 — a mannequin in the spirit of the
宋 天圣针灸铜人: neutral, genderless, a smooth body, a simple head, no face.
ONE set, three views (profile facing left, back, front), 600×900 each, ink line
over a faint bronze tone on paper. The bases carry no text and no points:
every label, point and channel is the codex entry's `marks` (scripts/marks.js),
drawn in the same 0–1 space, so all knowledge figures are one family and no
picture model ever places a point.

Writes worlds/jiuding/art/codex/mannequin-{profile,back,front}.svg.
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'worlds' / 'jiuding' / 'art' / 'codex'
W, H = 600, 900
PAPER, BODY, INK, SOFT = '#f4eee1', '#e8dcc4', '#3a3026', '#9b8a70'


def smooth(pts, closed=True):
  """Catmull-Rom through the points, as cubic Béziers."""
  n = len(pts)
  get = (lambda i: pts[i % n]) if closed else (lambda i: pts[max(0, min(n - 1, i))])
  d = f'M{pts[0][0]:.1f} {pts[0][1]:.1f}'
  for i in range(n if closed else n - 1):
    p0, p1, p2, p3 = get(i - 1), get(i), get(i + 1), get(i + 2)
    c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
    c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
    d += f' C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}'
  return d + (' Z' if closed else '')


def shape(d, fill=BODY, width=3.2):
  return f'<path d="{d}" fill="{fill}" stroke="{INK}" stroke-width="{width}" stroke-linejoin="round" stroke-linecap="round"/>'


def line(d, width=2, dash=None, colour=SOFT):
  extra = f' stroke-dasharray="{dash}"' if dash else ''
  return f'<path d="{d}" fill="none" stroke="{colour}" stroke-width="{width}" stroke-linecap="round"{extra}/>'


def svg(view, parts):
  return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">\n'
          f'<!-- 图鉴 base figure · {view} · 仿宋天圣针灸铜人 — no text, no points: the marks are the codex entry\'s (tools/mannequin.py) -->\n'
          f'<rect width="{W}" height="{H}" fill="{PAPER}"/>\n' + '\n'.join(parts) + '\n</svg>\n')


def mirror(half, cx=300):
  """A symmetric outline from its right half (x offsets from the centre, top to bottom)."""
  right = [(cx + x, y) for x, y in half]
  left = [(cx - x, y) for x, y in reversed(half) if x > 0]
  return right + left


# The standing figure, front and back: the right half of the trunk and legs,
# an arm, the head and the neck.
TRUNK = [(0, 214), (30, 216), (62, 234), (96, 252), (94, 292), (86, 342), (76, 420), (84, 500), (88, 560),
         (80, 660), (68, 760), (58, 846), (74, 876), (60, 888), (24, 886), (22, 846), (22, 760), (20, 660), (10, 584), (0, 574)]
ARM = [(92, 246), (114, 290), (120, 380), (118, 470), (112, 540), (118, 586), (106, 612), (92, 598), (90, 540), (92, 470), (92, 380), (88, 300)]


def standing(view):
  arm_r = [(300 + x, y) for x, y in ARM]
  arm_l = [(600 - x, y) for x, y in arm_r]
  parts = [shape(smooth(mirror(TRUNK))), shape(smooth(arm_r)), shape(smooth(arm_l)),
           shape(smooth([(274, 150), (326, 150), (328, 226), (272, 226)]), width=2.6),
           shape(smooth([(300, 48), (345, 62), (356, 112), (344, 160), (300, 182), (256, 160), (244, 112), (255, 62)]))]
  if view == 'back':
    # the spine, faint; the shoulder blades' lower edges
    parts.append(line(smooth([(300, 228), (301, 330), (299, 440), (300, 560)], closed=False), dash='10 9'))
    parts.append(line(smooth([(248, 300), (262, 330), (286, 336)], closed=False)))
    parts.append(line(smooth([(352, 300), (338, 330), (314, 336)], closed=False)))
  else:
    # the breast line and the navel, faint
    parts.append(line(smooth([(248, 312), (268, 330), (290, 328)], closed=False)))
    parts.append(line(smooth([(352, 312), (332, 330), (310, 328)], closed=False)))
    parts.append(f'<circle cx="300" cy="440" r="3.5" fill="none" stroke="{SOFT}" stroke-width="2"/>')
  return svg(view, parts)


def profile():
  body = [(284, 176), (284, 214), (262, 250), (248, 300), (250, 350), (258, 400), (256, 450), (262, 500), (276, 546),
          (282, 600), (282, 680), (290, 760), (292, 846), (252, 876), (254, 892), (346, 892), (338, 846), (336, 760),
          (342, 700), (340, 640), (356, 600), (372, 548), (368, 500), (350, 450), (356, 390), (368, 320), (360, 252), (334, 212), (330, 176)]
  head = [(300, 46), (344, 58), (364, 100), (362, 146), (340, 178), (304, 188), (282, 180), (262, 150), (250, 128),
          (242, 118), (248, 108), (250, 86), (266, 60)]
  arm = [(296, 232), (334, 230), (344, 290), (338, 360), (326, 420), (318, 480), (322, 530), (306, 548), (296, 520), (300, 470), (306, 410), (312, 350), (302, 290)]
  spine = smooth([(338, 190), (350, 250), (352, 320), (340, 390), (336, 450), (352, 510), (356, 546)], closed=False)
  return svg('profile', [shape(smooth(body)), line(spine, dash='10 9'), shape(smooth(head)), shape(smooth(arm))])


if __name__ == '__main__':
  OUT.mkdir(parents=True, exist_ok=True)
  for name, text in (('profile', profile()), ('back', standing('back')), ('front', standing('front'))):
    (OUT / f'mannequin-{name}.svg').write_text(text)
    print(f'wrote art/codex/mannequin-{name}.svg')
