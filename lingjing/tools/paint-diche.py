#!/usr/bin/env python3
"""paint-diche.py — 古六's 底册 · 看完烧了 (wm-laba), a short 大场面, by the LOCAL FLUX.

    python3 tools/paint-diche.py --only zao,page --seeds 1,2,3 [--review DIR]   # a review round
    python3 tools/paint-diche.py --cut zao,page,burn,glow [--review DIR]        # the KEPT seeds → art/setpiece/

The standing rule Hanli approved 2026-10-19 (「我和 agent 照规矩直接处理, 可以, 按你说的做」): the 底册 board
(read each line twice, burn it — reading) became a set piece — the page opened under the lamp, its lines lit one
after another, carried to the 灶口, curling as the fire eats them (setpieces/diche.js). The book (06-第六回.md):
「小满把那张纸凑到灶口，看着它卷起来，黑了。纸上的字，他已经一个一个记进了肚子里。」

Painted, never drawn: the kitchen's stove mouth (a scene, the house's 灶间 as the style reference), the page and the
page burning (cut-outs, painted on a flat dark ground so their pale paper stands off it), and a warm light (a glow).
FLUX can't write: the page's lines are ant-sized ink scribbles, never characters — the box says the book's words.
The painting and cutting are paint-yaowang.py's (loaded as a module: one FLUX job at a time, the same cut-out
code); only the subjects, names and kept seeds are here. Every seed looked at; the kept ones are below.
"""
import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('paint_yaowang', HERE / 'paint-yaowang.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

WORLD = base.WORLD
ZAOJIAN = WORLD / 'art' / 'places' / 'shiao-zaojian.webp'
INK = base.INK
DARK = ('The one subject alone in the middle on a plain flat even dark brown-black ground that runs to every edge, nothing '
        'else in the picture, no table, no shadow, no texture on the ground. Chinese ink-wash painting with light colour, '
        'fine ink linework. No text, no letters, no calligraphy, no seal, no signature, no border, no frame.')
PAGE = ('a small single sheet of old thin rice paper, pale and warm, unfolded flat after being folded into a tiny square: '
        'faint crossing fold creases, its edges a little ragged; on it twelve short rows of very tiny cramped grey-black ink '
        'marks like lines of marching ants, dots and short dashes only, unreadable, no real characters')

base.SUBJECTS = {
  'zao': ('The inside of a big old Chinese temple kitchen before dawn, in the same style as the reference picture but a '
          'larger kitchen: in the middle a broad old brick-and-clay stove with a big iron wok of porridge steaming on top; '
          'low on its front the round fire mouth of the stove glowing deep orange with burning firewood; on the stove ledge '
          'at the left a small clay oil lamp with one small warm flame and a coarse pottery bowl; firewood stacked at the '
          'right; the far doorway a cold blue-grey dawn. Warm firelight against the cold blue room. No people. ' + INK,
          (1536, 1024), ZAOJIAN, 'scene'),
  'page': (f'Seen from straight above, {PAGE}. ' + DARK, (768, 1024), None, ('cut', (480, 640), 'mid', False)),
  'burn': (f'Seen from straight above, {PAGE}, now burning: the sheet curling up from its edges, the edges charred black and '
           'glowing orange, a small bright flame licking up from the bottom corner, the lower half of the ink rows already '
           'gone black with burnt paper. ' + DARK, (768, 1024), None, ('cut', (480, 640), 'mid', False)),
  'glow': ('A soft round warm golden-orange glow of firelight, brightest in the middle and fading smoothly to nothing, alone '
           'on a flat pure black ground. No flame shape, no objects. ' + INK, (768, 768), None, ('glow', (512, 512))),
}
base.NAMES = {'zao': 'diche-zao', 'page': 'diche-page', 'burn': 'diche-burn', 'glow': 'diche-glow'}

# id: (kept seed, paper threshold) — every seed looked at (2026-10-19); what was wrong with the rest:
base.KEPT = {
  'page': (1, 30),   # ant-sized marks in seven rows, the fold creases; 2: the rows denser, the sheet squarer — kept 1 for burn 1
  'burn': (1, 30),   # the same sheet as page 1, black eating up from the bottom, a small flame; 2: pseudo-characters on it
  'zao': (1, 0),     # warm firelight, the lamp on the ledge at the left, the fire mouth low in the middle; 2: colder, the
                     # lamp a jar; 3: the lamp tiny, the stove grey. All three put a painter's seal low right (FLUX copies the
                     # reference's): the camera never reaches it (diche.js SHOT), nor the paper's deckle edge.
}

if __name__ == '__main__':
  import sys
  if '--review' not in sys.argv:
    sys.argv += ['--review', str(Path(base.tempfile.gettempdir()) / 'diche-review')]
  base.main()
