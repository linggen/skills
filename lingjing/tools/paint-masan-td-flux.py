#!/usr/bin/env python3
"""paint-masan-td-flux.py — 第一回's 收租 塔防 (守山门 kit, sadoushou) painted by the local FLUX (2026-10-22, Hanli:
「就是在第一次收租那里, 马小宝推倒小满后. 加一个塔防类的」).

    PY=~/.linggen/runtime/envs/pictures/bin/python
    $PY tools/paint-masan-td-flux.py paint [--only id,…] [--seeds 1,2]   # every seed → $FLUX_REVIEW/masan-td/, looked at
    $PY tools/paint-masan-td-flux.py cut [--only id,…]                    # the KEPT seeds → scripts/games/sadoushou/art/

马小宝 has shoved 小满 into the 灶台 and a bowl broke; on the floor the boy daydreams a comic fight: he holds the 灶台 with
the three bowls left while 马家家丁 and 小宝's 跟班 pour in through the broken door, and the two bosses — 马小宝 (round as
a 糯米团子, silk, 桂花糕 in hand) and 马三 (「长得跟一扇门似的」, the iron-bound short club) — charge down the middle.
Every sprite is an edit pass from 守墙关's own art (the 野猪 running at us, the 山门 wall) so it keeps the kit's comic style
and camera; the second frames are edit passes from the kept first. 马小宝's silk is blue and gold, never purple: the
magenta key reads purple as background. Every seed is looked at for fake writing (the 租 / 父债子偿 cards are pictures).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flux_comic as fc

HERE = Path(__file__).resolve().parent
ART = HERE.parent / 'worlds' / 'jiuding' / 'art'
QSRC = ART / 'games' / 'shouqiang'
SRC = ART / 'games' / 'sadoushou'
OUT = HERE.parent / 'scripts' / 'games' / 'sadoushou' / 'art'
GAME = 'masan-td'
REV = fc.REVIEW / GAME

STYLE_OF = ('The attached picture shows this game\'s art style: draw a NEW subject in exactly that style (the same bold '
            'dark-brown outline, flat cel shading, saturated colours and glossy highlight), not the attached subject. ')
NO_WRITING = 'No writing, no letters, no glyphs, no characters anywhere. '
RUN = ('Seen from the FRONT and a little from above, running straight TOWARDS the viewer, the whole body in view from head '
       'to feet, comic and funny. ')
JIADING = ('ONE burly thuggish servant man of a rich landlord house, a broad flat face with stubble and a mean comic scowl, '
           'a dark grey-black short cotton jacket with cloth knot buttons and a brown sash, a dark round cloth cap, dark '
           'trousers bound at the shins, black cloth shoes, a short wooden stick raised in one fist')
GENBAN = ('ONE cheeky twelve-year-old village bully boy, a rich kid\'s sidekick, chubby cheeks, a smug grin sticking his '
          'tongue out, a shaved head with one small tuft of black hair on top, a clean dark-blue cotton jacket and brown '
          'trousers, black cloth shoes, a small stick in one hand')
XIAOBAO = ('ONE very fat ROUND rich boy of fourteen, round as a sticky-rice ball, huge chubby cheeks and a double chin, '
           'black hair in a small topknot, a shiny SILK robe of deep BLUE with GOLD cloud pattern and a RED sash, black '
           'cloth shoes')
MASAN = ('ONE huge hulking man as wide and tall as a DOOR, shoulders twice as broad as a normal man, a square block of a body, a thick neck, a fierce scowl, stubble, '
         'black hair in a small topknot, a rough dark charcoal-grey short robe with the sleeves rolled up and a pale rope '
         'sash, baggy dark trousers, pale leg wrappings, black shoes, holding a short straight wooden CUDGEL as long as his '
         'forearm, wrapped along its whole length with dark IRON bands and studs (a club, NOT a hammer, NOT a mallet)')
WALKER = QSRC / 'yezhu-walk-1.green.webp'


def unit(who, what, size, w=768, h=768):
  return dict(w=w, h=h, refs=[WALKER], key='magenta', size=size, prompt=(
    STYLE_OF + who + ', ' + what + '. ' + RUN + NO_WRITING + fc.STYLE + ' ' + fc.ON_MAGENTA))


def thing(what, size, w=512, h=512):
  return dict(w=w, h=h, key='magenta', size=size, prompt=(
    'ONE ' + what + '. Seen from the front and a little from above. ' + NO_WRITING + fc.STYLE + ' ' + fc.ON_MAGENTA))


JOBS = {
  'jiading-walk-1': unit(JIADING, 'charging forward, the left foot stepping out', 200),
  'genban-walk-1': unit(GENBAN, 'running forward, the left foot stepping out, the stick waved high', 170),
  'maxiaobao-walk-1': unit(XIAOBAO, 'waddling forward, munching a big piece of golden yellow OSMANTHUS CAKE held in one '
                           'hand, crumbs flying, one eye shut in a cheeky WINK', 400, 896, 1024),
  'masan-walk-1': unit(MASAN, 'striding forward heavily, the iron-banded club gripped in his right hand', 420, 896, 1024),
  'zaotai-wall': dict(w=1536, h=768, refs=[QSRC / 'wall.green.webp'], key='magenta', size=1100, prompt=(
    'The attached picture is a long wall prop in this game. Draw the SAME kind of long straight prop running across the '
    'whole width, the same view from behind and above, drawn in the same bold dark-brown outline cartoon style, its flat TOP surface clearly seen from above, but now it '
    'is the long low CLAY STOVE LEDGE of a poor peasant hut: '
    'a plain rough sun-dried mud-and-clay counter with a flat top, a small dark fire mouth in the middle of its front, '
    'and standing on its top exactly THREE plain brown EARTHENWARE BOWLS spaced far apart — the left bowl with a chip '
    'broken off its rim, the middle one with a crack down its side, the right one knocked and chipped at its base. Nothing '
    'else on it. No towers, no roofs, no flags, no stone wall. ' + NO_WRITING + fc.ON_MAGENTA)),
  'tex-floor': dict(tex=True, w=576, h=1024, prompt=(
    'Seen from straight above, a flat seamless ground texture filling the WHOLE picture edge to edge: the packed bare '
    'EARTH floor of a poor old Chinese peasant hut, smooth trodden light-brown earth with faint scuffs, small cracks '
    'and a few pebbles, NO footprints, NO paw prints, no border, no frame, even soft light, no objects, nothing standing up, no path edges. ' + fc.STYLE + ' ' + fc.SCENE)),
  'tex-floor-side': dict(tex=True, w=576, h=1024, prompt=(
    'Seen from straight above, a flat seamless ground texture filling the WHOLE picture edge to edge: DARKER rough brown '
    'earth floor in the corner of a poor peasant hut, single loose golden STRAWS scattered EVENLY and thinly all over, no heaps, nothing in the corners, a little dust and grit, even soft '
    'light, NO footprints, no border, no frame, no objects, nothing standing up. ' + fc.STYLE + ' ' + fc.SCENE)),
  'home-far': dict(scene=True, w=1536, h=1024, refs=[ART / 'places' / 'shiao-home.webp'], prompt=(
    'The attached picture is this book\'s painting of a poor family\'s hut. Paint the SAME style (ink line and soft '
    'watercolour wash on old paper) and the SAME hut, but a new view: from inside looking at the far end wall at DUSK. '
    'In the middle of the wall an EMPTY DOORWAY — the door is GONE, kicked off, only the broken doorframe — and warm '
    'ORANGE SUNSET light pours in through it across the earth floor. Rough mud-and-straw walls, a ragged HOLE in the '
    'thatched roof with the evening sky showing, and an old wooden hunting BOW wrapped with sinew hanging on the wall. '
    'The floor in front is empty. NO people, NO door, no seal, no stamp. ' + fc.SCENE)),
  'icon-guihuagao': thing('square piece of golden-yellow OSMANTHUS CAKE, soft layered rice cake sprinkled with tiny '
                          'orange osmanthus flowers, glossy', 256),
  'icon-yecaizhou': thing('plain brown earthenware bowl full of thin watery pale gruel with a few floating green wild '
                          'leaves, a little steam', 256),
  'icon-lizi': thing('small heap of four roasted CHESTNUTS, glossy dark brown shells, two cracked open showing the '
                     'golden nut inside', 256),
  'icon-wan': thing('plain brown earthenware bowl, empty, simple, glowing softly with a warm golden light round it, a '
                    'few small gold sparkles', 256),
  'icon-zu': thing('heavy bulging grey-brown cloth SACK of grain tied at the neck with thick rope, with a string of '
                   'round copper coins with square holes hanging over it, a menacing red glow behind it', 256),
  'icon-fuzhai': thing('old short wooden club bound with dark iron bands, lying across a heavy dark wooden strongbox '
                       'with iron corners and a big iron padlock, a length of iron chain round it, a menacing red glow '
                       'behind it', 256),
  'bowl-break': thing('plain brown earthenware bowl SHATTERING in mid-air, broken into five or six curved shards flying '
                      'apart from the middle, little dust puffs and white impact lines, comic', 160),
  'wall-door': thing('poor peasant hut\'s BRUSHWOOD DOOR standing upright on its own: a flat rough door panel made of '
                     'bundled dry sticks and twigs lashed with straw rope to two crossbars, a bit crooked', 260, 640, 512),
  'wall-luoshu': thing('small plain wooden BOARD standing upright, and laid on its face NINE roasted CHESTNUTS in three '
                       'neat rows of three, a three-by-three grid, nothing else on the board. Each chestnut is a shiny '
                       'dark red-brown nut, round on one side with a flat pale beige bottom patch and a small pointed tip '
                       '(chestnuts, NOT acorns, no caps)', 260, 640, 512),
}
JOBS['home-far']['scrub'] = [(1472, 932, 1518, 972)]  # seed 1's little red seal, bottom right
JOBS['tex-floor-side']['crop'] = (0.08, 0.22, 0.97, 0.98)  # the seeds paint a wall corner at the top left
for k in ('icon-wan', 'icon-zu', 'icon-fuzhai'):
  JOBS[k]['grow'] = 48  # their glow is the card's colour: keep it
# The second frames: edit passes from a kept first, so they are the same figure.
SECOND = {
  'jiading-hit': ('jiading-walk-1', 'the same servant knocked BACK and dizzy, rocking backwards, arms flung out, eyes '
                  'spinning, his cap flying off, a few little stars round his head'),
  'genban-hit': ('genban-walk-1', 'the same boy knocked back and dizzy, wobbling, eyes spinning, a big tear, a few little '
                 'stars round his head'),
  'maxiaobao-roll': ('maxiaobao-walk-1', 'the same fat boy curled up into a ROUND BALL rolling forward at us, his blue '
                     'silk robe wrapped round him like a big round sticky-rice dumpling, only his grinning face and tiny '
                     'hands and feet showing, dust and speed lines behind'),
  'maxiaobao-hit': ('maxiaobao-walk-1', 'the same fat boy knocked back and sitting down hard, the cake flying out of his '
                    'hand, wailing with his mouth wide, a few little stars round his head'),
  'masan-slam': ('masan-walk-1', 'the same huge man, the same front view, both hands raising the iron-banded club high '
                 'over his head to SLAM it down, one foot stamping, roaring'),
  'masan-hit': ('masan-walk-1', 'the same huge man knocked back, staggering, the club drooping, eyes spinning dizzy, a few '
                'little stars round his head'),
}
# The walk's other step is the first frame mirrored: three edit passes each (seeds 1–3, 2026-10-22) asking for the right
# foot all kept the same legs (and 跟班 dropped his stick), so the step alternates by the mirror.
MIRROR = {'jiading-walk-2': 'jiading-walk-1', 'genban-walk-2': 'genban-walk-1'}

KEPT = {'jiading-walk-1': 1, 'genban-walk-1': 1, 'maxiaobao-walk-1': 2, 'home-far': 1,
        'icon-guihuagao': 2, 'icon-yecaizhou': 1, 'icon-lizi': 1, 'icon-wan': 2, 'icon-zu': 2, 'icon-fuzhai': 2,
        'wall-door': 2, 'jiading-hit': 2, 'genban-hit': 3, 'maxiaobao-roll': 1, 'maxiaobao-hit': 1,
        'masan-walk-1': 6, 'zaotai-wall': 5, 'bowl-break': 5, 'wall-luoshu': 4, 'tex-floor': 4, 'tex-floor-side': 4,
        'masan-slam': 1, 'masan-hit': 2}


def second_jobs():
  out = {}
  for jid, (src, what) in SECOND.items():
    seed = KEPT.get(src)
    if not seed:
      continue
    j = JOBS[src]
    out[jid] = dict(w=j['w'], h=j['h'], refs=[REV / f'{src}-{seed}.png'], key='magenta', size=j.get('size'), prompt=(
      'The attached picture is the MASTER drawing of this figure: draw ' + what + '. The same figure, the same colours, '
      'outline, size and view, the whole body in view. ' + NO_WRITING + fc.ON_MAGENTA))
  return out


def tile_v(im, band=0.18):
  """Vertically tileable: crossfade the picture with itself rolled by half, the rolled copy at the ends."""
  import numpy as np
  from PIL import Image
  a = np.asarray(im).astype(np.float32)
  h = a.shape[0]
  r = np.roll(a, h // 2, axis=0)
  y = np.arange(h) / (h - 1)
  d = np.minimum(y, 1 - y)  # 0 at the ends, .5 in the middle
  w = np.clip(1 - d / band, 0, 1)
  w = (w * w * (3 - 2 * w))[:, None, None]
  return Image.fromarray(np.clip(a * (1 - w) + r * w, 0, 255).astype(np.uint8))


def clean(im, grow=4):
  """Clear the faint keyed ghosts (crumbs, steam, shadow left at low alpha) that sit away from the kept body."""
  import numpy as np, cv2
  from PIL import Image
  a = np.asarray(im).copy()
  near = cv2.dilate((a[..., 3] > 100).astype(np.uint8), np.ones((2 * grow + 1, 2 * grow + 1), np.uint8))
  a[..., 3] = np.where(near > 0, a[..., 3], 0)
  out = Image.fromarray(a, 'RGBA')
  return out.crop(out.getbbox())


def cut(only=()):
  from PIL import Image, ImageOps
  jobs = {**JOBS, **second_jobs()}
  OUT.mkdir(parents=True, exist_ok=True)
  SRC.mkdir(parents=True, exist_ok=True)
  for jid, seed in KEPT.items():
    if only and jid not in only:
      continue
    j = jobs[jid]
    src = REV / f'{jid}-{seed}.png'
    out = OUT / f'{jid}.webp'
    raw = Image.open(src).convert('RGB')
    if j.get('tex'):
      l, t, r, b = j.get('crop', (0.04, 0.03, 0.96, 0.97))  # off the painted edge (and any wall in a corner)
      W, H = raw.size
      im = tile_v(ImageOps.fit(raw.crop((round(l * W), round(t * H), round(r * W), round(b * H))), (291, 512), Image.LANCZOS))
      im.save(out, 'WEBP', quality=86, method=6)
      raw.save(SRC / f'{jid}.webp', 'WEBP', quality=90)
    elif j.get('scene'):
      raw.save(SRC / f'{jid}.webp', 'WEBP', quality=90)
      for box in j.get('scrub', ()):  # a faint seal the model stamped anyway: painted out from the paper round it
        import numpy as np, cv2
        a = np.asarray(raw).copy()
        m = np.zeros(a.shape[:2], np.uint8)
        m[box[1]:box[3], box[0]:box[2]] = 255
        raw = Image.fromarray(cv2.inpaint(a, m, 5, cv2.INPAINT_TELEA))
      raw.save(out, 'WEBP', quality=84, method=6)
    else:
      raw.save(SRC / f'{jid}.green.webp', 'WEBP', quality=90)
      fc.save_webp(clean(fc.key_green(src, key=j.get('key', 'magenta')), j.get('grow', 4)), out, max_side=j.get('size') or 256)
    print(jid, '→', out)
  for jid, src in MIRROR.items():
    if (only and jid not in only) or not (OUT / f'{src}.webp').exists():
      continue
    ImageOps.mirror(Image.open(OUT / f'{src}.webp')).save(OUT / f'{jid}.webp', 'WEBP', quality=86, method=6, exact=True)
    print(jid, '→ mirror of', src)


if __name__ == '__main__':
  a = fc.run(JOBS)
  if a.cmd == 'paint':
    fc.paint_all(GAME, {**JOBS, **second_jobs()}, a)
  else:
    cut([k for k in a.only.split(',') if k])
