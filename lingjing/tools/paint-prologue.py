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

PANELS = {
  '00-shiao': 'a village of seventeen poor households at the foot of a great mountain in autumn dusk, terraced fields, one mud-brick hut apart with hides hanging to dry and a sagging thatch roof, bowls set out under the leaks inside, a child at the door looking up at the mountain',
  '00-masan': 'dusk inside a poor mountain hunter\'s mud-brick hut: a huge rent collector with an iron-bound club kicks open the wicker gate, a plump boy in silk waves a cake, an old hunter bows and smiles humbly, a thin child stands still with lowered eyes, a broken bowl on the floor, an old sinew-wrapped bow on the wall, bowls catching drips from the leaking thatch',
  '00-dawn': 'grey frosty dawn at a farmhouse paper window, a neighbour child\'s mittened hand passes a warm boiled egg through the half-open window to a child inside, breath steaming',
  '00-kitchen': 'lamplight in a poor farmhouse kitchen before dawn: a peasant mother crouched at a clay stove baking two flatbreads, one thick one thin; an old hunter sitting on the edge of a brick bed wrapping his left knee tightly with old cloth; a child watching',
  '00-chushan': 'misty dawn at the east end of a mountain village: a blind old woman sitting on her doorstep presses a small worn wooden token into a child\'s hand; an old limping hunter with a bow waits; beyond, a pine forest trampled by hunting dogs and a child at the top of a tall pine looking out over empty hills',
  '00-duanbei': 'a broken ancient stone stele half buried in dry grass at the mouth of a black pine forest, no birds, dead still air; an old hunter and a small child stand before it, the child parting the grass behind the stele where a tiny curled fox is carved',
  '00-heisong': 'a forest of giant black pines twice normal height, thick needle carpet, a child carving a notch into a black trunk with a knife while an old hunter crouches by a mountain stream touching huge deer hoofprints',
  '00-storm': 'a violent rainstorm in a black pine forest, trees bent in the wind, water pouring down a narrow path along a cliff edge; an old hunter\'s knee gives way and he tips toward the drop while a small child lunges and grabs his belt',
  '00-fall': 'the bottom of a deep misty ravine in the rain, towering cliffs vanishing into cloud, a small child lying in a bed of thick moss among broken branches and a snapped vine, then sitting up checking their hands',
  '00-fox': 'a hidden valley of strange silver-leaved trees with raindrops beaded like pearls on every leaf tip, faintly glowing grass; in a shallow muddy pit a tiny wounded silver fox with a single tail glows softly, breathing; a child crouches behind a silver tree watching',
  '00-cave': 'night in a shallow rock cave behind a small fire of moss and pine resin; a child sits against the stone wall holding a tiny silver fox wrapped in a patched jacket, breaking a flatbread in half for it',
  '00-yinyue': 'grey dawn at a cave mouth after rain: a young woman with long silver hair to her waist, barefoot, in a white robe bright as water, a single silver fox tail behind her, sits eating a piece of flatbread and looks back over her shoulder; a child waking inside the cave reaches for a stone',
  '00-cliff': 'a child climbing a rock crack up a cliff face toward an old hunter lying at the muddy cliff edge reaching down his hand, a peasant farmer with a torch behind him; a tiny silver fox curled around the child\'s neck like a fur scarf',
  '00-deer': 'a child drawing a large old sinew-wrapped bow at a great stag with branching antlers drinking at a stream three hundred paces away, an old hunter kneeling behind, a tiny silver fox on the child\'s shoulder, wind in the grass',
  '00-rent': 'a village threshing ground: a burly rent collector shakes out a whole deer hide, a plump youth in silk grins, an old hunter nods honestly, a child hunched and cowering as if frightened, villagers watching; a mother in the doorway',
  '00-dusk': 'night at the east end of the village: a blind old woman on her doorstep slowly bows her head low toward a child who wears a silver fox curled like a scarf around the neck, lantern light',
  '00-xiuxian': 'midnight on a woodpile behind a farmhouse: a child sits hunched and watchful beside a tiny silver fox lying limp on the straw, silver drops like frost falling from the cut root of its single tail, a full moon above',
  '00-sleep': 'night on a woodpile: a tiny silver fox, thin and translucent in the moonlight, dissolves into a thread of silver light that circles a child and flows into a small wooden token carved with a nine-tailed fox; a black pill and an old bamboo scroll lie on the straw',
  '00-halfyear': 'a poor farmhouse kitchen at night under one oil lamp: a peasant mother points with one finger at the characters of an old bamboo scroll on a low table while a child reads along; a wooden token on a cord at the child\'s neck',
  '00-uncle': 'a humble farmhouse at a meal: a thin bookkeeper uncle in a new blue-grey gown sits on the edge of the brick bed reading aloud from a folded paper; the old hunter father puts down his chopsticks, the mother listens; a child bends over the table clutching the chest, a thread of silver light leaking between the fingers',
  '00-years': 'moonlight on a woodpile behind a farmhouse through the seasons, snow on the roof; a teenager sits cross-legged breathing in meditation, a small silver fox with one tail sits on their knee beside an old bamboo scroll; two bowls of soup on the windowsill',
  '00-notice': 'night in a humble farmhouse: an old father lifts an old sinew-wrapped bow down from the wall and lays it before a teenager, the mother holds out a small cloth bundle with needle and thread and an empty purse; a silver fox scarf on the teenager\'s neck',
  '00-gate': 'three hundred stone steps climbing into clouds toward an old mountain temple gate, crowds of children rushing up and slumping exhausted halfway, one teenager walking steadily at the back, an old man with a bamboo broom at the top',
  '00-luoshu': 'a stone wall carved with a three by three grid of empty squares, a heap of stone blocks marked with black and white dots like the Luo Shu diagram beside it, a teenager placing a stone in the centre square, an old gatekeeper with a broom watching',
  '00-longzhi': 'a forest outside a temple gate: a fox-like beast with nine heads and nine tails and tiger claws chained to an ancient pine, all heads turned; children fleeing in tears; a teenager standing just beyond the chain\'s reach holding a stone, waiting',
  '00-hall': 'a Taoist main hall with no statues, only an empty square four-legged stone seat big enough for a person to lie in; before it a spirit-testing stone glows dimly in five faint colours; a mild abbot in a grey robe sits beside it; a teenager lays a hand on the stone',
  '00-waimen': 'a temple outer courtyard at evening: a stern young steward with a ledger hands out grey robes, wooden tags and three small spirit stones to new disciples; a plump youth leans on a pillar smirking',
  '00-mijing': 'night in a long temple dormitory, rows of sleeping youths on one long bed; a teenager lies awake by the door looking at the moon through the window, a small silver fox by the pillow; outside, a fresh paper notice on a wooden board in the courtyard',
}


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
