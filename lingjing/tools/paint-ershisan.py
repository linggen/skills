#!/usr/bin/env python3
"""paint-ershisan.py — 古五's 二十三下 (wm-chu), a short 大场面, by the LOCAL FLUX.

    python3 tools/paint-ershisan.py --only ya,quan --seeds 1,2,3 [--review DIR]   # a review round
    python3 tools/paint-ershisan.py --cut ya,quan [--review DIR]                  # the KEPT seeds → art/setpiece/

The reading cap (Hanli 2026-10-20: 「剧情连续阅读太长的地方, 你处理一下, 看是否可以加个小游戏等」; the standing rule of 10-19):
wm-kaikai → 讲堂 read 3,811 字 without play, and the reckoning at the 秘境's stone door is the book's own big moment — the 23
blows owed since the woodshed, counted out, three-tenths of his strength, the last a light touch. The book (05-第五回.md):
「小满站起身，一拳迎在他鼻梁上。『一。』……数到『二十三』，最后一下不轻不重，点在马小宝的肩膀上。」

Painted, never drawn: the ledge under the cliff by the iron stake where he sat and waited (a scene, the realm's cliff as the style
reference) and his fist (a cut-out on a flat dark ground). No faces: the camera keeps to the fist, the stake and the stone.
The painting and cutting are paint-yaowang.py's (loaded as a module: one FLUX job at a time, the same cut-out code).
"""
import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('paint_yaowang', HERE / 'paint-yaowang.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

WORLD = base.WORLD
CLIFF = WORLD / 'art' / 'places' / 'mijing-cliff.webp'
INK = base.INK
DARK = ('The one subject alone in the middle on a plain flat even dark brown-black ground that runs to every edge, nothing '
        'else in the picture, no table, no shadow, no texture on the ground. Chinese ink-wash painting with light colour, '
        'fine ink linework. No text, no letters, no calligraphy, no seal, no signature, no border, no frame.')

base.SUBJECTS = {
  'ya': ('In the same style and the same dark cave realm as the reference picture: a narrow rock ledge along the foot of a sheer '
         'cliff, seen from the side; near the ledge\'s edge on the left an old rusted iron stake driven into the rock, leaning a '
         'little; beyond the edge a dark drop into nothing; at the right a heavy stone door set in the cliff face, shut; short pale '
         'scratch marks on the rock by the edge; a thin cold grey light falling from high above, dust hanging in it. No people. '
         + INK, (1536, 1024), CLIFF, 'scene'),
  'quan': ('Seen from the side, a boy\'s clenched right fist thrusting forward to the right, the forearm in a coarse patched grey '
           'hemp sleeve, the knuckles scraped and red, the fist tight and hard, drawn in fine ink line and light wash. ' + DARK,
           (768, 768), None, ('cut', (480, 480), 'mid', False)),
}
base.NAMES = {'ya': 'ershisan-ya', 'quan': 'ershisan-quan'}

# id: (kept seed, paper threshold) — every seed looked at; what was wrong with the rest:
base.KEPT = {
  'ya': (1, 0),     # the stake at the left on its rock, the drop, the shut stone door in the cliff, the light from above;
                    # 2: the stake tiny on a crag; 3: the drop opens in the ledge's middle. All three put a painter's seal low
                    # right (FLUX copies the reference's): the camera never reaches it (ershisan.js SHOT).
  'quan': (3, 30),  # the fist square and hard, scraped knuckles, the coarse grey sleeve; 1: stubby; 2: the wrist bent up
}

def fade_sleeve():
  # The forearm runs off the painting's left edge: fade the cut-out's left third to nothing, as ink thins on wet paper,
  # so the sleeve never ends in a hard edge mid-frame (the fist comes in from the left).
  dst = base.OUT / 'ershisan-quan.webp'
  if not dst.exists():
    return
  code = ('import sys; from PIL import Image\n'
          'im = Image.open(sys.argv[1]).convert("RGBA"); w, h = im.size; a = im.getchannel("A")\n'
          'px = a.load()\n'
          'for x in range(int(w * 0.42)):\n'
          '  k = (x / (w * 0.42)) ** 1.6\n'
          '  for y in range(h): px[x, y] = int(px[x, y] * k)\n'
          'im.putalpha(a); im.save(sys.argv[1], "WEBP", quality=88)')
  base.subprocess.run([str(base.PY), '-c', code, str(dst)], check=True)
  print('quan → the sleeve faded at the left')


if __name__ == '__main__':
  import sys
  if '--review' not in sys.argv:
    sys.argv += ['--review', str(Path(base.tempfile.gettempdir()) / 'ershisan-review')]
  base.main()
  if '--cut' in ' '.join(sys.argv) and 'quan' in ' '.join(sys.argv):
    fade_sleeve()
