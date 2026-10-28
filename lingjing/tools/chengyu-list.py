#!/usr/bin/env python3
"""chengyu-list.py — 成语接龙's dictionary (worlds/jiuding/chengyu.json), derived once, offline.

Source: THUOCL (清华大学开放中文词库), data/THUOCL_chengyu.txt — MIT License, Copyright (c) 2018 THUNLP
(https://github.com/thunlp/THUOCL, commit f694ce77). Each line there is an idiom and its document frequency; only
the idioms of exactly four Han characters are kept, the commonest first (the file's own order), the word list only.
The license's notice travels with the data (`_license`). MIT is permissive, not public domain.

  curl -sSLO https://raw.githubusercontent.com/thunlp/THUOCL/f694ce779b2a066bfdff2c71a0bd7cfff81fe1ef/data/THUOCL_chengyu.txt
  python3 -I tools/chengyu-list.py THUOCL_chengyu.txt > worlds/jiuding/chengyu.json
"""
import json
import re
import sys

LICENSE = (
    'MIT License. Copyright (c) 2018 THUNLP. Permission is hereby granted, free of charge, to any person obtaining a copy '
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


def main():
    words, seen = [], set()
    for line in open(sys.argv[1], encoding='utf8'):
        parts = line.split()
        if not parts:
            continue
        w = parts[0].strip()
        if re.fullmatch(r'[一-鿿]{4}', w) and w not in seen:
            seen.add(w)
            words.append(w)
    doc = {
        '_about': '成语接龙\'s dictionary (games/jinchat-games.js chainOf): four-character idioms, the commonest first, one '
                  'space between. The page judges every link by it: his idiom must be here, unused, and start with the last '
                  'character of the one before; the person\'s own link is the commonest here that leaves him three or more. '
                  'Derived offline by tools/chengyu-list.py from THUOCL_chengyu.txt (清华大学开放中文词库, THUNLP), the word list only.',
        '_source': 'https://github.com/thunlp/THUOCL/blob/f694ce779b2a066bfdff2c71a0bd7cfff81fe1ef/data/THUOCL_chengyu.txt',
        '_license': LICENSE,
        'n': len(words),
        'words': ' '.join(words),
    }
    print(json.dumps(doc, ensure_ascii=False, indent=1))
    print(len(words), file=sys.stderr)


if __name__ == '__main__':
    main()
