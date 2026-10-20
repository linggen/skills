#!/usr/bin/env python3
"""font.py — the game font for 开炉: ZCOOL KuaiLe (站酷快乐体, SIL OFL 1.1; the TTF is 守墙关's, tools/shouqiang/font/), cut
down to the characters the game can show — its source, the 饭桶's words (fantong.json) and every item's name and small
print (items.json) — plus ASCII, as woff2 → scripts/games/kailu/font/. Run by build.mjs.
"""
import json, re
from pathlib import Path
from fontTools import subset

HERE = Path(__file__).resolve().parent
TOOLS = HERE.parent
OUT = TOOLS.parent / 'scripts' / 'games' / 'kailu' / 'font'
WORLD = TOOLS.parent / 'worlds' / 'jiuding'

items = json.loads((WORLD / 'items.json').read_text())['items']
names = ''.join((i.get('name') or {}).get('zh', '') + (i.get('hint') or {}).get('zh', '') for i in items)
text = ''.join(p.read_text() for p in sorted((HERE / 'src').glob('*.js'))) + (WORLD / 'fantong.json').read_text() + names
text += (TOOLS.parent / 'scripts' / 'games' / 'kailu.js').read_text()
chars = set(chr(c) for c in range(0x20, 0x7f)) | set(re.findall(r'[　-鿿＀-￯—…·×★☆]', text))
OUT.mkdir(parents=True, exist_ok=True)
opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = ['*']
font = subset.load_font(str(TOOLS / 'shouqiang' / 'font' / 'ZCOOLKuaiLe-Regular.ttf'), opts)
s = subset.Subsetter(opts)
s.populate(text=''.join(sorted(chars)))
s.subset(font)
subset.save_font(font, str(OUT / 'zcool-kuaile.woff2'), opts)
(OUT / 'OFL.txt').write_text((TOOLS / 'shouqiang' / 'font' / 'OFL.txt').read_text())
(OUT / 'chars.txt').write_text(''.join(sorted(chars)) + '\n')
print('font:', len(chars), 'chars →', OUT / 'zcool-kuaile.woff2')
