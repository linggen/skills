#!/usr/bin/env python3
"""paint-rope-flux.py — the 割绳子 games' sprites (灵气泡, 荆棘), painted by the local FLUX.

    python3 tools/paint-rope-flux.py [--only id,id] [--seeds 1,2,3,4] [--review DIR] [--keep id:seed,…]

2026-10-16 (the 饭桶's daily cut-the-rope puzzle; Codex quota low): FLUX.2 klein 4B through mflux
(tools/paint-cards.py's recipe, HF_HOME at the cached model, nothing downloaded), as an EDIT pass
from a house 水墨淡彩 painting (`reference`, art/items/chonglou.webp) so the sprite sits in the same
paper and wash. Prompts are English only (Chinese words in a FLUX prompt invite fake characters).
Without --keep, every seed goes to the review folder to be looked at; --keep paints the chosen seed
again and writes art/games/<id>.webp: cropped to the subject, the paper taken out as alpha (how far
each pixel is from the paper's colour), so the sprite lays clean on the light page and the dark one.
One FLUX job at a time on the GPU: wait while another mflux process runs.

Kept (2026-10-16, four seeds each looked at — one subject, no text, no seal): 灵气泡 seed 1 (a clean
ink ring, jade-and-gold wash, a wisp of mist), 荆棘 seed 1 (a dense crossed bramble, rust leaves).
"""
import argparse, json, os, subprocess, tempfile, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORLD = HERE.parent / 'worlds' / 'jiuding'
OUT = WORLD / 'art' / 'games'
REFERENCE = WORLD / 'art' / 'items' / 'chonglou.webp'
PY = Path.home() / '.linggen/runtime/envs/pictures/bin/python'
SCRIPT = Path.home() / '.linggen/runtime/mlx_picture.py'
MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'

STYLE = ('Match the attached reference picture EXACTLY in style: Chinese ink wash on pale aged rice paper, xieyi brush '
         'strokes, soft ink gradations, muted mineral colours, generous empty paper. Replace its subject entirely: do not '
         'draw the plant, do not draw the grey cloud of wash. The one subject alone in the middle on plain empty paper that '
         'runs to every edge. No text, no characters, no seal, no signature, no border, no frame, no vignette.')

SUBJECTS = {
  'bubble': 'A single round floating bubble of pale spirit mist, a perfect circle drawn with one light ink ring, the inside '
            'a very soft luminous wash of faint jade green and pale gold, a small white highlight near the top left, a few '
            'wisps of mist curling around its rim. Just the one bubble.',
  'thorns': 'A short horizontal tangle of thorny bramble branches, dark ink stems crossing each other, many sharp pointed '
            'thorns along them, a few small dry leaves in muted rust brown, wider than it is tall, lying across the middle '
            'of the paper. Just the bramble, nothing else.',
  # 2026-10-16, the module's new tools and the three story beats (算账 · 忍字 · 认路)
  'crow': 'A single black crow perched sideways, wings folded, head turned with a sly look, drawn in loose dark ink '
          'strokes with a little grey wash on the feathers, its feet gripping nothing. Just the one bird.',
  'seal': 'A single square Chinese seal stamp impression in cinnabar red ink, its border slightly broken and worn, '
          'with an abstract swirling cloud pattern inside instead of any characters. Just the one red seal.',
  'steelyard': 'An old Chinese steelyard (gancheng) hanging from one hook: a single long thin wooden rod held level, '
               'ONE shallow round woven pan hanging on three cords from its SHORT left end, and ONE small round iron '
               'counterweight hanging on a loop of cord far out on its LONG right arm. Only one pan, not a balance with '
               'two pans. Plain, worn, used by a village landlord.',
  'dog': 'A scruffy yellow village dog sitting and looking up hopefully with its mouth slightly open, tongue showing, '
         'ears up, tail curled, a rope collar. Side view, whole body, just the dog.',
  'cake': 'A single small square of pale golden osmanthus cake, soft layered steamed cake with tiny yellow osmanthus '
          'flowers on top, hanging from a short thin red string tied around it.',
  'meat': 'A single large cut of fresh deer meat, a thick red slab with a strip of pale fat, tied around with a straw '
          'cord ending in a loop, as a hunter would hang it.',
  'moss': 'A low soft cushion of green moss and small ferns on a flat stone at the mouth of a valley, a few blades of '
          'grass, gentle and inviting, seen from the side.',
  # 2026-10-19, 拽爹上崖 (00-fall) on the kit: 爹 over the drop, his pack, the ledge, the rock spur, the storm cliff
  'dad': 'A middle-aged Chinese village hunter seen from the front, hanging in the air with both arms raised straight up '
         'above his head as if gripping a rope, legs dangling, a short straw rain cape over his shoulders, a cloth belt, '
         'soaked by rain, a worried face. Whole figure, just the one man, nothing in his hands.',
  'pack': 'A single heavy hunter\'s bundle: a fat cloth sack wrapped in a straw rain mat and tied round with rough cords, '
          'a coil of hemp rope tucked under the cords, soaked dark by the rain. Just the one bundle.',
  'ledge': 'A narrow flat rock ledge jutting sideways out of a cliff, wet dark grey stone with a flat top, a few tufts of '
           'grass and a small bent pine root on its top, seen from the side, much wider than it is tall.',
  'spur': 'A single jagged pointed rock spur sticking up diagonally, wet grey stone with dark cracks and a little moss, '
          'seen from the side. Just the one rock.',
  # 2026-10-19: the 灵光 a level's stars are (they were code-drawn red dots — Hanli on 忍字's frame)
  'spark': 'A single small glowing mote of spirit light floating in the air, a soft round glow of pale gold with a faint '
           'jade green halo and a few fine short rays, a bright white core. Just the one small light, nothing else.',
  'fallcliff': 'A tall view of a sheer rain-soaked cliff face rising along the LEFT edge of the picture only, dark wet rock '
               'with cracks and small pines, the rest of the picture an empty grey misty drop with slanting rain streaks '
               'and a faint far ridge low down, gloomy storm light. No people.',
  # 2026-10-19, anchors (Hanli on 拽: 「把爹的图片拴在绳子上有点奇怪」 — nothing held the ropes): what a vine hangs from
  'fallpine': 'An ancient gnarled pine tree growing out of a rock at the far LEFT edge of the picture, its thick twisted '
              'trunk leaning out and running almost level across the whole TOP of the picture to the far right, one long '
              'bare crooked limb at the end, a few dark tufts of pine needles along it, soaked by rain. The lower part of '
              'the picture is empty paper.',
  'peg': 'A single short thick old wooden peg driven into a crack of dark rock, seen from the side, the rock a small '
         'rough lump around it, a few turns of rough hemp cord knotted round the peg. Just the peg in its rock.',
  'branch': 'A single short gnarled tree branch reaching out sideways, dark bark, a few small green leaves near its tip, '
            'a twist of vine wound round it. Just the one branch.',
}
# A backdrop painted taller than wide, kept opaque (no paper taken out).
SIZE = {'fallcliff': (512, 640), 'fallpine': (768, 320)}

# id: (kept seed, crop box in the 512 picture, output size, paper threshold)
# A box of None: cropped to the subject itself (where the paper's alpha is out), a 12 px margin, the
# longer side scaled to `size` (a number).
KEPT = {'bubble': (1, (120, 120, 392, 392), (256, 256), 10), 'thorns': (1, (10, 170, 502, 350), (492, 180), 26),
        'crow': (1, None, 256, 34), 'seal': (1, (165, 165, 347, 347), (120, 120), 34), 'dog': (1, None, 320, 34),
        'cake': (1, (150, 100, 340, 390), (114, 174), 34), 'steelyard': (5, None, 320, 30),
        'meat': (2, None, 240, 40), 'moss': (1, None, 320, 34),
        # 拽 (2026-10-19, three seeds each looked at): 爹 seed 1 (straw cape, arms up; the stick he held cropped
        # off — the ropes go to his chest), the pack seed 1, the ledge seed 1 (juts right, grass on its flat top),
        # the spur seed 2 (drawn mirrored on the board), the storm cliff seed 1 (opaque, the cliff down the left).
        'dad': (1, (140, 64, 372, 500), None, 30), 'pack': (1, None, 200, 30), 'ledge': (1, None, 360, 30),
        'spur': (2, None, 200, 48), 'spark': (1, (156, 156, 356, 356), (96, 96), 8), 'fallcliff': (1, (0, 0, 512, 640), (720, 880), -999),
        # anchors (2026-10-19, three seeds each looked at): 拽's pine seed 1 (the trunk on the cliff-top rock at
        # the left, its limb level across the top: the whole frame kept, so the board places it by its own
        # pixels), the peg seed 1 (turned over: the rock overhead, the peg down, the cord wound on it), the branch seed 1
        # (bark, a vine wound on it, leaves at the tip: the tie near the tip, the base off the board's side)
        'fallpine': (1, (0, 0, 768, 320), (768, 320), 60), 'peg': (1, None, 120, 30), 'branch': (1, None, 200, 34)}
# Turned before it is cut (degrees): a peg painted standing in its rock hangs from the rock overhead.
TURN = {'peg': 180}
# Its alpha faded out over the bottom px: the pine's rock melts into the cliff it grows from, no cut edge.
FADE = {'fallpine': 90}
# Where a sprite is written under art/games/ (its id, unless named here).
OUTNAME = {'fallpine': 'fall/pine', 'peg': 'anchor/peg', 'branch': 'anchor/branch', 'dad': 'fall/dad', 'pack': 'fall/pack', 'ledge': 'fall/ledge', 'spur': 'fall/spur', 'fallcliff': 'fall/cliff'}


def busy():
  # A FLUX job itself (a python running mlx_picture.py or mflux), not a shell that waits naming them.
  r = subprocess.run(['pgrep', '-lf', 'mflux|mlx_picture'], capture_output=True, text=True)
  return any('python' in line.split(' ', 2)[1] for line in r.stdout.splitlines() if ' ' in line)


def paint(out, subject, seed, sid=None):
  while busy(): time.sleep(0.4)
  w, h = SIZE.get(sid, (512, 512))
  req = {'model': MODEL, 'prompt': f'{subject} Style: {STYLE}', 'out': str(out), 'width': w, 'height': h, 'seed': seed,
         'reference': str(REFERENCE)}
  env = dict(os.environ, HF_HOME=str(Path.home() / '.linggen/models/hf-hub'), HF_HUB_OFFLINE='1')
  r = subprocess.run([str(PY), str(SCRIPT)], input=json.dumps(req), text=True, capture_output=True, env=env)
  return None if r.returncode == 0 and Path(out).exists() else (r.stdout.strip()[-200:] or r.stderr.strip()[-200:])


def to_webp(png, webp, box, size, threshold, turn=0, fade=0):
  crop = (f".crop({tuple(box)!r})" if box else '') + (f".rotate({turn})" if turn else '')
  code = (f"from PIL import Image; import numpy as np; im = Image.open({str(png)!r}).convert('RGB'){crop}; "
          "a = np.asarray(im).astype(float); "
          "c = np.concatenate([a[:8, :8].reshape(-1, 3), a[:8, -8:].reshape(-1, 3), a[-8:, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)]); "
          "d = np.sqrt(((a - np.median(c, axis=0)) ** 2).sum(axis=2)); "
          f"al = np.clip((d - {threshold}) * 6, 0, 255); "
          + (f"al = al * np.clip((al.shape[0] - np.arange(al.shape[0]))[:, None] / {fade}, 0, 1); " if fade else '')
          + "img = Image.fromarray(np.dstack([a, al]).astype('uint8'), 'RGBA'); "
          + ("" if box else "ys, xs = np.where(al > 220); m = 12; img = img.crop((max(0, xs.min() - m), max(0, ys.min() - m), min(img.width, xs.max() + m), min(img.height, ys.max() + m))); ")
          + ("" if size is None else f"img = img.resize({tuple(size)!r}, Image.LANCZOS); " if isinstance(size, tuple) else
             f"k = {size} / max(img.size); img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS); ")
          + f"img.save({str(webp)!r}, 'WEBP', quality=88)")
  subprocess.run([str(PY), '-c', code], check=True)


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--only', default='')
  ap.add_argument('--seeds', default='1,2,3,4')
  ap.add_argument('--review', default=str(Path(tempfile.gettempdir()) / 'rope-flux-review'))
  ap.add_argument('--keep', default='', help='id,… — paint its KEPT seed into art/games/<id>.webp')
  ap.add_argument('--cut', default='', help='id,… — cut its KEPT seed from the review folder (already painted) into art/games/<id>.webp')
  a = ap.parse_args()
  ids = [i for i in a.only.split(',') if i] or list(SUBJECTS)
  if a.cut:
    OUT.mkdir(parents=True, exist_ok=True)
    for sid in [k for k in a.cut.split(',') if k]:
      seed, box, size, threshold = KEPT[sid]
      out = OUT / f'{OUTNAME.get(sid, sid)}.webp'; out.parent.mkdir(parents=True, exist_ok=True)
      to_webp(Path(a.review) / f'{sid}-{seed}.png', out, box, size, threshold, TURN.get(sid, 0), FADE.get(sid, 0)); print(sid, '→', out)
    return
  if a.keep:
    OUT.mkdir(parents=True, exist_ok=True)
    for sid in [k for k in a.keep.split(',') if k]:
      seed, box, size, threshold = KEPT[sid]
      png = Path(tempfile.gettempdir()) / f'rope-flux-{sid}.png'
      err = paint(png, SUBJECTS[sid], seed, sid)
      if err: print(sid, 'failed', err); continue
      out = OUT / f'{OUTNAME.get(sid, sid)}.webp'; out.parent.mkdir(parents=True, exist_ok=True)
      to_webp(png, out, box, size, threshold, TURN.get(sid, 0), FADE.get(sid, 0)); print(sid, '→', out)
    return
  review = Path(a.review); review.mkdir(parents=True, exist_ok=True)
  for sid in ids:
    for seed in [int(s) for s in a.seeds.split(',')]:
      out = review / f'{sid}-{seed}.png'
      if out.exists(): continue
      err = paint(out, SUBJECTS[sid], seed, sid)
      print(sid, seed, err or out, flush=True)


if __name__ == '__main__':
  main()
