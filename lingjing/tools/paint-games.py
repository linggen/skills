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
#   kind 'sprite' = keyed to alpha and trimmed to its ink; 'pose' = keyed, kept on its whole canvas (a creature's poses
#   share one scale and ground line); 'vignette' = kept whole, on its paper.
SUBJECTS = {
  # ── 射鹿 (00-deer): 「低着头在喝水，头上的角像一丛冬天的枯树枝」. Facing RIGHT; the hunter is to the left.
  'deer/stag-drink': ('pose', (640, 480), (1024, 768), 2,
    'A wild sika stag drinking, seen from the side, facing RIGHT: its neck stretched down and its muzzle lowered to the ground '
    'at the right as if drinking from a stream (no water shown), four slender legs planted, a short tail. On its head a big '
    'pair of branching antlers like a thicket of bare winter branches. Body in soft grey-brown ink wash with a faint muted '
    'ochre on the back, legs and antlers in confident dark ink strokes.'),
  'deer/stag-look': ('pose', (640, 480), (1024, 768), 2,
    'A wild sika stag standing alert, seen from the side, facing RIGHT, its head RAISED high and turned slightly toward the '
    'viewer, ears pricked, listening, four slender legs planted, a short tail. On its head a big pair of branching antlers '
    'like a thicket of bare winter branches. Body in soft grey-brown ink wash with a faint muted ochre on the back, legs and '
    'antlers in confident dark ink strokes.'),
  'deer/stag-walk': ('pose', (640, 480), (1024, 768), 1,
    'A wild sika stag walking slowly, seen from the side, facing RIGHT, mid-stride with one front leg lifted, head level, a '
    'short tail. On its head a big pair of branching antlers like a thicket of bare winter branches. Body in soft grey-brown '
    'ink wash with a faint muted ochre on the back, legs and antlers in confident dark ink strokes.'),
  'deer/stag-bolt': ('pose', (640, 480), (1024, 768), 1,
    'A wild sika stag bolting away in fright, seen from the side, facing RIGHT, in a full leaping gallop: all four slender legs '
    'stretched out, front legs reaching forward and back legs kicking back, body long and low, head forward, a short tail '
    'raised. On its head a big pair of branching antlers like a thicket of bare winter branches. Body in soft grey-brown ink '
    'wash with a faint muted ochre on the back, legs and antlers in confident dark ink strokes.'),
  'deer/stag-down': ('sprite', (640, 400), (1024, 640), 1,
    'A wild sika stag lying fallen on its side on the ground, seen from the side, legs folded, head and big branching antlers '
    'like bare winter branches resting low on the ground, still. A single arrow stands in its neck. Body in soft grey-brown ink '
    'wash with a faint muted ochre on the back, dark ink strokes.'),
  'deer/bow-rest': ('sprite', (320, 640), (512, 1024), 2,
    'An old Chinese hunting bow standing upright, seen from the side: ONE recurved wooden bow, its limbs wrapped round and '
    'round with dark sinew, a leather-wrapped grip in the middle, and ONE thin straight bowstring from tip to tip, at rest '
    '(not drawn). The wood a muted brown wash, the sinew in dark ink. No arrow, no hands, no person.'),
  'deer/bow-drawn': ('sprite', (400, 640), (640, 1024), 4,
    'An old Chinese hunting bow drawn to full, upright, seen exactly from the side: the curved wooden BACK of the bow bulges '
    'out to the RIGHT like a deep letter D, its two tips pulled toward the left, limbs wrapped round with dark sinew, a '
    'leather-wrapped grip in the middle. The thin bowstring is pulled far back to the LEFT into a sharp V whose point is '
    'well left of the grip. ONE arrow lies across the grip, its iron head pointing RIGHT past the bow, its feathered end '
    'held at the point of the V on the left. The wood a muted brown wash, the sinew in dark ink. No hands, no person.'),
  'deer/arrow': ('sprite', (640, 80), (1024, 256), 2,
    'ONE long wooden arrow lying perfectly horizontal, pointing RIGHT: a thin straight shaft, a small dark iron arrowhead at the '
    'right end, three grey feather fletchings at the left end. Ink strokes with a pale muted brown on the shaft.'),
  'deer/reed': ('sprite', (200, 560), (512, 1280), 3,
    'ONE single tall river reed growing straight up from the bottom edge of the picture: one thin stem with three or four '
    'long narrow leaves curving off it, one feathery seed plume at the top bending gently to the right. Loose xieyi '
    'brushstrokes in grey and dark ink, a faint muted ochre on the seed plume.'),
  'deer/reed-stub': ('sprite', (200, 200), (768, 768), 3,
    'ONE broken river reed: a short snapped-off stub of reed stem standing up from the bottom edge of the picture, its top '
    'split and frayed, one torn leaf hanging from it, a short tuft of grass at its foot. Grey and dark ink brushstrokes.'),
  'deer/branch': ('sprite', (640, 300), (1024, 512), 2,
    'ONE dead fallen branch lying horizontal: a bare grey weathered tree branch with no leaves, its thick broken-off base '
    'at the LEFT end, thinning and forking into a few broken twigs toward the RIGHT, gnarled, the bark cracked. Dry grey and dark ink brushstrokes, a faint muted brown.'),
  'deer/ink-hit': ('sprite', (400, 400), (768, 768), 3,
    'A single bold SOLID splash of black Chinese ink burst on paper: one round blot filled solid black all the way through '
    '(no hole, no ring, not hollow), a few flung drops and short flicks around it, the edges bleeding softly into the paper. '
    'Black ink only, nothing else.'),

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
  # ── 扔石听声 (00-cave, the throwing board, row caveecho): 「先往里扔了一块石头，听了听」. Side-on: the cave at the
  # LEFT (its deep end at the far left), the hillside and the mouth at the right where he throws from.
  'stone/cave': ('vignette', (960, 600), (1536, 960), 2,
    'ONE single continuous picture, not panels, not a diptych, no dividing line: a long low shallow cave in a cliff, cut away '
    'and seen from the side like a stage. A heavy overhang of rock runs along the whole top edge in dark ink and grey wash and '
    'comes down into a rock wall at the far LEFT edge; a flat dim earth floor with a few pebbles runs along the whole bottom; '
    'the hollow between is a dusky grey wash, deeper and darker toward the left. At the far RIGHT the overhang ends and the open '
    'dusk hillside with a little grass shows. No animals, no people, no fire.'),
  # ── 芦苇里那一等 (09-yishui, row luwing): the 鯥 pinned on the shoal, 「翅膀根上那块皮翻开来……露出底下粉红的肉」.
  'lu/lu': ('pose', (640, 480), (1024, 768), 1,
    'A mythical river beast of the Shanhaijing, the Lu: the body of an ox, crouched low and side-on, facing LEFT, an ox head with '
    'short curved horns lowered at the left, a long scaly snake tail curling behind it at the right, and on its flank a pair of '
    'bat-like wings half raised, thin dark membranes. Grey-green and muddy ink wash, a touch of dull pink only where the wing '
    'meets the body. Brambles twined round its hind legs.'),
  'lu/shoal': ('vignette', (960, 600), (1536, 960), 1,
    'A river shoal at night, a wide picture: dark slow water of a broad river across the left and the back, a flat grey mud shoal '
    'across the bottom middle, a tall dense stand of reeds at the RIGHT edge in dark ink, a thin mist over the water and a pale '
    'moon behind cloud high at the top. Quiet, dim, no animals, no people.'),

  'sneeze/stage': ('sprite', (960, 160), (1536, 256), 3,
    'The front edge of a low stone fighting platform seen from the side, a long horizontal strip of big grey dressed stone '
    'blocks running across the whole width, its top edge flat, a few cracks and moss. Grey ink wash and dark ink.'),
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
solid = cv2.GaussianBlur(((m | big) * 255).astype(np.uint8), (5, 5), 0).astype(np.float32) / 255.0
alpha = np.maximum(alpha, solid * 0.97)
# un-mix the paper: what composited over the paper gives back the picture
A = np.maximum(alpha, 1e-3)[..., None]
rgb = np.clip((a - paper * (1 - A)) / A, 0, 1)
# FLUX lays a cool grey where the house paints on its paper: warm it toward the paper's own tone,
# and never lighter than the paper (a body lighter than the page reads as a white cut-out).
warm = 1 - 0.55 * (1 - paper / paper.max())
rgb = np.minimum(rgb * warm, paper * 1.0)
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


def paint_flux(png, subject, kind, paint_size, seed):
  alone = ALONE if kind != 'vignette' else ''
  req = {'model': MODEL, 'prompt': f'{subject} {alone} {OLD_CHINA} Style: {STYLE}', 'out': str(png),
         'width': paint_size[0], 'height': paint_size[1], 'seed': seed}
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
  for key, (kind, size, paint_size, kept, subject) in SUBJECTS.items():
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
      err = paint_codex(png, said, kind, paint_size) if a.codex else paint_flux(png, said, kind, paint_size, seed)
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
