#!/usr/bin/env python3
"""paint-jieqi.py — one picture per 节气, by the LOCAL FLUX (paint-festivals.py's recipe and house look).

    python3 tools/paint-jieqi.py --seeds 11,23 --out DIR             # a review round, all 24
    python3 tools/paint-jieqi.py --only lichun,bailu --seeds 7 --out DIR

A 节气's picture stands from its day until the next 节气 (calendar.js termSpan): in the engine's app it
is the faint background, and in the game the stage's picture for an outdoor scene at a place with no
painting of its own (atmos.js stageArt). A festival's own picture beats it while the festival runs.
Hanli approved the set 2026-10-15. Each carries its season — 立春's first willow buds, 清明's misty
rain, 小暑's lotus, 白露's dew, 霜降's red leaves, 大雪's snowbound mountains. Wide 3:2; the lower
third quiet (it sits under dark-faded text). English prompts only; every picture is looked at, and a
small seal is fine (Hanli preferred the richer paintings that had one). Output 1536×1024, webp q84.
"""
# The kept picks, each worlds/jiuding/art/jieqi/<id>.webp.
KEPT = {
    'lichun': {'seed': 11},  # the first willow buds over a thawing stream
    'yushui': {'seed': 23},  # drizzle over greening hills
    'jingzhe': {'seed': 23},  # far thunder over blooming peach
    'chunfen': {'seed': 11},  # peach blossom on both banks, swallows
    'qingming': {'seed': 11},  # willows in misty rain
    'guyu': {'seed': 11},  # peony by the rock, tea hills
    'lixia': {'seed': 11},  # young paddies, banana leaves
    'xiaoman': {'seed': 23},  # wheat swelling green-gold, a stone bridge
    'mangzhong': {'seed': 11},  # gold wheat beside new seedlings
    'xiazhi': {'seed': 11},  # tall summer trees, the high sun
    'xiaoshu': {'seed': 11},  # the lotus pond in bloom
    'dashu': {'seed': 11},  # a summer storm breaking over the valley
    'liqiu': {'seed': 11},  # the first leaves turning over the river
    'chushu': {'seed': 23},  # lotus pods and pale reeds, geese far off
    'bailu': {'seed': 11},  # dew on the autumn reeds
    'qiufen': {'seed': 11},  # the harvest moon over gold fields
    'hanlu': {'seed': 11},  # chrysanthemums on the rock, geese south
    'shuangjiang': {'seed': 23},  # red maples, the first frost
    'lidong': {'seed': 11},  # persimmons on a bare branch
    'xiaoxue': {'seed': 23},  # first snow on pines and thatch
    'daxue': {'seed': 11},  # mountains buried in snow
    'dongzhi': {'seed': 11},  # low winter sun, a lit window
    'xiaohan': {'seed': 23},  # red plum in snow, a bird
    'dahan': {'seed': 11},  # the frozen lake, rimed willows
}

import argparse, json
from pathlib import Path
import importlib.util

_spec = importlib.util.spec_from_file_location('festivals', Path(__file__).with_name('paint-festivals.py'))
_f = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_f)
STYLE, render, webp = _f.STYLE, _f.render, _f.webp

SUBJECT = {
  'lichun': 'Start of Spring: the first tender yellow-green buds on long drooping willow branches over a thawing stream, thin ice at the banks, a pale cold sky.',
  'yushui': 'Rain Water: soft spring drizzle over low hills and wet fields, a few bare trees just greening, mist in the valley.',
  'jingzhe': 'Awakening of Insects: the first spring thunder far off in a grey sky, peach trees beginning to bloom on a slope, fresh green shoots in a field.',
  'chunfen': 'Spring Equinox: a riverbank of peach and pear blossoms in full bloom, swallows flying low over the water, balanced soft light.',
  'qingming': 'Clear and Bright: fine misty rain over green hills, weeping willows with long pale-green strands, a stone path vanishing into mist.',
  'guyu': 'Grain Rain: tree peonies in bloom by a rock, new tea bushes on terraced hills, warm spring rain.',
  'lixia': 'Start of Summer: young green rice paddies reflecting the sky, a frog on a lily leaf, early summer clouds.',
  'xiaoman': 'Grain Buds: fields of ripening wheat swelling green-gold, a small water wheel by a canal, mulberry trees.',
  'mangzhong': 'Grain in Ear: golden wheat being harvested in wide fields, sheaves standing, new rice seedlings in flooded paddies beyond, a hot hazy sky.',
  'xiazhi': 'Summer Solstice: a long bright day, tall summer trees in deep green, cicadas on a branch, a still pond under a high sun.',
  'xiaoshu': 'Minor Heat: a lotus pond in full bloom, pink lotus flowers and broad leaves, a dragonfly resting on a bud, warm humid air.',
  'dashu': 'Major Heat: thick summer heat over a valley, a sudden summer thunderstorm building in tall clouds, banana leaves, deep green shade.',
  'liqiu': 'Start of Autumn: the first wutong leaf falling, a clear high sky, the summer green just beginning to pale, a calm river.',
  'chushu': 'End of Heat: cooling evening over a lake, the last lotus pods, reeds turning pale, wild geese far off.',
  'bailu': 'White Dew: clear morning dew drops on autumn grass and reeds by water, a pale cool sky, thin mist rising.',
  'qiufen': 'Autumn Equinox: osmanthus in bloom, a harvest moon rising over golden rice fields, balanced quiet light.',
  'hanlu': 'Cold Dew: chrysanthemums by a rock in cold morning air, dew turning cold on the leaves, wild geese flying south in a line.',
  'shuangjiang': 'Frost\'s Descent: maple trees in deep red and gold covering a mountainside, the first white frost on the grass, a clear cold sky.',
  'lidong': 'Start of Winter: bare trees with the last few leaves, persimmons hanging orange on a leafless branch, a grey early-winter sky.',
  'xiaoxue': 'Minor Snow: the first light snow dusting dark pines and thatched roofs, a cold grey sky, smoke from a chimney.',
  'daxue': 'Major Snow: high mountains buried in deep snow, snow-laden pines, a frozen river, heavy snow falling, white silence.',
  'dongzhi': 'Winter Solstice: the longest night, a pale low sun setting over snowy plains, a single plum tree beginning to bud, warm lamplight in a far window.',
  'xiaohan': 'Minor Cold: red plum blossoms on a dark branch in the snow, a small bird on the branch, a cold clear sky.',
  'dahan': 'Major Cold: a frozen lake under a deep winter sky, bare willows rimed with frost, ice and snow, the hardest cold before spring.',
}


def prompt(tid):
  return f'{SUBJECT[tid]} No people. Style: {STYLE}'


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--seeds', required=True, help='seeds to roll, e.g. 11,23')
  ap.add_argument('--only', default='', help='节气 ids, e.g. lichun,bailu (default all 24)')
  ap.add_argument('--out', required=True, help='review folder (PNGs, webps and prompts.json land here)')
  a = ap.parse_args()
  base = Path(a.out)
  base.mkdir(parents=True, exist_ok=True)
  ids = a.only.split(',') if a.only else list(SUBJECT)
  prompts = {fid: prompt(fid) for fid in ids}
  (base / 'prompts.json').write_text(json.dumps(prompts, ensure_ascii=False, indent=1) + '\n')
  for seed in [int(s) for s in a.seeds.split(',')]:
    for fid in ids:
      png = base / f'{fid}-s{seed}.png'
      if png.exists():
        continue
      ok, said = render(prompts[fid], seed, png)
      print(f'{fid} seed {seed}: {"ok" if ok and webp(png, png.with_suffix(".webp")) else "failed " + said}', flush=True)


if __name__ == '__main__':
  main()
