#!/usr/bin/env python3
"""paint-qimai-flux.py — 气走经脉's inner landscape (内景山水) on the local FLUX (Hanli 10-20: 「内景山水可以, 按你说的做」).

    PY=~/.linggen/runtime/envs/pictures/bin/python
    FLUX_REVIEW=<scratch> $PY tools/paint-qimai-flux.py paint [--only id,…] [--seeds 1,2,3]   # every seed, to be looked at
    FLUX_REVIEW=<scratch> $PY tools/paint-qimai-flux.py cut                                   # the KEPT seeds → scripts/games/qimai/art/

The meridian is a cloud road through mountains seen from the side; it scrolls. Per LAND (a level group, each its own
time of day): a static SKY, two parallax strips (FAR mountains, MID ridges — keyed on magenta, cut as A | mirror(A)
so a plain repeat-x never shows a seam) and a cliff ROCK texture (mirrored both ways: a seamless 2-D tile) that fills
the gorge walls outside the channel. Generic on purpose — no breath symbols in the land — so the 御剑 flight kit can
reuse the same layers. Sprites: the 灵珠 pearl and its glow (painted on black, keyed by brightness), the pass gates
(a gatehouse with a round moon-gate hole, cut in two at the hole's middle: the code opens them to each gate's gap),
the wind gust and the wave crest for currents and waves, and a small emblem per level for the title card.
"""
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flux_comic as fc  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / 'scripts' / 'games' / 'qimai' / 'art'
STYLE = fc.STYLE + ' A calm luminous dreamlike inner world: soft gradients, gentle mist.'
SCENE = fc.SCENE
MAG = ('Above them the background is ONE flat solid pure MAGENTA colour (#FF00FF), every pixel the same, up to the top '
       'edge: no sky, no glow, no gradient, no haze, no light behind the peaks.')

# a land: its sky, far peaks, mid ridges and cliff rock, all in one time of day
LANDS = {
  'dawn': dict(
    sky='a warm golden DAWN sky: a big soft pale-gold sun low near the bottom, peach and apricot glow fading up to '
        'pale cream, a few long thin golden clouds',
    far='distant soft hazy mountains in pale peach and lilac, tall rounded peaks with gentle mist lying between them',
    mid='rolling ochre and olive ridges with round cartoon pine trees on the crests and drifts of golden mist in the '
        'valleys',
    rock='natural rough warm sandstone CLIFF of irregular weathered boulders and slanted strata in ochre and honey-'
         'brown (not bricks, not a built wall, no masonry), deep cracks, a few tufts of green grass in the ledges'),
  'dusk': dict(
    sky='a glowing SUNSET sky: deep coral and tangerine near the bottom fading up to rose and dusky violet, a few '
        'long glowing pink clouds, the first faint star',
    far='distant soft hazy mountains in dusky rose and mauve, tall jagged-rounded peaks, low glowing mist',
    mid='red-brown rocky ridges with a few cartoon maple trees in orange and red autumn leaves on the crests, warm '
        'mist in the valleys',
    rock='natural rough red-brown and rust-orange CLIFF of irregular weathered boulders and slanted strata (not '
         'bricks, not a built wall, no masonry), deep cracks, a few small dry shrubs in the ledges'),
  'jade': dict(
    sky='a fresh SPRING morning sky: clear soft turquoise fading to pale mint near the bottom, puffy white rounded '
        'cartoon clouds',
    far='distant soft hazy jade-green karst peaks, tall rounded sugar-loaf mountains, white mist and a thin white '
        'waterfall ribbon down one cliff',
    mid='lush green rounded ridges with round cartoon pine trees and bamboo clumps on the crests, white mist in the '
        'valleys',
    rock='mossy grey-green cliff face with chunky rounded stones and cracks, bright green moss and little ferns in '
         'the ledges'),
  'mist': dict(
    sky='a quiet MISTY morning sky: soft silver-blue and pearl grey, very pale, layers of thin white fog, a faint '
        'pale sun disc behind the haze',
    far='distant pale blue-grey mountains half lost in white fog, tall soft peaks, layered mist bands',
    mid='blue-green ridges with tall slender cartoon bamboo groves on the crests swaying, thick white fog in the '
        'valleys',
    rock='cool slate-blue and grey cliff face with chunky rounded layers and cracks, dew-wet, small ferns in the '
         'ledges'),
  'moon': dict(
    sky='a calm MOONLIT NIGHT sky: deep indigo-blue at the top fading to soft blue near the bottom, a big round pale '
        'glowing full moon, a few small twinkling stars, thin silver clouds',
    far='distant dark blue mountains with silver moonlit edges, tall soft peaks, pale blue mist between them',
    mid='dark teal-blue ridges with round cartoon pine trees in silhouette with silver rim light on the crests, '
        'pale moonlit mist in the valleys',
    rock='dark blue-grey cliff face lit by cool moonlight, chunky rounded layers and cracks, silver highlights on '
         'the edges'),
  'star': dict(
    sky='a deep violet STARRY night sky full of stars: a glowing band of the Milky Way across it in soft lilac and '
        'teal, purple fading to deep blue, little sparkling stars',
    far='distant dark violet mountains with soft lilac glowing edges, tall rounded peaks, purple mist',
    mid='deep purple ridges with round cartoon pine trees in silhouette rimmed with soft lilac starlight, glowing '
        'violet mist in the valleys',
    rock='deep violet and indigo cliff face with chunky rounded layers and cracks, small glowing lilac crystals in '
         'a few cracks'),
}

JOBS = {}
for land, d in LANDS.items():
  JOBS[f'sky-{land}'] = dict(w=1024, h=640, prompt=(
    f'A wide empty sky backdrop for a side-scrolling cartoon game: {d["sky"]}. Only sky, no mountains, no ground, '
    f'no trees, no buildings. {STYLE} {SCENE}'))
  JOBS[f'far-{land}'] = dict(key='magenta', w=1024, h=448, prompt=(
    f'A wide side-view panorama for a side-scrolling cartoon game: {d["far"]}, spread evenly across the whole width '
    f'and running off both sides, no single landmark, no buildings. The mountains rise from the bottom edge to about '
    f'the middle of the picture. {MAG} {STYLE} {SCENE}'))
  JOBS[f'mid-{land}'] = dict(key='magenta', w=1024, h=448, prompt=(
    f'A wide side-view panorama for a side-scrolling cartoon game: {d["mid"]}, spread evenly across the whole width '
    f'and running off both sides, no single landmark, no buildings. The ridges fill the lower half of the picture. '
    f'{MAG} {STYLE} {SCENE}'))
  JOBS[f'rock-{land}'] = dict(w=768, h=768, prompt=(
    f'A seamless flat game texture of a {d["rock"]}, seen straight on from the front, filling the WHOLE picture edge '
    f'to edge, no sky, no horizon, evenly lit. {STYLE} {SCENE}'))

GATE = ('a thick old fortress gate wall seen straight from the front, with ONE big perfectly ROUND moon-gate opening '
        'right in its middle (a round hole straight through the wall, the background showing through the hole), ')
JOBS.update({
  'pearl': dict(key='magenta', w=512, h=512, prompt=(
    'ONE glowing magic spirit PEARL: a perfectly round glossy pearl of pale luminous white-cyan with a soft inner glow, '
    'a big bright glossy highlight at the top left and a thin bold dark outline. ' + STYLE + ' ' + fc.ON_MAGENTA)),
  'glow': dict(key='black', w=512, h=512, prompt=(
    'A soft round glow of pale cyan-white light in the middle of the picture, bright at the centre and fading '
    'smoothly to nothing, a few faint sparkles round it, on a plain pure BLACK background that runs to every edge. '
    'Nothing else. No text, no letters, no border.')),
  'gate-weilv': dict(key='magenta', w=768, h=768, prompt=(
    'A cartoon mountain PASS GATE: ' + GATE + 'built of huge heavy dark grey stone blocks with moss, a low sturdy '
    'wall with a grey tiled roof and upturned eaves on top, a stone base at the bottom, the round opening rimmed with '
    'a thick ring of pale carved stone. No plaque, no writing. ' + STYLE + ' ' + fc.ON_MAGENTA)),
  'gate-jiaji': dict(key='magenta', w=768, h=768, prompt=(
    'A cartoon mountain PASS GATE: ' + GATE + 'a tall red-lacquered wooden gate tower with two storeys of green tiled '
    'roofs with upturned eaves on top, red wooden pillars and beams, the round opening rimmed with a thick gold-'
    'painted ring. No plaque, no writing. ' + STYLE + ' ' + fc.ON_MAGENTA)),
  'gate-yuzhen': dict(key='magenta', w=768, h=768, prompt=(
    'A cartoon mountain PASS GATE: ' + GATE + 'made of smooth pale white-green JADE with soft carved cloud scrolls, '
    'an elegant curved jade roof with upturned eaves on top, faintly glowing, the round opening rimmed with a thick '
    'ring of bright pale jade. No plaque, no writing. ' + STYLE + ' ' + fc.ON_MAGENTA)),
  'gate-pass': dict(key='magenta', w=768, h=768, prompt=(
    'A cartoon natural ROCK ARCH: a thick craggy slab of brown-grey mountain rock seen straight from the front with '
    'ONE big perfectly ROUND hole worn straight through its middle (the background showing through the hole), moss '
    'and a small pine tuft on top, grass at its foot. ' + STYLE + ' ' + fc.ON_MAGENTA)),
  'gust': dict(key='magenta', w=768, h=384, prompt=(
    'ONE cartoon WIND GUST blowing from left to right: three long curling swooshing streaks of pale white-cyan air '
    'with soft swirls at their tails and pointed tips at the right, like a comic wind effect, nothing else. '
    + STYLE + ' ' + fc.ON_MAGENTA)),
  'wave': dict(key='magenta', w=768, h=384, prompt=(
    'ONE cartoon curling WAVE CREST of glowing turquoise water rolling from left to right and curling DOWN, white '
    'foam on its lip and a few droplets, like a comic water effect, nothing else. ' + STYLE + ' ' + fc.ON_MAGENTA)),
})

# a small emblem per level (the title card's mark, in place of the big faint glyph); no writing on any of them
EMBLEMS = {
  'feather': 'a single soft white goose FEATHER',
  'xisui': 'a small round wooden wash basin full of glowing clear water',
  'zhoutian': 'a round flat pale jade BI disc with a hole in the middle',
  'xirang': 'a small clod of rich brown earth with a tiny green sprout on top',
  'cangxi': 'a closed pink LOTUS bud on a short stem with one round green leaf',
  'ding': 'a colourful paper PINWHEEL on a small stick',
  'qianmi': 'a white fluffy DANDELION seed head',
  'faqiu': 'a round stitched leather cuju BALL',
  'dark': 'a small clay OIL LAMP with a tiny warm flame',
  'lastshot': 'a small red war DRUM',
  'chongmai': 'a big glossy drop of glowing turquoise WATER',
  'daimai': 'a knotted red silk SASH belt',
  'dazhoutian': 'a golden crescent MOON with one small star beside it',
}
for lid, what in EMBLEMS.items():
  JOBS[f'em-{lid}'] = dict(key='magenta', w=512, h=512, prompt=f'ONE small game icon: {what}. {STYLE} {fc.ON_MAGENTA}')

# id: seed — chosen after looking at every seed (no fake glyphs, one subject, the view asked for).
KEPT = {f'{k}-{land}': 1 for land in LANDS for k in ('sky', 'far', 'mid', 'rock')}
KEPT.update({'rock-dawn': 2, 'rock-dusk': 2, 'pearl': 2, 'glow': 1, 'gust': 2, 'wave': 1, 'gate-weilv': 1, 'gate-jiaji': 1, 'gate-yuzhen': 1, 'gate-pass': 1})
# a point inside each kept gate's round hole (px in its 768² picture), where the flood that cuts it starts
KEPT.update({f'em-{lid}': 1 for lid in EMBLEMS})
HOLE = {'gate-weilv': (384, 368), 'gate-jiaji': (384, 514), 'gate-yuzhen': (384, 437), 'gate-pass': (384, 407)}
# longest side (px) each piece ships at
SIZE = {'sky': 1024, 'far': 1536, 'mid': 1536, 'rock': 512, 'pearl': 96, 'glow': 160, 'gate': 384, 'gust': 256,
        'wave': 256, 'em': 160}


def key_black(src):
  """Light on black → alpha by brightness, colour un-premultiplied (a glow for a screen of light)."""
  import numpy as np
  from PIL import Image
  im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32) / 255
  a = np.clip((im.max(axis=2) - 0.04) / 0.96, 0, 1)
  rgb = np.where(a[..., None] > 0, np.clip(im / np.maximum(a[..., None], 1e-3), 0, 1), 0)
  out = Image.fromarray((np.dstack([rgb, a]) * 255).astype(np.uint8), 'RGBA')
  return out.crop(out.getbbox())


def mirror_x(im):
  from PIL import Image, ImageOps
  out = Image.new('RGBA', (im.width * 2, im.height))
  out.paste(im, (0, 0)); out.paste(ImageOps.mirror(im), (im.width, 0))
  return out


def tile_xy(im, band=0.14, shade=0.8):
  """A seamless 2-D tile (a mirrored rock reads as a kaleidoscope): the far band of each axis cross-faded into the
  near one, then cut off; darkened a little so the lit channel stands out against the gorge."""
  import numpy as np
  from PIL import Image
  a = np.asarray(im.convert('RGB')).astype(np.float32)
  for axis in (0, 1):
    n = a.shape[axis]
    k = int(n * band)
    t = np.linspace(0, 1, k).reshape((-1, 1, 1) if axis == 0 else (1, -1, 1))
    head, tail = np.take(a, range(k), axis), np.take(a, range(n - k, n), axis)
    a = np.concatenate([head * t + tail * (1 - t), np.take(a, range(k, n - k), axis)], axis)
  return Image.fromarray((a * shade).clip(0, 255).astype(np.uint8), 'RGB')


def punch(src, im, seed):
  """The gate's round hole comes back painted (sky in it): flood it from `seed` (x, y in the 768² picture) up to the
  ring's dark outline and make it transparent, on the untrimmed keyed picture."""
  import numpy as np, cv2
  from PIL import Image
  rgb = np.asarray(Image.open(src).convert('RGB')).copy()
  mask = np.zeros((rgb.shape[0] + 2, rgb.shape[1] + 2), np.uint8)
  cv2.floodFill(rgb, mask, seed, (0, 0, 0), (14, 14, 14), (14, 14, 14), 4 | cv2.FLOODFILL_MASK_ONLY | (255 << 8))
  m = cv2.dilate(mask[1:-1, 1:-1], np.ones((5, 5), np.uint8)) > 0
  a = np.asarray(im).copy()
  a[m, 3] = 0
  out = Image.fromarray(a, 'RGBA')
  return out.crop(out.getbbox())


def hole(im):
  """The round hole of a keyed gate: the transparent region not touching the border → (cy, r) as shares of height."""
  import numpy as np, cv2
  a = np.asarray(im)[..., 3]
  n, lab, stats, cen = cv2.connectedComponentsWithStats((a < 60).astype(np.uint8), 4)
  h, w = a.shape
  best = None
  for i in range(1, n):
    x, y, bw, bh, area = stats[i]
    if x == 0 or y == 0 or x + bw >= w or y + bh >= h:
      continue
    if best is None or area > stats[best][4]:
      best = i
  if best is None:
    raise SystemExit('gate: no enclosed hole')
  x, y, bw, bh, _ = stats[best]
  return dict(cx=round((x + bw / 2) / w, 4), cy=round((y + bh / 2) / h, 4), rx=round(bw / 2 / w, 4), ry=round(bh / 2 / h, 4))


def cut():
  from PIL import Image
  OUT.mkdir(parents=True, exist_ok=True)
  meta = {'gates': {}}
  for jid, seed in KEPT.items():
    j, src = JOBS[jid], fc.REVIEW / 'qimai' / f'{jid}-{seed}.png'
    kind = jid.split('-')[0]
    if j.get('key') == 'black':
      im = key_black(src)
    elif kind == 'gate':
      im = punch(src, fc.key_green(src, trim=False, key='magenta'), HOLE[jid])
    elif kind == 'pearl':  # its pink halo goes entirely (a tighter key), the dark outline is the edge
      im = fc.key_green(src, key='magenta', spill_lo=8, spill_hi=24)
    elif 'key' in j:
      im = fc.key_green(src, trim=kind not in ('far', 'mid'), key=j['key'])
    else:
      im = Image.open(src).convert('RGBA')
    if kind in ('far', 'mid'):
      im = mirror_x(im)
    if kind == 'rock':
      im = tile_xy(im)
    if kind == 'gate':
      meta['gates'][jid[5:]] = {**hole(im), 'aspect': round(im.width / im.height, 4)}
    q = 80 if kind in ('sky', 'rock') else 88
    out = fc.save_webp(im, OUT / f'{jid}.webp', max_side=SIZE[kind], quality=q)
    if kind in ('far', 'mid', 'sky'):
      meta[jid] = {'w': out.width, 'h': out.height}
    print(jid, '→', OUT / f'{jid}.webp', out.size)
  (OUT / 'art.json').write_text(json.dumps(meta, indent=1, ensure_ascii=False) + '\n')
  print('ART =', json.dumps(meta, separators=(',', ':')))
  print('EMBLEMS =', json.dumps(sorted(k[3:] for k in KEPT if k.startswith('em-'))))


if __name__ == '__main__':
  a = fc.run(JOBS)
  if a.cmd == 'paint':
    fc.paint_all('qimai', JOBS, a)
  else:
    cut()
