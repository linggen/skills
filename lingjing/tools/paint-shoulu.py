#!/usr/bin/env python3
"""paint-shoulu.py — 守炉's hero 银月, painted as comic action frames (Hanli 10-20: 「这个yinyue的hero形象太不hero了…重画一个吧」).

    python3 tools/paint-shoulu.py paint [--only id,id] [--force] [--jobs 4]
    python3 tools/paint-shoulu.py atlas

Canon: a silver FOX spirit (not a wolf), ONE tail and the stumps of the eight cut ones, blue eyes, a gold crescent
on her brow. Style: the small-game comic look of paint-zhazhai.py (STYLE RULING 2026-10-19, Angry-Birds cartoon).

`paint`: the master (idle-1) carries art/people/yinyue-fox.webp as WHO she is and 砸寨's weasel as the STYLE; every
other frame carries the master, so all stay one character. Painted on flat green, keyed by chroma (her coat is
white, so a white key would eat her), trimmed: art/games/shoulu/<id>.webp (768 px; the two masters also
kept on green, <id>.green.webp).
`atlas`: each figure scaled so its painted AREA matches the master's (bbox height lies for a howl or a leap), feet on
the cell's floor, centroid on its middle, packed into scripts/games/shoulu/art/yinyue.webp (what draw.js plays) and
yinyue-skills.webp (pounce, cast, fox-fire: for the skills pass), with yinyue.json giving the cells.
"""
import argparse, json, subprocess, tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
ART = HERE.parent / 'worlds' / 'jiuding' / 'art'
SRC = ART / 'games' / 'shoulu'
GAME = HERE.parent / 'scripts' / 'games' / 'shoulu' / 'art'
STYLE_REF = HERE.parent / 'scripts' / 'games' / 'zhazhai' / 'art' / 'weasel-m.webp'
MODEL = 'gpt-6.1-sol'  # gpt-5.5 is refused on a ChatGPT-account Codex (2026-10-20)

STYLE = ('Bright cheerful cartoon mobile-game art in the manner of Angry Birds: a bold clean dark-navy outline round '
         'every shape, flat saturated colours with simple cel shading and one soft glossy highlight, chunky rounded '
         'forms, big expressive eyes where there is a face. The subject ALONE, centred, filling most of the picture, on a plain flat solid '
         'pure GREEN background (#00FF00): no ground, no cast shadow, no scenery, no text, no letters, no border, no frame.')
HER = ('Yinyue the silver FOX spirit, hero of a cartoon tower-defense game: a fox (NOT a wolf, NOT a dog), chibi '
       'proportions with a big head, big bright BLUE eyes, tall pointed ears, a slender fox muzzle, a fluffy white chest '
       'ruff, a silver-white coat with pale blue-grey shading, a small GOLD CRESCENT MOON mark on her forehead, and '
       'exactly ONE big fluffy fox tail with a white tip (one tail only, never more) with a short row of small cut fur '
       'nubs at its base.')
SAME = ('The attached image is the MASTER drawing of this character: draw the SAME character in the SAME cartoon '
        'style, same colours, same outline weight, same proportions and the same size in the frame, only the pose '
        'changes. Strict SIDE PROFILE facing RIGHT.')

# id: (references, subject). 'master' = the idle-1 drawing.
FRAMES = {
  'idle-1': ('first', 'Strict SIDE PROFILE facing RIGHT, standing proud and heroic on all four legs, chest out, chin up, a confident little smile, ready to fight, the tail sweeping up behind her like a banner.'),
  'idle-2': ('master', 'The same standing heroic pose, breathing in: chest a little higher, head a touch higher, the tail swayed slightly forward, the same confident smile.'),
  'run-1': ('master', 'Running fast to the right, a gallop: front legs reaching far forward, hind legs pushing back, body stretched long and low, ears back, determined eyes, the tail streaming straight out behind.'),
  'run-2': ('master', 'Running fast to the right, gallop mid-stride: all four legs gathered under her body, back arched, body compact, ears back, determined eyes, the tail streaming behind.'),
  'run-3': ('master', 'Running fast to the right, gallop: front paws landing, hind legs stretched back off the ground, body leaning forward, determined eyes, the tail streaming behind and a little up.'),
  'run-4': ('master', 'Running fast to the right, gallop: hind paws landing under her belly, front legs lifting, body springing up, determined eyes, the tail streaming behind.'),
  'bite-1': ('master', 'Winding up to bite: crouched low on bent legs, head drawn back, jaws opening, a fierce narrow-eyed snarl, ears forward, the tail raised high.'),
  'bite-2': ('master', 'Lunging forward to the right in a fierce snapping bite: body stretched forward, head thrust out, jaws wide open showing small white fangs, eyes fierce, ears forward, the tail straight out behind.'),
  'howl-1': ('master', 'Howling at the moon: standing firm on all four legs, head thrown back pointing straight UP at the sky, mouth open in a long howl, eyes closed, ears back, the gold crescent mark shining, the tail raised high.'),
  'howl-2': ('master', 'Howling at the moon, the peak: chest swelled, front paws planted wide, head thrown back pointing straight UP, mouth wide open, eyes closed, the gold crescent mark shining bright, the tail fluffed up big.'),
  'hurt': ('master', 'Hurt: flinching back away from a hit, body recoiling to the left while still facing right, eyes squeezed shut, ears flat back, mouth in a pained grimace, fur ruffled, the tail tucked low.'),
  'fade': ('master', 'Retreating hurt: limping away to the LEFT but her head turned back over her shoulder to look right, sad tired eyes, ears drooping, head low, the tail dragging low.'),
  'pounce-1': ('master', 'Crouched to pounce: body pressed flat and low to the ground, hind legs coiled to spring, front paws forward, eyes locked on a target to the right, ears forward, the tail low and straight.'),
  'pounce-2': ('master', 'Mid-air leap to the right in a dash strike: body stretched out flat and long in the air, all four legs extended (front paws reaching forward with claws out, hind legs straight back), fierce eyes, ears back, the tail streaming straight behind, a few short speed lines behind her.'),
  'cast-1': ('master', 'Casting a spell: standing on three legs with ONE front paw raised in front of her chest, a small blue-white fox-fire flame starting to flicker just above the raised paw, eyes focused on it, the gold crescent mark glowing.'),
  'cast-2': ('master', 'Casting a spell, the release: one front paw thrust forward to the right, a bright round blue-white fox-fire flame blazing just in front of the paw, eyes bright and fierce, the gold crescent mark glowing, the tail raised.'),
  'foxfire-1': ('style', 'ONE magical fox-fire flame (狐火) burning on the ground: a blue-white spirit flame with a bright white core, pale cyan and blue outer tongues, a rounded teardrop shape with three flickering tips leaning slightly left. A plain flame: NO face, NO eyes, NO mouth.'),
  'foxfire-2': ('fire', 'The SAME fox-fire flame, next flicker: the tips leaning slightly right, a little taller. NO face.'),
  'foxfire-3': ('fire', 'The SAME fox-fire flame, next flicker: low and wide, the tips straight up, one small spark breaking off above. NO face.'),
}
HERO = ['idle-1', 'idle-2', 'run-1', 'run-2', 'run-3', 'run-4', 'bite-1', 'bite-2', 'howl-1', 'howl-2', 'hurt', 'fade']
SKILLS = ['pounce-1', 'pounce-2', 'cast-1', 'cast-2', 'foxfire-1', 'foxfire-2', 'foxfire-3']


def refs(kind, d):
  from PIL import Image
  def put(name, path):
    p = Path(d) / name
    Image.open(path).convert('RGBA').save(p)
    return ['-i', str(p)]
  if kind == 'first':
    return put('who.png', ART / 'people' / 'yinyue-fox.webp') + put('style.png', STYLE_REF), (
      'The first attached image shows WHO the character is (keep who she is, but redraw her fully in cartoon, not '
      'pencil); the second shows the cartoon STYLE of a sibling game.')
  if kind == 'master':
    return put('master.png', SRC / 'idle-1.green.webp'), SAME
  if kind == 'fire':
    return put('fire.png', SRC / 'foxfire-1.green.webp'), 'The attached image is the MASTER drawing of this flame: same style, colours and size.'
  return put('style.png', STYLE_REF), 'The attached image shows the cartoon STYLE of a sibling game (its subject is unrelated).'


def paint(key, force):
  kind, subject = FRAMES[key]
  dst = SRC / f'{key}.webp'
  if dst.exists() and not force:
    return f'{key}: kept'
  with tempfile.TemporaryDirectory() as d:
    args, lead = refs(kind, d)
    who = '' if key.startswith('foxfire') else HER
    prompt = (f'Use your image generation tool to make ONE new square image, then save it in the current directory as '
              f'frame.png. {lead} Subject: {who} {subject} Style: {STYLE} Reply with the saved file path only.')
    try:
      subprocess.run(['codex', 'exec', '-m', MODEL, '--skip-git-repo-check', '-s', 'workspace-write', *args, '--', prompt],
                     cwd=d, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=900)
    except subprocess.TimeoutExpired:
      return f'{key}: no picture in 15 minutes'
    src = Path(d) / 'frame.png'
    if not src.exists():
      return f'{key}: codex made no picture'
    from PIL import Image
    if key in ('idle-1', 'foxfire-1'):  # the masters the other frames carry
      Image.open(src).convert('RGB').save(SRC / f'{key}.green.webp', quality=92)
    key_green(src, dst)
  return f'{key}: painted'


def key_green(src, dst):
  """Green → alpha (chroma distance), green spill pulled off the edges, trimmed."""
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
  im = Image.fromarray(rgba, 'RGBA')
  im.thumbnail((768, 768), Image.LANCZOS)
  im.save(dst, quality=92, exact=True)


def atlas():
  import numpy as np
  from PIL import Image
  HEIGHT, FIRE = 150, 110  # the master's height in the cell; a flame's
  def load(k):
    im = Image.open(SRC / f'{k}.webp').convert('RGBA')
    return im, (np.asarray(im)[..., 3] > 128).sum()
  base, area0 = load('idle-1')
  k0 = HEIGHT / base.height
  fire0 = load('foxfire-1')
  scaled = {}
  for k in HERO + SKILLS:
    im, area = load(k)
    if k.startswith('foxfire'):
      s = FIRE / fire0[0].height * (fire0[1] / area) ** 0.5
    else:
      s = k0 * (area0 / area) ** 0.5
    scaled[k] = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
  cw = max(im.width for im in scaled.values()) + 8
  ch = max(im.height for im in scaled.values()) + 8
  cw, ch = cw + cw % 2, ch + ch % 2
  meta = {'cell': [cw, ch], 'foot': ch - 4, 'h0': HEIGHT, 'sheets': {}}
  GAME.mkdir(parents=True, exist_ok=True)
  for name, keys, cols in [('yinyue', HERO, 4), ('yinyue-skills', SKILLS, 4)]:
    rows = (len(keys) + cols - 1) // cols
    sheet = Image.new('RGBA', (cw * cols, ch * rows), (0, 0, 0, 0))
    cells = {}
    for i, k in enumerate(keys):
      im = scaled[k]
      a = np.asarray(im)[..., 3].astype(np.float32)
      cx = (a.sum(axis=0) * np.arange(im.width)).sum() / a.sum()
      x = (i % cols) * cw + round(cw / 2 - cx)
      x = min(max(x, (i % cols) * cw), (i % cols) * cw + cw - im.width)
      y = (i // cols) * ch + ch - 4 - im.height
      sheet.alpha_composite(im, (x, y))
      cells[k] = [(i % cols) * cw, (i // cols) * ch]
    png = GAME / f'{name}.png'
    sheet.save(png)
    subprocess.run(['/opt/homebrew/bin/cwebp', '-q', '86', '-alpha_q', '100', '-exact', str(png), '-o', str(GAME / f'{name}.webp')],
                   check=True, capture_output=True)
    png.unlink()
    meta['sheets'][name] = cells
  (GAME / 'yinyue.json').write_text(json.dumps(meta, indent=1) + '\n')
  print(json.dumps(meta))


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('cmd', choices=['paint', 'atlas'])
  ap.add_argument('--only')
  ap.add_argument('--force', action='store_true')
  ap.add_argument('--jobs', type=int, default=4)
  a = ap.parse_args()
  SRC.mkdir(parents=True, exist_ok=True)
  if a.cmd == 'atlas':
    return atlas()
  keys = a.only.split(',') if a.only else list(FRAMES)
  firsts = [k for k in ('idle-1', 'foxfire-1') if k in keys]
  for k in firsts:  # the masters before the frames that carry them
    print(paint(k, a.force), flush=True)
  rest = [k for k in keys if k not in firsts]
  with ThreadPoolExecutor(a.jobs) as ex:
    for line in ex.map(lambda k: paint(k, a.force), rest):
      print(line, flush=True)


if __name__ == '__main__':
  main()
