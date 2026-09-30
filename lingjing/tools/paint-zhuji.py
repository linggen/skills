#!/usr/bin/env python3
"""paint-zhuji.py — 筑基天象's paintings (第九回, the cliff-top foundation), by the LOCAL FLUX.

    python3 tools/paint-zhuji.py [--only a,b] [--seeds 1,2,3] [--out DIR]   # paint (a review round with --seeds)
    python3 tools/paint-zhuji.py --note RAW-d1.webp:x0,y0,x1,y1              # d1 + d2 from the kept door

Hanli, 2026-09-30: the code-drawn 筑基天象 was 「太假」 — paint first, then animate, as
漳水立起 was rebuilt (setpieces/zhang.js). He approved the frames: a 锅盖云 (wide),
b 一缕光, c 丹田台, d 那扇门 (twice: d1 the note unreadable, d2 the note 「今日放学」 —
the soak turns one into the other), e 四桩/星垂. Then, the same day: 「设计的时候要考虑后面更高
境界, 别太过了……应该一层更比一层震撼」 and 「筑基有一点天象就可以」 — so the outside frames are
restrained monochrome ink (one small cloud, a faint thread of light, stars only a little
clearer).

Then: 「筑基的图片在小满旁边画了个台子, 其实应该是内景的台子吧」 — the first e stitched the 台
under the boy on the cliff, so it read as a thing beside him. The 台 is INSIDE him (DESIGN
内景的阶梯; the book: 「那片湖，那座台，那五扇门，那四根桩……都在他自己肚里」). So two worlds, two
looks, never in one painting: OUTSIDE (a, b, e2) monochrome ink on paper; INSIDE (c, d1/d2,
e1) a small cosmos — a dark void, a faint starfield, nebula-like ink, the black lake floating
in it, soft coloured glows; c's five doors Chinese gateways (moon gates, tiled roofs), not
stone arches. e is two paintings: e1 the 台 on its four piles in the cosmos, e2 him alone on
the cliff under the night; the set piece soaks the cliff in over the cosmos (he opens his eyes).

Codex (the painter of zhang-*.webp) was out of credits, so these are FLUX.2 klein 4B through
mflux (paint-flux-codex.py's recipe, nothing downloaded), prompts in English only.
FLUX writes no real Chinese: the door is painted once with a blank note (roll d1 into a
review folder), and the four characters 「今日放学」 are brushed onto it (`--note`, a 行楷
(Xingkai) face multiplied into the paper) — rain-run past reading on d1 (he cannot read
them; he is sure they say 「勿入」), crisp on d2. All of it is in the painting files;
nothing is drawn at play time.

Each frame is rolled over several seeds into a review folder (--out), every picture looked
at (one boy, young, not a man; Chinese, not Western; no text, no seal, no frame; a cloud,
not a pot; no 台 anywhere near the cliff), and the kept seed is written below. Output:
art/setpiece/zhuji-<id>.webp, all 1536×1024.
"""
import argparse, json, os, subprocess, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'worlds' / 'jiuding' / 'art' / 'setpiece'
PY = Path.home() / '.linggen/runtime/envs/pictures/bin/python'
SCRIPT = Path.home() / '.linggen/runtime/mlx_picture.py'
MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'
W, H = 1536, 1024

# His ruling (2026-09-30): 筑基 is the first and smallest rung — 结丹, 元婴, 化神… must each
# be bigger, so this one is restrained: one cliff top, one modest cloud, monochrome ink,
# a faint thread of light, the stars only a little clearer (his: 「筑基有一点天象就可以」). 「天地看了他一眼」, not 「天地为之变色」.
# No lightning, dragons, galaxy, cracked sky, aurora or colour (all kept for later realms)
# — the inner world (c, d1, e1) is another place and keeps its muted colour.
INK_STYLE = ('A restrained monochrome Chinese ink-wash painting on warm aged rice paper: black ink linework and soft grey '
             'washes only, grey and white, no colour at all, quiet and understated, like a plate from a finely '
             'illustrated old Chinese novel. Set in old China, Ming dynasty, not Japanese, not Western. No text, no '
             'letters, no calligraphy, no seal, no signature, no border, no frame, no vignette.')
BOY = ('a thin poor Chinese village boy of thirteen (a young teenager, small and skinny, no beard), messy black hair '
       'tied in a small topknot, a patched hemp robe-jacket crossed at the front and tied with a rope, straw sandals')
# b's face: the first round read anime — ask for the old figure-painting hand instead.
FACE = ('His face is small and plain, drawn with a few fine brush lines in the manner of Ming dynasty woodblock and '
        'figure-painting illustration: narrow closed eyes, a small nose, not anime, not manga, not cartoon, no big eyes.')

# His note (2026-09-30): 「筑基的图片在小满旁边画了个台子, 其实应该是内景的台子吧」 — the 台 is inside
# him (DESIGN 内景的阶梯: 筑基 = the first 内视 — a black lake, a square 台, five doors, four piles).
# So the inner world gets its own look, one no viewer can take for the cliff: a SMALL COSMOS —
# a dark void, a faint starfield, nebula-like ink, the black lake floating in it, a soft glow.
# c, d1 and e1 are inside (in colour, in the cosmos); a, b and e2 outside (monochrome ink).
INNER_STYLE = ('A richly detailed Chinese ink-and-watercolour painting of a Taoist inner world, like a plate from a '
               'finely illustrated old Chinese novel: the whole picture is dark — deep indigo-black ink washes, fine '
               'dark ink linework, soft glows, painterly mist, visible paper grain. Set in old China, not Japanese, '
               'not Western, not European. No text, no letters, no calligraphy, no seal, no signature, no border, no '
               'frame, no vignette.')
COSMOS = ('Inside a body, a small cosmos: a vast dark void of deep indigo-black ink, flecked with a faint starfield of '
          'tiny pale specks, soft nebula-like clouds of diluted ink drifting through it in muted indigo, violet-grey '
          'and a little pale gold. In the middle of the void floats a round, still, black lake like a dark mirror, '
          'its far edges fading into the stars, lit by a soft glow from within. No land, no mountains, no trees, no '
          'sky with a horizon.')
DOORS = ('five simple old Chinese gateways: round moon gates set in short stretches of low whitewashed wall with grey '
         'tiled tops, and plain timber doorframes under small curved tiled roofs, like humble Chinese paifang — '
         'not stone arches, not Romanesque, not Gothic, not European')

# id: (kept seed, style, subject). `inner` = the cosmos (colour), `ink` = monochrome ink.
SUBJECTS = {
  'a': (7, 'ink', 'A very wide, calm, distant landscape of a Chinese Taoist mountain range in the afternoon, seen from far away across a valley. On one high cliff top, far off and very small, one lone boy sits alone cross-legged on a flat stone, meditating — the only person anywhere in the picture. Low over that one cliff top only, one small grey-white cloud hugs the peak like a lid: round on top, flat underneath, its soft vapour curling slowly around in a spiral. It is only a cloud, soft and made of mist, no object inside it. Everywhere else the sky is ordinary, clear and empty. Old twisted pine trees on the cliff, a thin waterfall falling into a misty gorge below. The air utterly still, no wind.'),
  'b': (5, 'ink', f'A closer view of a cliff top on a Chinese mountain. Only one person in the picture: {BOY}, sits alone cross-legged in the centre of the picture on a flat stone, eyes closed, hands resting in his lap, seen from the front and a little from afar, so that he fills only the middle third of the height of the picture. {FACE} A soft grey cloud overhead at the top of the picture, and from its heart one very thin, faint, pale thread of light comes straight down and rests on the top of his head — so faint it is almost missable, no brighter than the grey sky around it. An old pine tree beside him and the grass around the stone are perfectly still.'),
  'c': (3, 'inner', f'{COSMOS} From the floor of the black lake, rough grey stones float up out of the water and stack into a broad square stone platform in the centre of the lake, a few stones still rising around it, water streaming off them. Around the lake in a wide ring stand {DOORS}, each glowing softly from within in a muted colour: pale gold, moss green, deep indigo, dull cinnabar red, ochre yellow. The five glows reflect in the black water. No people.'),
  'd1': (2, 'inner', f'{COSMOS} Standing alone on the black water, filling the centre of the picture, one old Chinese wooden door in its own plain timber frame, freestanding with no wall around it, seen straight on: weathered planks, half of its dark red lacquer flaked away to grey wood, an old iron ring knocker, a worn stone threshold. Pasted on the door at eye level is one small blank sheet of old yellowed paper, stained and rain-smudged. The door stands a little ajar: through the narrow gap, faintly, a lamp-lit old village schoolroom with low wooden desks and a warm oil lamp. A thin warm glow from the gap, the stars all around. Nobody in sight. Quiet, a little forbidding.'),
  'e1': (3, 'inner', f'{COSMOS} In the centre of the black lake stands one square flat stone platform, level and firm, held up on exactly four thick square stone piles, one at each corner, seen a little from the side so all four piles go straight down into the still black water, their reflections below them. The platform is empty. Far off round the edge of the lake, five small soft glows in muted gold, green, indigo, red and ochre. Solid, calm and quiet. No people, no figures, no cliff.'),
  'e2': (2, 'ink', 'A calm clear night in the Chinese mountains, in soft dark grey ink wash. In the lower part of the picture, a cliff top with old twisted pine trees; small and alone near its edge, one boy seated cross-legged on a flat stone, seen from behind, looking up at the sky — the only person in the picture. Above, an ordinary clear, calm night sky: the last faint wisp of a small grey cloud thinning away, and the stars over this one peak simply a little clearer and brighter than usual — ordinary small stars in their ordinary places, no shooting stars, no Milky Way, nothing dramatic. Mist fills the gorge below the cliff.'),
}
STYLES = {'ink': INK_STYLE, 'inner': INNER_STYLE}


def render(prompt, seed, png, reference=None):
  req = {'model': MODEL, 'prompt': prompt, 'out': str(png), 'width': W, 'height': H, 'seed': seed, 'reference': reference}
  env = dict(os.environ, HF_HOME=str(Path.home() / '.linggen/models/hf-hub'), HF_HUB_OFFLINE='1')
  r = subprocess.run([str(PY), str(SCRIPT)], input=json.dumps(req), text=True, capture_output=True, env=env)
  return r.returncode == 0 and png.exists(), (r.stdout.strip() or r.stderr.strip())[-200:]


# d2: d1 with 爹's note. FLUX writes no real Chinese, so the four characters are brushed
# onto d1's paper in a Kaiti face — one vertical column, ink multiplied into the paper,
# softened a touch so it sits in the wash. `box` is the note's paper on d1, in pixels.
KAITI = next(iter(sorted(Path('/System/Library/AssetsV2').glob('com_apple_MobileAsset_Font*/*/AssetData/Xingkai.ttc'))), None)
NOTE_CODE = '''
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
src, out, font, x0, y0, x1, y1, words, blur, fill = sys.argv[1:11]
x0, y0, x1, y1 = map(int, (x0, y0, x1, y1))
im = Image.open(src).convert('RGB')
w, h = x1 - x0, y1 - y0
cols = [words[:2], words[2:]]  # two columns, read right to left: 今日 | 放学
size = int(min(w / 2.35, h / 2.35))
f = ImageFont.truetype(font, size)
ink = Image.new('L', im.size, 255)
d = ImageDraw.Draw(ink)
for c, col in enumerate(cols):
  cx = x0 + w * (0.72 - 0.44 * c)
  for i, ch in enumerate(col):
    d.text((cx, y0 + h * (0.29 + 0.44 * i)), ch, font=f, fill=int(fill), anchor='mm')
ink = ink.filter(ImageFilter.MinFilter(3))  # a brush's weight
ink = ink.filter(ImageFilter.GaussianBlur(float(blur)))
if float(blur) > 2:  # rain-run: the ink streaks downward, past reading
  for k in range(1, 7):
    ink = ImageChops.darker(ink, ink.transform(ink.size, Image.AFFINE, (1, 0, 0, 0, 1, -k * float(blur) * 0.9), fillcolor=255).point(lambda v: 255 - (255 - v) * (0.8 ** k)))
layer = Image.merge('RGB', [ink] * 3)
ImageChops.multiply(im, layer).save(out)
'''


def note(src_webp, out_webp, box, blur, fill, words='今日放学'):
  png = Path(tempfile.gettempdir()) / 'zhuji-note.png'
  subprocess.run(['/opt/homebrew/bin/dwebp', str(src_webp), '-o', str(png)], check=True, capture_output=True)
  subprocess.run([str(PY), '-c', NOTE_CODE, str(png), str(png), str(KAITI), *map(str, box), words, str(blur), str(fill)], check=True)
  ok = webp(png, out_webp)
  png.unlink(missing_ok=True)
  return ok


def webp(png, out):
  return subprocess.run(['/opt/homebrew/bin/cwebp', '-q', '84', str(png), '-o', str(out)], capture_output=True).returncode == 0


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--only', default='')
  ap.add_argument('--seeds', default='', help='roll these seeds (a review round) instead of the kept one')
  ap.add_argument('--out', default=None, help='paint into this folder instead of art/setpiece')
  ap.add_argument('--note', default=None, help='RAW.webp:x0,y0,x1,y1 — the kept FLUX door and its note\'s box: brush the words on (d1 rain-run past reading, d2 crisp), and stop')
  a = ap.parse_args()
  only = set(filter(None, a.only.split(',')))
  base = Path(a.out) if a.out else OUT
  base.mkdir(parents=True, exist_ok=True)
  if a.note:
    raw, box = a.note.rsplit(':', 1)
    box = [int(v) for v in box.split(',')]
    for key, blur, fill in (('d1', 6, 70), ('d2', 0.7, 40)):
      print(f'{key}:', 'ok' if note(Path(raw), base / f'zhuji-{key}.webp', box, blur, fill) else 'failed', flush=True)
    return
  for key, (kept, style, subject) in SUBJECTS.items():
    if only and key not in only:
      continue
    for seed in ([int(s) for s in a.seeds.split(',')] if a.seeds else [kept]):
      png = Path(tempfile.gettempdir()) / f'zhuji-{key}-{seed}.png'
      ok, said = render(f'{subject} Style: {STYLES[style]}', seed, png)
      name = f'zhuji-{key}.webp' if not a.seeds else f'zhuji-{key}-s{seed}.webp'
      print(f'{key} seed {seed}: {"ok" if ok and webp(png, base / name) else "failed " + said}', flush=True)
      png.unlink(missing_ok=True)


if __name__ == '__main__':
  main()
