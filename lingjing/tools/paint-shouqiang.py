#!/usr/bin/env python3
"""paint-shouqiang.py — 守墙关 (wall defense)'s painted pieces, comic style (STYLE RULING 2026-10-19; Hanli 10-20:
「主力是这个游戏做的漂亮, 好看, 好玩」, the art benchmark 《向僵尸开炮》).

    python3 tools/paint-shouqiang.py paint [--only id,id] [--force] [--jobs 4]
    python3 tools/paint-shouqiang.py flux [--only id,id] [--force] [--seed N]
    python3 tools/paint-shouqiang.py pack

`paint`: Codex paints each piece (masters first; a beast's other frames, and every icon after the first, carry their
master so a set stays one model). Pieces on flat green are keyed by chroma (paint-shoulu.py's key — white coats
survive), trimmed: art/games/shouqiang/<id>.webp (+ <id>.green.webp, the raw painting). The 山道 is a full scene.
`flux`: the LOCAL FLUX (FLUX.2 klein 4B edit, the recipe of paint-laobing-flux.py, deleted 2026-10-20 — in git history) for a piece that has a master — used
2026-10-20 when Codex ran out of credits mid-set (the skill icons after the first, xiaoman-cast): the master is the
reference, so the medallion / the boy keeps its shape and only the colours and emblem / pose change.
`pack`: sized for phones and written as webp into scripts/games/shouqiang/art/ (what the game loads).

Views: the camera looks down the 山道 from behind the wall (top-down 3/4). Beasts come TOWARD the viewer; 小满 stands
on the wall with his back to us, facing up the road. 银月 is 守炉's (scripts/games/shoulu/art/yinyue*.webp, reused as is).
"""
import argparse, subprocess, tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
ART = HERE.parent / 'worlds' / 'jiuding' / 'art'
SRC = ART / 'games' / 'shouqiang'
GAME = HERE.parent / 'scripts' / 'games' / 'shouqiang' / 'art'
STYLE_REF = HERE.parent / 'scripts' / 'games' / 'zhazhai' / 'art' / 'weasel-m.webp'
MODEL = 'gpt-6.1-sol'  # gpt-5.5 is refused on a ChatGPT-account Codex (2026-10-20, paint-shoulu.py)

STYLE = ('Bright cheerful cartoon mobile-game art in the manner of Angry Birds and top Chinese mobile tower-defense games: '
         'a bold clean dark outline round every shape, flat saturated colours with simple cel shading and one soft '
         'glossy highlight, chunky rounded forms, big expressive eyes where there is a face. Old rural China / xianxia flavour.')
ALONE = ('The subject ALONE, centred, filling most of the picture, on a plain flat solid pure GREEN background (#00FF00): '
         'no ground, no cast shadow, no scenery, no text, no letters, no border, no frame.')
TOWARD = ('Seen in TOP-DOWN 3/4 VIEW from above and in front (the camera high, looking down at about 50 degrees), the '
          'creature walking straight TOWARD the viewer, down the picture, its face toward us.')
BACK = ('Seen in TOP-DOWN 3/4 VIEW from BEHIND and above (the camera high behind, looking down at about 50 degrees): '
        'we see the BACK of the figure and the top of the head, facing AWAY from us toward the top of the picture.')
XIAOMAN = ('Xiaoman, a 12-year-old village boy cultivator, chibi proportions with a big head: black hair in a small topknot '
           'tied with a red cord, a plain off-white hemp tunic with a dark sash, rolled grey trousers, straw sandals, a '
           'little cloth pouch of yellow talismans on his hip.')

# id: (references, view, subject). Ref kinds: who:<path> (+ style), master:<id>, style.
BEASTS = {
  'yezhu': ('creatures/yezhu.webp', 'A chunky wild BOAR: black bristly mane, dark brown mud-caked hide, two white tusks curling up, '
            'small angry red eyes, a big snout, short stubby legs, tiny curly tail.'),
  'zheng': ('creatures/zheng.webp', 'A ZHENG: a round chubby RED leopard-like beast, a red fur ball with dark spots, ONE single '
            'horn on its forehead, FIVE fluffy tails fanning out behind, fierce yellow eyes, small fangs.'),
  'qiuyu': ('creatures/qiuyu.webp', 'A QIUYU: a hare-sized armoured beast, a round body covered in hard olive-green armour '
            'plates like an armadillo, a hooked yellow BIRD BEAK, big round orange OWL eyes, long hare ears, a thin snake tail.'),
  'qique': ('qique.webp', 'A QIQUE flying bird-beast: a plump chicken-like bird with a WHITE head, a red comb, dark slate-blue '
            'wings spread wide, mouse-like pink feet with big orange TIGER CLAWS, a fierce yellow beak, angry eyes.'),
  'heyu': ('heyu.webp', 'The HEYU boss: a HUGE fat pig-beast bigger than an ox, yellow fur, a long fiery RED tail like a flame '
           'behind, a creepy round HUMAN face (pale, chubby baby-like cheeks, small eyes, pouting mouth) on the pig head, '
           'sharp tusks, heavy hooves, menacing.'),
}
FRAMES = {}
for b, (who, look) in BEASTS.items():
  fly = b == 'qique'
  FRAMES[f'{b}-walk-1'] = (f'who:{who}', TOWARD, look + (' Flying toward the viewer, wings raised high.' if fly else
                           ' Mid-stride: the LEFT front leg reaching forward, the right hind leg pushing back.'))
  FRAMES[f'{b}-walk-2'] = (f'master:{b}-walk-1', TOWARD, ('The same bird, the wings swept DOWN in a flap.' if fly else
                           'The same creature, the other stride: the RIGHT front leg reaching forward, the left hind leg back.'))
  FRAMES[f'{b}-hit'] = (f'master:{b}-walk-1', TOWARD, 'The same creature HIT hard: recoiling backward, head jerked back, eyes '
                        'squeezed shut in a comic X-ish wince, mouth open in a yelp, a few fur tufts flying.')

FRAMES.update({
  'xiaoman-idle': ('who:people/xiaoman.webp', BACK, XIAOMAN + ' Standing ready on the wall walkway, feet apart, his right hand '
                   'raised in front of him in a two-finger sword sign, a glowing blue flying sword hovering beside his shoulder.'),
  'xiaoman-cast': ('master:xiaoman-idle', BACK, 'The SAME boy casting: right arm thrust forward and up toward the top of the '
                   'picture, flinging a glowing yellow paper talisman that bursts into light, the blue flying sword shooting '
                   'forward, his robe and hair whipping back.'),
  'fu-huo': ('style', '', 'ONE Taoist FIRE talisman: a narrow strip of yellow paper with red brush swirls (no readable writing), '
             'its edges wrapped in bright orange flames, glowing.'),
  'fu-han': ('style', '', 'ONE Taoist FROST talisman: a narrow strip of pale blue paper with white swirls (no readable writing), '
             'ice crystals growing on its edges, frosty white-cyan glow.'),
})

ICON = ('A glossy ROUND mobile-game skill icon: a perfect circular medallion with a rich radial GRADIENT background ({bg}), '
        'a thick shiny GOLD rim, a soft inner glow, and inside it ONE bold chunky cartoon emblem: {what}. No text, no numbers.')
ICONS = {
  'icon-jian-more': ('deep blue to bright cyan', 'three glowing silver flying swords fanned out pointing up'),
  'icon-jian-pierce': ('indigo to sky blue', 'one glowing flying sword piercing straight through two small red targets in a line'),
  'icon-jian-arc': ('teal to aqua', 'a flying sword swinging round in a sideways arc, a glowing circular trail behind it'),
  'icon-huo-blast': ('dark red to bright orange', 'a yellow talisman exploding into a big round fireball burst'),
  'icon-huo-ground': ('crimson to amber', 'a patch of ground with tall flames burning on it, cracked glowing earth'),
  'icon-han-slow': ('navy to icy cyan', 'a pale blue talisman with a big white snowflake'),
  'icon-han-freeze': ('deep blue to white-cyan', 'a big chunky block of ice with a small paw frozen inside it'),
  'icon-lei-chain': ('dark purple to violet', 'a jagged bright yellow-white lightning bolt zig-zagging between three dots'),
  'icon-lei-strike': ('midnight blue to purple', 'a huge thunderbolt falling from a dark cloud onto the ground'),
  'icon-yy-foxfire': ('deep teal to silver-blue', 'a blue-white fox-fire flame shaped like a fox head'),
  'icon-yy-howl': ('violet to silver', 'a silver fox head howling up at a gold crescent moon, sound rings round it'),
}
for i, (k, (bg, what)) in enumerate(ICONS.items()):
  FRAMES[k] = ('style' if i == 0 else 'master:icon-jian-more', '', ICON.format(bg=bg, what=what)
               + (' Same medallion shape, rim and rendering as the attached master icon; only the colours and emblem change.' if i else ''))

SCENES = {
  'bg': 'A TALL PORTRAIT game background (2:3), TOP-DOWN 3/4 VIEW looking down a mountain road from above: a wide winding '
        'stone-paved mountain path (山道) running from the top edge straight down to the bottom edge, filling the middle '
        'two-thirds of the width, worn flagstones with grass in the cracks, a few broken stone steps. Both sides: green pine '
        'trees seen from above, mossy boulders, a small stone lantern, a toppled stone tablet, bamboo, ferns, a wooden '
        'signpost, fallen leaves. The top is misty and darker (deep forest), the bottom is open flat paved stone. Daylight '
        'from the upper left. NO characters, NO creatures, NO buildings, NO wall, NO text. Painted in this style: ' ,
  'wall': 'A WIDE landscape (3:2) game prop: a long Chinese mountain-gate stone rampart (山门城墙) running straight across the '
          'whole width, seen in TOP-DOWN 3/4 VIEW from behind and above: the flat stone walkway on top is visible, '
          'crenellated grey stone battlements along its FAR edge, warm grey stone blocks, mossy, two small wooden watchtower '
          'roofs with curved red-brown tiled eaves at the LEFT and RIGHT ends, red banners and two paper lanterns. The '
          'middle of the walkway is open and empty. Fill the full width. Painted in this style: ',
}


def refs(kind, d):
  from PIL import Image
  def put(name, path):
    p = Path(d) / name
    Image.open(path).convert('RGBA').save(p)
    return ['-i', str(p)]
  style = put('style.png', STYLE_REF)
  if kind.startswith('who:'):
    return put('who.png', ART / kind[4:]) + style, ('The first attached image shows WHO it is (an old ink painting: keep who '
           'it is, redraw it fully in cartoon); the second shows the cartoon STYLE of a sibling game (its subject is unrelated).')
  if kind.startswith('master:'):
    return put('master.png', SRC / f'{kind[7:]}.green.webp'), ('The attached image is the MASTER drawing: the SAME subject, same '
           'cartoon style, colours, outline weight, proportions and size in the frame; only what is described changes.')
  return style, 'The attached image shows the cartoon STYLE of a sibling game (its subject is unrelated).'


def paint(key, force):
  scene = key in SCENES
  dst = SRC / f'{key}.webp'
  if dst.exists() and not force:
    return f'{key}: kept'
  with tempfile.TemporaryDirectory() as d:
    if scene:
      args, lead = refs('style', d)
      shape = 'tall portrait' if key == 'bg' else 'wide landscape'
      what = SCENES[key] + STYLE + (' On a plain flat solid pure GREEN background (#00FF00) round the prop.' if key == 'wall' else '')
      prompt = (f'Use your image generation tool to make ONE new {shape} image, then save it in the current directory as '
                f'frame.png. {lead} {what} Reply with the saved file path only.')
    else:
      kind, view, subject = FRAMES[key]
      args, lead = refs(kind, d)
      prompt = (f'Use your image generation tool to make ONE new square image, then save it in the current directory as '
                f'frame.png. {lead} Subject: {subject} {view} Style: {STYLE} {ALONE} Reply with the saved file path only.')
    try:
      subprocess.run(['codex', 'exec', '-m', MODEL, '--skip-git-repo-check', '-s', 'workspace-write', *args, '--', prompt],
                     cwd=d, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=900)
    except subprocess.TimeoutExpired:
      return f'{key}: no picture in 15 minutes'
    src = Path(d) / 'frame.png'
    if not src.exists():
      return f'{key}: codex made no picture'
    from PIL import Image
    if key == 'bg':
      Image.open(src).convert('RGB').save(dst, quality=90)
    else:
      Image.open(src).convert('RGB').save(SRC / f'{key}.green.webp', quality=90)
      key_green(src, dst)
  return f'{key}: painted'


def key_green(src, dst):
  """Green → alpha (chroma distance), green spill pulled off the edges, trimmed (paint-shoulu.py's key)."""
  import numpy as np, cv2
  from PIL import Image
  im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
  r, g, b = im[..., 0], im[..., 1], im[..., 2]
  spill = g - np.maximum(r, b)
  alpha = np.clip(1 - (spill - 40) / 80, 0, 1)
  alpha = cv2.GaussianBlur(alpha, (3, 3), 0)
  im[..., 1] = np.where(spill > 0, np.maximum(r, b), g)
  a8 = (alpha * 255).astype(np.uint8)
  ys, xs = np.where(a8 > 40)
  y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
  rgba = np.dstack([np.clip(im, 0, 255).astype(np.uint8), a8])[y0:y1, x0:x1]
  Image.fromarray(rgba, 'RGBA').save(dst, quality=90, exact=True)


FLUX_PY = Path.home() / '.linggen/runtime/envs/pictures/bin/python'
FLUX_SCRIPT = Path.home() / '.linggen/runtime/mlx_picture.py'
FLUX_MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'


def flux(key, force, seed):
  import json, os
  kind, view, subject = FRAMES[key]
  dst = SRC / f'{key}.webp'
  if dst.exists() and not force:
    return f'{key}: kept'
  if not kind.startswith('master:'):
    return f'{key}: no master to edit from'
  ref = SRC / f'{kind[7:]}.green.webp'
  with tempfile.TemporaryDirectory() as d:
    out = Path(d) / 'frame.png'
    icon = key.startswith('icon-')
    tail = ('Glossy cartoon game-icon rendering, bold dark outline. The emblem is an OBJECT or effect only: no face, no '
            'eyes, no mouth, no hat, no character. Plain flat pure GREEN background (#00FF00) round the medallion.') if icon else f'Style: {STYLE} {ALONE}'
    req = {'model': FLUX_MODEL, 'prompt': f'{subject} {view} {tail}', 'out': str(out), 'width': 768,
           'height': 768, 'seed': seed, 'reference': str(ref)}
    env = dict(os.environ, HF_HOME=str(Path.home() / '.linggen/models/hf-hub'), HF_HUB_OFFLINE='1')
    r = subprocess.run([str(FLUX_PY), str(FLUX_SCRIPT)], input=json.dumps(req), text=True, capture_output=True, env=env)
    if not out.exists():
      return f'{key}: flux made no picture ({(r.stdout or r.stderr).strip()[-160:]})'
    from PIL import Image
    Image.open(out).convert('RGB').save(SRC / f'{key}.green.webp', quality=90)
    key_green(out, dst)
  return f'{key}: painted (flux seed {seed})'


# What the game loads: long side in px (the board is 540×960 drawn at up to 2× — a beast ~64 px tall → ~200 px here).
SIZES = {'bg': 1080, 'wall': 1100, 'icon': 160, 'fu': 128, 'sword': 128}
SETS = {'yezhu': 200, 'zheng': 200, 'qiuyu': 200, 'qique': 200, 'heyu': 400, 'xiaoman': 260}  # one cell per set (feet aligned)
BORROWED = {'sword': ART / 'games' / 'zhazhai' / 'proj-sword.png', 'fu-lei': ART / 'games' / 'zhazhai' / 'proj-talisman.png'}


def webp(im, name, q='88'):
  GAME.mkdir(parents=True, exist_ok=True)
  tmp = GAME / f'{name}.png'
  im.save(tmp)
  subprocess.run(['/opt/homebrew/bin/cwebp', '-q', q, '-alpha_q', '100', '-exact', str(tmp), '-o', str(GAME / f'{name}.webp')],
                 check=True, capture_output=True)
  tmp.unlink()
  print(name, im.size)


def fit(im, side):
  s = side / max(im.size)
  return im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS) if s < 1 else im


def pack():
  """Pieces → webp. A set's frames (a beast's walk-1/walk-2/hit, 小满's idle/cast) are scaled so their painted AREA
  matches the first frame's and laid on one cell size, feet on the floor, centred: swapping frames never jumps."""
  global Image
  from PIL import Image
  import numpy as np
  done = set()
  for name, ids in {k: sorted(p.stem for p in SRC.glob(f'{k}-*.webp') if not p.name.endswith('.green.webp')) for k in SETS}.items():
    first = f'{name}-walk-1' if name != 'xiaoman' else 'xiaoman-idle'
    ims = {k: Image.open(SRC / f'{k}.webp').convert('RGBA') for k in ids}
    area = lambda im: (np.asarray(im)[..., 3] > 128).sum()
    k0 = SETS[name] / max(ims[first].size)
    a0 = area(ims[first])
    scaled = {k: im.resize((max(1, round(im.width * k0 * (a0 / area(im)) ** 0.5)), max(1, round(im.height * k0 * (a0 / area(im)) ** 0.5))), Image.LANCZOS)
              for k, im in ims.items()}
    cw = max(im.width for im in scaled.values()) + 4
    ch = max(im.height for im in scaled.values()) + 4
    for k, im in scaled.items():
      cell = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
      cell.alpha_composite(im, ((cw - im.width) // 2, ch - 2 - im.height))
      webp(cell, k)
      done.add(k)
  for p in sorted(SRC.glob('*.webp')):
    k = p.stem
    if p.name.endswith('.green.webp') or k in done:
      continue
    side = SIZES.get(k) or SIZES.get(k.split('-')[0]) or 200
    webp(fit(Image.open(p), side), k, '80' if k == 'bg' else '88')
  for k, src in BORROWED.items():
    webp(fit(Image.open(src).convert('RGBA'), SIZES.get(k) or SIZES['fu']), k)


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('cmd', choices=['paint', 'flux', 'pack'])
  ap.add_argument('--seed', type=int, default=1)
  ap.add_argument('--only')
  ap.add_argument('--force', action='store_true')
  ap.add_argument('--jobs', type=int, default=4)
  a = ap.parse_args()
  SRC.mkdir(parents=True, exist_ok=True)
  if a.cmd == 'pack':
    return pack()
  if a.cmd == 'flux':  # one at a time: a render holds 7–14 GB
    for k in (a.only.split(',') if a.only else list(FRAMES)):
      print(flux(k, a.force, a.seed), flush=True)
    return
  everything = list(SCENES) + list(FRAMES)
  keys = a.only.split(',') if a.only else everything
  needs = lambda k: FRAMES.get(k, ('',))[0]
  firsts = [k for k in keys if not needs(k).startswith('master:')]
  rest = [k for k in keys if k not in firsts]
  with ThreadPoolExecutor(a.jobs) as ex:  # the masters before the frames that carry them
    for line in ex.map(lambda k: paint(k, a.force), firsts):
      print(line, flush=True)
    for line in ex.map(lambda k: paint(k, a.force), rest):
      print(line, flush=True)


if __name__ == '__main__':
  main()
