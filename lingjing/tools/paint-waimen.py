#!/usr/bin/env python3
"""paint-waimen.py — 第一章 · 外门's pictures: its new people and its things.

No story panels (his ruling, 2026-09-29): a picture is for unfamiliar knowledge
(acupoints, meridians, 洛书), never a story moment — the chapter's scenes are
caption and choices. Its knowledge figures are listed in chapters/00-waimen/figures.md.

    python3 tools/paint-waimen.py [--only id,id] [--force] [--seed N]

The same recipe as the prologue's (tools/paint-prologue.py): the engine's local
painter (FLUX.2 klein 4B through mflux), 白描 with a light wash on aged paper.
The hero is drawn from behind or small, never a face that says boy or girl — and
阿禾, always the other gender, likewise. FLUX follows position words, not layout
sketches, and "no text" is not reliable: every panel is looked at for fake
characters and re-rolled with `--seed` when it has them.
"""
import argparse, importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location('paint_prologue', HERE / 'paint-prologue.py')
pp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pp)
ART, PORTRAIT, ITEM, paint = pp.ART, pp.PORTRAIT, pp.ITEM, pp.paint

PEOPLE = {
  'chuxiansheng': 'a thin Chinese Taoist lecturer in his fifties with a small goat beard, grey scholar robe, a thread-bound book in one hand, one eyebrow raised, sharp sardonic face',
  'sunergou': 'a tall skinny timid Chinese youth of fifteen in a patched grey robe, knees knocking, a small hand-sewn cloth charm pouch tied at his waist, anxious hopeful eyes',
  'neimen-shijie': 'a calm young Chinese woman of eighteen in a pale blue inner-disciple robe, hair tied high, a plain sword at her back, a faint knowing smile',
}

ITEMS = {
  'luobo': 'a fresh white radish with green leaves, a little soil still on it, lying on straw',
  'danlu': 'a tiny bronze alchemy furnace the size of a palm, three legs and two ears, bluish purple bronze carved with flames and clouds, a small beast crouched on the lid with one eye open',
  'huangting': 'a thin old Chinese string-bound book, soft paper pages stitched along the right edge with white thread, a faded plain yellow paper cover with no title, lying closed on a blue stone',
  'heluo': 'an ancient Chinese bamboo slip scroll, many flat narrow blank bamboo strips tied side by side with two cords, half rolled up, dark with age, lying on a worn open cloth wrapper on a blue stone',
}

# The seed each picture was kept at, after the re-rolls (a signature, a Western
# hardback, bamboo tubes for slips); the rest keep the default, sum(ord) × 7.
SEEDS = {
  'chuxiansheng': 221, 'sunergou': 222, 'huangting': 223, 'heluo': 224,
}


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--only', default='')
  ap.add_argument('--force', action='store_true')
  ap.add_argument('--seed', type=int, default=None)
  args = ap.parse_args()
  only = set(filter(None, args.only.split(',')))
  jobs = [(ART / 'people' / f'{k}.webp', f'{v}. {PORTRAIT}', 512, 640) for k, v in PEOPLE.items()]
  jobs += [(ART / 'items' / f'{k}.webp', f'{v}. {ITEM}', 640, 480) for k, v in ITEMS.items()]
  failed = []
  for out, prompt, w, h in jobs:
    if only and out.stem not in only:
      continue
    if out.exists() and not args.force:
      continue
    seed = args.seed if args.seed is not None else SEEDS.get(out.stem, sum(map(ord, out.stem)) * 7)
    print(f'painting {out.parent.name}/{out.stem}', flush=True)
    err = paint(out, prompt, w, h, seed)
    print(f'  {"x " + err if err else "ok"}', flush=True)
    if err:
      failed.append(err)
  print(f'failed {len(failed)}')


if __name__ == '__main__':
  main()
