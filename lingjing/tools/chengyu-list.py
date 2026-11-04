#!/usr/bin/env python3
"""chengyu-list.py — 成语接龙's dictionary (worlds/jiuding/chengyu.json), derived once, offline.

Two tiers (2026-11-04, Hanli on 钱掌柜 · 一罐回春丹: 定国安民 and 听风是雨 refused 「不在成语谱里」 and the chain stuck):
  · `words` — the commonest, the order the person plays and hints from: THUOCL (清华大学开放中文词库, THUNLP,
    data/THUOCL_chengyu.txt, MIT, commit f694ce77), its own order, kept only where a dictionary below also lists it
    or holds as one half of a longer idiom (千里之行，始于足下) — THUOCL is mined from text: 同轴电缆 and 博拉尔德 are in it —
    and the supplement.
  · `more` — every other four-character idiom of the dictionaries, his to say, never theirs to pick: mapull/chinese-dictionary
    idiom/idiom.json (MIT, Copyright (c) 2021 码谱, commit e804ada3; a superset of pwxcoo/chinese-xinhua data/idiom.json,
    MIT, Copyright (c) 2018 PWXCOO, commit fe6d6c2e), then THUOCL's own others. Grouped by first character to save
    bytes: each group is the head, then the other three characters of each idiom, one after another.
Only idioms of exactly four Han characters. Every license notice travels with the data (`_license`).

  curl -sSLO https://raw.githubusercontent.com/thunlp/THUOCL/f694ce779b2a066bfdff2c71a0bd7cfff81fe1ef/data/THUOCL_chengyu.txt
  curl -sSL https://raw.githubusercontent.com/mapull/chinese-dictionary/e804ada333b68afddfdccbe8dcc938a72da157a7/idiom/idiom.json -o mapull-idiom.json
  python3 -I tools/chengyu-list.py THUOCL_chengyu.txt mapull-idiom.json > worlds/jiuding/chengyu.json
"""
import json
import re
import sys

MIT = (
    'Permission is hereby granted, free of charge, to any person obtaining a copy '
    'of this software and associated documentation files (the "Software"), to deal in the Software without restriction, '
    'including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell '
    'copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following '
    'conditions: The above copyright notice and this permission notice shall be included in all copies or substantial '
    'portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, '
    'INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND '
    'NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER '
    'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE '
    'SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.'
)
LICENSE = ' '.join([
    'MIT License. Copyright (c) 2018 THUNLP (THUOCL). ' + MIT,
    'MIT License. Copyright (c) 2021 码谱 (mapull/chinese-dictionary). ' + MIT,
    'MIT License. Copyright (c) 2018 PWXCOO (pwxcoo/chinese-xinhua, which mapull\'s idiom list builds on). ' + MIT,
])
SOURCES = [
    'https://github.com/thunlp/THUOCL/blob/f694ce779b2a066bfdff2c71a0bd7cfff81fe1ef/data/THUOCL_chengyu.txt',
    'https://github.com/mapull/chinese-dictionary/blob/e804ada333b68afddfdccbe8dcc938a72da157a7/idiom/idiom.json',
    'https://github.com/pwxcoo/chinese-xinhua/blob/fe6d6c2e8baa82187f4c96bbe042e43f96c05666/data/idiom.json',
]
# Standard idioms the open lists lack, added by hand (reported 2026-11-04 on 钱掌柜's board; 新华成语词典 has both).
SUPPLEMENT = ['定国安民', '听风是雨']

FOUR = re.compile(r'[一-鿿]{4}')


def main():
    thu, seen = [], set()
    for line in open(sys.argv[1], encoding='utf8'):
        parts = line.split()
        w = parts[0].strip() if parts else ''
        if FOUR.fullmatch(w) and w not in seen:
            seen.add(w)
            thu.append(w)
    lexicon, halves = [], set()
    for row in json.load(open(sys.argv[2], encoding='utf8')):
        w = str(row.get('word', '')).strip()
        if FOUR.fullmatch(w):
            lexicon.append(w)
        # 千里之行，始于足下: each four-character half of a longer idiom counts as the dictionary's (THUOCL has 千里之行).
        for part in re.split(r'[，,、；;。]', w):
            if FOUR.fullmatch(part):
                halves.add(part)
    known = set(lexicon) | halves | set(SUPPLEMENT)
    words = [w for w in thu if w in known] + [w for w in SUPPLEMENT if w not in thu]
    have = set(words)
    rest = []
    for w in lexicon + thu:
        if w not in have:
            have.add(w)
            rest.append(w)
    groups = {}
    for w in rest:
        groups.setdefault(w[0], []).append(w[1:])
    more = ' '.join(h + ''.join(t) for h, t in groups.items())
    doc = {
        '_about': '成语接龙\'s dictionary (games/jinchat-games.js dictOf), derived offline by tools/chengyu-list.py. `words`: '
                  'the commonest four-character idioms, the commonest first, one space between — the person plays, hints and '
                  'deals the choices from these alone. `more`: every other idiom he may say, grouped by first character (the '
                  'head, then the other three characters of each). His idiom must be in either, unused, and start with the '
                  'last character of the one before. Sources: THUOCL_chengyu.txt (清华大学开放中文词库, THUNLP), mapull/'
                  'chinese-dictionary idiom.json (码谱, built on pwxcoo/chinese-xinhua), and a hand-kept supplement of '
                  'standard idioms they lack (定国安民, 听风是雨; 2026-11-04). The word lists only.',
        '_source': ' · '.join(SOURCES),
        '_license': LICENSE,
        'n': len(words),
        'n_more': len(rest),
        'words': ' '.join(words),
        'more': more,
    }
    print(json.dumps(doc, ensure_ascii=False, indent=1))
    print(len(words), len(rest), file=sys.stderr)


if __name__ == '__main__':
    main()
