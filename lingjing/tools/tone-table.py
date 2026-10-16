#!/usr/bin/env python3
"""tone-table.py — 对对子's 平仄 table (worlds/jiuding/tones.json), derived once, offline.

新韵 (modern Mandarin tones): tones 1–2 are 平, 3–4 仄; the light tone is neither.
Every character of GB2312 (levels 1 and 2, 6763) plus any extra given, classed by its
every reading in pypinyin's character dictionary (MIT; data from pinyin-data /
Unihan): all 平 → P, all 仄 → Z, both → B (a polyphone that may be either — never
failed). A character with no toned reading is left out: unknown, never failed.

Run from a venv with pypinyin installed (it is never a runtime dependency):
  python3 -m venv v && ./v/bin/pip install pypinyin
  ./v/bin/python -I tools/tone-table.py "$(extra chars)" > worlds/jiuding/tones.json
"""
import json
import sys
import unicodedata

from pypinyin import pinyin_dict

MARKS = {'̄': 1, '́': 2, '̌': 3, '̀': 4}


def tone(reading):
    for ch in unicodedata.normalize('NFD', reading):
        if ch in MARKS:
            return MARKS[ch]
    return 0


def side(t):
    return 'P' if t in (1, 2) else 'Z' if t in (3, 4) else None


def gb2312():
    for b1 in range(0xB0, 0xF8):
        for b2 in range(0xA1, 0xFF):
            try:
                yield bytes([b1, b2]).decode('gb2312')
            except UnicodeDecodeError:
                pass


def main():
    chars = list(gb2312())
    seen = set(chars)
    for c in (sys.argv[1] if len(sys.argv) > 1 else ''):
        if '一' <= c <= '鿿' and c not in seen:
            chars.append(c)
            seen.add(c)
    out = {'P': [], 'Z': [], 'B': []}
    for c in chars:
        v = pinyin_dict.pinyin_dict.get(ord(c))
        if not v:
            continue
        sides = {side(tone(r)) for r in v.split(',')} - {None}
        if sides:
            out['B' if len(sides) == 2 else sides.pop()].append(c)
    doc = {
        '_about': '对对子\'s 平仄 (新韵: tones 1–2 平, 3–4 仄), derived offline by tools/tone-table.py from pypinyin\'s character dictionary (MIT; pinyin-data / Unihan). P 平 · Z 仄 · B a polyphone that may be either (never failed). A character in none of them is unknown (never failed).',
        **{k: ''.join(v) for k, v in out.items()},
    }
    print(json.dumps(doc, ensure_ascii=False, indent=1))
    print({k: len(v) for k, v in out.items()}, file=sys.stderr)


if __name__ == '__main__':
    main()
