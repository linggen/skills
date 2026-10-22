#!/usr/bin/env python3
"""paint-zhuigu.py — 第一回's 暴雨坠谷 (00-fall), three ink-wash set pieces by the LOCAL FLUX (2026-10-22).

    python3 tools/paint-zhuigu.py --only ya,gun,tai --seeds 1,2,3 [--review DIR]   # a review round
    python3 tools/paint-zhuigu.py --cut ya,gun,tai [--review DIR]                  # the KEPT seeds → art/setpiece/

The book (01-第一回.md): a black rainstorm on 黑松岭; at the 27th mark the narrow muddy slope hugging the cliff, 小满
hauls 爹 in against the rock and is flung out over the edge himself; he tumbles down — 「泥浆、石头、断枝、雨水劈头盖脸而来，
天和地在他眼前翻了不知多少个跟头」 — a vine snaps in his hand; he lands in a thick bed of moss at the cliff's foot, the cliff
gone up into the rain mist, silver-leaved trees. Three scenes, the house's 黑松岭 cliff and 银谷 plates as the style
references: ya (the edge), gun (the fall down the cliff face, the camera pans top to bottom), tai (the moss bed).

The painting and cutting are paint-yaowang.py's (loaded as a module: one FLUX job at a time); only the subjects, names,
kept seeds and the seal scrub are here. FLUX copies the references' red painter's seal: a kept seed that still has one
gets it painted out from the paper round it (SCRUB, cv2 inpaint). Every seed looked at; the kept ones are below.
"""
import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('paint_yaowang', HERE / 'paint-yaowang.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

WORLD = base.WORLD
CLIFF = WORLD / 'art' / 'places' / 'heisong-cliff.webp'
YINGU = WORLD / 'art' / 'places' / 'yingu.webp'
INK = base.INK
BOY = ('a small skinny twelve-year-old peasant boy in a patched off-white cotton jacket and grey trousers, black hair in a '
       'small topknot')
DAD = 'a lean peasant man in a grey-brown jacket with a hunting bow slung on his back'
STORM = ('A black rainstorm: long slanting sheets of driving rain drawn as fine grey ink strokes across the whole picture, '
         'a dark heavy ink-wash sky, mist. ')

base.SUBJECTS = {
  'ya': ('In the same style as the reference picture, a new scene at night in a storm on a high pine mountain: a narrow '
         'muddy slope path hugging a sheer dark rock cliff. ' + STORM + 'On the LEFT the rock wall rises out of the picture '
         'with wind-bent black pines clinging to it; ' + DAD + ' is pressed flat against the rock wall on the left, small. '
         'The path ends at a crumbling muddy edge in the middle; on the RIGHT a misty empty void falls away, and out over '
         'it, in mid-air beyond the edge, ' + BOY + ' is flung outwards, arms and legs flailing, very small. The figures are '
         'small, the storm and the cliff are huge. ' + INK, (1536, 1024), CLIFF, 'scene'),
  'gun': ('In the same style as the reference picture, a new scene seen from HIGH ABOVE, looking steeply DOWN the face of a '
          'towering sheer cliff in a black rainstorm: the wet dark rock face fills the picture from the top edge to the '
          'bottom edge and falls away into white mist below. Fine slanting grey rain strokes over everything. Long STREAMS of '
          'brown MUD pour down the rock face in ribbons; grey stones and broken pine branches tumble down with them; one long '
          'thin dark VINE hangs down the cliff from the top edge to the middle. Exactly in the MIDDLE of the picture, among '
          'the falling mud, stones and branches, ' + BOY + ' tumbles head over heels in mid-air, very small, seen from above. '
          'No sky. ' + INK, (1536, 1024), CLIFF, 'scene'),
  'tai': ('In the same style as the reference picture, a new scene at the foot of a towering cliff in grey rain mist, the '
          'rain easing to a light drizzle, quiet: in the foreground a deep thick bed of soft wet green MOSS, mounded and '
          'spongy; a snapped vine dangles down from above, its broken end hanging over the moss; on the left the dark cliff '
          'rises up and vanishes into fog; faint silver-leaved trees at the right in the mist. In the moss, ' + BOY + ' lies '
          'sunk half into it on his back, very small. ' + INK, (1536, 1024), YINGU, 'scene'),
}
base.NAMES = {'ya': 'zhuigu-ya', 'gun': 'zhuigu-gun', 'tai': 'zhuigu-tai'}

# id: (kept seed, unused) — every seed looked at (2026-10-22); what was wrong with the rest:
base.KEPT = {
  'ya': (1, 0),   # 爹 crouched against the rock at the left, the path's muddy end, the boy flung out over the void at the right;
                  # 2: 爹 standing on the path, the void a plain mist; 3: 爹 walking away, the boy too high. No seal on any.
  'gun': (5, 0),  # of 1–7: the cliff face top to bottom, mud ribbons, stones, a vine, the boy at the middle; 1–3 (the first
                  # prompt) a cliff seen from the side, the boy climbing; 4 a close second (the rock only on the right
                  # two-thirds); 6 the rock only on the right half, the boy over mist; 7 the boy smaller. He reads leaping more than tumbling head over heels.
  'tai': (3, 0),  # the moss bed, the boy sunk in on his side, the vine hanging from the top, the cliff into fog at the left,
                  # silver trees right; 1: no fog on the cliff, the boy on top of the moss; 2: the vine off-centre and thick.
}
# id: [(x0, y0, x1, y1), …] in the 1536×1024 picture — a seal the kept seed stamped anyway, painted out.
SCRUB = {}

SCRUB_CODE = r'''
import sys, json, numpy as np, cv2
from PIL import Image
dst, boxes = sys.argv[1], json.loads(sys.argv[2])
a = np.asarray(Image.open(dst).convert('RGB')).copy()
m = np.zeros(a.shape[:2], np.uint8)
for x0, y0, x1, y1 in boxes:
  m[y0:y1, x0:x1] = 255
Image.fromarray(cv2.inpaint(a, m, 5, cv2.INPAINT_TELEA)).save(dst, 'WEBP', quality=84)
'''

_cut = base.cut


def cut(png, sid, thr):
  dst = _cut(png, sid, thr)
  if SCRUB.get(sid):
    import json, subprocess
    subprocess.run([str(base.PY), '-c', SCRUB_CODE, str(dst), json.dumps(SCRUB[sid])], check=True)
  return dst


base.cut = cut

if __name__ == '__main__':
  import sys
  if '--review' not in sys.argv:
    sys.argv += ['--review', str(Path(base.tempfile.gettempdir()) / 'zhuigu-review')]
  base.main()
