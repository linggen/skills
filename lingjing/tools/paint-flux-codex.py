#!/usr/bin/env python3
"""paint-flux-codex.py — 图鉴 pictures painted by the LOCAL FLUX when Codex is at its limit.

    python3 tools/paint-flux-codex.py [--only id,id] [--force] [--seed N] [--out DIR]

Hanli, 2026-09-29: 「用flux吧」 (Codex's image quota ran out). The engine's local painter
(FLUX.2 klein 4B through mflux, tools/paint-prologue.py's recipe, HF_HOME at the cached
model — nothing downloaded) with tools/paint-codex.py's house STYLE and OLD_CHINA lines,
so the pictures sit beside the Codex ones. Each subject's prompt is written in English
only (Chinese words in a FLUX prompt invite fake characters), every countable feature
spelled out. FLUX miscounts: each subject was rolled 8 seeds a round into a review
folder, every picture looked at (counts, Chinese not Western, no text / seal / fold /
frame, the creature's size), and only a right one kept — its seed is below.

Not yet right after two rounds (2026-09-29), so they keep their old pictures:
肥遗 (six legs never six — lizards with four, or snakes with eight), 雷神 (a scaly man
holding a ball, not a dragon with a man's head), 蠪侄 (heads 8–9, tails never nine),
夔 (FLUX will not draw one leg or drop the horns). 蠪侄 again 2026-09-30, six seeds: five to seven heads, one to three tails — the 1597 woodcut stays.

2026-09-30, 卷一's people without a picture (第十回): 赵昂 (seed 6, a round-1 prompt with the willow of the scene; the frame FLUX drew is cropped off), 豆腐西施 (seed 6), 巫祝婆婆 (seed 6); every picture looked at.

Output as paint-codex.py: art/people/<id>.webp (2:3, 640×960), art/creatures/<id>.webp (3:2, 960×640).
"""
import argparse, importlib.util, json, os, subprocess, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location('paint_codex', HERE / 'paint-codex.py')
pc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pc)
ART = pc.ART
PY = Path.home() / '.linggen/runtime/envs/pictures/bin/python'
SCRIPT = Path.home() / '.linggen/runtime/mlx_picture.py'
MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'

# id: (folder, kept seed, subject[, crop box]) — a crop trims a frame FLUX drew in, then scales back
SUBJECTS = {
  'bingyi': ('people', 2, "A monochrome graphite pencil drawing of a Chinese river god riding two huge dragons out of a river. ONE man with a calm ageless human face and deep still eyes, long loose hair, long robes flowing like water, standing upright on the BACKS of exactly TWO enormous traditional Chinese dragons (long serpentine bodies, long whiskers, branching deer-like antlers, flowing manes, four small clawed legs, no wings), side by side, swimming together: his left foot planted on the left dragon's back, his right foot planted on the right dragon's back. The dragons are HUGE — each dragon head bigger than the whole man, scales as big as millstones — their long scaly bodies arching up out of the water and back down into the river. Exactly two dragons, each with ONE head. Water spray around them. Full length. Pencil grey only on warm sepia paper, no green, no colour."),
  'fangfeng': ('creatures', 4, 'A monochrome graphite pencil drawing of Fangfeng, a giant chieftain of ancient China, drawn like a figure in an old Chinese illustrated classic: an enormous but HUMAN man (not a troll, not an ogre, not hairy), ONE head, TWO arms, TWO legs, a stern Chinese face with a short beard, long hair bound up in a knot, wearing a plain ancient Chinese wrap robe of hemp tied with a rope belt, straw sandals, a long wooden staff in one hand, striding over low hills. Beside his foot, a tiny ancient Chinese two-wheeled ox cart no higher than his ankle, to show how huge he is. Like a plate in a classical Chinese bestiary: the figure alone, whole and clearly seen, with only a small hint of its setting at its feet. Pencil grey only on warm sepia paper, no colour.'),
  'tongtong': ('creatures', 4, 'A monochrome graphite pencil drawing of the mythical Chinese beast Tongtong: a stout wild pig with ONE head, FOUR legs, a curly tail, holding ONE round shining pearl in its mouth, walking on a mountain path by a stream. Like a plate in a classical Chinese bestiary: the creature alone, whole and clearly seen, with only a small hint of its setting at its feet. No people. Pencil grey only on warm sepia paper, no colour.'),
  'zhaoang': ('people', 6, "A monochrome graphite pencil drawing of a Chinese young swordsman of about sixteen, tall, straight-backed and proud like a young pine, a handsome cold aloof face with sharp eyebrows, long hair bound neatly in a topknot with a plain band, wearing a clean plain WHITE long robe with wide sleeves and a sash, a long straight sword in a plain scabbard hanging at his waist, one hand resting on the sword hilt, standing under a willow by a river at night. Full length. Pencil grey only on warm sepia paper, no colour.", (27, 52, 613, 931)),
  'doufu-xishi': ('people', 6, "A monochrome graphite pencil drawing of a young Chinese woman of seventeen (a grown young woman, not a child) who sells tofu, slender, pretty, a quiet gentle oval face and calm clear eyes, lips closed (she cannot speak), hair in a low bun under a plain cloth kerchief, wearing a plain cotton jacket CROSSED AT THE FRONT and tied with a cloth sash (no buttons, no stand-up collar), a long plain skirt, a work apron, sleeves tied back with a cord, holding a flat wooden tray with a few square blocks of white tofu. Standing alone. Full length. Plain empty paper background, no scenery. Pencil grey only on warm sepia paper, no colour."),
  'wuzhu': ('people', 6, "A monochrome graphite pencil drawing of an old Chinese village shaman woman of about sixty, thin and hard, a sly greedy wrinkled face, grey hair piled up in a bun with two long pins, wearing a long dark robe crossed at the front with wide sleeves, tied with a sash, a string of wooden beads round her neck, holding a small hand drum in one hand and a drumstick in the other. Standing alone. Full length. Plain empty paper background, no scenery, no building. Pencil grey only on warm sepia paper, no colour."),
}


def paint(out, subject, folder, seed, crop=None):
  w, h = (640, 960) if folder == 'people' else (960, 640)
  png = Path(tempfile.gettempdir()) / f'flux-codex-{out.stem}.png'
  req = {'model': MODEL, 'prompt': f'{subject} {pc.OLD_CHINA} Style: {pc.STYLE}', 'out': str(png), 'width': w, 'height': h, 'seed': seed}
  env = dict(os.environ, HF_HOME=str(Path.home() / '.linggen/models/hf-hub'), HF_HUB_OFFLINE='1')
  r = subprocess.run([str(PY), str(SCRIPT)], input=json.dumps(req), text=True, capture_output=True, env=env)
  if r.returncode != 0 or not png.exists():
    return f'failed: {r.stdout.strip()[-200:] or r.stderr.strip()[-200:]}'
  if crop:
    code = f"from PIL import Image; im = Image.open({str(png)!r}).convert('RGB'); im.crop({tuple(crop)!r}).resize(({w}, {h}), Image.LANCZOS).save({str(png)!r})"
    subprocess.run([str(PY), '-c', code], check=True)
  c = subprocess.run(['/opt/homebrew/bin/cwebp', '-q', '84', str(png), '-o', str(out)], capture_output=True)
  png.unlink(missing_ok=True)
  return 'ok' if c.returncode == 0 else 'cwebp failed'


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--only', default='')
  ap.add_argument('--force', action='store_true')
  ap.add_argument('--seed', type=int, default=None)
  ap.add_argument('--out', default=None, help='paint into this folder instead of art/ (a review round)')
  a = ap.parse_args()
  only = set(filter(None, a.only.split(',')))
  for key, (folder, seed, subject, *crop) in SUBJECTS.items():
    if only and key not in only:
      continue
    base = Path(a.out) if a.out else ART / folder
    base.mkdir(parents=True, exist_ok=True)
    out = base / f'{key}.webp'
    if out.exists() and not a.force:
      print(f'{folder}/{key}: kept', flush=True)
      continue
    print(f'{folder}/{key}: {paint(out, subject, folder, a.seed if a.seed is not None else seed, crop[0] if crop else None)}', flush=True)


if __name__ == '__main__':
  main()
