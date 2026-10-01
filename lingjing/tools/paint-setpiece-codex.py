#!/usr/bin/env python3
"""paint-setpiece-codex.py — the set pieces' Codex repaints: each frame fixed on its kept painting.

    python3 tools/paint-setpiece-codex.py [--only zhuji-b,zhang-e] [--out DIR]

Hanli decided four repaints (2026-09-30) that waited on Codex credits — the FLUX frames
of 筑基天象 and the last 漳水 frame Codex had run out on:
  zhuji-b   the face (FLUX's still read anime; Ming woodblock figure painting asked)
  zhuji-c   the gateways (a wall ringing the lake, arches set in it, the 台 heaped with rocks)
  zhuji-e1  the 台 (a low table on stubs; it stands on four piles out of the water)
  zhang-e   the 洛书 dot counts (4 9 2 / 3 5 7 / 8 1 6 — odd white, even black)

Each job hands Codex the kept painting itself (art/setpiece/<id>.webp) as the image to
repaint, and asks for that one fix with composition, style and light unchanged — so the
set piece's camera MARKS still land. Painted only with Codex's image tool: an earlier e
whose tiles Codex overlaid with code was rejected. Same call as paint-codex.py (gpt-5.5,
stdin closed, 10-minute cap, stop at a usage limit). Paint into a review folder (--out),
look at every picture, then copy the kept ones into art/setpiece/.
"""
import argparse, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ART = HERE.parent / 'worlds' / 'jiuding' / 'art' / 'setpiece'

KEEP = ('Repaint the attached painting as ONE new image in landscape (3:2), 1536x1024. Keep everything about it the '
        'same — the composition, the camera angle, the placement and size of every element, the painting style, the '
        'palette, the paper texture and the light — and change ONLY what is described below. Paint it with your image '
        'generation tool only: do not edit, draw on or overlay the picture with code. No text, no letters, no '
        'calligraphy, no seal, no signature, no border, no frame.')

JOBS = {
  'zhuji-b': 'The change: the boy\'s FACE. Repaint his face in the manner of Ming dynasty woodblock and figure-painting '
             'illustration: a small, plain, thin face drawn with a few fine ink brush lines, narrow closed eyes as two '
             'short curved strokes, a small simple nose, a small closed mouth — a poor thin Chinese village boy of '
             'thirteen. NOT anime, NOT manga, NOT a webtoon or cartoon face: no big eyes, no large round head, no '
             'glossy hair, no blush. Keep his topknot, his body, his pose, the stone, the pine, the cloud and the very '
             'faint thread of light that comes down from the cloud and rests on the top of his head exactly where they are.',
  'zhuji-c': 'The change: the GATEWAYS round the lake. Replace the long white walls with FIVE separate, freestanding old '
             'Chinese gateways, each standing on its own on the rim of the black lake with empty starry void between '
             'them — no continuous wall around the lake. Each gateway is either a round moon gate set in a SHORT stretch '
             'of whitewashed wall with a grey tiled top, or a plain timber gateway (a humble paifang) under a small curved '
             'tiled roof — Chinese, not stone arches, not Romanesque, not European. Keep them where the five doors are '
             'now: far left, left, right of centre, right, far right. Each gateway\'s opening glows softly from within, '
             'from left to right: pale gold, moss green, deep indigo, dull cinnabar red, ochre yellow — all five glowing, '
             'their glows reflected in the black water. Also: the square stone platform in the middle of the lake is '
             'broad and FLAT on top, its top level and bare — no rocks piled on it; a few rough stones still rise out '
             'of the water AROUND it, water streaming off them. No people.',
  'zhuji-e1': 'The change: the PLATFORM. It must stand clearly up out of the still black water on exactly FOUR thick, '
              'tall, square stone piles, one under each corner — all four piles visible, going straight down into the '
              'water, each with its reflection below it, so there is a clear height of dark water and air between the '
              'platform and the lake (it is a raised 台 on four piles, not a low table). Make it massive stone architecture, NOT furniture — not a table, not a stool, not a bench: the slab is thick and heavy, and the four piles are broad, rough-hewn square stone piers like the piers of an old stone bridge, rising out of the deep water. The platform itself: one square, '
              'flat, level stone slab, empty, solid and calm. Keep it in the centre of the lake where it is now, seen a '
              'little from the side, the lake floating in the dark cosmos with its stars and muted nebula, and the five '
              'small soft glows far off round the edge of the lake (gold, green, indigo, red, ochre). No people, no '
              'figures, no cliff.',
  'zhang-e': 'The change: the DOTS on the nine square stone tiles on top of the bronze vessel (the 洛书, the Lo Shu '
             'magic square). Every tile keeps its place; only its dots change. Each tile carries a set of round dots, '
             'clearly separate and countable, set in a simple regular pattern like dice pips. ODD numbers are WHITE '
             'dots (pale, bright, like inlaid white jade); EVEN numbers are BLACK dots (dark ink, like inlaid jet). '
             'Read the grid as it lies in the picture, the far row at the top: FAR row, left to right: 4 black dots, '
             '9 white dots, 2 black dots. MIDDLE row, left to right: 3 white dots, 5 white dots (this is the centre '
             'tile, under the boy\'s hand, glowing softly), 7 white dots. NEAR row (the front edge), left to right: '
             '8 black dots, 1 white dot, 6 black dots. Exactly those numbers — every row, column and diagonal adds up '
             'to 15. Keep the boy swimming down with his hand pressed on the centre tile, the light from above, the '
             'fish, the weed, the square four-legged vessel and its carved sides exactly as they are.',
}


def paint(key, out_dir, src=None, extra=''):
  src = Path(src) if src else ART / f'{key}.webp'
  ref = out_dir / f'{key}-ref.png'
  png = out_dir / f'{key}.png'
  if src.suffix == '.png':
    ref.write_bytes(src.read_bytes())
  else:
    subprocess.run(['/opt/homebrew/bin/dwebp', '-quiet', str(src), '-o', str(ref)], check=True)
  png.unlink(missing_ok=True)
  prompt = f'{KEEP} {JOBS[key]} {extra} Save the image in the current directory as {png.name}. Reply with the saved file path only.'
  try:
    r = subprocess.run(['codex', 'exec', '-m', 'gpt-5.5', '--skip-git-repo-check', '-s', 'workspace-write', '-i', str(ref), '--', prompt],
                       cwd=out_dir, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=600)
  except subprocess.TimeoutExpired:
    return 'failed: no picture in 10 minutes'
  if not png.exists():
    said = (r.stdout + r.stderr).lower()
    if 'usage limit' in said or 'out of credits' in said or 'rate limit' in said:
      raise SystemExit(f'{key}: Codex limit reached — stopped')
    return f'failed: {r.stdout.strip()[-200:]} {r.stderr.strip()[-200:]}'
  c = subprocess.run(['/opt/homebrew/bin/cwebp', '-q', '84', '-resize', '1536', '1024', str(png), '-o', str(out_dir / f'{key}.webp')], capture_output=True)
  return 'ok' if c.returncode == 0 else 'cwebp failed'


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--only', default='')
  ap.add_argument('--ref', default=None, help='repaint this picture (a kept review roll) instead of art/setpiece/<id>.webp')
  ap.add_argument('--extra', default='', help='one more sentence: what the last roll got wrong')
  ap.add_argument('--out', required=True, help='a review folder; copy the kept pictures into art/setpiece/ by hand')
  a = ap.parse_args()
  only = set(filter(None, a.only.split(',')))
  out = Path(a.out).resolve()
  out.mkdir(parents=True, exist_ok=True)
  for key in JOBS:
    if not only or key in only:
      print(f'{key}: {paint(key, out, a.ref, a.extra)}', flush=True)


if __name__ == '__main__':
  sys.exit(main())
