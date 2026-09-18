#!/usr/bin/env python3
"""paint-cards.py — a picture for every card in the deck.

    python3 tools/paint-cards.py [--only id,id] [--force]

The 山海经 creatures are NOT painted: they keep their classical plates (his
ruling, 2026-09-16 — those editions drew them better than any model will, and
a model cannot count 夫诸's antlers). Everything else in the deck is ours to
paint: the small beasts, the arts, the pills and the talisman paper.

The recipe is the engine's own local painter (FLUX.2 klein 4B through mflux),
and it needs HF_HOME pointed at the cached model or it re-downloads 4.3 GB.
Each line below is written by hand, because a prompt stitched together from a
card's fields gives a picture of a card, not a picture of the thing.
"""
import argparse, json, os, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORLD = HERE.parent / 'worlds' / 'jiuding'
OUT = WORLD / 'art' / 'cards'
PY = Path.home() / '.linggen/runtime/envs/pictures/bin/python'
SCRIPT = Path.home() / '.linggen/runtime/mlx_picture.py'
MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'
STYLE = ('Chinese ink wash painting on aged rice paper, xieyi brush strokes, soft ink gradations, '
         'muted mineral colours, generous empty space, no text, no watermark')

# One line each: what the thing IS, said the way a painter would be told.
SUBJECTS = {
  # ── 小随从 ──
  'xiaoyao': 'a small mischievous mountain imp crouching on a rock, thin limbs, big ears',
  'shanjing': 'a squat moss-covered hill spirit made of stone and roots, arms folded, standing guard',
  'yinyue': 'a young woman in pale robes under a full moon, silver hairpin, calm and watchful',
  'luying': 'the shadow of a leaping deer over rippling water, antlers catching the light',
  'xianshi': 'a small bird carrying a pebble in its beak over grey sea waves',
  'leipu': 'a small thunder servant with a drum on its back, crackling sparks at its heels',
  'jiushou': 'a nine-headed serpent beast, thin and quick, heads fanned like blades',
  'gupi': 'a great war drum of stretched hide on a wooden frame, standing alone',
  'jinsuo': 'a bronze weaving shuttle flying edge-on, a thread of light behind it',
  'jianying': 'the after-image of a sword stroke, a blade dissolving into three shadows',
  'jingang': 'a temple guardian statue of dark metal, arms crossed, immovable',
  'tengmiao': 'a single vine sprout uncurling from wet earth, one bright leaf',
  'tengmiao_token': 'a thin green tendril reaching upward, small and new',
  'linmu': 'an ancient mother tree with a face in its bark, roots spread wide',
  'hanquan': 'a cold spring welling from cracked stone, mist above the water',
  'huoya': 'a crow with feathers of flame, wings spread, diving',
  'tuou': 'a small clay figure of a squatting guard, cracked and patient',
  'shishou': 'a stone beast the size of an ox, lichen on its flanks, planted in the ground',
  'tongling': 'a young page spirit with a scroll under one arm, bowing',
  # ── 功法 ──
  'qingteng': 'green vines whipping out and binding an unseen thing, leaves torn loose',
  'huodan': 'a ball of fire leaving an open palm, sparks trailing',
  'hantan': 'a finger pointing at a black pool, ice spreading across the water',
  'luoshi': 'boulders falling down a cliff face, dust blooming below',
  'wulei': 'five lightning bolts striking down together onto bare ground',
  'jinzhen': 'a rain of fine golden needles falling in slanting lines',
  'fenghuo': 'a grass fire running across a wide plain, smoke bending in the wind',
  'wudao': 'a seated figure in meditation, a single lamp, night around',
  'peiyuan': 'a hand pouring spring water over a young plant in a shallow bowl',
  'huiqi': 'a small round pill of pale jade in an open palm, faint breath of vapour',
  'chaoqi': 'a tide rising over dark rocks, white foam at the crest',
  'tunshi': 'a vast maw opening in shadow, swallowing light',
  'jixiao': 'a starved beast howling with its head thrown back',
  'leiming': 'a thunderclap over a mountain ridge, one white bolt',
  'zhennu': 'a storm breaking over a forest, trees bent flat',
  'jinzhua': 'a golden claw raking down, three bright gashes in the air',
  'zhuguang': 'a luminous pearl resting in an open shell, soft light on the ground',
  'suijin': 'a bronze bell shattering, fragments flying outward',
  'chunsheng': 'young shoots breaking through soil all across a field in spring',
  'fengmao': 'wind moving through a bamboo grove, every stalk leaning the same way',
  'shuiwu': 'thin mist drifting low over a river at dawn',
  'tingbo': 'a wide lake gone perfectly still, one reflected mountain',
  'yanxin': 'a heart of embers glowing inside a dark forge',
  'liaotian': 'a wall of fire rising to the clouds over a burning ridge',
  'houtu': 'deep dark earth in cross-section, roots and stones layered',
  'canwu': 'an old scholar reading by a window, one crane outside',
}

def paint(card_id, subject, width, height, seed):
  OUT.mkdir(parents=True, exist_ok=True)
  png = Path(tempfile.gettempdir()) / f'card-{card_id}.png'
  req = {
    'model': MODEL,
    'prompt': f'{subject}. {STYLE}',
    'out': str(png),
    'width': width, 'height': height, 'seed': seed,
  }
  env = dict(os.environ, HF_HOME=str(Path.home() / '.linggen/models/hf-hub'), HF_HUB_OFFLINE='1')
  r = subprocess.run([str(PY), str(SCRIPT)], input=json.dumps(req), text=True, capture_output=True, env=env)
  if r.returncode != 0 or not png.exists():
    return f'{card_id}: {r.stderr.strip()[-160:] or "no picture"}'
  webp = OUT / f'{card_id}.webp'
  c = subprocess.run(['/opt/homebrew/bin/cwebp', '-q', '86', str(png), '-o', str(webp)], capture_output=True)
  png.unlink(missing_ok=True)
  return None if c.returncode == 0 else f'{card_id}: cwebp failed'

def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--only', default='')
  ap.add_argument('--force', action='store_true')
  ap.add_argument('--size', default='448x320')
  args = ap.parse_args()
  w, h = (int(x) for x in args.size.split('x'))
  path = WORLD / 'cards.json'
  data = json.loads(path.read_text())
  only = set(filter(None, args.only.split(',')))
  done, failed = 0, []
  for card in data['cards']:
    cid = card['id']
    if only and cid not in only:
      continue
    if cid not in SUBJECTS:
      continue  # a 山海经 creature: it keeps its plate
    if card.get('art') and not args.force and (WORLD / card['art']).exists():
      continue
    print(f'painting {cid} — {SUBJECTS[cid][:52]}…', flush=True)
    err = paint(cid, SUBJECTS[cid], w, h, abs(hash(cid)) % 100000)
    if err:
      failed.append(err)
      print('  ✗ ' + err, flush=True)
      continue
    card['art'] = f'art/cards/{cid}.webp'
    card['art_source'] = 'Painted for Lingjing by the local picture model (FLUX.2 klein 4B), 2026-09-18, from the description.'
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    done += 1
    print(f'  ✓ {done} done', flush=True)
  print(f'\npainted {done}, failed {len(failed)}')
  for f in failed:
    print(' ', f)

if __name__ == '__main__':
  main()
