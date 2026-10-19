#!/usr/bin/env python3
"""paint-huochai.py — 第七回's 大场面 扔了干净 (09-snow, setpieces/huochai.js), by the LOCAL FLUX.

    python3 tools/paint-huochai.py --only body,lid --seeds 1,2,3 [--review DIR]   # a review round
    python3 tools/paint-huochai.py --cut body,lid [--review DIR]                   # the KEPT seeds → art/setpiece/

Hanli, 2026-10-19: 「「扔了干净」这一幕改成大场面」. The book (07-第七回.md): 他摸进柴房，按开饭桶，一股脑儿倒了进去
……饭桶嚼了很久……歇一回，吸他一口气，吸到第五口，他眼前一阵一阵发黑。末了，盖子「咔哒」一弹，一道红光窜出来，「笃」
的一声，钉在了门板上，剑柄还在嗡嗡地颤。小狰一头扎进了柴堆。

The stage is the house's own woodshed at night (art/places/chaifang-night.webp: the woodpile on the left, the
door on the right), never repainted. The cut-outs are edit passes from the house paintings where there is one:
the 饭桶 (art/games/fantong-pot.webp, the daily feed's) opened into its body and its lid, the two wastes and
the sword in the same pot's hand, and 小狰 diving from his 图鉴 picture (art/creatures/zheng.webp). Cut out
with paint-yaowang.py's own cutter (CUT_CODE: alpha from the brushwork, the paper inside the outline kept),
fitted into the piece's fixed sizes (huochai.js `SIZES`). The breath drawn from him is the house's painted
wisp (setpiece/tengyun-cloud.webp), laid small; the red light is the painted.js glow — nothing drawn.

FLUX.2 klein 4B through mflux (the same recipe and the same one-job-at-a-time wait as paint-yaowang.py),
prompts in English only. Every seed looked at; the kept ones are below with what was wrong with the rest.
"""
import argparse, importlib.util, json, os, subprocess, tempfile, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location('paint_yaowang', HERE / 'paint-yaowang.py')
PY_ = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(PY_)
WORLD, OUT, PY, SCRIPT, MODEL, CUT_CODE, busy = PY_.WORLD, PY_.OUT, PY_.PY, PY_.SCRIPT, PY_.MODEL, PY_.CUT_CODE, PY_.busy

POT = WORLD / 'art' / 'games' / 'fantong-pot.webp'      # the 饭桶 (RGBA cut-out): laid on paper for a reference
ZHENG = WORLD / 'art' / 'creatures' / 'zheng.webp'      # 小狰, the 图鉴's

ALONE = ('The one subject alone on plain empty pale rice paper that runs to every edge, nothing else in the picture, no ground, '
         'no shadow, no table, no background.')
HAND = ('Drawn exactly in the style of the reference picture: fine sketchy pencil and soft grey-sepia wash on pale paper, delicate '
        'hatching, muted colour, not a photograph, not 3D, not anime. No text, no seal, no border. ')
SAME_POT = 'the very same old bronze cauldron as the reference, same round body, same cloud reliefs, same three legs and two upright handles'

# id: (prompt, (w, h) painted, reference ('pot' | 'zheng'), (w, h) cut out, anchor)
SUBJECTS = {
  'body': (HAND + f'{SAME_POT} — but with its lid taken off and gone: the round mouth of the cauldron stands open, its rim seen a '
           'little from above, the inside of the mouth dark and deep. No lid anywhere. ' + ALONE, (768, 768), 'pot', (512, 512), 'foot'),
  'lid': (HAND + 'Only the domed lid of the cauldron in the reference, taken off and alone, without the pot: the round domed lid '
          'with its cloud reliefs and the little guardian lion sitting on top as its knob, its flat rim along the bottom. '
          + ALONE, (768, 512), 'pot', (512, 320), 'foot'),
  'gourd': (HAND + 'Replace the subject entirely: draw none of the cauldron. A small red-copper calabash gourd flask (a hulu): two '
            'round bulbs, a small one on top and a bigger one below, pinched in at a narrow waist between them, its little mouth '
            'open at the top with no stopper; dull dark red copper with a few dents and a faint fire pattern, empty, tilted. ' + ALONE,
            (512, 768), 'pot', (256, 384), 'mid'),
  'shard': (HAND + 'Replace the subject entirely: draw none of the cauldron. One broken shard of a round red-copper shield: a small '
            'jagged wedge-shaped fragment, about a sixth of the shield, NOT a whole disc, beaten dark red copper with a little of a '
            'fire-pattern relief on it, its broken edges sharp and irregular on every side but the curved rim. ' + ALONE,
            (512, 512), 'pot', (256, 256), 'mid'),
  'sword': (HAND + 'Replace the subject entirely: draw none of the cauldron. A plain straight Chinese jian sword lying flat across '
            'the picture, its point to the right: a dark red copper blade about three feet long, a row of rough pitted hammer marks '
            'along its spine like an apprentice blacksmith\'s botched work, a plain dark guard and a plain wrapped hilt on the left, '
            'no ornament, no tassel. ' + ALONE, (1536, 384), 'pot', (768, 160), 'mid'),
  'zheng': (HAND + 'The very same baby zheng as the reference, exactly him: the small round fluffy spotted cub like a kitten with one '
            'short pointed horn on his forehead and FIVE big bushy tails, fur in soft pink-grey wash with faint spots, exactly as '
            'in the reference. Diving headfirst away to the left: front paws stretched out ahead, head tucked down between them, '
            'body long in the leap, all five fluffy tails fanned out and streaming up and back behind him, seen from the side. No '
            'grass, no stalk in his mouth. ' + ALONE, (768, 768), 'zheng', (512, 512), 'mid'),
}
NAMES = {k: f'huochai-{k}' for k in SUBJECTS}

# id: (kept seed, paper threshold) — every seed looked at (2026-10-19); what was wrong with the rest:
KEPT = {
  'body': (2, 30),   # the dark open mouth; 1: a second little pot standing inside it; 3: a hollow inner ring, not a mouth
  'lid': (3, 30),    # wide and flat, the lion knob as the pot's; 1: a cast shadow; 2: steeper, narrower than the rim
  'gourd': (6, 30),  # the calabash (two bulbs, the pinched waist); 1–3 (the first prompt) and 4, 5: a round pot-bellied jar
  'shard': (5, 30),  # a broken half with jagged edges; 1–3 (the first prompt): a whole disc with a bite; 4, 6: near-whole
  'zheng': (4, 30),  # the 图鉴's cub (the horn, the pink wash, the spots) diving left; 1–3 (the first prompt): a grey
                     # tabby, no horn on 2, 3; 5, 6: no horn. FLUX can't count: two tails show, not five (small and fast here)
  'sword': (2, 30),  # the row of hammer marks along the spine; 1: the marks scattered like rain; 3: dull, the hilt too dark
}


def ref_of(kind, review):
  if kind == 'zheng':
    return ZHENG
  # The pot is a cut-out on clear ground: laid on the house paper, with room round it, for the edit to see.
  flat = review / 'ref-pot.png'
  if not flat.exists():
    subprocess.run([str(PY), '-c', (
      'from PIL import Image\n'
      f'p = Image.open({str(POT)!r}).convert("RGBA")\n'
      'k = 560 / p.height; p = p.resize((round(p.width * k), 560), Image.LANCZOS)\n'
      'bg = Image.new("RGBA", (768, 768), (240, 233, 216, 255))\n'
      'bg.alpha_composite(p, ((768 - p.width) // 2, (768 - p.height) // 2))\n'
      f'bg.convert("RGB").save({str(flat)!r})\n')], check=True)
  return flat


def paint(out, sid, seed, review):
  prompt, (w, h), ref, _, _ = SUBJECTS[sid]
  while busy():
    time.sleep(10)
  req = {'model': MODEL, 'prompt': prompt, 'out': str(out), 'width': w, 'height': h, 'seed': seed, 'reference': str(ref_of(ref, review))}
  env = dict(os.environ, HF_HOME=str(Path.home() / '.linggen/models/hf-hub'), HF_HUB_OFFLINE='1')
  r = subprocess.run(['nice', '-n', '19', str(PY), str(SCRIPT)], input=json.dumps(req), text=True, capture_output=True, env=env)
  return None if r.returncode == 0 and Path(out).exists() else (r.stdout.strip()[-200:] or r.stderr.strip()[-200:])


# The 饭桶's body: FLUX lays a pale hatched floor-shadow under it that the cutter keeps (it is brushwork); on the
# woodshed's dark floor it reads as a paper patch. Below the bowl only what is darker than that hatching stays (the
# legs, the dark of the shadow), in big pieces; then the picture is cropped and fitted into its box again.
FLOOR_CODE = r'''
import sys, numpy as np, cv2
from PIL import Image
src, W, H = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
im = np.asarray(Image.open(src).convert('RGBA')).astype(float)
rgb, al = im[..., :3], im[..., 3]
g = rgb.mean(axis=2)
y0 = int(al.shape[0] * 0.72)
keep = (g < 200).astype(np.uint8)
keep = cv2.morphologyEx(keep, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
keep = cv2.morphologyEx(keep, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
n, lab, st, _ = cv2.connectedComponentsWithStats(keep, 8)
keep = np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] > 800]).astype(np.float32)
keep = cv2.GaussianBlur(keep, (0, 0), 1.5)
ramp = np.clip((np.arange(al.shape[0]) - y0) / 20, 0, 1)[:, None]
al = al * (1 - ramp) + np.minimum(al, keep * 255) * ramp
ys, xs = np.where(al > 200)
img = Image.fromarray(np.dstack([rgb, al]).astype('uint8'), 'RGBA').crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
k = min(W / img.width, H / img.height)
img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
out.paste(img, ((W - img.width) // 2, H - img.height))
out.save(src, 'WEBP', quality=86)
'''


def cut(png, sid, thr, out_dir):
  _, _, _, (w, h), anchor = SUBJECTS[sid]
  dst = out_dir / f'{NAMES[sid]}.webp'
  subprocess.run([str(PY), '-c', CUT_CODE, str(png), str(dst), str(w), str(h), anchor, '0', str(thr), '1'], check=True)
  if sid == 'body':
    subprocess.run([str(PY), '-c', FLOOR_CODE, str(dst), str(w), str(h)], check=True)
  return dst


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--only', default='')
  ap.add_argument('--seeds', default='1,2,3')
  ap.add_argument('--review', default=str(Path(tempfile.gettempdir()) / 'huochai-review'))
  ap.add_argument('--cut', default='', help='id,… — cut its KEPT seed from the review folder into art/setpiece/')
  ap.add_argument('--try', dest='trial', default='', help='id:seed:thr,… — cut a review picture into the review folder, to look at')
  a = ap.parse_args()
  review = Path(a.review)
  review.mkdir(parents=True, exist_ok=True)
  if a.trial:
    (review / 'cut').mkdir(exist_ok=True)
    for t in a.trial.split(','):
      sid, seed, thr = t.split(':')
      print(sid, '→', cut(review / f'{sid}-{seed}.png', sid, float(thr), review / 'cut'))
    return
  if a.cut:
    OUT.mkdir(parents=True, exist_ok=True)
    for sid in [k for k in a.cut.split(',') if k]:
      seed, thr = KEPT[sid]
      png = review / f'{sid}-{seed}.png'
      if not png.exists():
        err = paint(png, sid, seed, review)
        if err:
          print(sid, 'failed', err)
          continue
      print(sid, '→', cut(png, sid, thr, OUT))
    return
  for sid in [i for i in a.only.split(',') if i] or list(SUBJECTS):
    for seed in [int(s) for s in a.seeds.split(',')]:
      out = review / f'{sid}-{seed}.png'
      err = paint(out, sid, seed, review)
      print(sid, seed, err or out, flush=True)


if __name__ == '__main__':
  main()
