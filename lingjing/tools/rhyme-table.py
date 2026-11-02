#!/usr/bin/env python3
"""rhyme-table.py — English 对对子's syllable and rhyme table (worlds/jiuding/rhymes.json), derived once, offline.

From the CMU Pronouncing Dictionary (cmudict.dict, BSD-style licence: its notice ships in
the table's `_licence`), each word's every pronunciation is cut to two facts: its
syllable count (the vowels) and its rhyme tail — the phones from the last stressed
vowel (stress 1 or 2; else the last vowel) to the end, stress marks dropped,
an unstressed AH/IH/EH/UH after it written `@` (trouble · bubble), and AO written
AA (frog · dog: the cot–caught merger). Only common words are kept: those seen at
least MIN times in a corpus of public-domain books (Project Gutenberg plain texts
given on the command line), plus every word of the English ladder (aigames.json
`duizi.english`; the few CMU lacks are in EXTRA, transcribed by hand). A word outside the table is unknown to scripts/rhyme.js: counted by
its spelling, never failed.

The shipped table (2026-11-02): MIN = 4 over these 39 Project Gutenberg plain texts
(https://www.gutenberg.org/cache/epub/<id>/pg<id>.txt; #2005 was fetched and left out):
  10 11 16 20 26 74 76 84 98 100 113 136 158 345 768 932 1041 1260 1342 1400 1661 1934 1952 2199
  2428 2591 2701 3207 5200 6130 7409 10607 15349 16456 22120 22403 23794 47383 49221
  for id in ...; do curl -sSLo pg$id.txt https://www.gutenberg.org/cache/epub/$id/pg$id.txt; done
  curl -O https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict
  curl -O https://raw.githubusercontent.com/cmusphinx/cmudict/master/LICENSE
  python3 -I tools/rhyme-table.py cmudict.dict LICENSE worlds/jiuding/aigames.json pg*.txt > worlds/jiuding/rhymes.json

The table: `tails` maps a rhyme tail to its words, each with its syllable count
appended ("day1 away2"); a word with two pronunciations sits in both.
"""
import collections
import json
import re
import sys

MIN = 4
VOWEL = re.compile(r'^([A-Z]+)([012])$')
WEAK = {'AH', 'IH', 'EH', 'UH'}
WORD = re.compile(r"[a-z]+(?:'[a-z]+)*")
# Ladder words the CMU dictionary lacks, transcribed by hand in its phones.
EXTRA = {
    'rend': 'R EH1 N D', 'nought': 'N AO1 T', 'weepers': 'W IY1 P ER0 Z', 'fenny': 'F EH1 N IY0', 'pricking': 'P R IH1 K IH0 NG',
    'glisters': 'G L IH1 S T ER0 Z', "hurlyburly's": 'HH ER1 L IY0 B ER1 L IY0 Z', 'glutton': 'G L AH1 T AH0 N',
}


def tail(phones):
    vowels = [i for i, p in enumerate(phones) if VOWEL.match(p)]
    if not vowels:
        return None, 0
    stressed = [i for i in vowels if phones[i][-1] in '12']
    start = (stressed or vowels)[-1]
    out = []
    for i, p in enumerate(phones[start:]):
        m = VOWEL.match(p)
        if m:
            v = 'AA' if m.group(1) == 'AO' else m.group(1)
            out.append('@' if i and m.group(2) == '0' and v in WEAK else v)
        else:
            out.append(p)
    return '.'.join(out), len(vowels)


def ladder_words(aigames):
    en = json.load(open(aigames, encoding='utf-8'))['duizi'].get('english', {})
    words = set()
    for rung in en.get('rungs', []):
        for up, ref, _src in rung['ladder']:
            words.update(WORD.findall((up + ' ' + ref).lower().replace('’', "'").replace('-', ' ')))
    return words


def main():
    cmu, licence, aigames, *corpus = sys.argv[1:]
    counts = collections.Counter()
    for path in corpus:
        text = open(path, encoding='utf-8', errors='ignore').read().lower().replace('’', "'")
        counts.update(WORD.findall(text))
    keep = {w for w, n in counts.items() if n >= MIN} | ladder_words(aigames)
    tails = collections.defaultdict(list)
    seen = set()
    for line in [*open(cmu, encoding='utf-8'), *(f'{w} {p}' for w, p in EXTRA.items())]:
        line = line.split('#')[0].strip()
        if not line:
            continue
        head, *phones = line.split()
        word = re.sub(r'\(\d+\)$', '', head)
        if word not in keep or not WORD.fullmatch(word):
            continue
        key, n = tail(phones)
        if not key or (word, key, n) in seen:
            continue
        seen.add((word, key, n))
        tails[key].append(f'{word}{n}')
    words = {e.rstrip('0123456789') for v in tails.values() for e in v}
    out = {
        '_about': "English 对对子's syllables and rhymes, derived offline by tools/rhyme-table.py from the CMU Pronouncing Dictionary "
                  f"(cmudict.dict; the licence below), trimmed to {len(words)} common words (seen {MIN}+ times in public-domain books) and the English ladder's ({len(EXTRA)} of them, which CMU lacks, transcribed by hand). "
                  "`tails`: a rhyme tail (phones from the last stressed vowel, `@` an unstressed AH/IH/EH/UH, AO as AA) → its words, each with its syllable count. "
                  "A word in none is unknown (counted by its spelling, never failed).",
        '_licence': open(licence, encoding='utf-8').read().strip(),
        'tails': {k: ' '.join(v) for k, v in sorted(tails.items())},
    }
    json.dump(out, sys.stdout, ensure_ascii=False, separators=(',', ':'))
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
