#!/usr/bin/env python3
"""paint-waimen.py — 第一章 · 外门's pictures: its people, its things and its panels.

    python3 tools/paint-waimen.py [--only id,id] [--force] [--seed N]

The same recipe as the prologue's (tools/paint-prologue.py): the engine's local
painter (FLUX.2 klein 4B through mflux), 白描 with a light wash on aged paper.
The hero is drawn from behind or small, never a face that says boy or girl — and
阿禾, always the other gender, likewise. FLUX follows position words, not layout
sketches, and "no text" is not reliable: every panel is looked at for fake
characters and re-rolled with `--seed` when it has them.
"""
import argparse, importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location('paint_prologue', HERE / 'paint-prologue.py')
pp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pp)
ART, PORTRAIT, PANEL, ITEM, paint = pp.ART, pp.PORTRAIT, pp.PANEL, pp.ITEM, pp.paint

PEOPLE = {
  'chuxiansheng': 'a thin Chinese Taoist lecturer in his fifties with a small goat beard, grey scholar robe, a thread-bound book in one hand, one eyebrow raised, sharp sardonic face',
  'sunergou': 'a tall skinny timid Chinese youth of fifteen in a patched grey robe, knees knocking, a small hand-sewn cloth charm pouch tied at his waist, anxious hopeful eyes',
  'neimen-shijie': 'a calm young Chinese woman of eighteen in a pale blue inner-disciple robe, hair tied high, a plain sword at her back, a faint knowing smile',
}

ITEMS = {
  'luobo': 'a fresh white radish with green leaves, a little soil still on it, lying on straw',
  'danlu': 'a tiny bronze alchemy furnace the size of a palm, three legs and two ears, bluish purple bronze carved with flames and clouds, a small beast crouched on the lid with one eye open',
  'huangting': 'a thin old Chinese string-bound book, soft paper pages stitched along the right edge with white thread, a faded plain yellow paper cover with no title, lying closed on a blue stone',
  'heluo': 'an ancient Chinese bamboo slip scroll, many flat narrow blank bamboo strips tied side by side with two cords, half rolled up, dark with age, lying on a worn open cloth wrapper on a blue stone',
}

NOTEXT = 'Plain walls and plain paper, no hanging scrolls, no signs, no calligraphy, no writing anywhere.'

PANELS = {
  'wm-ahe': 'early morning in a temple outer courtyard: a queue of youths in grey robes before a steward\'s table; two youths in oversized grey robes with sleeves rolled up stand together seen from behind, one writing in a small notebook with a brush',
  'wm-jiangtang': 'a temple lecture hall: rows of youths in grey robes kneeling at low desks; at the front a thin old teacher with a small goat beard holds up a kitchen skimmer ladle full of holes; at the back one youth, seen from behind, stands up to answer',
  'wm-zhoutian': 'night behind a temple courtyard: a youth sits cross-legged on a woodpile, seen from behind, a warm line of light rising up the spine from the lower back to the crown and circling down the front; a tiny translucent silver fox sits on the knee; full moon',
  'wm-qingshi': 'moonlit cliff top above a river valley: a large blue-grey boulder taller than a person, split by one crack from top to bottom; a small figure crouches behind it, seen from behind, biting a fist; far mountains and a river below',
  'wm-chaifang': 'night behind a temple woodshed beside a muddy pigsty: six youths in fine robes loom over a small figure huddled on the muddy ground, seen from behind, arms wrapped around the chest; a plump youth in silk leads them; stacked firewood, moonlight',
  'wm-danlu': 'night by a woodshed: a small figure in a muddy grey robe, fully clothed, lies curled on the muddy ground seen from behind, face turned away; on the ground beside their chest sits a tiny bronze alchemy furnace with three legs, carved with flames and clouds, a little beast on its lid; above it a translucent silver fox fades like smoke. Plain walls and plain paper, no hanging scrolls, no signs, no calligraphy, no writing anywhere',
  'wm-diyilu': 'inside an old Chinese woodshed by day: a tiny ancient bronze tripod cauldron no bigger than a hand, three legs and two ears, sits on the dirt floor and blazes with a cool blue-violet flame that lights the whole shed; beside it a small figure seen from behind has fallen back into a collapsed woodpile; a small round green pill ringed with thin gold lines rests glowing in the mouth of the cauldron',
  'wm-mijing': 'the river has drawn back, showing a great ancient stone door in the wet riverbed; hundreds of youths in grey robes crowd before it holding paper maps; on the bank a plump youth in silk sits at a little gilded box collecting stones; in front one youth passes a folded map to another',
  'wm-wangzuo': 'inside an underground ruin: at the foot of a dark cliff a bare stone wall carved with a faint three by three grid of squares; a small figure, seen from behind, lays a palm flat on the wall; a translucent silver fox on the shoulder sniffs the air; a thin draught stirs the dust',
  'wm-kunzhen': 'an underground cliff wall glowing with a faint ring of light: six youths stuck to the rock like geckos, limbs flailing; at the foot of the cliff a round fat boulder that looks like a plump man; a small figure below tosses a radish upward',
  'wm-xirang': 'a small bare stone chamber: a stone altar with an open jade box holding a pinch of yellow-brown earth; a figure kneels before it seen from behind, five coloured lights, gold, green, black, red and yellow, flowing under their skin; a silver fox with bright eyes on the altar',
  'wm-chu': 'dusk at an ancient stone door in a riverbed: youths come out carrying herbs and broken bronze artifacts; the last figure walks out empty-handed, seen from behind; a young steward with a ledger stands on the bank raising one hand',
  'wm-dabi': 'a temple courtyard with a raised square stone platform for a tournament, hundreds of youths in grey robes crowding around, long banners; on the platform a plump youth in new silk robes with a round bronze mirror at his waist; an old abbot and a goat-bearded teacher watch from the steps',
  'wm-lun1': 'a square stone tournament platform: a tall skinny trembling youth with a small cloth charm at his waist throws a punch with his eyes shut; another figure tumbles backward off the edge of the platform; the crowd below stares open-mouthed',
  'wm-fushi': 'night in a small ancient Chinese temple steward\'s room lit by one clay oil lamp, paper lattice window: a stern young steward in a grey Taoist robe behind a low wooden desk with a thick open ledger sets half a candle on the table beside a row of ten small spirit stones; a figure stands before the desk, seen from behind',
  'wm-lun2': 'a square stone tournament platform: a plump youth in silk robes flies through the air spinning over the crowd and over a courtyard wall toward a river, a round bronze mirror tumbling from his hand; standing at the near edge of the platform, large in the foreground and seen from behind, a figure in a grey robe holds out one open palm with a small ring of five coloured lights, gold, green, black, red and yellow, turning in it',
  'wm-juesai': 'a stone tournament platform at dusk: two figures bow to each other with fist in palm, one a tall young woman in a pale blue inner-disciple robe; to the side a mild old abbot in grey holds out a small lacquered pill box',
  'wm-baishi': 'the top of long stone steps before an old temple gate: an old gatekeeper with a bamboo broom has stopped sweeping and looks up; a figure carrying two water buckets on a shoulder pole, seen from behind, has stopped too',
  'wm-caowu': 'a mountain cliff top with a small thatched hut: on a blue stone before it an incense burner with three lit sticks and a blank sheet of red paper; an old man leans on a bamboo broom; a figure kneels and bows to the ground, seen from behind',
  'wm-heluo': 'a mountain cliff top: an old man holds a bamboo broom upside down, the handle pointed forward like a sword; a swirl of scattered fallen leaves hangs still in the air in the shape of one large empty square frame, like a window of leaves; a bundle of blank bamboo slips lies rolled on a stone; a young disciple in a grey robe watches from behind, a tiny translucent silver fox curled on the disciple\'s shoulder',
  'wm-jiaxin': 'night in a long ancient Chinese temple dormitory with a wooden lattice paper window, snow falling outside: a figure lies awake on a long shared bed, seen from behind, holding up a small wooden token on a cord that glows faintly silver; a folded blank letter by the pillow',
}


# The seed each picture was kept at, after the re-rolls (fake characters on a
# wall scroll, a signature, a modern lamp, a fox-headed man …); the rest keep
# the default, sum(ord) × 7.
SEEDS = {
  'wm-jiangtang': 101, 'wm-ahe': 211, 'wm-danlu': 613, 'wm-diyilu': 313, 'wm-fushi': 314, 'wm-lun2': 515,
  'wm-baishi': 216, 'wm-caowu': 217, 'wm-heluo': 418, 'wm-jiaxin': 219,
  'chuxiansheng': 221, 'sunergou': 222, 'huangting': 223, 'heluo': 224,
}


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--only', default='')
  ap.add_argument('--force', action='store_true')
  ap.add_argument('--seed', type=int, default=None)
  args = ap.parse_args()
  only = set(filter(None, args.only.split(',')))
  jobs = [(ART / 'panels' / f'{k}.webp', f'{v}. {NOTEXT} {PANEL}', 768, 512) for k, v in PANELS.items()]
  jobs += [(ART / 'people' / f'{k}.webp', f'{v}. {PORTRAIT}', 512, 640) for k, v in PEOPLE.items()]
  jobs += [(ART / 'items' / f'{k}.webp', f'{v}. {ITEM}', 640, 480) for k, v in ITEMS.items()]
  failed = []
  for out, prompt, w, h in jobs:
    if only and out.stem not in only:
      continue
    if out.exists() and not args.force:
      continue
    seed = args.seed if args.seed is not None else SEEDS.get(out.stem, sum(map(ord, out.stem)) * 7)
    print(f'painting {out.parent.name}/{out.stem}', flush=True)
    err = paint(out, prompt, w, h, seed)
    print(f'  {"x " + err if err else "ok"}', flush=True)
    if err:
      failed.append(err)
  print(f'failed {len(failed)}')


if __name__ == '__main__':
  main()
