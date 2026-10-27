#!/usr/bin/env python3
"""paint-games.py — the small games' pieces, painted in the house 水墨淡彩 so a game sits in its scene.

    python3 tools/paint-games.py [--only id,id] [--force] [--seed N] [--seeds N] [--out DIR] [--codex]

2026-10-16, Hanli: 「射鹿的画风比较粗糙啊」 — the games were drawn in code (an SVG blob of a deer, a
yellow disc of a 饼, stick men) in front of painted backdrops. Each piece here is painted by the
engine's local FLUX (FLUX.2 klein 4B through mflux; tools/paint-flux-codex.py's recipe, HF_HOME at
the cached model, nothing downloaded) — 「codex画图额度比较少, 可以用flux」. `--codex` paints one
piece with Codex instead (tools/paint-wash-codex.py's call), kept for a piece FLUX cannot do.

A SPRITE (a thing that moves: the stag, the bow, the 饼, a basin) is painted alone on plain paper,
then KEYED: the paper's colour is read from the border, every pixel's alpha is how much darker than
the paper it is, and its colour is un-mixed from the paper — so the piece lands on any paper (or a
painted vignette) with its own wash intact, and moves over the others. A VIGNETTE (a scene's ground:
the cave) keeps its paper and runs edge to edge.

Review: `--out DIR --seeds 6` rolls six seeds a piece into DIR (<id>-s<seed>.webp); look at each
beside the house sheet (art/creatures/qiuyu.webp, longzhi.webp, art/cards/luying.webp) at card size
and at 390, then paint the kept seed into art/games/ with `--only <id> --seed N --force`, and write
that seed in SUBJECTS below. FLUX follows position words, drifts to bright white field-guide paper
(the STYLE line pushes back) and sometimes paints fake characters — re-roll those.

Output: art/games/<game>/<piece>.webp (RGBA webp q86 for sprites, RGB q84 for vignettes).
"""
import argparse, json, os, subprocess, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ART = HERE.parent / 'worlds' / 'jiuding' / 'art'
OUT = ART / 'games'
PY = Path.home() / '.linggen/runtime/envs/pictures/bin/python'
SCRIPT = Path.home() / '.linggen/runtime/mlx_picture.py'
MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'

STYLE = ('Chinese ink wash painting (shuimo with light colour) on warm aged sepia rice paper, loose xieyi brushwork, '
         'soft ink gradations from black to pale grey, the faintest muted mineral tint only where it carries meaning, '
         'in the manner of an old Chinese album leaf. No bright or saturated colour, no white paper, no pen hatching, '
         'no Western field-guide rendering, no photograph, no 3D. No text, no characters, no calligraphy, no seal, '
         'no signature, no border, no frame.')
ALONE = ('The subject ALONE in the middle of the picture with wide plain empty paper all around it, '
         'the paper even and clean, no ground, no shadow, no landscape, no other objects.')
OLD_CHINA = 'Set in old rural China (Ming dynasty dress), not Japanese, not Western.'
BRUSH = ('Painted like Xu Beihong\'s ink horses: the body laid in a few broad wet strokes of ink wash with soft bleeding edges, '
         'dry flying-white brush for the legs and antlers, no fine outline drawing, no fur texture, no illustration.')
BRUSHED = set()  # pieces whose kept seed was painted with the BRUSH line

# "<game>/<piece>": (kind, out size (w, h) after keying/trim, paint size (w, h), kept seed, subject)
#   kind 'sprite' = keyed to alpha and trimmed to its ink; 'solid' = a sprite whose body is paler than the paper (ice):
#   all its outline holds is filled, in the painted colours; 'pose' = keyed, kept on its whole canvas (a creature's poses
#   share one scale and ground line); 'vignette' = kept whole, on its paper.
SUBJECTS = {
  # 射鹿's pieces (deer/*) were here: the board was retired 2026-10-20 — 射鹿 is a level of 砸寨 (tools/paint-zhazhai-throws.py).
  # ── 喂饼 (00-cave/00-fox, the 割绳子 puzzle): the 饼 swings on vines in the cave to the fox.
  'bread/cave': ('vignette', (720, 880), (720, 880), 2,
    'The inside of a small mountain cave seen straight on, a tall picture. Top: a heavy overhanging rock ceiling in dark ink and '
    'grey wash across the whole width, a few roots and small vines hanging from it. Bottom: a rough earth and stone cave floor '
    'across the whole width. Middle: wide, open and EMPTY, only a soft pale grey haze of wash, nothing in it. A faint warm '
    'glow from the left as from a small fire outside. No animals, no people.'),
  'bread/bing': ('sprite', (240, 240), (768, 768), 2,
    'ONE thick round Chinese griddle flatbread (a bing), seen from straight above, a flat disc, golden-brown with a few darker '
    'scorch spots from the iron griddle, one fold of dough across it. Muted warm ochre wash with ink edges; homely and plain.'),
  'bread/bing-piece': ('sprite', (200, 200), (768, 768), 1,
    'ONE small torn wedge of a round Chinese flatbread, a triangular piece with a curved outer crust and a rough torn edge, '
    'golden-brown with a dark scorch spot. Muted warm ochre wash with ink edges.'),
  'bread/stone': ('sprite', (480, 160), (1024, 384), 3,
    'ONE long flat grey stone slab lying horizontal, rough edges, moss in a few cracks, seen from the side. Grey ink wash and '
    'dark ink outline.'),
  'bread/puff': ('sprite', (220, 160), (768, 576), 2,
    'ONE small puff of wind drawn the old Chinese way: a soft curling swirl of cloud like a breath blown out to the RIGHT, '
    'two or three spiral curls and trailing wisps, in pale grey ink wash with a fine dark ink line. Nothing else.'),
  'bread/leaf': ('sprite', (160, 160), (512, 512), 2,
    'A small sprig of a mountain vine: two or three heart-shaped leaves on a short curling tendril. Muted dark green-grey ink '
    'wash with dark ink veins.'),

  # ── 接雨 (00-shiao): 「一场雨接满十七个盆」 — the roof leaks; set a basin under each drip.
  'rain/basin': ('sprite', (360, 200), (1024, 576), 1,
    'ONE old round wooden washbasin seen from the front and a little above, staves bound with two thin hoops, empty. Muted '
    'brown wash with dark ink edges.'),
  # ── 打地鼠's story levels (全文后的小游戏, 2026-10-26; rain.js levels): 银色的血 (00-xiuxian) · 捡球递水 (j04-line).
  'rain/xue-beam': ('sprite', (960, 200), (1536, 320), 1,
    'A long horizontal strip of a small silver-white fox\'s tail fur seen close, soft silvery fur running across the whole width, '
    'several stumps of broken tails along it, faint silver beads of liquid hanging from them, moonlight. Silver-grey ink wash.'),
  'rain/xue-palm': ('sprite', (360, 200), (1024, 576), 2,
    'A close-up of two small cupped hands only, palms up and pressed together at the wrists, a few silver drops shining in '
    'them, seen from above. Only the hands and wrists, no face, no body. Muted ink and soft wash on plain paper.'),
  'rain/qiu-beam': ('sprite', (960, 200), (1536, 320), 1,
    'A long horizontal strip of the edge of an indoor basketball court seen from the side: the bench, a row of plastic water '
    'bottles and a few basketballs along it. Grey ink wash and dark ink, modern setting drawn in old Chinese album style.'),
  'rain/qiu-ball': ('sprite', (360, 200), (1024, 576), 2,
    'A plastic sports water bottle lying beside a basketball on the floor, seen from the front and a little above. '
    'Muted ink and soft wash, modern objects drawn in old Chinese album style.'),
  'rain/beam': ('sprite', (960, 200), (1536, 320), 1,
    'A long horizontal strip of an old thatched cottage ceiling seen from below: one dark wooden roof beam running across the '
    'whole width, with rafters and straw thatch above it, wet, a few drops hanging from it. Dark ink and grey wash.'),

  # ── 吹鹅毛 (00-halfyear): 老周家的鹅毛 stuck on a strip of bamboo under his nose.
  'feather/feather': ('sprite', (160, 480), (512, 1024), 1,
    'ONE single soft white goose feather standing upright, its thin quill at the bottom, the vane soft and slightly curved, '
    'a few loose downy barbs at its base. Pale grey ink wash on the shadow side so the white feather shows on the paper, '
    'fine dark ink line for the quill.'),
  'feather/face': ('sprite', (300, 420), (768, 1024), 1,
    'The head of a thin Chinese boy of thirteen in exact side profile, facing RIGHT, eyes half closed in calm concentration, '
    'lips softly parted breathing out, hair tied in a small topknot, a little of the neck and the collar of a patched hemp '
    'jacket. Only the head and neck. Ink lines and soft grey wash.'),
  'feather/bamboo': ('sprite', (900, 90), (1536, 256), 3,
    'ONE thin flat strip of split bamboo lying perfectly horizontal across the picture, pale muted yellow-green with two '
    'dark ink nodes. Ink and soft wash.'),
  # ── 喷嚏符 (wm-dabi): 何七 swings, 小满 yields.
  'sneeze/heqi-guard': ('sprite', (400, 600), (768, 1152), 2,
    'A big burly young Chinese martial disciple of about twenty, whole body seen from the side, facing LEFT, standing in a '
    'fighting stance on his feet, knees bent, his right fist drawn back at his hip and his left hand open in front of him, '
    'glaring. A plain grey Chinese cotton short jacket with a crossed collar, a WIDE soft cloth sash knotted at the side with its '
    'ends hanging (NOT a karate belt, NOT a gi), loose Chinese trousers bound at the shins with cloth strips, black cloth shoes, '
    'hair in a topknot with a cloth band. Old Chinese storybook figure. Ink lines and soft grey wash.'),
  'sneeze/heqi-punch': ('sprite', (520, 600), (1024, 1152), 2,
    'A big burly young Chinese martial disciple of about twenty, whole body seen from the side, facing LEFT, lunging forward '
    'and throwing a heavy straight punch to the LEFT with his right arm fully stretched out, front knee bent, back leg '
    'straight. A plain grey Chinese cotton short jacket with a crossed collar, a WIDE soft cloth sash knotted at the side with its '
    'ends hanging (NOT a karate belt, NOT a gi), loose Chinese trousers bound at the shins with cloth strips, black cloth shoes, '
    'hair in a topknot with a cloth band. Old Chinese storybook figure. Ink lines and soft grey wash.'),
  'sneeze/xiaoman': ('sprite', (360, 560), (768, 1152), 1,
    'A thin Chinese boy of thirteen, whole body seen from the side, facing RIGHT, standing light on his feet and leaning a '
    'little away, his right hand raised in front of his chest holding a small paper talisman between two fingers. A patched '
    'hemp jacket crossed at the front, rope belt, loose trousers, straw sandals, hair in a small topknot. Old Chinese '
    'storybook figure. Ink lines and soft grey wash.'),
  # 芦苇里那一等's 鯥 and shoal (lu/*) were here: a level of 砸寨 since 2026-10-20 (tools/paint-zhazhai-throws.py).
  'sneeze/stage': ('sprite', (960, 160), (1536, 256), 3,
    'The front edge of a low stone fighting platform seen from the side, a long horizontal strip of big grey dressed stone '
    'blocks running across the whole width, its top edge flat, a few cracks and moss. Grey ink wash and dark ink.'),
  # ── 时机's story levels (全文后的小游戏, 2026-10-26; kept seeds looked at 2 a piece; sneeze.js steps): each a stage strip, the other side idle and on
  #    its tell, and the hero. 今 levels are 沈芒 at the 沂中医 gym, the same ink as the 古.
  'shiji/shangya-stage': ('sprite', (960, 160), (1536, 256), 1,
    'A long horizontal strip of steep rock cliff face seen from the side, a narrow crack running across it with clumps of '
    'thorny wild brambles sprouting from it, wet with rain. Grey ink wash and dark ink.'),
  'shiji/biedou-stage': ('sprite', (960, 160), (1536, 256), 1,
    'A long horizontal strip of a plain wooden gym floor seen from the side, a bathroom weighing scale standing on it at one end. '
    'Grey ink wash and dark ink, modern setting drawn in old Chinese album style.'),
  'shiji/tuifeng-stage': ('sprite', (960, 160), (1536, 256), 1,
    'A long horizontal strip of steep ancient stone steps seen from the side, each step knee high, mist drifting over them. '
    'Grey ink wash and dark ink.'),
  'shiji/tuifeng-me': ('sprite', (360, 400), (768, 768), 1,
    'A thin Chinese boy of twelve crouching very low on all fours facing RIGHT, ready to crawl forward, a patched hemp '
    'jacket, straw sandals, hair in a small topknot. Old Chinese storybook figure. Ink lines and soft grey wash.'),
  'shiji/qingshi-stage': ('sprite', (960, 160), (1536, 256), 1,
    'A long horizontal strip of a bare rocky mountain clifftop seen from the side at night, flat stone ground with tufts of '
    'grass, moonlight. Grey ink wash and dark ink.'),
  'shiji/luobo-stage': ('sprite', (960, 160), (1536, 256), 1,
    'A long horizontal strip of a mountain herb garden bed seen from the side at night, dark earth and low herb plants. '
    'Grey ink wash and dark ink.'),
  # ── the second batch (全文后的小游戏 古五 → 古九, 2026-10-26): 时机 and 打地鼠 story levels, as the first batch's.
  #    第五回 · the 秘境: 凶崖 (the climb down, the torch below) · 踏马符 (邹青松's four snakes) · 翻板 (阿禾's warning) · 谷粒.
  #    第六回 · the 大比: 扣 (the fist held through the incense) · 接镜 (马小宝's beam) · 风掉头 (the pig talisman).
  'shiji/jiejing-stage': ('sprite', (960, 160), (1536, 256), 1,
    'The front edge of a low round stone fighting platform seen from the side at dusk, big grey stone blocks, frozen earth '
    'below. Grey ink wash and dark ink.'),
  #    今三 · 沂中医: the paper pad (严老师) · day one under the bar · the morning pulse.
  'shiji/zhizhen-stage': ('sprite', (960, 160), (1536, 256), 2,
    'A long horizontal strip of a modern laboratory bench seen from the side, a few thick pads of rough paper tied with thread '
    'and cotton balls on it. Grey ink wash and dark ink, modern setting drawn in old Chinese album style.'),
  'shiji/chenmai-stage': ('sprite', (960, 160), (1536, 256), 2,
    'A long horizontal strip of a cramped student dormitory at dawn seen from the side, bunk beds and a desk, still dark. '
    'Grey ink wash and dark ink, modern setting drawn in old Chinese album style.'),
  #    时机 → 打地鼠 (Hanli 10-26: 「还是用现有的类型吧」): each board's catcher; its overhead strip is its old stage strip.
  'rain/shangya-basin': ('sprite', (360, 200), (1024, 576), 1,
    'ONE small hand gripping a thorny bramble stem tight, a few thorns and leaves. Only the hand and wrist. Muted ink and soft wash on plain paper.'),
  'rain/qingshi-basin': ('sprite', (360, 200), (1024, 576), 1,
    'ONE clenched fist of a boy seen from the side, a faint warm golden glow around the knuckles. Only the fist and wrist. Muted ink and soft wash on plain paper.'),
  'rain/luobo-basin': ('sprite', (360, 200), (1024, 576), 1,
    'ONE big white radish with its green leaves, held out flat on an open palm. Only the hand and the radish. Muted ink and soft wash on plain paper.'),
  'rain/jiejing-basin': ('sprite', (360, 200), (1024, 576), 1,
    'ONE small broken round bronze hand mirror with a corner missing, held up face outward on an open palm. Only the hand and the mirror. Muted ink and soft wash on plain paper.'),
  'rain/zhizhen-basin': ('sprite', (360, 200), (1024, 576), 2,
    'ONE thin acupuncture needle standing upright, pushed straight into a small thick pad of rough paper tied with thread. Muted ink and soft wash on plain paper.'),
  'rain/chenmai-basin': ('sprite', (360, 200), (1024, 576), 2,
    'Two fingertips pressed on the inside of a wrist, feeling the pulse. Only the hand and the wrist. Muted ink and soft wash on plain paper.'),
  'rain/biedou-basin': ('sprite', (360, 200), (1024, 576), 1,
    'ONE pair of plastic skinfold calipers, pinching a fold of skin on an upper arm. Only the calipers and a bit of the arm. Muted ink and soft wash on plain paper.'),
  'rain/fanban-beam': ('sprite', (960, 200), (1536, 320), 1,
    'A long horizontal strip of a dim stone corridor floor seen from the side and a little above: a row of square old '
    'flagstones running across the whole width, one of them tilted open over a black pit. Grey ink wash and dark ink.'),
  'rain/fanban-basin': ('sprite', (360, 200), (1024, 576), 2,
    'A small raised open hand of a young girl held out palm forward in warning, a grey sleeve at the wrist. Only the hand '
    'and forearm, no face, no body. Muted ink and soft wash on plain paper.'),
  'rain/guli-beam': ('sprite', (960, 200), (1536, 320), 1,
    'A long horizontal strip of a wet cracked rock floor at the foot of a cliff seen from the side and a little above, '
    'water shining in the cracks. Grey ink wash and dark ink.'),
  'rain/guli-basin': ('sprite', (360, 200), (1024, 576), 2,
    'A young green vine bursting up out of a single blackened grain of rice, curling tendrils and three small leaves, '
    'seen from the front. Muted green-grey ink wash with dark ink veins.'),
}


def key_paper(src, dst, size, kind):
  """Paper → alpha (a sprite: trimmed to its ink; a pose: kept on its whole canvas), scaled to `size`; a vignette keeps its paper."""
  code = r'''
import sys, json
import numpy as np
from PIL import Image, ImageFilter
src, dst, (W, H), mode = sys.argv[1], sys.argv[2], json.loads(sys.argv[3]), sys.argv[4]
sprite = mode != 'vignette'
im = Image.open(src).convert('RGB')
if not sprite:
    # FLUX's paper drifts white: lay the picture on the house's warm paper (white → aged paper, ink stays ink).
    v = np.asarray(im).astype(np.float32) * np.array([0.96, 0.88, 0.75], np.float32)
    Image.fromarray(v.clip(0, 255).astype(np.uint8)).resize((W, H), Image.LANCZOS).save(dst, quality=84, method=6)
    sys.exit(0)
a = np.asarray(im).astype(np.float32) / 255.0
h, w, _ = a.shape
b = max(4, int(min(h, w) * 0.04))
band = np.concatenate([a[:b].reshape(-1, 3), a[-b:].reshape(-1, 3), a[:, :b].reshape(-1, 3), a[:, -b:].reshape(-1, 3)])
paper = np.median(band, axis=0)
# Paper unevenness: a heavy blur of the picture where it is near the paper colour is the local paper.
lum = a @ np.array([0.299, 0.587, 0.114], np.float32)
plum = float(paper @ np.array([0.299, 0.587, 0.114], np.float32))
dark = np.clip((plum - lum), 0, 1)
chroma = np.abs(a - paper).max(axis=2)
d = np.maximum(dark, chroma * 0.8)
lo, hi = 0.05, 0.42
alpha = np.clip((d - lo) / (hi - lo), 0, 1) ** 0.85
alpha[alpha < 0.06] = 0
am = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(3))
alpha = np.asarray(am).astype(np.float32) / 255.0
# fade a thin border to nothing, so no paper edge survives
ramp = np.ones((h, w), np.float32)
e = b
for i in range(e):
    f = i / e
    ramp[i, :] = np.minimum(ramp[i, :], f); ramp[-1 - i, :] = np.minimum(ramp[-1 - i, :], f)
    ramp[:, i] = np.minimum(ramp[:, i], f); ramp[:, -1 - i] = np.minimum(ramp[:, -1 - i], f)
alpha *= ramp
# A body is solid, not a ghost: what the ink outlines (its light wash included) is filled opaque, so the piece
# holds over any ground — the dark stream of a backdrop as well as the paper. Small gaps (between antler tines)
# stay open; only enclosed regions of some size that carry wash (not bare paper) fill.
import cv2
m = (alpha > 0.25).astype(np.uint8)
m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
flood = m.copy() * 255
cv2.floodFill(flood, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 128)
holes = (flood == 0).astype(np.uint8)
n_, lab, stats, _ = cv2.connectedComponentsWithStats(holes, connectivity=4)
big = np.zeros_like(holes)
for i in range(1, n_):
    here = lab == i
    # a hole of bare paper (the sky between antler tines) stays open; a washed one (a body, a basin's inside) fills
    # and a pinhole always fills
    if stats[i, cv2.CC_STAT_AREA] <= h * w * 0.0006 or float(d[here].mean()) > 0.035:
        big[here] = 1
if mode == 'solid':  # a pale body (ice) lighter than the paper: all within its ink's hull is it, in its painted colours
    ys_, xs_ = np.where(m > 0)
    hull = cv2.convexHull(np.stack([xs_, ys_], axis=1).astype(np.int32))
    big = np.zeros_like(holes)
    cv2.fillPoly(big, [hull], 1)
solid = cv2.GaussianBlur(((m | big) * 255).astype(np.uint8), (5, 5), 0).astype(np.float32) / 255.0
alpha = np.maximum(alpha, solid * 0.97)
# un-mix the paper: what composited over the paper gives back the picture
A = np.maximum(alpha, 1e-3)[..., None]
rgb = np.clip((a - paper * (1 - A)) / A, 0, 1)
# FLUX lays a cool grey where the house paints on its paper: warm it toward the paper's own tone,
# and never lighter than the paper (a body lighter than the page reads as a white cut-out).
warm = 1 - 0.55 * (1 - paper / paper.max())
rgb = np.minimum(rgb * warm, paper * 1.0)
if mode == 'solid':
    rgb = np.where(solid[..., None] > 0.5, a * 0.97, rgb)
rgba = np.dstack([rgb, alpha])
out = Image.fromarray((rgba * 255).astype(np.uint8), 'RGBA')
if mode == 'pose':  # one canvas for every pose of a creature: not trimmed, so they share a scale and a ground line
    out.resize((W, H), Image.LANCZOS).save(dst, quality=74, alpha_quality=55, method=6, exact=False)
    sys.exit(0)
# trim to the ink: rows/columns where enough of the piece is (paper grain leaves faint specks everywhere)
solid = alpha > 0.3
rows = np.where(solid.sum(axis=1) > max(3, w * 0.012))[0]
cols = np.where(solid.sum(axis=0) > max(3, h * 0.012))[0]
ys, xs = (rows, cols) if len(rows) and len(cols) else np.where(alpha > 0.04)
if len(xs):
    pad = 6
    out = out.crop((max(0, xs.min() - pad), max(0, ys.min() - pad), min(w, xs.max() + pad), min(h, ys.max() + pad)))
out.thumbnail((W, H), Image.LANCZOS)
out.save(dst, quality=74, alpha_quality=55, method=6, exact=False)
'''
  r = subprocess.run([str(PY), '-c', code, str(src), str(dst), json.dumps(list(size)), kind], capture_output=True, text=True)
  return r.returncode == 0 or print(r.stderr[-400:])


def flat_reference(ref, paint_size, erase=None):
  """A kept piece (keyed, with alpha) laid back on the house paper at the paint size: FLUX's edit reference.
  `erase` [x0, y0, x1, y1] (fractions of the piece) is cleared first: what the edit is to paint anew."""
  from PIL import Image
  im = Image.open(ref).convert('RGBA')
  if erase:
    alpha = im.getchannel('A')
    a, (W, H) = alpha.load(), im.size
    for y in range(int(erase[1] * H), int(erase[3] * H)):
      for x in range(int(erase[0] * W), int(erase[2] * W)):
        a[x, y] = 0
    im.putalpha(alpha)
  im = im.resize(paint_size, Image.LANCZOS)
  paper = Image.new('RGBA', paint_size, (236, 226, 204, 255))
  paper.alpha_composite(im)
  out = Path(tempfile.gettempdir()) / f'paint-games-ref-{Path(ref).stem}.png'
  paper.convert('RGB').save(out)
  return out


def paint_flux(png, subject, kind, paint_size, seed, reference=None, erase=None):
  alone = ALONE if kind != 'vignette' else ''
  req = {'model': MODEL, 'prompt': f'{subject} {alone} {OLD_CHINA} Style: {STYLE}', 'out': str(png),
         'width': paint_size[0], 'height': paint_size[1], 'seed': seed}
  if reference:  # the edit pass: the same creature, its pose changed (mlx_picture.py keeps the reference's shape)
    req['reference'] = str(flat_reference(ART / reference, paint_size, erase))
  env = dict(os.environ, HF_HOME=str(Path.home() / '.linggen/models/hf-hub'), HF_HUB_OFFLINE='1')
  r = subprocess.run([str(PY), str(SCRIPT)], input=json.dumps(req), text=True, capture_output=True, env=env)
  return None if r.returncode == 0 and png.exists() else (r.stdout.strip()[-200:] or r.stderr.strip()[-200:] or 'no picture')


def paint_codex(png, subject, kind, paint_size, model='gpt-6.1-sol'):
  aspect = 'portrait' if paint_size[1] > paint_size[0] else 'landscape' if paint_size[0] > paint_size[1] else 'square'
  alone = ALONE if kind != 'vignette' else ''
  ref = ART / 'creatures/qiuyu.webp'
  with tempfile.TemporaryDirectory() as d:
    from PIL import Image
    refpng = Path(d) / 'ref.png'
    Image.open(ref).convert('RGB').save(refpng)
    name = 'piece.png'
    prompt = (f'Use your image generation tool to make ONE new image in {aspect} orientation, then save it in the current directory '
              f'as {name}. The attached image is a STYLE reference only — do not copy its subject. Subject: {subject} {alone} '
              f'{OLD_CHINA} Style: {STYLE} Reply with the saved file path only.')
    subprocess.run(['codex', 'exec', '-m', model, '--skip-git-repo-check', '-s', 'workspace-write', '-i', str(refpng), '--', prompt],
                   cwd=d, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=900)
    if not (Path(d) / name).exists():
      return 'codex: no picture'
    Image.open(Path(d) / name).convert('RGB').resize(paint_size).save(png)
  return None


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--only', default='')
  ap.add_argument('--force', action='store_true')
  ap.add_argument('--seed', type=int, default=None, help='paint this seed instead of the kept one')
  ap.add_argument('--seeds', type=int, default=0, help='a review round: this many seeds a piece into --out')
  ap.add_argument('--out', default=None, help='paint into this folder instead of art/games/ (a review round)')
  ap.add_argument('--codex', action='store_true', help='paint with Codex instead of FLUX (a piece FLUX cannot do)')
  ap.add_argument('--brush', action='store_true', help='push harder to loose wet xieyi brushwork (the BRUSH line)')
  ap.add_argument('--raw', default=None, help='key this raw painting (a review round\'s raw/<id>-s<seed>.png) into --only\'s piece')
  a = ap.parse_args()
  if a.raw:
    kind, size = SUBJECTS[a.only][0], SUBJECTS[a.only][1]
    out = Path(a.out) / f'{a.only.replace("/", "-")}.webp' if a.out else OUT / f'{a.only}.webp'
    out.parent.mkdir(parents=True, exist_ok=True)
    print(a.only, 'ok' if key_paper(Path(a.raw), out, size, kind) else 'key failed', '→', out)
    return
  only = set(filter(None, a.only.split(',')))
  for key, (kind, size, paint_size, kept, subject, *ref) in SUBJECTS.items():
    if only and key not in only and key.split('/')[0] not in only:
      continue
    seeds = list(range(1, a.seeds + 1)) if a.seeds else [a.seed if a.seed is not None else kept]
    for seed in seeds:
      if a.out:
        out = Path(a.out) / f'{key.replace("/", "-")}-s{seed}.webp'
      else:
        out = OUT / f'{key}.webp'
      out.parent.mkdir(parents=True, exist_ok=True)
      if out.exists() and not a.force:
        print(f'{key} s{seed}: kept', flush=True)
        continue
      png = Path(tempfile.gettempdir()) / f'paint-games-{key.replace("/", "-")}-{seed}.png'
      said = f'{subject} {BRUSH}' if a.brush or key in BRUSHED else subject
      err = paint_codex(png, said, kind, paint_size) if a.codex else paint_flux(png, said, kind, paint_size, seed, *ref)
      if err:
        print(f'{key} s{seed}: failed: {err}', flush=True)
        continue
      ok = key_paper(png, out, size, kind)
      if a.out:  # a review round keeps the raw painting, so a kept seed is keyed again without repainting (--raw)
        (Path(a.out) / 'raw').mkdir(parents=True, exist_ok=True)
        png.replace(Path(a.out) / 'raw' / f'{out.stem}.png')
      png.unlink(missing_ok=True)
      print(f'{key} s{seed}: {"ok" if ok else "key failed"} → {out}', flush=True)


if __name__ == '__main__':
  main()
