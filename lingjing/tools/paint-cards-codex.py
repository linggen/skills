#!/usr/bin/env python3
"""paint-cards-codex.py — the new cards of 2026-10-16 (cards.md: every card gained in the story), in the house card style.

    python3 tools/paint-cards-codex.py [--only id,id] [--force] [--out DIR] [--model M]

Hanli prefers the earlier card paintings (art/cards/*, FLUX 2026-09-18): one subject, loose ink line with a
pale wash, a lot of warm empty paper. Each new card is painted by `codex exec -i <house card>` with
qingteng.webp and huiqi.webp attached as the style, the way tools/paint-wash-codex.py did the 后山崖顶 set.
Existing cards are never repainted here. Output: art/cards/<id>.webp (448×320), webp q90.
"""
import argparse, subprocess, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ART = HERE.parent / 'worlds' / 'jiuding' / 'art'
REFS = [ART / 'cards/qingteng.webp', ART / 'cards/huiqi.webp']

STYLE = ('Match the attached reference pictures EXACTLY in style: warm pale aged rice paper filling the whole canvas, one subject '
         'drawn with a loose confident ink line and a pale soft wash, colour only where it carries meaning and even then muted, a lot '
         'of empty paper around it. Chinese ink-and-wash (水墨淡彩) card illustration. No bright or saturated colour, no background '
         'landscape, no text, no characters, no seal, no signature, no border, no frame.')

CARDS = {
  'niangbing': "娘的饼, a mother's flatbreads: two round griddle flatbreads, one thick and one thin, golden-brown in a soft muted wash, wrapped half-open in a plain blue-grey cloth bundle tied with a knot, a faint wisp of steam rising.",
  'mutang': "木藤, a summoned wood vine: one slender pale green vine shooting up out of the ground and coiling twice round a short wooden stake, its tip curling, a few small leaves, the earth at its root cracked open in a few ink strokes.",
  'yigun': "一滚, a dodge-roll: a boy in a dark padded jacket caught mid-roll sideways across pine needles, knees tucked, seen small; behind him three long dark ink streaks of a beast's claw sweeping through the empty air where he was. Loose xieyi strokes.",
  'shizi': "石子, a thrown stone: one small grey river pebble flying across the paper from left to right, a few dry-brush motion streaks behind it, a little scatter of dust.",
  'yijian': "一箭 · 偏左半寸, one arrow: a single hunting arrow in flight across the paper, fletched with grey feathers, over a few tall reeds bending in the wind; the arrow aimed a little left, against the wind. An old wooden bow drawn faintly at the left edge.",
  'qingguang': "青光, a healing light: a girl's slender hand, palm down, a small soft point of pale green light glowing at her fingertip and spreading as a faint green mist over a bandaged forearm below it.",
}


def to_png(webp, d):
  from PIL import Image
  out = Path(d) / (webp.stem + '.png')
  Image.open(webp).convert('RGB').save(out)
  return out


def paint(out, subject, model):
  with tempfile.TemporaryDirectory() as d:
    png = Path(d) / f'{out.stem}.png'
    prompt = (f'Use your image generation tool to make ONE new image in landscape 7:5 orientation, then save it in the current '
              f'directory as {png.name}. The attached images are a STYLE reference only — do not copy their subjects. Subject: '
              f'{subject} Set in old China. Style: {STYLE} Reply with the saved file path only.')
    args = ['codex', 'exec', '-m', model, '--skip-git-repo-check', '-s', 'workspace-write']
    for r in REFS:
      args += ['-i', str(to_png(r, d))]
    try:
      r = subprocess.run([*args, '--', prompt], cwd=d, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=900)
    except subprocess.TimeoutExpired:
      return 'failed: no picture in 15 minutes'
    if not png.exists():
      return f'failed: {(r.stdout + r.stderr).strip()[-300:]}'
    c = subprocess.run(['/opt/homebrew/bin/cwebp', '-quiet', '-q', '90', '-resize', '448', '320', str(png), '-o', str(out)], capture_output=True)
    return 'ok' if c.returncode == 0 else 'cwebp failed'


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--only', default='')
  ap.add_argument('--force', action='store_true')
  ap.add_argument('--out', default=None)
  ap.add_argument('--model', default='gpt-6.1-sol')
  a = ap.parse_args()
  only = set(filter(None, a.only.split(',')))
  for key, subject in CARDS.items():
    if only and key not in only:
      continue
    base = Path(a.out) if a.out else ART / 'cards'
    out = base / f'{key}.webp'
    if out.exists() and not a.force:
      print(f'cards/{key}: kept', flush=True)
      continue
    print(f'cards/{key}: {paint(out, subject, a.model)}', flush=True)


if __name__ == '__main__':
  main()
