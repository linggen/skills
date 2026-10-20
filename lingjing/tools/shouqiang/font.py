#!/usr/bin/env python3
"""font.py — the game font for 守墙关: ZCOOL KuaiLe (站酷快乐体, SIL OFL 1.1, font/OFL.txt), cut down to the characters
the game can show (its source, the level file) plus ASCII, as woff2 → scripts/games/shouqiang/font/. Run by build.mjs.
"""
import re
from pathlib import Path
from fontTools import subset

HERE = Path(__file__).resolve().parent
OUT = HERE.parent.parent / 'scripts' / 'games' / 'shouqiang' / 'font'
LEVELS = HERE.parent.parent / 'worlds' / 'jiuding' / 'levels' / 'shouqiang.json'

text = ''.join(p.read_text() for p in sorted((HERE / 'src').glob('*.js'))) + LEVELS.read_text()
chars = set(chr(c) for c in range(0x20, 0x7f)) | set(re.findall(r'[　-鿿＀-￯—…·]', text))
OUT.mkdir(parents=True, exist_ok=True)
opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = ['*']
font = subset.load_font(str(HERE / 'font' / 'ZCOOLKuaiLe-Regular.ttf'), opts)
s = subset.Subsetter(opts)
s.populate(text=''.join(sorted(chars)))
s.subset(font)
subset.save_font(font, str(OUT / 'zcool-kuaile.woff2'), opts)
(OUT / 'OFL.txt').write_text((HERE / 'font' / 'OFL.txt').read_text())
(OUT / 'chars.txt').write_text(''.join(sorted(chars)) + '\n')
print('font:', len(chars), 'chars →', OUT / 'zcool-kuaile.woff2')
