#!/usr/bin/env python3
"""paint-chending.py — 沉鼎山's first sight (第三回, 00-gate), by the LOCAL FLUX.

    python3 tools/paint-chending.py                       # the kept seed → art/setpiece/chendingshan.webp
    python3 tools/paint-chending.py --seeds 1,2,3 --out DIR  # a review round

The book (03-第三回.md, 九月初八傍晚): 「沉鼎山并不怎么高，只是陡。山脚下的松林里浮着一层极淡的白气……
一道石阶从山脚笔直地插进雾里去，瞧不见尽头。云里头隐隐约约一点白，一闪，又一闪，是两只鹤……
小满张着嘴，半天合不上。」 The still plays at that paragraph (setpieces/chending.js, the scene
passage's `{景=chending}`).

Four candidates were shown (2026-10-14): two with a paper-coloured fog brushed over the top half
in post, two raw. Hanli picked 「图用4」: this one, the raw painting, no post step — the river bank
close, 小满 and 舅舅 from behind, the cliffs in the fog, the stair faint up the middle, two cranes.
FLUX.2 klein 4B through mflux (paint-zhuji.py's recipe, nothing downloaded), prompt in English
only. Every candidate looked at (a Chinese boy of twelve, not a man; old China, not Japanese;
no temple or text; the top lost in fog). Output 1536×1024, webp q84.
"""
import argparse, json, os, subprocess, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'worlds' / 'jiuding' / 'art' / 'setpiece'
PY = Path.home() / '.linggen/runtime/envs/pictures/bin/python'
SCRIPT = Path.home() / '.linggen/runtime/mlx_picture.py'
MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'
W, H = 1536, 1024
KEPT = 2  # the kept seed (candidate 4 of the review round)

WARM = ('A Chinese ink-and-light-watercolour landscape painting (shan shui) on warm aged rice paper: fine ink linework, soft grey '
        'washes, muted pale blue-green on the pines and a faint warm amber evening glow, like a plate from a finely illustrated old '
        'Chinese novel. Set in old China, Ming dynasty, not Japanese, not Western. No text, no letters, no calligraphy, no seal, no '
        'signature, no border, no frame, no vignette.')
BOY = ('a small thin poor Chinese village boy of twelve, seen from behind, black hair in a small topknot, a patched hemp jacket tied '
       'with a rope, straw sandals, a long hunting bow slung on his back')
UNCLE = 'his uncle, a thin man with black hair tied up, in a plain blue-grey long scholar gown'
FOG = ('The upper half of the picture is nothing but a solid wall of white fog and bare paper. Below it, the lower cliffs of a steep '
       'mountain, sheer rock and clinging pines, rise straight up into that fog and stop; no outline, no peak, no summit above the fog. '
       'At the foot, a pine forest with a very faint thin white mist drifting between the pine tops. One narrow stone stairway climbs dead '
       'straight up the cliff and its top vanishes into the fog. Two faint white cranes half-hidden inside the fog. No temple, no gate, no buildings.')
PROMPT = (f'{FOG} Bottom: a calm river bank in the evening; lower centre, seen from far away, two tiny distant figures: {BOY}, '
          f'and beside him {UNCLE}. Style: {WARM}')


def render(seed, png):
  req = {'model': MODEL, 'prompt': PROMPT, 'out': str(png), 'width': W, 'height': H, 'seed': seed, 'reference': None}
  env = dict(os.environ, HF_HOME=str(Path.home() / '.linggen/models/hf-hub'), HF_HUB_OFFLINE='1')
  r = subprocess.run([str(PY), str(SCRIPT)], input=json.dumps(req), text=True, capture_output=True, env=env)
  return r.returncode == 0 and png.exists(), (r.stdout.strip() or r.stderr.strip())[-200:]


def webp(png, out):
  return subprocess.run(['/opt/homebrew/bin/cwebp', '-q', '84', str(png), '-o', str(out)], capture_output=True).returncode == 0


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--seeds', default='', help='roll these seeds (a review round) instead of the kept one')
  ap.add_argument('--out', default=None, help='paint into this folder instead of art/setpiece')
  a = ap.parse_args()
  base = Path(a.out) if a.out else OUT
  base.mkdir(parents=True, exist_ok=True)
  for seed in ([int(s) for s in a.seeds.split(',')] if a.seeds else [KEPT]):
    png = Path(tempfile.gettempdir()) / f'chendingshan-{seed}.png'
    ok, said = render(seed, png)
    name = 'chendingshan.webp' if not a.seeds else f'chendingshan-s{seed}.webp'
    print(f'seed {seed}: {"ok" if ok and webp(png, base / name) else "failed " + said}', flush=True)
    png.unlink(missing_ok=True)


if __name__ == '__main__':
  main()
