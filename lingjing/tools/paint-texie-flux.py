#!/usr/bin/env python3
"""paint-texie-flux.py — 施法特写's ink close-up, painted by the local FLUX (never Codex; the house's comic style,
flux_comic.STYLE): 小满 in side profile, an edit pass from his side bust (art/xiaoman-side.webp, itself an edit pass
from 守墙关's comic 小满) so he is the same boy in every frame. Hanli 10-21: 「那就水墨, 识别到手势, 放一个预制的动画就好了」.

    PY=~/.linggen/runtime/envs/pictures/bin/python
    $PY tools/paint-texie-flux.py paint [--only id,…] [--seeds 1,2,3]   # every seed → $FLUX_REVIEW/texie/, to be looked at
    $PY tools/paint-texie-flux.py cut                                    # the KEPT seeds → scripts/games/texie/art/

Per seal (worlds/jiuding/levels/texie.json `anims`) three frames — `rise` (the hand coming up), `seal` (the seal held),
`thrust` (thrust forward, the element's glow) — cut into one sprite sheet, art/seal-<key>.webp; and one `ready` frame
(arms down). Every frame on one 768 × 576 canvas, keyed (magenta) but not trimmed, so frames line up as they cross-fade.
Hands are FLUX's weak spot: every kept seed was checked finger by finger against the seal's rule.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flux_comic as fc

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'scripts' / 'games' / 'texie' / 'art'
BUST = OUT / 'xiaoman-side.webp'
W, H = 768, 576

BOY = ('The attached image is the MASTER drawing of this boy: draw the SAME boy, same face, black hair in a small topknot '
       'tied with a red cord, the same off-white hemp tunic with a dark sash, in the same cartoon style, in strict SIDE '
       'PROFILE facing RIGHT, head and chest, his face set in fierce concentration. His WHOLE head is in the picture with '
       'space above it; he stands at the LEFT of the picture, the right half open for his hand. ')
TAIL = ' ' + fc.STYLE + ' ' + fc.ON_MAGENTA

# What each seal's hand is, in words FLUX can follow (jieyin.json's rule for it).
SEALS = {
  'jian': ('the SWORD SEAL: his INDEX and MIDDLE fingers held STRAIGHT UP pressed together side by side, his RING finger '
           'and LITTLE finger FOLDED DOWN into the palm, the thumb pressing over the folded ring and little fingers',
           'a streak of pale blue sword light shooting from the two straight fingertips'),
  'danjian': ('ONE finger pointing: only his INDEX finger STRAIGHT UP, the middle, ring and little fingers FOLDED into the '
              'palm, the thumb over them',
              'a small bright white spark flying from the index fingertip'),
  'zhang': ('an OPEN FLAT PALM: all five fingers straight and together, the palm facing forward like a palm strike',
            'a gust of white wind swirling out from the palm'),
  'quan': ('a tight FIST, the fingers curled in, the thumb across them',
           'an orange-gold burst of force around the fist'),
  'wu': ('a ring made by the THUMB and the MIDDLE finger touching at their TIPS (like an OK sign but with the MIDDLE finger), '
         'the index, ring and little fingers STRAIGHT UP, the palm toward the viewer',
         'a ball of red-orange fire bursting from the hand'),
  'shen': ('a ring made by the THUMB and the LITTLE finger touching at their TIPS (the little finger bent across to meet '
           'the thumb), the index, middle and ring fingers STRAIGHT UP, the palm toward the viewer',
           'a ball of red-orange fire bursting from the hand'),
  'zi': ('the THUMB TIP pressed on the BASE of the RING finger where it meets the palm, all four fingers STRAIGHT UP '
         'together, the palm toward the viewer',
         'a spray of icy blue water and ice shards bursting from the hand'),
  'you': ('the THUMB TIP pressed on the TOP JOINT of the LITTLE finger, the other fingers STRAIGHT UP, the palm toward the '
          'viewer',
          'a flash of white-gold metal light like a blade from the hand'),
  'mao': ('the THUMB TIP pressed on the MIDDLE JOINT of the INDEX finger, all four fingers STRAIGHT UP, the palm toward the '
          'viewer',
          'green vines and leaves bursting from the hand'),
  'yuqing': ('the THUMB TIP pressed on the MIDDLE JOINT of the MIDDLE finger, all four fingers STRAIGHT UP, the palm toward '
             'the viewer',
             'a burst of golden-brown earth and dust from the hand'),
}

FRAMES = {
  'rise': lambda hand, glow: BOY + f'His right hand is RISING from below up toward his chest, the fingers starting to form {hand}.',
  'seal': lambda hand, glow: BOY + f'His right hand is held up in front of him at the right of the picture, drawn LARGE and close to the viewer, making {hand}. Every finger clearly visible and separate.',
  'thrust': lambda hand, glow: BOY + f'He THRUSTS his right arm forward to the right, the hand still making {hand}, with {glow}, motion lines.',
}

JOBS = {'ready': dict(w=W, h=H, refs=[BUST], key='magenta', prompt=(
  BOY + 'His arms hang down out of the picture: NO hands, NO fingers. Calm and ready.' + TAIL))}
for sid, (hand, glow) in SEALS.items():
  for fr, make in FRAMES.items():
    JOBS[f'{sid}-{fr}'] = dict(w=W, h=H, refs=[BUST], key='magenta', prompt=make(hand, glow) + TAIL)

# Looked at 2026-10-21, finger by finger: see KEPT (a missing frame keeps the seal's `seal` frame in its place).
KEPT = {}


def cut():
  from PIL import Image
  OUT.mkdir(parents=True, exist_ok=True)
  fw, fh = 512, 384
  def frame(jid):
    seed = KEPT[jid]
    im = fc.key_green(fc.REVIEW / 'texie' / f'{jid}-{seed}.png', trim=False, key='magenta')
    return im.resize((fw, fh), Image.LANCZOS)
  if 'ready' in KEPT:
    frame('ready').save(OUT / 'ready.webp', 'WEBP', quality=84, method=6, exact=True)
  for sid in SEALS:
    if f'{sid}-seal' not in KEPT:
      continue
    sheet = Image.new('RGBA', (fw * 3, fh), (0, 0, 0, 0))
    for i, fr in enumerate(FRAMES):
      sheet.paste(frame(f'{sid}-{fr}' if f'{sid}-{fr}' in KEPT else f'{sid}-seal'), (fw * i, 0))
    sheet.save(OUT / f'seal-{sid}.webp', 'WEBP', quality=82, method=6, exact=True)
    print(sid, '→ done')


if __name__ == '__main__':
  a = fc.run(JOBS)
  if a.cmd == 'paint':
    fc.paint_all('texie', JOBS, a)
  else:
    cut()
