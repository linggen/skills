#!/usr/bin/env python3
"""paint-prologue.py — the prologue's pictures: its people and its panels.

    python3 tools/paint-prologue.py [--only id,id] [--force] [--seed N]

The prologue is told as a 连环画 (Hanli, 2026-09-28: 「右边尽量放图片……像小人书。
左边chat里放剧情」): one panel per beat on the stage, the story in the chat.
Portraits are single figures in the ink style of art/people/ (v1, 2026-09-28);
panels are picture-book plates — 白描 line with a light wash on aged paper.

The recipe is the engine's own local painter (FLUX.2 klein 4B through mflux),
with HF_HOME pointed at the cached model (tools/paint-cards.py). Each line is
written by hand: the child is drawn from behind or small, never a face that
says boy or girl — the player's 男 · 女 is theirs.
"""
import argparse, json, os, subprocess, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ART = HERE.parent / 'worlds' / 'jiuding' / 'art'
PY = Path.home() / '.linggen/runtime/envs/pictures/bin/python'
SCRIPT = Path.home() / '.linggen/runtime/mlx_picture.py'
MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'

PORTRAIT = ('Chinese ink wash painting portrait on aged rice paper, a single figure, three-quarter length, '
            'soft ink gradations, muted mineral colours, plain background with a hint of landscape, no text, no watermark')
PANEL = ('Chinese 连环画 picture-book illustration, fine ink line drawing (白描) with light wash, '
         'on aged paper, no text, no border')

PEOPLE = {
  'baba': 'an old Chinese mountain hunter in his fifties, hair half white, kind honest weathered face, patched grey hunting clothes, cloth wrapped around his left knee, an old bow wrapped in ox sinew on his back, leaning slightly on one leg',
  'mama': 'a thin Chinese peasant woman in her forties, plain dark cotton clothes and headscarf, quiet clever watchful eyes, hands rough from the loom, standing by a clay stove',
  'wupo': 'a very old blind Chinese village woman, clouded white eyes, deeply wrinkled, sitting on a wooden doorstep with a cane, grey hair in a small bun, a knowing faint smile',
  'masan': 'a huge broad Chinese rent collector wider than a door frame, thick neck, coarse sneering face, plain dark tunic with a belt, a short iron-bound club at his waist',
  'maxiaobao': 'a plump spoiled Chinese youth of fourteen in fine silk robes, round smug face, holding a piece of osmanthus cake, a mocking grin',
  'laozhou': 'a middle-aged Chinese peasant farmer, sturdy and plain, patched cotton clothes, a straw rain cape on his shoulders, mud on his trousers, holding a torch, steady trustworthy face',
  'jiujiu': 'a Chinese county-town bookkeeper in his thirties, neat new blue-grey cotton scholar gown, thin careful face, a folded paper in his hand, a small abacus at his belt, a trace of old disappointment in his eyes',
  'yinyue-fox': 'a tiny silver fox with a single tail, fur like frost made of moonlight, golden eyes with vertical slit pupils, sitting upright and aloof, faint silver glow around it',
  'yinyue': 'a young woman with long silver hair falling past her waist, golden eyes with vertical slit pupils, barefoot, in a white robe bright as snow and shining like water, one silver fox tail behind her, proud aloof expression',
}

ITEM = ('Chinese ink wash painting on aged rice paper, xieyi brush strokes, soft ink gradations, '
        'muted mineral colours, generous empty space, no text, no watermark')

ITEMS = {
  'fox-token': 'a small worn wooden token polished bright by hands, carved with a tiny curled fox whose nine tails wrap around its body, on a frayed cord',
  'deer-hide': 'a whole glossy deer hide folded on a wooden rack, rich brown fur with pale spots',
  'tuna-jing': 'an old bamboo slip scroll half unrolled on straw, its binding cords nearly rotted through, faded columns of brushed characters too worn to read',
  'old-bow': 'an old hunting bow of dark wood, its back cracked twice and bound with ox sinew, a worn leather grip, lying on straw',
}

# The 28 小人书 panels were retired 2026-09-29 (his: 「不用小人书的方式了，图片作为图鉴」);
# their prompts are in git history. Portraits and things: tools/paint-codex.py.
PANELS = {}


def paint(out, prompt, width, height, seed):
  out.parent.mkdir(parents=True, exist_ok=True)
  png = Path(tempfile.gettempdir()) / f'prologue-{out.stem}.png'
  req = {'model': MODEL, 'prompt': prompt, 'out': str(png), 'width': width, 'height': height, 'seed': seed}
  env = dict(os.environ, HF_HOME=str(Path.home() / '.linggen/models/hf-hub'), HF_HUB_OFFLINE='1')
  r = subprocess.run([str(PY), str(SCRIPT)], input=json.dumps(req), text=True, capture_output=True, env=env)
  if r.returncode != 0 or not png.exists():
    return f'{out.stem}: {r.stderr.strip()[-200:] or "no picture"}'
  c = subprocess.run(['/opt/homebrew/bin/cwebp', '-q', '88', str(png), '-o', str(out)], capture_output=True)
  png.unlink(missing_ok=True)
  return None if c.returncode == 0 else f'{out.stem}: cwebp failed'


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--only', default='')
  ap.add_argument('--force', action='store_true')
  ap.add_argument('--seed', type=int, default=None)
  args = ap.parse_args()
  only = set(filter(None, args.only.split(',')))
  jobs = [(ART / 'people' / f'{k}.webp', f'{v}. {PORTRAIT}', 512, 640) for k, v in PEOPLE.items()]
  jobs += [(ART / 'items' / f'{k}.webp', f'{v}. {ITEM}', 640, 480) for k, v in ITEMS.items()]
  jobs += [(ART / 'panels' / f'{k}.webp', f'{v}. {PANEL}', 768, 512) for k, v in PANELS.items()]
  failed = []
  for out, prompt, w, h in jobs:
    if only and out.stem not in only:
      continue
    if out.exists() and not args.force:
      continue
    seed = args.seed if args.seed is not None else sum(map(ord, out.stem)) * 7
    print(f'painting {out.parent.name}/{out.stem}', flush=True)
    err = paint(out, prompt, w, h, seed)
    print(f'  {"x " + err if err else "ok"}', flush=True)
    if err:
      failed.append(err)
  print(f'failed {len(failed)}')


if __name__ == '__main__':
  main()
