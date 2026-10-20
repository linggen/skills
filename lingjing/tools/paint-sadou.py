#!/usr/bin/env python3
"""paint-sadou.py — 撒豆成兵's painted pieces on the local FLUX (FLUX.2 klein 4B, mflux 4-bit; Hanli's default painter;
the art benchmark 《向僵尸开炮》: chunky outlined cartoon, painted ground, props and light).

    PY=~/.linggen/runtime/envs/pictures/bin/python
    $PY tools/paint-sadou.py paint [--only id,…] [--seeds 1,2,3] [--force]   # every seed → $FLUX_REVIEW/sadou/, to be looked at
    $PY tools/paint-sadou.py cut                                             # the KEPT seeds → scripts/games/sadou/art/
    $PY tools/paint-sadou.py cut --only longzhi                              # one boss's frames only (the 黑松岭 boss)

`paint` writes every seed for review (fake glyphs, off-model, wrong view → not kept); KEPT names the seed taken.
A piece whose `ref` is another piece is an EDIT pass from that piece's kept seed (a run frame from its master, the
cursed gate from the good one), so a set stays one drawing. Pieces on flat green/magenta are keyed and trimmed; the
textures are made to tile top-to-bottom (a crossfade of the seam). `cut` also packs the crowd and the props into
one atlas (units.webp + units.json, Phaser's JSON-hash format), so hundreds of bean soldiers draw in one batch.

The beasts and the 合窳 boss are NOT painted here: they are 守墙关's frames (scripts/games/shouqiang/art/, the same
top-down 3/4 view, walking toward the viewer), shared across kits by doc/game-kit.md's rule — one 野猪 for every game.
The camera looks up the 山道 from behind the crowd: the soldiers are seen from BEHIND, running away from us.
"""
import argparse, json, os, subprocess, sys, time
from pathlib import Path

os.environ.setdefault('HF_HOME', str(Path.home() / '.linggen/models/hf-hub'))
os.environ.setdefault('HF_HUB_OFFLINE', '1')

HERE = Path(__file__).resolve().parent
GAME = HERE.parent / 'scripts' / 'games' / 'sadou' / 'art'
REVIEW = Path(os.environ.get('FLUX_REVIEW', '/tmp/flux-sadou-review')) / 'sadou'
MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'

STYLE = ('Bright cheerful cartoon mobile-game art in the manner of Angry Birds and polished Chinese casual mobile games: '
         'a bold clean dark-brown outline round every shape, flat saturated colours with simple cel shading and one '
         'soft glossy highlight, chunky rounded forms, a big readable silhouette. Old rural China / xianxia flavour.')
GREEN = ('The subject ALONE, centred, filling most of the picture, on a plain flat solid pure bright GREEN background '
         '(#00FF00) that runs to every edge: no ground, no cast shadow, no scenery, no text, no letters, no writing, '
         'no border, no frame.')
MAGENTA = GREEN.replace('GREEN', 'MAGENTA').replace('#00FF00', '#FF00FF')
NOTEXT = 'No text, no letters, no writing, no numbers, no signature, no border, no frame, no people.'
BACK = ('Seen in TOP-DOWN 3/4 VIEW from BEHIND and above (the camera high behind, looking down at about 50 degrees): we '
        'see the BACK of the figure and the top of its head, running AWAY from us toward the top of the picture.')
ABOVE = 'Seen in TOP-DOWN 3/4 VIEW from above and a little in front (the camera high, looking down at about 50 degrees).'
TEX = ('A seamless flat game texture seen STRAIGHT DOWN from directly above, filling the WHOLE picture edge to edge, no '
       'horizon, no perspective, evenly lit, in the cartoon game style: ')

SOLDIER = ('A tiny chubby BEAN SOLDIER (a magic soybean turned warrior, 撒豆成兵): its whole body is ONE big round glossy '
           'golden-yellow SOYBEAN with a little seam line, two stubby arms and two short stubby legs, wearing a small '
           'bright TEAL-BLUE paper helmet with a RED tassel on top, holding a short spear with a red tassel upright over '
           'its shoulder. Very simple chunky silhouette that reads at a tiny size.')

JOBS = {
  'soldier-1': dict(key='green', w=512, h=512, prompt=f'{SOLDIER} {BACK} Mid-run: the LEFT leg striding forward, the '
                    f'right leg kicked back. {STYLE} {GREEN}'),
  'soldier-2': dict(key='green', w=512, h=512, ref='soldier-1', prompt='The SAME bean soldier, the same view from '
                    'behind, the other stride: the RIGHT leg striding forward, the left leg kicked back, spear the same. '
                    f'{STYLE} {GREEN}'),
  'gate-good': dict(key='magenta', w=768, h=512, prompt=(
    'ONE Taoist TALISMAN GATE for a cartoon mobile game, seen from the FRONT and a little from above: two short red-'
    'lacquered wooden pillars with gold caps on the left and right, a curved green-tiled lintel roof across the top with '
    'upturned eaves and a small round gold medallion, and between the pillars a big EMPTY rectangular panel of glowing '
    'translucent BLUE-CYAN magic light, totally blank and plain inside, bright edges. The gate is twice as wide as tall. '
    f'{STYLE} {MAGENTA}')),
  'gate-bad': dict(key='magenta', w=768, h=512, ref='gate-good', prompt=(
    'The SAME gate turned CURSED: the pillars charred black with cracks, the lintel dark with torn yellow paper '
    'charms hanging, the glowing panel between the pillars a blank plain glowing DEEP RED light, totally empty inside. '
    f'{STYLE} {MAGENTA}')),
  'tex-road': dict(w=512, h=1024, prompt=TEX + (
    'an old mountain path paved with big irregular flagstones of warm grey and tan, worn smooth, dark gaps between the '
    'stones with tiny tufts of green grass and a few fallen leaves, soft dappled light. ' + STYLE + ' ' + NOTEXT)),
  'tex-side': dict(w=512, h=1024, prompt=TEX + (
    'a lush mountain forest floor: thick bright green grass, clumps of ferns, small yellow and white wildflowers, a few '
    'mossy pebbles, fallen pine needles, varied light and shade. ' + STYLE + ' ' + NOTEXT)),
  'edge': dict(key='magenta', w=384, h=1024, prompt=(
    'A long VERTICAL border strip running from the very top edge to the very bottom edge of the picture: a row of '
    'chunky mossy grey rocks and round stones packed together with tufts of grass and little ferns between them, '
    f'seen from above. {STYLE} The strip fills the middle third; left and right of it the background is flat solid '
    'MAGENTA (#FF00FF). ' + NOTEXT)),
  'pine': dict(key='magenta', w=512, h=512, prompt=(
    f'ONE round fluffy cartoon PINE TREE {ABOVE} a puffy layered dark-green crown with lighter green tips and a glossy '
    f'highlight, a short brown trunk. {STYLE} {MAGENTA}')),
  'rock': dict(key='magenta', w=512, h=384, prompt=(
    f'ONE chunky grey BOULDER with a patch of bright green moss on top and two grass tufts at its foot, {ABOVE} '
    f'{STYLE} {MAGENTA}')),
  'lantern': dict(key='magenta', w=384, h=512, prompt=(
    f'ONE old Chinese STONE LANTERN by a mountain road, a squat grey stone post with a little roofed lamp box glowing '
    f'warm orange inside, moss on its roof, {ABOVE} {STYLE} {MAGENTA}')),
  'log': dict(key='magenta', w=768, h=384, prompt=(
    'ONE big heavy rolling LOG lying horizontally across the picture, thick brown bark with knots, round pale sawn ends '
    f'showing growth rings at the left and right, a few iron spikes driven into it, {ABOVE} {STYLE} {MAGENTA}')),
  'spikes': dict(key='magenta', w=768, h=384, prompt=(
    'ONE wide shallow trap PIT in the ground, an oval of dark earth bristling with many sharp pointed bamboo stakes '
    f'sticking up at angles, broken grass round its rim, {ABOVE} {STYLE} {MAGENTA}')),
  'bean': dict(key='magenta', w=384, h=384, prompt=(
    f'ONE single glossy golden-yellow SOYBEAN, plump and oval with a small dark seam, a bright shine, faint golden '
    f'sparkles round it. {STYLE} {MAGENTA}')),
  # the 黑松岭 boss (level 5): 蠪侄 of 卷一's 序章 trial (creatures.json `longzhi`), in 守墙关's beast view — walking
  # TOWARD the viewer, top-down 3/4 — so it stands at the road's end like 合窳 does
  'longzhi-walk-1': dict(key='green', w=768, h=768, prompt=(
    'The LONGZHI boss beast of Chinese myth: a HUGE fox-like beast as big as an ox, sleek russet-orange fox body with a '
    'cream chest, NINE fluffy fox TAILS fanned out wide behind it like a peacock fan, NINE small fox HEADS on short '
    'necks clustered on its shoulders (one big middle head, four smaller heads each side), every head with sharp ears, '
    'glowing gold eyes and a wailing open mouth, big striped TIGER PAWS with long claws. Seen in TOP-DOWN 3/4 VIEW from '
    'above and in front (the camera high, looking down at about 50 degrees), walking straight TOWARD the viewer, its faces '
    f'toward us, menacing. {STYLE} {GREEN}')),
  'longzhi-hit': dict(key='green', w=768, h=768, ref='longzhi-walk-1', prompt=(
    'The SAME nine-headed nine-tailed fox beast HIT hard: recoiling backward, all its heads jerked back with eyes squeezed '
    'shut in a comic wince, mouths open in a yelp, a few fur tufts flying, the tails bristling. The same view, colours, '
    f'outline and size in the frame. {STYLE} {GREEN}')),
}
# the boss's frames: one cell per set, feet on the floor (paint-shouqiang.py's pack), loaded by the kit's `art: sadou`
BOSS = {'longzhi': 420}

# id: seed — chosen after looking at every seed in REVIEW (one subject, on-model, no fake glyphs).
KEPT = {'longzhi-walk-1': 1, 'longzhi-hit': 3, 'soldier-1': 3, 'gate-good': 3, 'tex-road': 3, 'tex-side': 2, 'edge': 3, 'pine': 1, 'rock': 2, 'lantern': 1, 'soldier-2': 1, 'gate-bad': 1, 'log': 1, 'spikes': 1, 'bean': 1}
# atlas frames (the crowd and every small sprite) and how big each one is drawn into it (longest side, px)
ATLAS = {'soldier-1': 96, 'soldier-2': 96, 'bean': 48, 'pine': 220, 'rock': 160, 'lantern': 140, 'log': 300,
         'spikes': 300}
# loose images (too big for the atlas, or tiled): longest side, px
LOOSE = {'gate-good': 420, 'gate-bad': 420, 'tex-road': 512, 'tex-side': 512, 'edge': 512}


# ---------------------------------------------------------------- painting
_model = {}


def busy():
  """Another FLUX job holds the GPU (a paint-*.py on mflux, the engine's mlx_picture.py, a bare mflux): wait."""
  r = subprocess.run(['pgrep', '-f', r'mlx_picture|mflux-generate|paint-.*flux|flux_comic'], capture_output=True, text=True)
  return any(int(p) != os.getpid() for p in r.stdout.split())


def model(edit):
  if edit in _model:
    return _model[edit]
  from huggingface_hub import snapshot_download
  from mflux.models.common.config.model_config import ModelConfig
  path, cfg = snapshot_download(MODEL), ModelConfig.flux2_klein_4b()
  if edit:
    from mflux.models.flux2.variants.edit.flux2_klein_edit import Flux2KleinEdit
    m = Flux2KleinEdit(model_config=cfg, model_path=path)
  else:
    from mflux.models.flux2.variants.txt2img.flux2_klein import Flux2Klein
    m = Flux2Klein(model_config=cfg, model_path=path)
  _model.clear()
  _model[edit] = m
  return m


def render(prompt, out, w, h, seed, ref=None):
  # wait for another painter's turn, but not forever: a queue that never yields would starve this one, and two
  # 4-bit klein runs share the GPU (and unified memory) fine, only slower
  t = time.time()
  while busy() and time.time() - t < 15:
    time.sleep(2)
  t0 = time.time()
  kw = dict(seed=seed, prompt=prompt, num_inference_steps=4, height=h, width=w, guidance=1.0)
  if ref:
    kw['image_paths'] = [str(ref)]
  img = model(bool(ref)).generate_image(**kw)
  out.parent.mkdir(parents=True, exist_ok=True)
  img.save(path=str(out))
  return time.time() - t0


def paint(a):
  only = [k for k in a.only.split(',') if k] or list(JOBS)
  for jid in only:
    j = JOBS[jid]
    ref = None
    if j.get('ref'):
      if j['ref'] not in KEPT:
        print(f'{jid}: its master {j["ref"]} has no kept seed yet — skipped', flush=True)
        continue
      ref = REVIEW / f'{j["ref"]}-{KEPT[j["ref"]]}.png'
    for seed in [int(s) for s in a.seeds.split(',')]:
      out = REVIEW / f'{jid}-{seed}.png'
      if out.exists() and not a.force:
        continue
      s = render(j['prompt'], out, j['w'], j['h'], seed, ref)
      print(f'{jid} {seed} → {out} ({s:.0f} s)', flush=True)


# ---------------------------------------------------------------- cutting
def key(src, kind):
  """Green or magenta → alpha by chroma distance, the spill pulled off the edges, specks dropped, trimmed."""
  import numpy as np, cv2
  from PIL import Image
  im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
  r, g, b = im[..., 0], im[..., 1], im[..., 2]
  if kind == 'magenta':
    spill = np.minimum(r, b) - g
    im[..., 0] = np.where(spill > 0, np.maximum(g, r - spill), r)
    im[..., 2] = np.where(spill > 0, np.maximum(g, b - spill), b)
  else:
    spill = g - np.maximum(r, b)
    im[..., 1] = np.where(spill > 0, np.maximum(r, b), g)
  alpha = cv2.GaussianBlur(np.clip(1 - (spill - 40) / 80, 0, 1), (3, 3), 0)
  a8 = (alpha * 255).astype(np.uint8)
  n, lab, stats, _ = cv2.connectedComponentsWithStats((a8 > 100).astype(np.uint8), 8)
  big = max(stats[1:, cv2.CC_STAT_AREA]) if n > 1 else 0
  for i in range(1, n):
    if stats[i, cv2.CC_STAT_AREA] < max(60, big * 0.01):
      a8[lab == i] = 0
  out = Image.fromarray(np.dstack([np.clip(im, 0, 255).astype(np.uint8), a8]), 'RGBA')
  return out.crop(out.getbbox())


def tile_v(im, band=0.12):
  """Tiles top-to-bottom: the bottom band is cross-faded into the top, then cut off."""
  import numpy as np
  from PIL import Image
  a = np.asarray(im.convert('RGBA')).astype(np.float32)
  h = a.shape[0]
  k = int(h * band)
  t = np.linspace(0, 1, k)[:, None, None]
  top = a[:k] * t + a[h - k:] * (1 - t)
  out = np.concatenate([top, a[k:h - k]], 0)
  return Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA')


def fit(im, side):
  from PIL import Image
  k = side / max(im.size)
  return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS) if k < 1 else im


def cut_boss(name, side):
  """A boss's frames (walk-1, hit) → webp on one cell: scaled to the same painted area, feet on the floor, centred."""
  import numpy as np
  from PIL import Image
  ids = [k for k in KEPT if k.startswith(f'{name}-')]
  ims = {k: key(REVIEW / f'{k}-{KEPT[k]}.png', JOBS[k]['key']) for k in ids}
  area = lambda im: (np.asarray(im)[..., 3] > 128).sum()
  first = f'{name}-walk-1'
  k0, a0 = side / max(ims[first].size), area(ims[first])
  sc = {k: im.resize((max(1, round(im.width * k0 * (a0 / area(im)) ** 0.5)), max(1, round(im.height * k0 * (a0 / area(im)) ** 0.5))), Image.LANCZOS)
        for k, im in ims.items()}
  cw, ch = max(i.width for i in sc.values()) + 4, max(i.height for i in sc.values()) + 4
  for k, im in sc.items():
    cell = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    cell.alpha_composite(im, ((cw - im.width) // 2, ch - 2 - im.height))
    cell.save(GAME / f'{k}.webp', 'WEBP', quality=88, method=6, exact=True)
    print(k, '→', GAME / f'{k}.webp', cell.size)


def cut(only=''):
  from PIL import Image
  GAME.mkdir(parents=True, exist_ok=True)
  if only:  # one boss set only: the atlas needs every kept seed of the first set, painted 10-20 and not kept on disk
    for name in only.split(','):
      cut_boss(name, BOSS[name])
    return
  pieces = {}
  for jid, seed in KEPT.items():
    j, src = JOBS[jid], REVIEW / f'{jid}-{seed}.png'
    im = key(src, j['key']) if 'key' in j else Image.open(src).convert('RGBA')
    if jid.startswith('tex-') or jid == 'edge':
      im = tile_v(im)
    pieces[jid] = im
  for jid, side in LOOSE.items():
    if jid in pieces:
      fit(pieces[jid], side).save(GAME / f'{jid}.webp', 'WEBP', quality=88, method=6, exact=True)
      print(jid, '→', GAME / f'{jid}.webp')
  # the atlas: shelf-packed, 2 px apart
  frames, x, y, row, W = {}, 2, 2, 0, 1024
  fitted = sorted(((j, fit(pieces[j], s)) for j, s in ATLAS.items() if j in pieces), key=lambda p: -p[1].height)
  for jid, im in fitted:
    if x + im.width + 2 > W:
      x, y, row = 2, y + row + 2, 0
    frames[jid] = (x, y, im)
    x, row = x + im.width + 2, max(row, im.height)
  H = 1 << (y + row + 2 - 1).bit_length()
  sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0))
  meta = {'frames': {}, 'meta': {'image': 'units.webp', 'size': {'w': W, 'h': H}, 'scale': '1'}}
  for jid, (fx, fy, im) in frames.items():
    sheet.alpha_composite(im, (fx, fy))
    meta['frames'][jid] = {'frame': {'x': fx, 'y': fy, 'w': im.width, 'h': im.height}, 'rotated': False,
                           'trimmed': False, 'spriteSourceSize': {'x': 0, 'y': 0, 'w': im.width, 'h': im.height},
                           'sourceSize': {'w': im.width, 'h': im.height}}
  sheet.save(GAME / 'units.webp', 'WEBP', quality=90, method=6, exact=True)
  (GAME / 'units.json').write_text(json.dumps(meta, indent=1) + '\n')
  print('atlas →', GAME / 'units.webp', f'{W}×{H}', list(frames))


if __name__ == '__main__':
  ap = argparse.ArgumentParser()
  ap.add_argument('cmd', choices=['paint', 'cut'])
  ap.add_argument('--only', default='')
  ap.add_argument('--seeds', default='1,2,3')
  ap.add_argument('--force', action='store_true')
  a = ap.parse_args()
  paint(a) if a.cmd == 'paint' else cut(a.only)
