#!/usr/bin/env python3
"""paint-cards.py — a picture for every card in the deck.

    python3 tools/paint-cards.py [--only id,id] [--force]
    python3 tools/paint-cards.py --only huoya,leipu --seeds 1,2,3 --out DIR   # a review round

The 山海经 creatures are NOT painted: they keep their classical plates (his
ruling, 2026-09-16 — those editions drew them better than any model will, and
a model cannot count 夫诸's antlers). Everything else in the deck is ours to
paint: the small beasts, the arts, the pills and the talisman paper.

The recipe is the engine's own local painter (FLUX.2 klein 4B through mflux),
and it needs HF_HOME pointed at the cached model or it re-downloads 4.3 GB.
Each line below is written by hand, because a prompt stitched together from a
card's fields gives a picture of a card, not a picture of the thing.

A review round (--seeds/--out) writes <id>-s<seed>.webp into DIR and touches
neither art/cards nor cards.json; look at every picture (the model ignores "no
text" often and adds red seals and fake signatures), then put the pick in KEPT
and repaint that card with --only id --force. A card not in KEPT paints from a
stable seed of its id (the 2026-09-18 set used Python's per-run hash, so those
seeds are lost).
"""
import argparse, json, os, re, subprocess, sys, tempfile, zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORLD = HERE.parent / 'worlds' / 'jiuding'
OUT = WORLD / 'art' / 'cards'
PY = Path.home() / '.linggen/runtime/envs/pictures/bin/python'
SCRIPT = Path.home() / '.linggen/runtime/mlx_picture.py'
MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'
STYLE = ('Chinese ink wash painting on aged rice paper, xieyi brush strokes, soft ink gradations, '
         'muted mineral colours, generous empty space, no text, no watermark, no red seal, no signature')

# Repainted 2026-10-15 to Hanli's 水墨淡彩 lock (the house STYLE above): the kept seed of each
# review round, every picture looked at. The note says what the old picture got wrong.
KEPT = {
  'huoya': {'seed': 5},           # was a saturated orange Western bird; now an ink crow, dull red only at the wing tips
  'huodan': {'seed': 2},          # the hand wore a Western suit cuff; now a wide robe sleeve
  'jinzhua': {'seed': 3},         # drew a trident; now three gashes raked by a paw
  'shuiwu': {'seed': 4},          # a full landscape with a fake signature and seal; now sparse low mist
  'leipu': {'seed': 2},           # too small and faint; now a winged, beaked thunder imp filling the frame
  'jiushou': {'seed': 6},         # three heads; now nine (counted)
  'peiyuan': {'seed': 4},         # a glass pitcher; now an earthen jug
  'tunshi': {'seed': 2},          # a grotesque realistic face with a signature and seal; now an ink vortex
  'tongling': {'seed': 4},        # signature and seal; now clean
  'liaotian': {'seed': 4},        # a saturated orange volcano; now muted fire along a ridge
  'canwu': {'seed': 1},           # fake calligraphy on the wall, the crane barely there; now a bare wall, the crane clear
  'tengmiao_token': {'seed': 2},  # a single faint line, unreadable on a card
  'jinsuo': {'seed': 4},          # read as a pen or dart (round one drew boats); now a spindle shuttle and its thread
  'suijin': {'seed': 4},          # a bell with fake characters; now a knobbed Chinese bianzhong bell
  'yanxin': {'seed': 1},          # a Western stone fireplace (round one drew chimineas); now a three-legged ding of embers
}

# One line each: what the thing IS, said the way a painter would be told.
SUBJECTS = {
  # ── 小随从 ──
  'xiaoyao': 'a small mischievous mountain imp crouching on a rock, thin limbs, big ears',
  'shanjing': 'a squat moss-covered hill spirit made of stone and roots, arms folded, standing guard',
  # yinyue's card was repainted with Codex 2026-10-01 from her 图鉴 portrait (a girl of 14–15, not this woman); see CREDITS.md.
  'yinyue': 'a silver-haired girl of fourteen in a white robe under a full moon, one silver fox tail, proud and impish',
  'luying': 'the shadow of a leaping deer over rippling water, antlers catching the light',
  'xianshi': 'a small bird carrying a pebble in its beak over grey sea waves',
  'leipu': 'close up, filling the frame: a small fierce thunder spirit of Chinese myth like a young Lei Gong, a bird beak and short dark wings, a round red-lacquered Chinese drum with brass studs on its back, crouched mid-leap, white sparks crackling at its feet',
  'jiushou': 'a serpent beast with many snake heads on long necks fanned out in a wide arc, a coiled scaly body',
  'gupi': 'a great war drum of stretched hide on a wooden frame, standing alone',
  'jinsuo': 'a slender spindle-shaped golden shuttle, tapering to a point at both ends like a long seed pod, flying fast through the air on a diagonal, one long fine golden thread trailing behind it',
  'jianying': 'the after-image of a sword stroke, a blade dissolving into three shadows',
  'jingang': 'a temple guardian statue of dark metal, arms crossed, immovable',
  'tengmiao': 'a single vine sprout uncurling from wet earth, one bright leaf',
  'tengmiao_token': 'close up, a curling green vine tendril with two small leaves reaching upward from a clump of earth',
  'linmu': 'an ancient mother tree with a face in its bark, roots spread wide',
  'hanquan': 'a cold spring welling from cracked stone, mist above the water',
  'huoya': 'a black ink crow diving with wings spread, bold monochrome brush strokes, only a few restrained touches of dull vermilion flame at the wing tips',
  'tuou': 'a small clay figure of a squatting guard, cracked and patient',
  'shishou': 'a stone beast the size of an ox, lichen on its flanks, planted in the ground',
  'tongling': 'a little boy spirit in a plain grey Chinese robe, his hair in two buns, a rolled scroll under one arm, bowing',
  # ── 功法 ──
  'qingteng': 'green vines whipping out and binding an unseen thing, leaves torn loose',
  'huodan': 'an open palm reaching out of a wide loose hanging Chinese robe sleeve, a small ball of fire leaving the palm, faint sparks trailing',
  'hantan': 'a finger pointing at a black pool, ice spreading across the water',
  'luoshi': 'boulders falling down a cliff face, dust blooming below',
  'wulei': 'five lightning bolts striking down together onto bare ground',
  'jinzhen': 'a rain of fine golden needles falling in slanting lines',
  'fenghuo': 'a grass fire running across a wide plain, smoke bending in the wind',
  'wudao': 'a seated figure in meditation, a single lamp, night around',
  'peiyuan': 'water poured from a small brown earthenware jug onto a young plant in a shallow pottery bowl',
  'huiqi': 'a small round pill of pale jade in an open palm, faint breath of vapour',
  'chaoqi': 'a tide rising over dark rocks, white foam at the crest',
  'tunshi': 'a dark swirling vortex of ink like a vast open maw, drawing in wisps of light',
  'jixiao': 'a starved beast howling with its head thrown back',
  'leiming': 'a thunderclap over a mountain ridge, one white bolt',
  'zhennu': 'a storm breaking over a forest, trees bent flat',
  'jinzhua': 'three parallel claw marks torn diagonally across the paper in gold and ink, the blurred dark paw of a beast at the end of the stroke, no weapon',
  'zhuguang': 'a luminous pearl resting in an open shell, soft light on the ground',
  'suijin': 'an ancient Chinese bronze bianzhong bell with an almond-shaped mouth and rows of round knobs, no clapper, hanging from a wooden beam, cracking apart, bronze fragments flying outward',
  'chunsheng': 'young shoots breaking through soil all across a field in spring',
  'fengmao': 'wind moving through a bamboo grove, every stalk leaning the same way',
  'shuiwu': 'a few thin bands of pale mist drifting low over flat still water, mostly empty paper, no trees, no mountains',
  'tingbo': 'a wide lake gone perfectly still, one reflected mountain',
  'yanxin': 'a bronze three-legged Chinese ding cauldron, a heap of glowing red embers inside it, a thread of smoke rising',
  'liaotian': 'flames rising in pale ochre and grey ink from a long mountain ridge into billowing smoke clouds',
  'houtu': 'deep dark earth in cross-section, roots and stones layered',
  'canwu': 'an old scholar in a robe reading a book by an open round window, bare plain wall, one white crane standing outside',
}

def paint(card_id, subject, width, height, seed, webp):
  webp.parent.mkdir(parents=True, exist_ok=True)
  png = Path(tempfile.gettempdir()) / f'card-{card_id}-{seed}.png'
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
  c = subprocess.run(['/opt/homebrew/bin/cwebp', '-q', '86', str(png), '-o', str(webp)], capture_output=True)
  png.unlink(missing_ok=True)
  return None if c.returncode == 0 else f'{card_id}: cwebp failed'

def seed_of(cid):
  return KEPT[cid]['seed'] if cid in KEPT else zlib.crc32(cid.encode()) % 100000

def source_of(cid):
  if cid in KEPT:
    return ('Painted for Lingjing by the local picture model (FLUX.2 klein 4B), 2026-10-15, from the description '
            f'(repainted to the 水墨淡彩 house style, seed {KEPT[cid]["seed"]}) — see art/CREDITS.md.')
  return 'Painted for Lingjing by the local picture model (FLUX.2 klein 4B), 2026-09-18, from the description.'

def write_source(path, data, card):
  """Set the card's art and art_source in place, keeping cards.json's hand layout."""
  text = path.read_text()
  top = re.compile(r'^      "id": "([^"]+)"', re.M)  # a card's own id, not a summoned token's
  heads = [m for m in top.finditer(text)]
  at = [i for i, m in enumerate(heads) if m.group(1) == card['id']]
  head = heads[at[0]].start() if at else -1
  nxt = heads[at[0] + 1].start() if at and at[0] + 1 < len(heads) else len(text)
  pat = re.compile(r'("art": )"[^"]*",(\s*)"art_source": "(?:[^"\\]|\\.)*"')
  m = pat.search(text, head, nxt) if head >= 0 else None
  if not m:  # a card without art yet: fall back to a full rewrite
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    return
  repl = (f'{m.group(1)}{json.dumps(card["art"], ensure_ascii=False)},{m.group(2)}'
          f'"art_source": {json.dumps(card["art_source"], ensure_ascii=False)}')
  path.write_text(text[:m.start()] + repl + text[m.end():])

def review(ids, seeds, out, w, h):
  failed = []
  for cid in ids:
    for seed in seeds:
      print(f'{cid} s{seed}', flush=True)
      err = paint(cid, SUBJECTS[cid], w, h, seed, out / f'{cid}-s{seed}.webp')
      if err:
        failed.append(err)
  print(f'\nreview round in {out}, failed {len(failed)}')
  for f in failed:
    print(' ', f)

def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--only', default='')
  ap.add_argument('--force', action='store_true')
  ap.add_argument('--size', default='448x320')
  ap.add_argument('--seeds', default='', help='a review round: seeds to roll, e.g. 1,2,3 (needs --out)')
  ap.add_argument('--out', default='', help='review folder; art/cards and cards.json are not touched')
  args = ap.parse_args()
  w, h = (int(x) for x in args.size.split('x'))
  path = WORLD / 'cards.json'
  data = json.loads(path.read_text())
  only = set(filter(None, args.only.split(',')))
  if args.seeds:
    if not args.out:
      sys.exit('--seeds needs --out')
    ids = [c['id'] for c in data['cards'] if c['id'] in SUBJECTS and (not only or c['id'] in only)]
    review(ids, [int(x) for x in args.seeds.split(',')], Path(args.out), w, h)
    return
  done, failed = 0, []
  for card in data['cards']:
    cid = card['id']
    if only and cid not in only:
      continue
    if cid not in SUBJECTS:
      continue  # a 山海经 creature: it keeps its plate
    if 'Codex' in card.get('art_source', '') and cid not in only:
      continue  # painted by Codex (yinyue): repaint only when named
    if card.get('art') and not args.force and (WORLD / card['art']).exists():
      continue
    print(f'painting {cid} — {SUBJECTS[cid][:52]}…', flush=True)
    err = paint(cid, SUBJECTS[cid], w, h, seed_of(cid), OUT / f'{cid}.webp')
    if err:
      failed.append(err)
      print('  ✗ ' + err, flush=True)
      continue
    card['art'] = f'art/cards/{cid}.webp'
    card['art_source'] = source_of(cid)
    write_source(path, data, card)
    done += 1
    print(f'  ✓ {done} done', flush=True)
  print(f'\npainted {done}, failed {len(failed)}')
  for f in failed:
    print(' ', f)

if __name__ == '__main__':
  main()
