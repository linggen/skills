#!/usr/bin/env python3
"""paint-memories.py — 银月's memories, the only colour in the game.

    python3 tools/paint-memories.py [--only 1-a] [--force] [--seed N] [--try DIR --seeds 1,2,3]

哇时刻 #3 (Hanli, 2026-09-29: 「终章全彩」): everything in Lingjing is ink —
白描 on aged paper — and only her memories are painted: 工笔重彩 in the
colours of the 敦煌 murals (石绿, 朱砂, 石青, 金), one memory per tail
(worlds/jiuding/memories.json). The art lives in art/memories/ and is the
ONLY colour set (tests/memories.test.mjs measures it); a fragment
(art/memories/fragments/) is ink with ONE coloured thing.

The recipe is the prologue's (tools/paint-prologue.py): FLUX.2 klein 4B
through mflux, the engine's local painter. FLUX follows position words;
"no text" is unreliable — look at every picture for fake characters and
re-roll (`--try DIR --seeds …` paints candidates to DIR, never into art/).

银月 is drawn from the words of her portrait (art/people/yinyue.webp):
long silver hair past the waist, gold eyes with slit pupils, barefoot, a
white robe bright as snow — with her nine tails whole in a memory.
"""
import argparse, importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
ART = HERE.parent / 'worlds' / 'jiuding' / 'art'
_spec = importlib.util.spec_from_file_location('prologue', HERE / 'paint-prologue.py')
_prologue = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_prologue)
paint = _prologue.paint

MEMORY = ('Chinese gongbi heavy-colour painting in the style of the Dunhuang cave murals, '
          'mineral pigments: malachite green, cinnabar red, azurite blue and gold leaf, '
          'fine even brush line, flowing silk ribbons, on aged silk, no text, no letters, no calligraphy, no border')

YINYUE = ('a young woman with long silver hair falling past her waist, golden eyes with vertical slit pupils, '
          'barefoot, in a white robe bright as snow with cinnabar red sashes, nine silver fox tails fanned out behind her')

# Memory n → its ONE picture (his, 2026-09-29: 「银月一章一图就好」; 1-b, the voice, retired). Only memory 1 is painted
# (2026-09-29); 2–8 are drafted in doc/archive.md § doc/design.md as it stood 2026-09-30 § ③ (To paint). SEEDS pins the
# candidate picked from a sheet (1-a: 3 tried; 1-b: 7 tried over two
# wordings — a close-up read as a triumphant pose, and one seed put a
# European heraldic shield on her robe).
SEEDS = {'1-a': 11}
PANELS = {
  '1-a': f'high above a sea of swirling clouds, {YINYUE}, stands on a cloud, looking up; the sky above her splits open and a blinding column of golden white light falls straight down toward her from far above',
}


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--only', default='')
  ap.add_argument('--force', action='store_true')
  ap.add_argument('--seed', type=int, default=None)
  ap.add_argument('--try', dest='trydir', default='')
  ap.add_argument('--seeds', default='')
  args = ap.parse_args()
  only = set(filter(None, args.only.split(',')))
  failed = []
  for k, v in PANELS.items():
    if only and k not in only:
      continue
    prompt = f'{v}. {MEMORY}'
    if args.trydir:
      for seed in [int(s) for s in args.seeds.split(',') if s]:
        out = Path(args.trydir) / f'{k}-s{seed}.webp'
        print(f'trying {out.name}', flush=True)
        err = paint(out, prompt, 768, 512, seed)
        print(f'  {"x " + err if err else "ok"}', flush=True)
        if err:
          failed.append(err)
      continue
    out = ART / 'memories' / f'{k}.webp'
    if out.exists() and not args.force:
      continue
    seed = args.seed if args.seed is not None else SEEDS.get(k, sum(map(ord, k)) * 7)
    print(f'painting memories/{k}', flush=True)
    err = paint(out, prompt, 768, 512, seed)
    print(f'  {"x " + err if err else "ok"}', flush=True)
    if err:
      failed.append(err)
  print(f'failed {len(failed)}')


if __name__ == '__main__':
  main()
