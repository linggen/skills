#!/usr/bin/env python3
"""paint-yaowang.py — 第一回's two set pieces at the dawn in 银叶谷 (00-yinyue), by the LOCAL FLUX.

    python3 tools/paint-yaowang.py --only sky,moon --seeds 1,2,3 [--review DIR]   # a review round
    python3 tools/paint-yaowang.py --cut sky,moon [--review DIR]                   # the KEPT seeds → art/setpiece/

Hanli, 2026-10-16 (「可以」): 青丘之主 (setpieces/yaowang.js) — her boast made visible, the moon, nine
tails, the 万妖 bowing among the 八荒 ridges, a peak falling on 一怒, the slopes flowering on 一笑 — and
then the bread; 腾云 (setpieces/tengyun.js) — her little cloud, the pop, the rings of lit grass.

Every picture is painted; the set pieces only place and move them. Two full scenes (the cave mouth
with her at it, the night sky) and the cut-outs, each painted alone on plain paper and cut out here:
alpha from each pixel's distance to the paper's colour, then the paper INSIDE the subject's ink
outline filled back in (her white robe, the silver tail, the white cloud are paper-pale — without
the fill they would be holes), cropped to the subject and fitted into its fixed size (yaowang.js /
tengyun.js `SIZES`), anchored at the foot (or the middle). A ridge's or a peak's body is made solid
below its outline, so nothing behind shows through its mist.

FLUX.2 klein 4B through mflux (paint-rope-flux.py's recipe: HF_HOME at the cached model, nothing
downloaded), prompts in English only. The scenes take a house painting as the reference (the cave
mouth: art/places/yingu-cave.webp; her: art/people/yinyue.webp) so they sit in the house's 水墨淡彩.
One tail is painted, never nine (FLUX can't count): the set piece lays it nine times round the fan.
One FLUX job at a time on the machine: wait while another mflux process runs. Every seed looked at;
the kept ones are below with what was wrong with the rest.
"""
import argparse, json, os, subprocess, tempfile, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORLD = HERE.parent / 'worlds' / 'jiuding'
OUT = WORLD / 'art' / 'setpiece'
PY = Path.home() / '.linggen/runtime/envs/pictures/bin/python'
SCRIPT = Path.home() / '.linggen/runtime/mlx_picture.py'
MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'
CAVE = WORLD / 'art' / 'places' / 'yingu-cave.webp'
HER = WORLD / 'art' / 'people' / 'yinyue.webp'
ITEM = WORLD / 'art' / 'items' / 'chonglou.webp'

INK = ('Chinese ink wash with light colour (shuimo dancai) on warm aged rice paper: fine ink linework, soft grey washes, muted '
       'mineral colours, like a plate from a finely illustrated old Chinese novel. Old China, not Japanese, not Western. No text, no '
       'letters, no calligraphy, no seal, no signature, no border, no frame, no vignette.')
ALONE = ('The one subject alone on plain empty pale rice paper that runs to every edge, nothing else in the picture, no ground, '
         'no shadow, no sky wash.')
CUT = ('Match the attached reference picture EXACTLY in style: Chinese ink wash on pale aged rice paper, fine ink outlines, soft '
       'washes, muted colours. Replace its subject entirely: draw none of it. ' + ALONE + ' No text, no seal, no border.')
GIRL = ('the same girl as the reference: a slight girl of fourteen, very long straight silver hair to her waist, gold eyes, a plain '
        'snow-white robe with a sash, barefoot, ONE big silver fox tail')

# id: (prompt, (w, h) painted, reference, kind) — kind 'scene' (kept whole) or a cut-out:
#   ('cut', (w, h) out, anchor 'foot'|'mid', solid below the outline?)
SUBJECTS = {
  'cave': ('The same cave mouth seen from inside the cave, the same composition, rocks and trees, in the same style. Add only: '
           'sitting on the stone floor at the mouth of the cave, in the middle, seen from behind with her back to us, a slight '
           'barefoot girl of fourteen with very long straight silver hair falling to her waist, in a plain snow-white robe. ONE '
           'single silver fox tail, only one, curled on the ground to her right side. Her right hand raises one small torn '
           'corner of flatbread to her mouth, chewing; her left hand rests on her knee. Just one piece of bread. The campfire is out, cold ashes and a thin wisp of smoke. Grey dawn light outside after rain. No seal, no '
           'text.', (1536, 1024), CAVE, 'scene'),
  'sky': ('A vast night sky over the eight wildernesses, a Chinese ink-wash painting: deep indigo and slate-grey washes, soft '
          'luminous banks of cloud parting in the middle, a pale silver glow low on the horizon in the middle. NO moon anywhere '
          'in the sky: the moon has not risen yet. At the very bottom many layered far mountain ranges, faint. Grand, empty and '
          'quiet, no figures, no buildings. ' + INK, (1536, 1024), None, 'scene'),
  'moon': ('A huge full moon filling most of the picture, centred: a round pale silver-white disc with soft grey ink-wash '
           'markings on its face and a soft luminous halo, alone on a flat dark indigo-black ink-wash night sky, no clouds over '
           'it, no stars, no mountains. ' + INK, (768, 768), None, ('glow', (640, 640))),
  'tail': ('A single big bushy fox tail exactly like the girl\'s tail in the reference picture, alone without the girl: thick soft '
           'fluffy silver-grey fur drawn with many fine grey ink strokes, a narrow root at the bottom centre, swelling wide and '
           'full in the middle, curving in a gentle S up to a curled white tip at the top. Not a feather, no quill, no blue. '
           'Only the one tail, no fox, no body. ' + CUT, (512, 1024), HER, ('cut', (384, 768), 'foot', False)),
  'ridge': ('A long horizontal band of steep layered mountain ridges and peaks across the whole width, painted in dark ink and '
            'deep grey-green wash, jagged crests along the top, the bodies of the mountains dark and solid down to the bottom '
            'edge. Above the crests: plain empty paper, nothing. ' + INK, (1536, 512), None, ('cut', (1536, 512), 'foot', True)),
  'yao': ('A dense crowd of the beasts and spirits of Chinese legend in two overlapping ranks across the whole width, every '
          'one bowing low with its head down to the ground in homage toward the middle: foxes, tigers, deer with antlers, bears, '
          'cranes and great birds with folded wings, horned beasts, coiled serpents, a few demons in human shape kneeling in '
          'robes. Painted ONLY as flat dark grey and black ink silhouettes, no colour, no stripes, no faces, their shapes filling '
          'the full height of the band. ' + ALONE + ' ' + INK, (1536, 512), None, ('cut', (1536, 384), 'foot', False)),
  'peak': ('A single tall steep jagged mountain peak of rock standing alone, dark ink outlines and grey-green wash, a few pines '
           'clinging to it, its body solid to the bottom. ' + CUT, (512, 768), ITEM, ('cut', (512, 768), 'foot', False)),
  'flower': ('A wide spray of wild blossoms bursting open: peach blossom and pink and red mountain flowers, a few yellow ones, '
             'green leaves and fine dark twigs, a low clump as if growing out of a slope. ' + CUT, (768, 512), ITEM,
             ('cut', (384, 288), 'foot', False)),
  'cloud': ('A small round puffy cloud of white mist, auspicious-cloud style: soft rounded billows with a clean thin grey ink '
            'outline and curling wisps, pale white inside with a faint grey wash at the bottom. Just the one small cloud. ' + CUT,
            (768, 512), ITEM, ('cut', (512, 320), 'mid', False)),
  'stand': (f'Full body, standing, {GIRL}: chin up, hands on her hips, a proud smug look, bare feet together, the tail behind '
            'her. Exactly the reference girl, on plain empty paper, no ground. No text, no seal.', (512, 1024), HER,
            ('cut', (384, 768), 'foot', False)),
  'sit': (f'Full body, {GIRL}, fallen and sitting flat on her bottom on the ground, legs out in front with her two bare feet up '
          'in the air, hands back on the ground, face red, cross and embarrassed, the tail splayed. Exactly the reference girl, '
          'seen from the side, on plain empty paper, no ground. No text, no seal.', (768, 768), HER, ('cut', (512, 448), 'foot', False)),
  'ring': ('A flat ring of glowing grass seen from above at a low angle, a wide thin ellipse: blades of grass lit with a soft pale '
           'jade-green and silver light, in a ring with an empty middle. Just the ring of lit grass. ' + CUT, (1024, 512), ITEM,
           ('cut', (512, 512), 'mid', False, False)),
}
NAMES = {'cave': 'yaowang-cave', 'sky': 'yaowang-sky', 'moon': 'yaowang-moon', 'tail': 'yaowang-tail', 'ridge': 'yaowang-ridge',
         'yao': 'yaowang-yao', 'peak': 'yaowang-peak', 'flower': 'yaowang-flower', 'cloud': 'tengyun-cloud',
         'stand': 'tengyun-stand', 'sit': 'tengyun-sit', 'ring': 'tengyun-ring'}

# id: (kept seed, paper threshold) — every seed looked at (2026-10-16); what was wrong with the rest:
KEPT = {
  'cave': (6, 0),     # 1–3: two tails (or two tufts) and a bread in each hand; 4: a fist raised; 5: two breads
  'sky': (3, 0),      # 1, 2: a small moon already painted in (the moon rises on its own); 4: heavy, no glow
  'moon': (4, 0),     # 1, 2 (the outlined disc on paper, a round): ovals; 3: paper corners round its night
  'tail': (5, 30),    # 1–3 (the first prompt): feathers, a quill, blue; 4: a paisley; 6: dark at the root
  'ridge': (2, 30),   # 1: lighter, the far rows washed out
  'peak': (2, 30),    # 1: squat, a stack of cones
  'flower': (1, 30),  # 2: a round bush, less of a spray
  'cloud': (1, 30),   # 2: the outline broken at the left
  'stand': (1, 30),   # 2: the tail cut by the frame
  'sit': (2, 30),     # 1: kneeling and looking up, not sat down hard
  'ring': (1, 22),    # 2: a grey square of wash behind it
  'yao': (3, 30),     # 1, 2 (the first prompt): a thin file of walking beasts in profile, coloured, none bowing;
                      # 4, 5: two crowds with a gap of bare paper between. 3 is one band, heads down toward the middle
                      # (its few striped tigers go dark under the vision's tint, yaowang.js)
}


def busy():
  # A picture job running anywhere on the machine: a python process on the picture script (or mflux's own CLI) —
  # never a shell whose command line merely names them (another agent's wait loop).
  r = subprocess.run(['ps', '-axo', 'comm=,args='], capture_output=True, text=True)
  return any('python' in line.split(' ', 1)[0].lower() and ('mlx' + '_picture' in line or 'mflux-' in line)
             for line in r.stdout.splitlines())


def paint(out, sid, seed):
  prompt, (w, h), ref, _ = SUBJECTS[sid]
  while busy():
    time.sleep(10)
  req = {'model': MODEL, 'prompt': prompt, 'out': str(out), 'width': w, 'height': h, 'seed': seed,
         'reference': str(ref) if ref else None}
  env = dict(os.environ, HF_HOME=str(Path.home() / '.linggen/models/hf-hub'), HF_HUB_OFFLINE='1')
  r = subprocess.run(['nice', '-n', '19', str(PY), str(SCRIPT)], input=json.dumps(req), text=True, capture_output=True, env=env)
  return None if r.returncode == 0 and Path(out).exists() else (r.stdout.strip()[-200:] or r.stderr.strip()[-200:])


CUT_CODE = r'''
import sys, numpy as np, cv2
from PIL import Image
src, dst, W, H, anchor, solid, thr, fill = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5], sys.argv[6] == '1', float(sys.argv[7]), sys.argv[8] == '1'
a = np.asarray(Image.open(src).convert('RGB')).astype(float)
c = np.concatenate([a[:10, :10].reshape(-1, 3), a[:10, -10:].reshape(-1, 3), a[-10:, :10].reshape(-1, 3), a[-10:, -10:].reshape(-1, 3)])
d = np.sqrt(((a - np.median(c, axis=0)) ** 2).sum(axis=2))
al = np.clip((d - thr) * 6, 0, 255)
# The subject's own shape. The paper's tone wanders as much as a pale subject's (a silver tail, a white
# robe), so the shape is found by its brushwork, not its colour: the strokes' local energy (an ink line
# is sharp, paper grain is soft) above what the picture's edge holds, closed up (fur leaves gaps in an
# outline), its holes filled — paper the outside cannot reach is the subject's own — and specks dropped
# (only the big pieces kept). Alpha is that shape with a soft rim, and never more than the ink's own
# where the subject is thin (`thr`, the paper-distance floor, only lifts pale insides).
g = cv2.cvtColor(a.astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
e = cv2.GaussianBlur(np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)), (0, 0), 5)
rim = np.concatenate([e[:30].ravel(), e[-30:].ravel(), e[:, :30].ravel(), e[:, -30:].ravel()])
ink = ((e > max(24, np.percentile(rim, 99.9) * 1.15)) | (d > thr * 2.5)).astype(np.uint8)
k = max(9, round(min(ink.shape) * 0.03)) | 1
shut = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
pad = np.pad(shut, 1, constant_values=0)
mask = np.zeros((pad.shape[0] + 2, pad.shape[1] + 2), np.uint8)
cv2.floodFill(pad, mask, (0, 0), 2)
# A ring (the lit grass) keeps its hole: only its own brushwork, never the paper it encloses.
subject = (pad[1:-1, 1:-1] != 2).astype(np.uint8) if fill else shut
n, lab, stats, _ = cv2.connectedComponentsWithStats(subject, 8)
if n > 1:
  big = stats[1:, cv2.CC_STAT_AREA].max()
  subject = np.isin(lab, [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= big * 0.02]).astype(np.uint8)
subject = cv2.erode(subject, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
al = cv2.GaussianBlur(subject.astype(np.float32) * 255, (0, 0), 1.6).astype(float)
if not fill:
  al = np.minimum(al, np.clip((d - thr) * 5, 0, 255))
if solid:  # the body below the outline: solid to the foot
  seen = np.maximum.accumulate(al > 160, axis=0)
  al = np.where(seen, 255, al)
al = np.clip(al, 0, 255)
ys, xs = np.where(al > 200)
m = 6
box = (max(0, xs.min() - m), max(0, ys.min() - m), min(a.shape[1], xs.max() + m), min(a.shape[0], ys.max() + m))
img = Image.fromarray(np.dstack([a, al]).astype('uint8'), 'RGBA').crop(box)
k = min(W / img.width, H / img.height)
img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
x = (W - img.width) // 2
y = H - img.height if anchor == 'foot' else (H - img.height) // 2
out.paste(img, (x, y))
out.save(dst, 'WEBP', quality=86)
'''


GLOW_CODE = r'''
import sys, numpy as np, cv2
from PIL import Image
src, dst, W, H = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
g = a.mean(axis=2)
ground = np.median(np.concatenate([g[:12].ravel(), g[-12:].ravel(), g[:, :12].ravel(), g[:, -12:].ravel()]))
# A light painted on the dark: its alpha is how far it is lighter than the night it was painted on,
# so its halo fades into whatever sky it is laid over; the disc itself solid.
al = np.clip((g - ground - 14) / 60.0, 0, 1)
disc = (cv2.GaussianBlur(g, (0, 0), 3) > ground + 110).astype(np.uint8)
n, lab, stats, _ = cv2.connectedComponentsWithStats(disc, 8)
if n > 1:
  big = 1 + stats[1:, cv2.CC_STAT_AREA].argmax()
  disc = (lab == big).astype(np.uint8)
  disc = cv2.morphologyEx(disc, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
al = np.maximum(al, cv2.GaussianBlur(disc.astype(np.float32), (0, 0), 2))
ys, xs = np.where(disc > 0)
cy, cx = (ys.max() + ys.min()) // 2, (xs.max() + xs.min()) // 2
rd = max(ys.max() - ys.min(), xs.max() - xs.min()) / 2
r = int(min(rd * 1.35, cy, cx, g.shape[0] - cy, g.shape[1] - cx))
# The halo is the disc's own light: its colour the disc's rim, fading out radially to nothing at the crop's edge.
yy, xx = np.mgrid[:g.shape[0], :g.shape[1]]
dist = np.hypot(yy - cy, xx - cx)
al = al * np.clip((r - dist) / max(1.0, r - rd), 0, 1)
al = np.where(dist <= rd * 0.98, np.maximum(al, cv2.GaussianBlur(disc.astype(np.float32), (0, 0), 2)), al)
rim = np.median(a[(dist > rd * 0.85) & (dist < rd * 0.95)], axis=0)
rgb = np.where((dist <= rd * 0.98)[..., None], a, rim)
img = Image.fromarray(np.dstack([rgb, al * 255]).astype('uint8'), 'RGBA').crop((cx - r, cy - r, cx + r, cy + r)).resize((W, H), Image.LANCZOS)
img.save(dst, 'WEBP', quality=88)
'''


def cut(png, sid, thr):
  _, _, _, kind = SUBJECTS[sid]
  dst = OUT / f'{NAMES[sid]}.webp'
  if kind == 'scene':
    w, h = SUBJECTS[sid][1]
    subprocess.run([str(PY), '-c', f"from PIL import Image; Image.open({str(png)!r}).convert('RGB').resize(({w}, {h})).save({str(dst)!r}, 'WEBP', quality=84)"], check=True)
  elif kind[0] == 'glow':
    w, h = kind[1]
    subprocess.run([str(PY), '-c', GLOW_CODE, str(png), str(dst), str(w), str(h)], check=True)
  else:
    _, (w, h), anchor, solid, *rest = kind
    fill = rest[0] if rest else True
    subprocess.run([str(PY), '-c', CUT_CODE, str(png), str(dst), str(w), str(h), anchor, '1' if solid else '0', str(thr), '1' if fill else '0'], check=True)
  return dst


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--only', default='')
  ap.add_argument('--seeds', default='1,2,3')
  ap.add_argument('--review', default=str(Path(tempfile.gettempdir()) / 'yaowang-review'))
  ap.add_argument('--cut', default='', help='id,… — cut its KEPT seed from the review folder into art/setpiece/')
  ap.add_argument('--try', dest='trial', default='', help='id:seed:thr,… — cut a review picture into the review folder, to look at')
  a = ap.parse_args()
  review = Path(a.review)
  review.mkdir(parents=True, exist_ok=True)
  if a.trial:
    global OUT
    OUT = review / 'cut'
    OUT.mkdir(exist_ok=True)
    for t in a.trial.split(','):
      sid, seed, thr = t.split(':')
      print(sid, '→', cut(review / f'{sid}-{seed}.png', sid, float(thr)))
    return
  if a.cut:
    OUT.mkdir(parents=True, exist_ok=True)
    for sid in [k for k in a.cut.split(',') if k]:
      seed, thr = KEPT[sid]
      png = review / f'{sid}-{seed}.png'
      if not png.exists():
        err = paint(png, sid, seed)
        if err:
          print(sid, 'failed', err)
          continue
      print(sid, '→', cut(png, sid, thr))
    return
  for sid in [i for i in a.only.split(',') if i] or list(SUBJECTS):
    for seed in [int(s) for s in a.seeds.split(',')]:
      out = review / f'{sid}-{seed}.png'
      err = paint(out, sid, seed)
      print(sid, seed, err or out, flush=True)


if __name__ == '__main__':
  main()
